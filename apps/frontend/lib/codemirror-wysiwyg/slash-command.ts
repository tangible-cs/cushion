/**
 * Slash Command Extension for CodeMirror
 *
 * Typing "/" at the start of a line (or after whitespace) opens a floating
 * menu with block-type commands.
 */

import { EditorView, ViewPlugin, ViewUpdate, showTooltip, Tooltip } from '@codemirror/view';
import { StateField, StateEffect, EditorState } from '@codemirror/state';
import { startCompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { getResolvedBindings } from '@/stores/shortcutsStore';
import { matchShortcut, formatShortcutList } from '@/lib/shortcuts/utils';

// --- Command definitions ---

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string; // SVG path or emoji
  keywords: string[];
  apply: (view: EditorView, from: number, to: number) => void;
}

function replaceWithText(text: string) {
  return (view: EditorView, from: number, to: number) => {
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
  };
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'bullet-list',
    label: 'Bullet List',
    description: 'Create a bulleted list',
    icon: 'list',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
    apply: replaceWithText('- '),
  },
  {
    id: 'numbered-list',
    label: 'Numbered List',
    description: 'Create a numbered list',
    icon: 'list-ordered',
    keywords: ['number', 'ordered', 'ol'],
    apply: replaceWithText('1. '),
  },
  {
    id: 'todo',
    label: 'Todo',
    description: 'Create a checkbox item',
    icon: 'check-square',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    apply: replaceWithText('- [ ] '),
  },
  {
    id: 'blockquote',
    label: 'Blockquote',
    description: 'Create a quote block',
    icon: 'quote',
    keywords: ['quote', 'blockquote'],
    apply: replaceWithText('> '),
  },
  {
    id: 'code-block',
    label: 'Code Block',
    description: 'Insert a fenced code block',
    icon: 'code',
    keywords: ['code', 'fence', 'block', 'pre'],
    apply: (view, from, to) => {
      // Insert ``` with cursor right after it, so the existing
      // code-fence autocomplete triggers for language selection
      const insert = '```';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 3 },
      });
      view.focus();
      // Trigger language autocomplete
      setTimeout(() => startCompletion(view), 0);
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Insert a horizontal rule',
    icon: 'minus',
    keywords: ['divider', 'hr', 'horizontal', 'rule', 'line'],
    apply: replaceWithText('---\n'),
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    description: 'Large heading',
    icon: 'heading',
    keywords: ['heading', 'h1', 'title'],
    apply: replaceWithText('# '),
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    description: 'Medium heading',
    icon: 'heading',
    keywords: ['heading', 'h2', 'subtitle'],
    apply: replaceWithText('## '),
  },
  {
    id: 'heading-3',
    label: 'Heading 3',
    description: 'Small heading',
    icon: 'heading',
    keywords: ['heading', 'h3'],
    apply: replaceWithText('### '),
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a table',
    icon: 'table',
    keywords: ['table', 'grid', 'rows', 'columns'],
    apply: (view, from, to) => {
      const insert = '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 2 },
      });
      view.focus();
    },
  },
];

// --- SVG Icons ---

const ICONS: Record<string, string> = {
  'list': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>',
  'list-ordered': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
  'check-square': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  'quote': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>',
  'code': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  'minus': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  'heading': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/></svg>',
  'table': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
};

// --- State management ---

interface SlashMenuState {
  open: boolean;
  /** Absolute position of the "/" character */
  slashPos: number;
  /** Current query text after "/" */
  query: string;
  /** Currently selected index (-1 means none) */
  selectedIndex: number;
}

const initialState: SlashMenuState = { open: false, slashPos: 0, query: '', selectedIndex: -1 };

const openSlashMenu = StateEffect.define<{ pos: number }>();
const closeSlashMenu = StateEffect.define<void>();
const updateSlashQuery = StateEffect.define<{ query: string }>();
const updateSlashSelection = StateEffect.define<{ index: number }>();

