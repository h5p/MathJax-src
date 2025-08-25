/*************************************************************
 *
 *  Copyright (c) 2009-2025 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @file Explorers based on keyboard events.
 *
 * @author v.sorge@mathjax.org (Volker Sorge)
 */

import { HoverRegion, SpeechRegion, LiveRegion } from './Region.js';
import { STATE } from '../../core/MathItem.js';
import type { ExplorerMathItem, ExplorerMathDocument } from '../explorer.js';
import { Explorer, AbstractExplorer } from './Explorer.js';
import { ExplorerPool } from './ExplorerPool.js';
import { MmlNode } from '../../core/MmlTree/MmlNode.js';
import { honk, SemAttr } from '../speech/SpeechUtil.js';
import { GeneratorPool } from '../speech/GeneratorPool.js';
import { context } from '../../util/context.js';

/**
 * Interface for keyboard explorers. Adds the necessary keyboard events.
 *
 * @interface
 * @augments {Explorer}
 */
export interface KeyExplorer extends Explorer {
  /**
   * Function to be executed on key down.
   *
   * @param {KeyboardEvent} event The keyboard event.
   */
  KeyDown(event: KeyboardEvent): void;

  /**
   * Function to be executed on focus in.
   *
   * @param {KeyboardEvent} event The keyboard event.
   */
  FocusIn(event: FocusEvent): void;

  /**
   * Function to be executed on focus out.
   *
   * @param {KeyboardEvent} event The keyboard event.
   */
  FocusOut(event: FocusEvent): void;

  /**
   * A method that is executed if no move is executed.
   */
  NoMove(): void;
}

/**********************************************************************/

/**
 * Type of function that implements a key press action
 */
type keyMapping = (
  explorer: SpeechExplorer,
  event: KeyboardEvent
) => boolean | void;

/**
 * Selectors for walking.
 */
const nav = '[data-speech-node]';

/**
 * Predicate to check if element is a MJX container.
 *
 * @param {HTMLElement} el The HTML element.
 * @returns {boolean} True if the element is an mjx-container.
 */
export function isContainer(el: HTMLElement): boolean {
  return el.matches('mjx-container');
}

/**
 * Test if an event has any modifier keys
 *
 * @param {MouseEvent|KeyboardEvent} event   The event to check
 * @param {boolean} shift                    True if shift is to be included in check
 * @returns {boolean}                        True if shift, ctrl, alt, or meta key is pressed
 */
export function hasModifiers(
  event: MouseEvent | KeyboardEvent,
  shift: boolean = true
): boolean {
  return (
    (event.shiftKey && shift) || event.metaKey || event.altKey || event.ctrlKey
  );
}

/**********************************************************************/

/**
 * Creates a customized help dialog
 *
 * @param {string} title   The title to use for the message
 * @param {string} select  Additional ways to select the typeset math
 * @returns {string}       The customized message
 */
function helpMessage(title: string, select: string): string {
  return `
<H2>Exploring expressions ${title}</h2>

<p>The mathematics on this page is being rendered by <a
href="https://www.mathjax.org/" target="_blank">MathJax</a>, which
generates both the text spoken by screen readers, as well as the
visual layout for sighted users.</p>

<p>Expressions typeset by MathJax can be explored interactively, and
are focusable.  You can use the <kbd>Tab</kbd> key to move to a typeset
expression${select}.  Initially, the expression will be read in full,
but you can use the following keys to explore the expression
further:<p>

<ul>

<li><kbd>Down Arrow</kbd> moves one level deeper into the expression to
allow you to explore the current subexpression term by term.</li>

<li><kbd>Up Arrow</kbd> moves back up a level within the expression.</li>

<li><kbd>Right Arrow</kbd> moves to the next term in the current
subexpression.</li>

<li><kbd>Left Arrow</kbd> moves to the next term in the current
subexpression.</li>

<li><kbd>Shift</kbd>+<kbd>Arrow</kbd> moves to a neighboring cell within a table.

<li><kbd>0-9</kbd>+<kbd>0-9</kbd> jumps to a cell by its index in the table, where 0 = 10.

<li><kbd>Home</kbd> takes you to the top of the expression.</li>

<li><kbd>Enter</kbd> or <kbd>Return</kbd> clicks a link or activates an active
subexpression.</li>

<li><kbd>Space</kbd> opens the MathJax contextual menu where you can view
or copy the source format of the expression, or modify MathJax's
settings.</li>

<li><kbd>Escape</kbd> exits the expression explorer.</li>

<li><kbd>x</kbd> gives a summary of the current subexpression.</li>

<li><kbd>z</kbd> gives the full text of a collapsed expression.</li>

<li><kbd>d</kbd> gives the current depth within the expression.</li>

<li><kbd>s</kbd> starts or stops auto-voicing with synchronized highlighting.</li>

<li><kbd>v</kbd> marks the current position in the expression.</li>

<li><kbd>p</kbd> cycles through the marked positions in the expression.</li>

<li><kbd>u</kbd> clears all marked positions and returns to the starting position.</li>

<li><kbd>&gt;</kbd> cycles through the available speech rule sets
(MathSpeak, ClearSpeak).</li>

<li><kbd>&lt;</kbd> cycles through the verbosity levels for the current
rule set.</li>

<li><kbd>h</kbd> produces this help listing.</li>
</ul>

<p>The MathJax contextual menu allows you to enable or disable speech
or Braille generation for mathematical expressions, the language to
use for the spoken mathematics, and other features of MathJax.  In
particular, the Explorer submenu allows you to specify how the
mathematics should be identified in the page (e.g., by saying "math"
when the expression is spoken), and whether or not to include a
message about the letter "h" bringing up this dialog box.</p>

<p>The contextual menu also provides options for viewing or copying a
MathML version of the expression or its original source format,
creating an SVG version of the expression, and viewing various other
information.</p>

<p>For more help, see the <a
href="https://docs.mathjax.org/en/latest/basic/accessibility.html"
targe="_blank">MathJax accessibility documentation.</a></p>
`;
}

/**
 * Help for the different OS versions
 */
