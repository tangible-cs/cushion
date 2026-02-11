import { EditorView, KeyBinding } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { toCodeMirrorKey } from '@/lib/shortcuts/utils';

/**
 * Matches a markdown list line prefix.
 * Group 1: leading whitespace (indent)
 * Group 2: list marker  (-, +, *, or  1.  2)  etc.)
 * Group 3: optional task checkbox with trailing space  ("[ ] ", "[x] ", "[-] ")
 * The full match[0] includes the space after the marker.
 */
const LIST_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX-]\] )?/;

/**
 * Returns true when the main cursor sits inside a fenced code block,
 * front-matter, or HTML block — contexts where list key-bindings must not fire.
 */
function isInSpecialBlock(state: EditorState): boolean {
  const pos = state.selection.main.head;
  let node = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    const name = node.type.name;
    if (
      name === 'FencedCode' ||
      name === 'FrontMatter' ||
      name === 'Frontmatter' ||
      name === 'HTMLBlock'
    ) {
      return true;
    }
    if (!node.parent || node.parent.type === node.type) break;
    node = node.parent;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Tab — indent list lines                                           */
/* ------------------------------------------------------------------ */

function listIndent(view: EditorView): boolean {
  const state = view.state;
  const { from, to, head } = state.selection.main;

  // Multi-line selection: indent every list line in the range
  if (from !== to) {
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    // Single-line selection on a list line — treat like single cursor
    if (startLine.number === endLine.number) {
      if (!LIST_RE.test(startLine.text)) return false;
      view.dispatch({ changes: { from: startLine.from, insert: '\t' } });
      return true;
    }

    const changes: { from: number; insert: string }[] = [];
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (LIST_RE.test(line.text)) {
        changes.push({ from: line.from, insert: '\t' });
      }
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes });
    return true;
  }

  // Single cursor — only act on list lines
  const line = state.doc.lineAt(head);
  if (!LIST_RE.test(line.text)) return false;

  view.dispatch({
    changes: { from: line.from, insert: '\t' },
    selection: { anchor: head + 1 },
  });
  return true;
}

/* ------------------------------------------------------------------ */
/*  Shift+Tab — outdent list lines                                    */
/* ------------------------------------------------------------------ */

/** How many leading whitespace characters to remove (1 tab or up to tabSize spaces). */
function outdentAmount(text: string, tabSize: number): number {
  if (text.startsWith('\t')) return 1;
  const m = text.match(/^ +/);
  return m ? Math.min(m[0].length, tabSize) : 0;
}

function listOutdent(view: EditorView): boolean {
  const state = view.state;
  const { from, to, head } = state.selection.main;

  if (from !== to) {
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    const changes: { from: number; to: number }[] = [];
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (LIST_RE.test(line.text)) {
        const n = outdentAmount(line.text, state.facet(EditorState.tabSize) || 4);
        if (n > 0) changes.push({ from: line.from, to: line.from + n });
      }
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes });
    return true;
  }

  const line = state.doc.lineAt(head);
  if (!LIST_RE.test(line.text)) return false;
  const n = outdentAmount(line.text, state.facet(EditorState.tabSize) || 4);
  if (n === 0) return false;

  view.dispatch({
    changes: { from: line.from, to: line.from + n },
    selection: { anchor: Math.max(line.from, head - n) },
  });
  return true;
}

/* ------------------------------------------------------------------ */
/*  Enter — continue list or break out of empty item                  */
/* ------------------------------------------------------------------ */

function listEnter(view: EditorView): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;

  const line = state.doc.lineAt(from);

  // Cross-line selection — let the default handler deal with it
  if (from !== to && state.doc.lineAt(to).number !== line.number) return false;

  const match = line.text.match(LIST_RE);
  if (!match) return false;

  const indent = match[1];
  const marker = match[2];
  const taskMarker = match[3] || '';
  const fullPrefix = match[0];
  const content = line.text.slice(fullPrefix.length);

  // ---- Empty list item → break out of the list ----
  if (content.trim() === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
    });
    return true;
  }

  // Cursor sits inside the prefix — let the default handler insert a plain newline
  const cursorOffset = from - line.from;
  if (cursorOffset < fullPrefix.length) return false;

  // ---- Build the next line's prefix ----
  let nextMarker = marker;
  const numMatch = marker.match(/^(\d+)([.)])/);
  if (numMatch) {
    nextMarker = (parseInt(numMatch[1], 10) + 1) + numMatch[2];
  }

  let nextPrefix = indent + nextMarker + ' ';
  if (taskMarker) {
    nextPrefix += '[ ] '; // always reset checkbox
  }

  // Text after the selection-end stays on the new line
  const selEnd = Math.max(from, to);
  const textAfter = line.text.slice(selEnd - line.from);

  view.dispatch({
    changes: { from, to: line.to, insert: '\n' + nextPrefix + textAfter },
    selection: { anchor: from + 1 + nextPrefix.length },
  });
  return true;
}

/* ------------------------------------------------------------------ */
/*  Backspace/Delete — remove list prefix in one keypress              */
/* ------------------------------------------------------------------ */

function listRemovePrefix(view: EditorView): boolean {
  const state = view.state;
  const { from, to, head } = state.selection.main;
  if (from !== to) return false;

  const line = state.doc.lineAt(head);
  const tabSize = state.facet(EditorState.tabSize) || 4;
  const match = line.text.match(LIST_RE);
  if (match && match.index === 0) {
    const prefixLen = match[0].length;
    const cursorOffset = head - line.from;
    const indent = match[1] || '';
    const rest = line.text.slice(prefixLen);
    const restIsEmpty = rest.trim() === '';

    if (!restIsEmpty && cursorOffset > prefixLen) return false;

    if (restIsEmpty) {
      const removeCount = outdentAmount(indent, tabSize);
      const remainingIndent = indent.slice(removeCount);
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: remainingIndent },
        selection: { anchor: line.from + remainingIndent.length },
      });
      return true;
    }

    view.dispatch({
      changes: { from: line.from, to: line.from + prefixLen, insert: '' },
      selection: { anchor: line.from },
    });
    return true;
  }

  if (line.text.trim() === '') {
    const removeCount = outdentAmount(line.text, tabSize);
    if (removeCount === 0) return false;
    const remainingIndent = line.text.slice(removeCount);
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: remainingIndent },
      selection: { anchor: line.from + remainingIndent.length },
    });
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Exported keymap helpers                                           */
/* ------------------------------------------------------------------ */

type ListKeymapOptions = {
  indent?: string[];
  outdent?: string[];
  continueList?: string[];
  removePrefix?: string[];
};

function wrapListCommand(command: (view: EditorView) => boolean) {
  return (view: EditorView) => {
    if (isInSpecialBlock(view.state)) return false;
    return command(view);
  };
}

function buildBindings(keys: string[] | undefined, run: (view: EditorView) => boolean): KeyBinding[] {
  if (!keys || keys.length === 0) return [];
  const bindings: KeyBinding[] = [];
  keys.forEach((binding) => {
    const key = toCodeMirrorKey(binding);
    if (!key) return;
    bindings.push({ key, run });
  });
  return bindings;
}

export function createListKeymap(options: ListKeymapOptions): KeyBinding[] {
  return [
    ...buildBindings(options.indent, wrapListCommand(listIndent)),
    ...buildBindings(options.outdent, wrapListCommand(listOutdent)),
    ...buildBindings(options.continueList, wrapListCommand(listEnter)),
    ...buildBindings(options.removePrefix, wrapListCommand(listRemovePrefix)),
  ];
}