function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords.some(k => k.includes(q))
  );
}

const slashMenuField = StateField.define<SlashMenuState>({
  create() {
    return initialState;
  },
  update(value, tr) {
    let state = value;
    for (const effect of tr.effects) {
      if (effect.is(openSlashMenu)) {
        state = { open: true, slashPos: effect.value.pos, query: '', selectedIndex: -1 };
      } else if (effect.is(closeSlashMenu)) {
        state = initialState;
      } else if (effect.is(updateSlashQuery)) {
        const filtered = filterCommands(effect.value.query);
        const maxIndex = filtered.length - 1;
        const nextSelectedIndex = state.selectedIndex < 0
          ? -1
          : maxIndex < 0
            ? -1
            : Math.min(state.selectedIndex, maxIndex);
        state = {
          ...state,
          query: effect.value.query,
          selectedIndex: nextSelectedIndex,
        };
      } else if (effect.is(updateSlashSelection)) {
        state = { ...state, selectedIndex: effect.value.index };
      }
    }

    // Close if cursor moved away from the slash context
    if (state.open && tr.docChanged) {
      const pos = tr.state.selection.main.head;
      if (pos < state.slashPos) {
        return initialState;
      }
    }
    if (state.open && tr.selection) {
      const pos = tr.newSelection.main.head;
      if (pos < state.slashPos) {
        return initialState;
      }
    }

    return state;
  },
  provide(field) {
    return showTooltip.computeN([field], (state) => {
      const menu = state.field(field);
      if (!menu.open) return [];
      return [{
        pos: menu.slashPos,
        above: false,
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'cm-slash-menu';
          return { dom, mount: () => renderMenu(dom, state, menu) };
        },
      }];
    });
  },
});

// --- DOM rendering ---

function renderMenu(container: HTMLElement, editorState: EditorState, menu: SlashMenuState) {
  const filtered = filterCommands(menu.query);
  container.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cm-slash-menu-empty';
    empty.textContent = 'No matching commands';
    container.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'cm-slash-menu-list';
    filtered.forEach((cmd, i) => {
      const item = document.createElement('div');
      item.className = 'cm-slash-menu-item' + (i === menu.selectedIndex ? ' cm-slash-menu-item-selected' : '');
      item.dataset.index = String(i);

      const icon = document.createElement('div');
      icon.className = 'cm-slash-menu-icon';
      icon.innerHTML = ICONS[cmd.icon] || '';

      const text = document.createElement('div');
      text.className = 'cm-slash-menu-text';

      const label = document.createElement('div');
      label.className = 'cm-slash-menu-label';
      label.textContent = cmd.label;

      const desc = document.createElement('div');
      desc.className = 'cm-slash-menu-desc';
      desc.textContent = cmd.description;

      text.appendChild(label);
      text.appendChild(desc);
      item.appendChild(icon);
      item.appendChild(text);
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  // Footer — dynamic hints from registry
  const prevLabel = formatShortcutList(getResolvedBindings('editor.slashMenu.prev'));
  const nextLabel = formatShortcutList(getResolvedBindings('editor.slashMenu.next'));
  const confirmLabel = formatShortcutList(getResolvedBindings('editor.slashMenu.confirm'));
  const closeLabel = formatShortcutList(getResolvedBindings('editor.slashMenu.close'));

  const footer = document.createElement('div');
  footer.className = 'cm-slash-menu-footer';
  let footerHtml = '';
  if (prevLabel || nextLabel) {
    const navKbds =
      (prevLabel ? `<kbd>${prevLabel}</kbd>` : '') +
      (nextLabel ? `<kbd>${nextLabel}</kbd>` : '');
    footerHtml += `<span>${navKbds} Navigate</span>`;
  }
  if (confirmLabel) footerHtml += `<span><kbd>${confirmLabel}</kbd> Insert</span>`;
  if (closeLabel) footerHtml += `<span><kbd>${closeLabel}</kbd> Close</span>`;
  footer.innerHTML = footerHtml;
  container.appendChild(footer);
}

// --- View plugin to sync DOM with state ---

const slashMenuPlugin = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      const menu = update.state.field(slashMenuField);
      if (!menu.open) return;

      // Find tooltip DOM and re-render
      const tooltips = update.view.dom.querySelectorAll('.cm-slash-menu');
      if (tooltips.length > 0) {
        renderMenu(tooltips[0] as HTMLElement, update.state, menu);

        // Handle click events on items
        const items = tooltips[0].querySelectorAll('.cm-slash-menu-item');
        items.forEach((el) => {
          (el as HTMLElement).onmousedown = (e) => {
            e.preventDefault();
            const idx = parseInt((el as HTMLElement).dataset.index || '0', 10);
            executeCommand(update.view, idx);
          };
        });
      }
    }
  }
);