const helpData: Map<string, [string, string]> = new Map([
  [
    'MacOS',
    [
      'on MacOS and iOS using VoiceOver',
      ', or the VoiceOver arrow keys to select an expression',
    ],
  ],
  [
    'Windows',
    [
      'in Windows using NVDA or JAWS',
      `. The screen reader should enter focus or forms mode automatically
when the expression gets the browser focus, but if not, you can toggle
focus mode using NVDA+space in NVDA; for JAWS, Enter should start
forms mode while Numpad Plus leaves it.  Also note that you can use
the NVDA or JAWS key plus the arrow keys to explore the expression
even in browse mode, and you can use NVDA+shift+arrow keys to
navigate out of an expression that has the focus in NVDA`,
    ],
  ],
  [
    'Unix',
    [
      'in Unix using Orca',
      `, and Orca should enter focus mode automatically.  If not, use the
Orca+a key to toggle focus mode on or off.  Also note that you can use
Orca+arrow keys to explore expressions even in browse mode`,
    ],
  ],
  ['unknown', ['with a Screen Reader.', '']],
]);

/**********************************************************************/
/**********************************************************************/

/**
 * @class
 * @augments {AbstractExplorer}
 *
 * @template T  The type that is consumed by the Region of this explorer.
 */
export class SpeechExplorer
  extends AbstractExplorer<string>
  implements KeyExplorer
{
  /*
   * The explorer key mapping
   */
  protected static keyMap: Map<string, [keyMapping, boolean?]> = new Map([
    ['Tab', [() => true]],
    ['Escape', [(explorer) => explorer.escapeKey()]],
    ['Enter', [(explorer, event) => explorer.enterKey(event)]],
    ['Home', [(explorer) => explorer.homeKey()]],
    [
      'ArrowDown',
      [(explorer, event) => explorer.moveDown(event.shiftKey), true],
    ],
    ['ArrowUp', [(explorer, event) => explorer.moveUp(event.shiftKey), true]],
    [
      'ArrowLeft',
      [(explorer, event) => explorer.moveLeft(event.shiftKey), true],
    ],
    [
      'ArrowRight',
      [(explorer, event) => explorer.moveRight(event.shiftKey), true],
    ],
    [' ', [(explorer) => explorer.spaceKey()]],
    ['h', [(explorer) => explorer.hKey()]],
    ['>', [(explorer) => explorer.nextRules(), false]],
    ['<', [(explorer) => explorer.nextStyle(), false]],
    ['x', [(explorer) => explorer.summary(), false]],
    ['z', [(explorer) => explorer.details(), false]],
    ['d', [(explorer) => explorer.depth(), false]],
    ['v', [(explorer) => explorer.addMark(), false]],
    ['p', [(explorer) => explorer.prevMark(), false]],
    ['u', [(explorer) => explorer.clearMarks(), false]],
    ['s', [(explorer) => explorer.autoVoice(), false]],
    ...[...'0123456789'].map((n) => [
      n,
      [(explorer: SpeechExplorer) => explorer.numberKey(parseInt(n)), false],
    ]),
  ] as [string, [keyMapping, boolean?]][]);

  /**
   * Switches on or off the use of sound on this explorer.
   */
  public sound: boolean = false;

  /**
   * Convenience getter for generator pool of the item.
   *
   * @returns {GeneratorPool} The item's generator pool.
   */
  private get generators(): GeneratorPool<HTMLElement, Text, Document> {
    return this.item?.generatorPool;
  }

  /**
   * Shorthand for the item's speech ARIA role
   *
   * @returns {string}  The role
   */
  protected get role(): string {
    return this.item.ariaRole;
  }

  /**
   * Shorthand for the item's ARIA role description
   *
   * @returns {string}  The role description
   */
  protected get description(): string {
    return this.item.roleDescription;
  }

  /**
   * Shorthand for the item's "none" indicator
   *
   * @returns {string}  The string to use for no description
   */
  protected get none(): string {
    return this.item.none;
  }

  /**
   * The currently focused element.
   */
  protected current: HTMLElement = null;

  /**
   * The clicked node from a mousedown event
   */
  protected clicked: HTMLElement = null;

  /**
   * Node to focus on when restarted
   */
  public refocus: HTMLElement = null;

  /**
   * True when we are refocusing on the speech node
   */
  protected focusSpeech: boolean = false;

  /**
   * Selector string for re-focusing after re-rendering
   */
  public restarted: string = null;

  /**
   * The transient speech node
   */
  protected speech: HTMLElement = null;

  /**
   * Set to 'd' when depth is showing, 'x' when summary, '' when speech.
   */
  protected speechType: string = '';

  /**
   * The speech node when the top-level node has no role
   */
  protected img: HTMLElement = null;

  /**
   * True when explorer is attached to a node
   */
  public attached: boolean = false;

  /**
   * Treu if events of the explorer are attached.
   */
  private eventsAttached: boolean = false;

  /**
   * The array of saved positions.
   */
  protected marks: HTMLElement[] = [];

  /**
   * The index of the current position in the array.
   */
  protected currentMark: number = -1;

  /**
   * The last explored position from previously exploring this
   * expression.
   */
  protected lastMark: HTMLElement = null;

  /**
   * First index of cell to jump to
   */
  protected pendingIndex: number[] = [];

  /**
   * The possible types for a "table" cell
   */
  protected cellTypes: string[] = ['cell', 'line'];

  /********************************************************************/
  /*
   * The event handlers
   */

  /**
   * @override
   */
  protected events: [string, (x: Event) => void][] = super.Events().concat([
    ['focusin', this.FocusIn.bind(this)],
    ['focusout', this.FocusOut.bind(this)],
    ['keydown', this.KeyDown.bind(this)],
    ['mousedown', this.MouseDown.bind(this)],
    ['click', this.Click.bind(this)],
    ['dblclick', this.DblClick.bind(this)],
  ]);

  /**
   * @override
   */
  public FocusIn(_event: FocusEvent) {
    if (this.item.outputData.nofocus) {
      //
      // we are refocusing after a menu or dialog box has closed
      //
      this.item.outputData.nofocus = false;
      return;
    }
    if (!this.clicked) {
      this.Start();
    }
    this.clicked = null;
  }

  /**
   * @override
   */
  public FocusOut(_event: FocusEvent) {
    if (this.current && !this.focusSpeech) {
      this.setCurrent(null);
      this.Stop();
      if (!document.hasFocus()) {
        this.focusTop();
      }
    }
  }

  /**
   * @override
   */
  public KeyDown(event: KeyboardEvent) {
    this.pendingIndex.shift();
    this.region.cancelVoice();
    //
    if (hasModifiers(event, false)) return;
    //
    // Get the key action, if there is one and perform it
    //
    const CLASS = this.constructor as typeof SpeechExplorer;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const [action, value] = CLASS.keyMap.get(key) || [];
    const result = action
      ? value === undefined || this.active
        ? action(this, event)
        : value
      : this.undefinedKey(event);
    //
    // If result is true, propagate event,
    // Otherwise stop the event, and if false, play the honk sound
    //
    if (result) return;
    this.stopEvent(event);
    if (result === false && this.sound) {
      this.NoMove();
    }
  }

  /**
   * Handle clicks that perform selections, and keep track of clicked node
   * so that the focusin event will know something was clicked.
   *
   * @param {MouseEvent} event   The mouse down event
   */
  private MouseDown(event: MouseEvent) {
    this.pendingIndex = [];
    this.region.cancelVoice();
    //
    if (hasModifiers(event) || event.buttons === 2) {
      this.item.outputData.nofocus = true;
      return;
    }
    //
    // Get the speech element that was clicked
    //
    const clicked = this.findClicked(
      event.target as HTMLElement,
      event.x,
      event.y
    );
    //
    // If it is the info icon, top the event and let the click handler process it
    //
    if (clicked === this.document.infoIcon) {
      this.stopEvent(event);
      return;
    }
    //
    // Remove any selection ranges and
    // If the target is the highlight rectangle, refocus on the clicked element
    //   otherwise record the click for the focusin handler
    //
    document.getSelection()?.removeAllRanges();
    if ((event.target as HTMLElement).getAttribute('sre-highlighter-added')) {
      this.refocus = clicked;
    } else {
      this.clicked = clicked;
    }
  }

  /**
   * Handle a click event
   *
   * @param {MouseEvent} event   The mouse click event
   */
  public Click(event: MouseEvent) {
    //
    // If we are extending a click region, focus out
    //
    if (
      hasModifiers(event) ||
      event.buttons === 2 ||
      document.getSelection().type === 'Range'
    ) {
      this.FocusOut(null);
      return;
    }
    //
    // Get the speech element that was clicked
    //
    const clicked = this.findClicked(
      event.target as HTMLElement,
      event.x,
      event.y
    );
    //
    // If it was the info icon, open the help dialog
    //
    if (this.document.infoIcon && clicked === this.document.infoIcon) {
      this.stopEvent(event);
      this.help();
      return;
    }
    //
    // If the node contains the clicked element,
    //   don't propagate the event
    //   focus on the clicked element when focusin occurs
    //   start the explorer if this isn't a link
    //
    if (!clicked || this.node.contains(clicked)) {
      this.stopEvent(event);
      this.refocus = clicked;
      if (!this.triggerLinkMouse()) {
        this.Start();
      }
    }
  }

  /**
   * Handle a double-click event (focus full expression)
   *
   * @param {MouseEvent} event   The mouse click event
   */
  public DblClick(event: MouseEvent) {
    const direction = (document.getSelection() as any).direction ?? 'none';
    if (hasModifiers(event) || event.buttons === 2 || direction !== 'none') {
      this.FocusOut(null);
    } else {
      this.stopEvent(event);
      this.refocus = this.rootNode();
      this.Start();
    }
  }

  /********************************************************************/
  /*
   * The Key action functions
   */

  /**
   * The space key opens the menu, so it propagates, but we retain the
   * current focus to refocus it when the menu closes.
   *
   * @returns {boolean}  Don't cancel the event
   */
  protected spaceKey(): boolean {
    this.refocus = this.current;
    return true;
  }

  /**
   * Open the help dialog, and refocus when it closes.
   */
  protected hKey() {
    if (this.document.options.enableHelp === false) {
      return;
    }
    this.refocus = this.current;
    this.help();
  }

  /**
   * Stop exploring and focus the top element
   *
   * @returns {boolean}  Don't cancel the event
   */
  protected escapeKey(): boolean {
    this.Stop();
    this.focusTop();
    return true;
  }

  /**
   * Process Enter key events
   *
   * @param {KeyboardEvent} event  The event for the enter key
   * @returns {void | boolean}     False means play the honk sound
   */
  protected enterKey(event: KeyboardEvent): void | boolean {
    if (this.active) {
      if (this.triggerLinkKeyboard(event)) {
        this.Stop();
      } else {
        const expandable = this.actionable(this.current);
        if (!expandable) {
          return false;
        }
        this.refocus = expandable;
        expandable.dispatchEvent(new Event('click'));
      }
    } else {
      this.Start();
    }
  }

  /**
   * Select top-level of expression
   */
  protected homeKey() {
    this.setCurrent(this.rootNode());
  }

  /**
   * Move to deeper level in the expression
   *
   * @param {boolean} shift     True if shift is pressed
   * @returns {boolean | void}  False if no node, void otherwise
   */
  protected moveDown(shift: boolean): boolean | void {
    return shift
      ? this.moveToNeighborCell(1, 0)
      : this.moveTo(this.firstNode(this.current));
  }

  /**
   * Move to higher level in expression
   *
   * @param {boolean} shift     True if shift is pressed
   * @returns {boolean | void}  False if no node, void otherwise
   */
  protected moveUp(shift: boolean): boolean | void {
    return shift
      ? this.moveToNeighborCell(-1, 0)
      : this.moveTo(this.getParent(this.current));
  }

  /**
   * Move to next term in the expression
   *
   * @param {boolean} shift     True if shift is pressed
   * @returns {boolean | void}  False if no node, void otherwise
   */
  protected moveRight(shift: boolean): boolean | void {
    return shift
      ? this.moveToNeighborCell(0, 1)
      : this.moveTo(this.nextSibling(this.current));
  }

  /**
   * Move to previous term in the expression
   *
   * @param {boolean} shift     True if shift is pressed
   * @returns {boolean | void}  False if no node, void otherwise
   */
  protected moveLeft(shift: boolean): boolean | void {
    return shift
      ? this.moveToNeighborCell(0, -1)
      : this.moveTo(this.prevSibling(this.current));
  }

  /**
   * Move to a specified node, unless it is null
   *
   * @param {HTMLElement} node   The node to move it
   * @returns {boolean | void}   False if no node, void otherwise
   */
  protected moveTo(node: HTMLElement): void | boolean {
    if (!node) return false;
    this.setCurrent(node);
  }

  /**
   * Move to an adjacent table cell
   *
   * @param {number} di          Change in row number
   * @param {number} dj          Change in column number
   * @returns {boolean | void}   False if no such cell, void otherwise
   */
  protected moveToNeighborCell(di: number, dj: number): boolean | void {
    const cell = this.tableCell(this.current);
    if (!cell) return false;
    const [i, j] = this.cellPosition(cell);
    if (i == null) return false;
    const move = this.cellAt(this.cellTable(cell), i + di, j + dj);
    if (!move) return false;
    this.setCurrent(move);
  }

  /**
   * Determine if an event that is not otherwise mapped should be
   * allowed to propagate.
   *
   * @param {KeyboardEvent} event   The event to check
   * @returns {boolean}             True if not active or the event has a modifier
   */
  protected undefinedKey(event: KeyboardEvent): boolean {
    return !this.active || hasModifiers(event);
  }

  /**
   * Mark a location so we can return to it later
   */
  protected addMark() {
    if (this.current === this.marks[this.marks.length - 1]) {
      this.setCurrent(this.current);
    } else {
      this.currentMark = this.marks.length - 1;
      this.marks.push(this.current);
      this.speak('Position marked');
    }
  }

  /**
   * Return to a previous location (loop through them).
   * If no saved marks, go to the last previous position,
   * or if not, the top level.
   */
  protected prevMark() {
    if (this.currentMark < 0) {
      if (this.marks.length === 0) {
        this.setCurrent(this.lastMark || this.rootNode());
        return;
      }
      this.currentMark = this.marks.length - 1;
    }
    const current = this.currentMark;
    this.setCurrent(this.marks[current]);
    this.currentMark = current - 1;
  }

  /**
   * Clear all saved positions and return to the last explored position.
   */
  protected clearMarks() {
    this.marks = [];
    this.currentMark = -1;
    this.prevMark();
  }

  /**
   * Toggle auto voicing.
   */
  protected autoVoice() {
    const value = !this.document.options.a11y.voicing;
    if (this.document.menu) {
      this.document.menu.menu.pool.lookup('voicing').setValue(value);
    } else {
      this.document.options.a11y.voicing = value;
    }
    this.Update();
  }

  /**
   * Get index for cell to jump to.
   *
   * @param {number} n         The number key that was pressed
   * @returns {boolean|void}   False if not in a table or no such cell to jump to.
   */
  protected numberKey(n: number): boolean | void {
    if (!this.tableCell(this.current)) return false;
    if (n === 0) {
      n = 10;
    }
    if (this.pendingIndex.length) {
      const table = this.cellTable(this.tableCell(this.current));
      const cell = this.cellAt(table, this.pendingIndex[0] - 1, n - 1);
      this.pendingIndex = [];
      this.speak(String(n));
      if (!cell) return false;
      setTimeout(() => this.setCurrent(cell), 500);
    } else {
      this.pendingIndex = [null, n];
      this.speak(`Jump to row ${n} and column`);
    }
  }

  /**
   * Computes the nesting depth announcement for the currently focused sub
   * expression.
   */
  public depth() {
    if (this.speechType === 'd') {
      this.setCurrent(this.current);
      return;
    }
    this.speechType = 'd';
    const parts = [
      [
        this.node.getAttribute('data-semantic-level') ?? 'Level',
        this.current.getAttribute('aria-level') ?? '0',
      ]
        .join(' ')
        .trim(),
    ];
    const action = this.actionable(this.current);
    if (action) {
      parts.unshift(
        this.node.getAttribute(
          action.getAttribute('toggle') === '1'
            ? 'data-semantic-expandable'
            : 'data-semantic-collapsible'
        ) ?? ''
      );
    }
    this.speak(parts.join(' '), this.current.getAttribute(SemAttr.BRAILLE));
  }

  /**
   * Computes the summary for this expression.
   */
  public summary() {
    if (this.speechType === 'x') {
      this.setCurrent(this.current);
      return;
    }
    this.speechType = 'x';
    const summary = this.current.getAttribute(SemAttr.SUMMARY);
    this.speak(
      summary,
      this.current.getAttribute(SemAttr.BRAILLE),
      this.SsmlAttributes(this.current, SemAttr.SUMMARY_SSML)
    );
  }

  /**
   * Cycles to next speech rule set if possible and recomputes the speech for
   * the expression.
   */
  public nextRules() {
    this.node.removeAttribute('data-speech-attached');
    this.restartAfter(this.generators.nextRules(this.item));
  }

  /**
   * Cycles to next speech style or preference if possible and recomputes the
   * speech for the expression.
   */
  public nextStyle() {
    this.node.removeAttribute('data-speech-attached');
    this.restartAfter(this.generators.nextStyle(this.current, this.item));
  }

  /**
   * Speak the expanded version of a collapsed expression.
   */
  public details() {
    //
    // If the current node is not collapsible and collapsed, just speak it
    //
    const action = this.actionable(this.current);
    if (
      !action ||
      !action.getAttribute('data-collapsible') ||
      action.getAttribute('toggle') !== '1' ||
      this.speechType === 'z'
    ) {
      this.setCurrent(this.current);
      return;
    }
    this.speechType = 'z';
    //
    // Otherwise, look for the current node in the MathML tree
    //
    const id = this.nodeId(this.current);
    let current: MmlNode;
    this.item.root.walkTree((node) => {
      if (node.attributes.get('data-semantic-id') === id) {
        current = node;
      }
    });
    //
    // Create a new MathML string from the subtree
    //
    let mml = this.item.toMathML(current, this.item);
    if (!current.isKind('math')) {
      mml = `<math>${mml}</math>`;
    }
    mml = mml.replace(
      / (?:data-semantic-|aria-|data-speech-|data-latex).*?=".*?"/g,
      ''
    );
    //
    // Get the speech for the new subtree and speak it.
    //
    this.item
      .speechFor(mml)
      .then(([speech, braille]) => this.speak(speech, braille));
  }

  /**
   * Displays the help dialog.
   */
  protected help() {
    const adaptor = this.document.adaptor;
    const helpBackground = adaptor.node('mjx-help-background');
    const close = (event: Event) => {
      helpBackground.remove();
      this.node.focus();
      this.stopEvent(event);
    };
    helpBackground.addEventListener('click', close);
    const helpSizer = adaptor.node('mjx-help-sizer', {}, [
      adaptor.node(
        'mjx-help-dialog',
        { tabindex: 0, role: 'dialog', 'aria-labeledby': 'mjx-help-label' },
        [
          adaptor.node('h1', { id: 'mjx-help-label' }, [
            adaptor.text('MathJax Expression Explorer Help'),
          ]),
          adaptor.node('div'),
          adaptor.node('input', { type: 'button', value: 'Close' }),
        ]
      ),
    ]);
    helpBackground.append(helpSizer);
    const help = helpSizer.firstChild as HTMLElement;
    help.addEventListener('click', (event) => this.stopEvent(event));
    help.lastChild.addEventListener('click', close);
    help.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        close(event);
      }
    });
    const [title, select] = helpData.get(context.os);
    (help.childNodes[1] as HTMLElement).innerHTML = helpMessage(title, select);
    document.body.append(helpBackground);
    help.focus();
  }

  /********************************************************************/
  /*
   * Methods to handle the currently selected node and its speech
   */

  /**
   * Set the currently selected node and speak its label, if requested.
   *
   * @param {HTMLElement} node         The node that should become current
   * @param {boolean} addDescription   True if the speech node should get a description
   */
  protected setCurrent(node: HTMLElement, addDescription: boolean = false) {
    this.speechType = '';
    if (!document.hasFocus()) {
      this.refocus = this.current;
    }
    //
    // Let AT know we are making changes
    //
    this.node.setAttribute('aria-busy', 'true');
    //
    // If there is a current selection
    //   clear it and remove the associated speech
    //   if we aren't setting a new selection
    //   (i.e., we are focusing out)
    //
    if (this.current) {
      for (const part of this.getSplitNodes(this.current)) {
        part.classList.remove('mjx-selected');
      }
      this.pool.unhighlight();
      if (this.document.options.a11y.tabSelects === 'last') {
        this.refocus = this.current;
      }
      if (!node) {
        this.lastMark = this.current;
        this.removeSpeech();
      }
      this.current = null;
    }
    //
    // If there is a current node
    //   Select it and add its speech, if requested
    //
    this.current = node;
    this.currentMark = -1;
    if (this.current) {
      const parts = this.getSplitNodes(this.current);
      for (const part of parts) {
        part.classList.add('mjx-selected');
      }
      this.pool.highlight(parts);
      this.addSpeech(node, addDescription);
    }
    //
    // Done making changes
    //
    this.node.removeAttribute('aria-busy');
  }

  /**
   * Get all nodes with the same semantic id (multiple nodes if there are line breaks).
   *
   * @param {HTMLElement} node  The node to check if it is split
   * @returns {HTMLElement[]}   All the nodes for the given id
   */
  protected getSplitNodes(node: HTMLElement): HTMLElement[] {
    const id = this.nodeId(node);
    if (!id) {
      return [node];
    }
    return Array.from(this.node.querySelectorAll(`[data-semantic-id="${id}"]`));
  }

  /**
   * Remove the top-level speech node and create
   *   a temporary one for the given node.
   *
   * @param {HTMLElement} node   The node to be spoken
   * @param {boolean} describe   True if the description should be added
   */
  protected addSpeech(node: HTMLElement, describe: boolean) {
    this.img?.remove();
    let speech = [
      node.getAttribute(SemAttr.PREFIX),
      node.getAttribute(SemAttr.SPEECH),
      node.getAttribute(SemAttr.POSTFIX),
    ]
      .join(' ')
      .trim();
    if (describe) {
      let description =
        this.description === this.none ? '' : ', ' + this.description;
      if (this.document.options.a11y.help) {
        description += ', press h for help';
      }
      speech += description;
    }
    this.speak(
      speech,
      node.getAttribute(SemAttr.BRAILLE),
      this.SsmlAttributes(node, SemAttr.SPEECH_SSML)
    );
    this.node.setAttribute('tabindex', '-1');
  }

  /**
   * If there is a speech node, remove it
   *   and put back the top-level node, if needed.
   */
  protected removeSpeech() {
    if (this.speech) {
      this.speech.remove();
      this.speech = null;
      if (this.img) {
        this.node.append(this.img);
      }
      this.node.setAttribute('tabindex', '0');
    }
  }

  /**
   * Create a new speech node and sets its needed attributes,
   *   then add it to the container and focus it.  If there is
   *   and old speech node, remove it after a delay (the delay
   *   is needed for Orca on Linux).
   *
   * @param {string} speech        The string to speak
   * @param {string} braille       The braille string
   * @param {string[]} ssml        The SSML attributes to add
   * @param {string} description   The description to add to the speech
   */
  public speak(
    speech: string,
    braille: string = '',
    ssml: string[] = null,
    description: string = this.none
  ) {
    const oldspeech = this.speech;
    this.speech = document.createElement('mjx-speech');
    this.speech.setAttribute('role', this.role);
    this.speech.setAttribute('aria-label', speech);
    this.speech.setAttribute(SemAttr.SPEECH, speech);
    if (ssml) {
      this.speech.setAttribute(SemAttr.PREFIX_SSML, ssml[0] || '');
      this.speech.setAttribute(SemAttr.SPEECH_SSML, ssml[1] || '');
      this.speech.setAttribute(SemAttr.POSTFIX_SSML, ssml[2] || '');
    }
    if (braille) {
      this.speech.setAttribute('aria-braillelabel', braille);
    }
    this.speech.setAttribute('aria-roledescription', description);
    this.speech.setAttribute('tabindex', '0');
    this.node.append(this.speech);
    this.focusSpeech = true;
    this.speech.focus();
    this.focusSpeech = false;
    this.Update();
    if (oldspeech) {
      setTimeout(() => oldspeech.remove(), 100);
    }
  }

  /**
   * Set up the MathItem output to handle the speech exploration
   */
  public attachSpeech() {
    const item = this.item;
    const container = this.node;
    if (!container.hasAttribute('has-speech')) {
      for (const child of Array.from(container.childNodes) as HTMLElement[]) {
        child.setAttribute('aria-hidden', 'true'); // hide the content
      }
      container.setAttribute('has-speech', 'true');
    }
    const description = item.roleDescription;
    const speech =
      (container.getAttribute(SemAttr.SPEECH) || '') +
      (description ? ', ' + description : '');
    this.img?.remove();
    this.img = this.document.adaptor.node('mjx-speech', {
      'aria-label': speech,
      role: 'img',
      'aria-roledescription': item.none,
    });
    container.appendChild(this.img);
  }

  /**
   * Undo any changes from attachSpeech()
   */
  public detachSpeech() {
    const container = this.node;
    this.img?.remove();
    container.removeAttribute('has-speech');
    for (const child of Array.from(container.childNodes) as HTMLElement[]) {
      child.removeAttribute('aria-hidden');
    }
  }

  /**
   * Set focus on the current node
   */
  public focus() {
    this.node.focus();
  }

  /********************************************************************/
  /*
   * Utility functions
   */

  /**
   * @param {HTMLElement} node  The node whose ID we want
   * @returns {string}          The node's semantic ID
   */
  protected nodeId(node: HTMLElement): string {
    return node.getAttribute('data-semantic-id');
  }

  /**
   * @param {HTMLElement} node  The node whose parent ID we want
   * @returns {string}          The node's parent's semantic ID
   */
  protected parentId(node: HTMLElement): string {
    return node.getAttribute('data-semantic-parent');
  }

  /**
   * @param {string} id       The semantic ID of the node we want
   * @returns {HTMLElement}   The HTML node with that id
   */
  protected getNode(id: string): HTMLElement {
    return id ? this.node.querySelector(`[data-semantic-id="${id}"]`) : null;
  }

  /**
   * @param {HTMLElement} node   The HTML node whose parent is to be found
   * @returns {HTMLElement}      The HTML node of the parent node
   */
  protected getParent(node: HTMLElement): HTMLElement {
    return this.getNode(this.parentId(node));
  }

  /**
   * @param {HTMLElement} node   The node whose child array we want
   * @returns {string[]}         The array of semantic IDs of its children
   */
  protected childArray(node: HTMLElement): string[] {
    return node ? node.getAttribute('data-semantic-children').split(/,/) : [];
  }

  /**
   * @param {HTMLElement} node   The node to check for being a cell node
   * @returns {boolean}          True if the node is a cell node
   */
  protected isCell(node: HTMLElement): boolean {
    return (
      !!node && this.cellTypes.includes(node.getAttribute('data-semantic-type'))
    );
  }

  /**
   * @param {HTMLElement} node   The node to check for being a row node
   * @returns {boolean}          True if the node is a row node
   */
  protected isRow(node: HTMLElement): boolean {
    return !!node && node.getAttribute('data-semantic-type') === 'row';
  }

  /**
   * @param {HTMLElement} node   A node that may be in a table cell
   * @returns {HTMLElement}      The HTML node for the table cell containing it, or null
   */
  protected tableCell(node: HTMLElement): HTMLElement {
    while (node && node !== this.node) {
      if (this.isCell(node)) {
        return node;
      }
      node = node.parentNode as HTMLElement;
    }
    return null;
  }

  /**
   * @param {HTMLElement} cell   An HTML node that is a cell of a table
   * @returns {HTMLElement}      The HTML node for semantic table element containing the cell
   */
  protected cellTable(cell: HTMLElement): HTMLElement {
    const row = this.getParent(cell);
    return this.isRow(row) ? this.getParent(row) : row;
  }

  /**
   * @param {HTMLElement} cell     The HTML node for a semantic table cell
   * @returns {[number, number]}   The row and column numbers for the cell in its table (0-based)
   */
  protected cellPosition(cell: HTMLElement): [number, number] {
    const row = this.getParent(cell);
    const j = this.childArray(row).indexOf(this.nodeId(cell));
    if (!this.isRow(row)) {
      return [j, 1];
    }
    const table = this.getParent(row);
    const i = this.childArray(table).indexOf(this.nodeId(row));
    return [i, j];
  }

  /**
   * @param {HTMLElement} table   An HTML node for a semantic table element
   * @param {number} i            The row number of the desired cell in the table
   * @param {number} j            The column numnber of the desired cell in the table
   * @returns {HTMLElement}       The HTML element for the (i,j)-th cell of the table
   */
  protected cellAt(table: HTMLElement, i: number, j: number): HTMLElement {
    const row = this.getNode(this.childArray(table)[i]);
    if (!this.isRow(row)) {
      return j === 1 ? row : null;
    }
    const cell = this.getNode(this.childArray(row)[j]);
    return cell;
  }

  /**
   * Get an element's first speech child. This is computed by going through the
   * owns list until the first speech element is found.
   *
   * @param {HTMLElement} node   The parent element to get a child from
   * @returns {HTMLElement}      The first speech child of the node
   */
  protected firstNode(node: HTMLElement): HTMLElement {
    const owns = node.getAttribute('data-semantic-owns');
    if (!owns) {
      return node.querySelector(nav) as HTMLElement;
    }
    const ownsList = owns.split(/ /);
    for (const id of ownsList) {
      const node = this.getNode(id);
      if (node?.hasAttribute('data-speech-node')) {
        return node;
      }
    }
    return node.querySelector(nav) as HTMLElement;
  }

  /**
   * Get the element's semantic root node. We compute this from the root id
   * given in the semantic structure. The semantic structure is an sexp either
   * of the form `0` or `(0 1 (2 ...) ...)`. We can safely assume that the root
   * node contains the speech for the entire structure.
   *
   * If for some reason the semantic structure is not available, we return the
   * first speech node found in the expression.
   *
   * @returns {HTMLElement} The semantic root or first speech node.
   */
  protected rootNode(): HTMLElement {
    const base = this.node.querySelector('[data-semantic-structure]');
    if (!base) {
      return this.node.querySelector(nav) as HTMLElement;
    }
    const id = base
      .getAttribute('data-semantic-structure')
      .split(/ /)[0]
      .replace('(', '');
    return this.getNode(id);
  }

  /**
   * Navigate one step to the right on the same level.
   *
   * @param {HTMLElement} node   The current element.
   * @returns {HTMLElement}      The next element.
   */
  protected nextSibling(node: HTMLElement): HTMLElement {
    const id = this.parentId(node);
    if (!id) return null;
    const owns = this.getNode(id)
      .getAttribute('data-semantic-owns')
      ?.split(/ /);
    if (!owns) return null;
    let i = owns.indexOf(this.nodeId(node));
    let next;
    do {
      next = this.getNode(owns[++i]);
    } while (next && !next.hasAttribute('data-speech-node'));
    return next;
  }

  /**
   * Navigate one step to the left on the same level.
   *
   * @param {HTMLElement} node   The current element.
   * @returns {HTMLElement}      The next element.
   */
  protected prevSibling(node: HTMLElement): HTMLElement {
    const id = this.parentId(node);
    if (!id) return null;
    const owns = this.getNode(id)
      .getAttribute('data-semantic-owns')
      ?.split(/ /);
    if (!owns) return null;
    let i = owns.indexOf(this.nodeId(node));
    let prev;
    do {
      prev = this.getNode(owns[--i]);
    } while (prev && !prev.hasAttribute('data-speech-node'));
    return prev;
  }

  /**
   * Find the speech node that was clicked, if any
   *
   * @param {HTMLElement} node   The target node that was clicked
   * @param {number} x           The x-coordinate of the click
   * @param {number} y           The y-coordinate of the click
   * @returns {HTMLElement}      The clicked node or null
   */
  protected findClicked(node: HTMLElement, x: number, y: number): HTMLElement {
    //
    // Check if the click is on the info icon and return that if it is.
    //
    const icon = this.document.infoIcon;
    if (icon && (icon === node || icon.contains(node))) {
      return icon;
    }
    //
    // For CHTML, get the closest navigable parent element.
    //
    if (this.node.getAttribute('jax') !== 'SVG') {
      return node.closest(nav) as HTMLElement;
    }
    //
    // For SVG, look through the tree to find the element whose bounding box
    // contains the click (x,y) position.
    //
    let found = null;
    let clicked = this.node;
    while (clicked) {
      if (clicked.matches(nav)) {
        found = clicked; // could be this node, but check if a child is clicked
      }
      const nodes = Array.from(clicked.childNodes) as HTMLElement[];
      clicked = null;
      for (const child of nodes) {
        if (
          child !== this.speech &&
          child !== this.img &&
          child.tagName.toLowerCase() !== 'rect'
        ) {
          const { left, right, top, bottom } = child.getBoundingClientRect();
          if (left <= x && x <= right && top <= y && y <= bottom) {
            clicked = child;
            break;
          }
        }
      }
    }
    return found;
  }

  /**
   * Focus the container node without activating it (e.g., when Escape is pressed)
   */
  protected focusTop() {
    this.focusSpeech = true;
    this.node.focus();
    this.focusSpeech = false;
  }

  /**
   * Get the SSML attribute array
   *
   * @param {HTMLElement} node  The node whose SSML attributes are to be obtained
   * @param {SemAttr} center    The name of the SSML attribute between pre and postfix
   * @returns {string[]}        The prefix/speech or summary/postfix array
   */
  protected SsmlAttributes(node: HTMLElement, center: SemAttr): string[] {
    return [
      node.getAttribute(SemAttr.PREFIX_SSML),
      node.getAttribute(center),
      node.getAttribute(SemAttr.POSTFIX_SSML),
    ];
  }

  /**
   * Restarts the explorer after a promise resolves (e.g., for an maction rerender)
   *
   * @param {Promise<void>} promise  The promise to restart after
   */
  protected async restartAfter(promise: Promise<void>) {
    await promise;
    this.attachSpeech();
    const current = this.current;
    this.current = null;
    this.pool.unhighlight();
    this.setCurrent(current);
  }

  /********************************************************************/
  /*
   * Base class overrides
   */

  /**
   * @param {ExplorerMathDocument} document The accessible math document.
   * @param {ExplorerPool} pool The explorer pool.
   * @param {SpeechRegion} region The speech region for the explorer.
   * @param {HTMLElement} node The node the explorer is assigned to.
   * @param {LiveRegion} brailleRegion The braille region.
   * @param {HoverRegion} magnifyRegion The magnification region.
   * @param {MmlNode} _mml The internal math node.
   * @param {ExplorerMathItem} item The math item.
   * @class
   * @augments {AbstractExplorer}
   */
  constructor(
    public document: ExplorerMathDocument,
    public pool: ExplorerPool,
    public region: SpeechRegion,
    protected node: HTMLElement,
    public brailleRegion: LiveRegion,
    public magnifyRegion: HoverRegion,
    _mml: MmlNode,
    public item: ExplorerMathItem
  ) {
    super(document, pool, null, node);
  }

  /**
   * Determine the node that should be made active when we start
   * (the refocus, current, or restarted node, if any otherwise null)
   *
   * @returns {HTMLElement}   The node to be made the current node
   */
  protected findStartNode(): HTMLElement {
    let node = this.refocus || this.current;
    if (!node && this.restarted) {
      node = this.node.querySelector(this.restarted);
    }
    this.refocus = this.restarted = null;
    return node;
  }

  /**
   * @override
   */
  public async Start() {
    //
    // If we aren't attached or already active, return
    //
    if (!this.attached || this.active) return;
    this.document.activeItem = this.item;
    //
    // If there is no speech, request the speech and wait for it
    //
    if (this.item.state() < STATE.ATTACHSPEECH) {
      this.item.attachSpeech(this.document);
      await this.generators.promise;
    }
    //
    // If we are respnding to a focusin on the speech node, we are done
    //
    if (this.focusSpeech) return;
    //
    // Mark the node as active (for CSS that turns on the info icon)
    // and add the info icon.
    //
    this.node.classList.add('mjx-explorer-active');
    if (this.document.infoIcon) {
      this.node.append(this.document.infoIcon);
    }

    //
    // Get the node to make current, and determine if we need to add a
    // speech node (or just use the top-level node), then set the
    // current node (which creates the speech) and start the explorer.
    //
    const node = this.findStartNode();
    this.setCurrent(node || this.rootNode(), !node);
    super.Start();
    //
    // Show any needed regions
    //
    const options = this.document.options;
    const a11y = options.a11y;
    if (a11y.subtitles && a11y.speech && options.enableSpeech) {
      this.region.Show(this.node, this.highlighter);
    }
    if (a11y.viewBraille && a11y.braille && options.enableBraille) {
      this.brailleRegion.Show(this.node, this.highlighter);
    }
    if (a11y.keyMagnifier) {
      this.magnifyRegion.Show(this.current, this.highlighter);
    }
    this.Update();
  }

  /**
   * @override
   */
  public Stop() {
    if (this.active) {
      const description = this.description;
      if (this.node.getAttribute('aria-roledescription') !== description) {
        this.node.setAttribute('aria-roledescription', description);
      }
      this.node.classList.remove('mjx-explorer-active');
      if (this.document.infoIcon) {
        this.document.infoIcon.remove();
      }
      this.pool.unhighlight();
      this.magnifyRegion.Hide();
      this.region.Hide();
      this.brailleRegion.Hide();
    }
    super.Stop();
  }

  /**
   * @override
   */
  public Update() {
    if (!this.active) return;
    this.region.node = this.node;
    this.generators.updateRegions(
      this.speech || this.node,
      this.region,
      this.brailleRegion
    );
    this.magnifyRegion.Update(this.current);
  }

  /**
   * @override
   */
  public Attach() {
    if (this.attached) return;
    super.Attach();
    this.node.setAttribute('tabindex', '0');
    this.attached = true;
  }

  /**
   * @override
   */
  public Detach() {
    super.RemoveEvents();
    this.node.removeAttribute('role');
    this.node.removeAttribute('aria-roledescription');
    this.node.removeAttribute('aria-label');
    this.img?.remove();
    if (this.active) {
      this.node.setAttribute('tabindex', '0');
    }
    this.attached = false;
  }

  /**
   * @override
   */
  public NoMove() {
    honk();
  }

  /**
   * @override
   */
  public AddEvents() {
    if (!this.eventsAttached) {
      super.AddEvents();
      this.eventsAttached = true;
    }
  }

  /********************************************************************/
  /*
   * Actions and links
   */

  /**
   * Checks if a node is actionable, i.e., corresponds to an maction.
   *
   * @param {HTMLElement} node The (rendered) node under consideration.
   * @returns {HTMLElement} The node corresponding to an maction element.
   */
  private actionable(node: HTMLElement): HTMLElement {
    const parent = node?.parentNode as HTMLElement;
    return parent && this.highlighter.isMactionNode(parent) ? parent : null;
  }

  /**
   * Programmatically triggers a link if the focused node contains one.
   *
   * @param {KeyboardEvent} event The keyboard event for the last keydown event.
   * @returns {boolean} True if link was successfully triggered.
   */
  protected triggerLinkKeyboard(event: KeyboardEvent): boolean {
    if (!this.current) {
      if (event.target instanceof HTMLAnchorElement) {
        event.target.dispatchEvent(new MouseEvent('click'));
        return true;
      }
      return false;
    }
    return this.triggerLink(this.current);
  }

  /**
   * Executiving the trigger the link action.
   *
   * @param {HTMLElement} node The node with the link.
   * @returns {boolean} True if link was successfully triggered.
   */
  protected triggerLink(node: HTMLElement): boolean {
    const focus = node
      ?.getAttribute('data-semantic-postfix')
      ?.match(/(^| )link($| )/);
    if (focus) {
      while (node && node !== this.node) {
        if (node instanceof HTMLAnchorElement) {
          node.dispatchEvent(new MouseEvent('click'));
          setTimeout(() => this.FocusOut(null), 50);
          return true;
        }
        node = node.parentNode as HTMLElement;
      }
    }
    return false;
  }

  /**
   * Programmatically triggers a link if the clicked mouse event contains one.
   *
   * @returns {boolean} True if link was successfully triggered.
   */
  protected triggerLinkMouse(): boolean {
    let node = this.refocus;
    while (node && node !== this.node) {
      if (this.triggerLink(node)) {
        return true;
      }
      node = node.parentNode as HTMLElement;
    }
    return false;
  }

  /**
   * @returns {string} The semantic id of the node that is currently focused.
   */
  public semanticFocus(): string {
    const focus = [];
    let name = 'data-semantic-id';
    let node = this.current || this.refocus || this.node;
    const action = this.actionable(node);
    if (action) {
      name = action.hasAttribute('data-maction-id') ? 'data-maction-id' : 'id';
      node = action;
      focus.push(nav);
    }
    const attr = node.getAttribute(name);
    if (attr) {
      focus.unshift(`[${name}="${attr}"]`);
    }
    return focus.join(' ');
  }
}