// --- Command execution ---

function executeCommand(view: EditorView, index: number) {
  const menu = view.state.field(slashMenuField);
  const filtered = filterCommands(menu.query);
  const cmd = filtered[index];
  if (!cmd) return;

  // Close menu first
  view.dispatch({ effects: closeSlashMenu.of(undefined) });

  // Replace from slashPos to current cursor with the command output
  const from = menu.slashPos;
  const to = view.state.selection.main.head;
  cmd.apply(view, from, to);
}

// --- Input handler: detect "/" ---

const slashTrigger = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '/') return false;

  const menu = view.state.field(slashMenuField);
  if (menu.open) return false; // already open

  const line = view.state.doc.lineAt(from);
  const textBefore = view.state.doc.sliceString(line.from, from);

  // Only trigger at line start or after whitespace
  if (textBefore.length > 0 && !/\s$/.test(textBefore)) return false;

  // Open menu after the character is inserted
  setTimeout(() => {
    view.dispatch({ effects: openSlashMenu.of({ pos: from }) });
  }, 0);

  return false; // let "/" be inserted normally
});

// --- Update query as user types ---

const slashQueryUpdater = EditorView.updateListener.of((update) => {
  const menu = update.state.field(slashMenuField);
  if (!menu.open) return;

  if (update.docChanged || update.selectionSet) {
    const pos = update.state.selection.main.head;
    // If cursor is before slash or on a different line, close
    const slashLine = update.state.doc.lineAt(menu.slashPos);
    const cursorLine = update.state.doc.lineAt(pos);
    if (cursorLine.number !== slashLine.number || pos < menu.slashPos) {
      update.view.dispatch({ effects: closeSlashMenu.of(undefined) });
      return;
    }

    // Extract query: text between "/" and cursor
    const query = update.state.doc.sliceString(menu.slashPos + 1, pos);

    // If user deleted the "/", close
    if (pos <= menu.slashPos) {
      update.view.dispatch({ effects: closeSlashMenu.of(undefined) });
      return;
    }

    // Check the "/" is still there
    const slashChar = update.state.doc.sliceString(menu.slashPos, menu.slashPos + 1);
    if (slashChar !== '/') {
      update.view.dispatch({ effects: closeSlashMenu.of(undefined) });
      return;
    }

    const currentQuery = menu.query;
    if (query !== currentQuery) {
      update.view.dispatch({ effects: updateSlashQuery.of({ query }) });
    }
  }
});

// --- Keyboard handler ---

const slashKeymap = EditorView.domEventHandlers({
  keydown(event, view) {
    const menu = view.state.field(slashMenuField);
    if (!menu.open) return false;

    const filtered = filterCommands(menu.query);

    const nextBindings = getResolvedBindings('editor.slashMenu.next');
    if (matchShortcut(event, nextBindings)) {
      event.preventDefault();
      if (filtered.length === 0) return true;
      const next = menu.selectedIndex < 0 ? 0 : (menu.selectedIndex + 1) % filtered.length;
      view.dispatch({ effects: updateSlashSelection.of({ index: next }) });
      return true;
    }

    const prevBindings = getResolvedBindings('editor.slashMenu.prev');
    if (matchShortcut(event, prevBindings)) {
      event.preventDefault();
      if (filtered.length === 0) return true;
      const prev = menu.selectedIndex < 0
        ? filtered.length - 1
        : (menu.selectedIndex - 1 + filtered.length) % filtered.length;
      view.dispatch({ effects: updateSlashSelection.of({ index: prev }) });
      return true;
    }

    const confirmBindings = getResolvedBindings('editor.slashMenu.confirm');
    if (matchShortcut(event, confirmBindings)) {
      event.preventDefault();
      if (menu.selectedIndex >= 0) {
        executeCommand(view, menu.selectedIndex);
      }
      return true;
    }

    const closeBindings = getResolvedBindings('editor.slashMenu.close');
    if (matchShortcut(event, closeBindings)) {
      event.preventDefault();
      view.dispatch({ effects: closeSlashMenu.of(undefined) });
      return true;
    }

    return false;
  },
});

// --- Theme ---

const slashMenuTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-below .cm-slash-menu, .cm-tooltip.cm-tooltip-above .cm-slash-menu': {
    // Override CM tooltip defaults
  },
  '.cm-slash-menu': {
    width: '320px',
    maxHeight: '300px',
    backgroundColor: 'var(--md-bg)',
    border: '1px solid var(--md-border)',
    borderRadius: '6px',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'inherit',
  },
  '.cm-slash-menu-list': {
    overflowY: 'auto',
    maxHeight: '240px',
    padding: '4px',
  },
  '.cm-slash-menu-item': {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '8px',
    color: 'var(--md-text-muted)',
  },
  '.cm-slash-menu-item:hover': {
    backgroundColor: 'var(--md-autocomplete-item-hover-bg)',
    color: 'var(--md-text)',
  },
  '.cm-slash-menu-item-selected': {
    backgroundColor: 'var(--md-autocomplete-item-hover-bg) !important',
    color: 'var(--md-text) !important',
  },
  '.cm-slash-menu-item-selected .cm-slash-menu-desc': {
    color: 'var(--md-text-muted) !important',
  },
  '.cm-slash-menu-icon': {
    flexShrink: '0',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: '1px solid var(--md-border)',
    backgroundColor: 'var(--md-bg-secondary)',
    color: 'var(--md-text-muted)',
  },
  '.cm-slash-menu-item-selected .cm-slash-menu-icon': {
    color: 'var(--md-text) !important',
    borderColor: 'var(--md-border)',
    backgroundColor: 'var(--md-autocomplete-item-hover-bg)',
  },
  '.cm-slash-menu-text': {
    flex: '1',
    minWidth: '0',
  },
  '.cm-slash-menu-label': {
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: '1.3',
  },
  '.cm-slash-menu-desc': {
    fontSize: '12px',
    color: 'var(--md-text-muted)',
    lineHeight: '1.3',
  },
  '.cm-slash-menu-empty': {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--md-text-muted)',
    fontSize: '13px',
  },
  '.cm-slash-menu-footer': {
    display: 'flex',
    gap: '12px',
    padding: '6px 12px',
    borderTop: '1px solid var(--md-border)',
    fontSize: '11px',
    color: 'var(--md-text-muted)',
  },
  '.cm-slash-menu-footer kbd': {
    padding: '1px 4px',
    backgroundColor: 'var(--md-autocomplete-item-hover-bg)',
    borderRadius: '3px',
    fontSize: '11px',
  },
});

// --- Export ---

export function slashCommandExtension(): Extension {
  return [
    slashMenuField,
    slashMenuPlugin,
    slashTrigger,
    slashQueryUpdater,
    slashKeymap,
    slashMenuTheme,
  ];
}
