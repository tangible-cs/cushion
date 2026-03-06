export type ShortcutScope =
  | 'app'
  | 'focus-mode'
  | 'quick-switcher'
  | 'editor'
  | 'editor-list'
  | 'editor-slash'
  | 'editor-checkbox'
  | 'chat'
  | 'chat-suggestions'
  | 'chat-shell'
  | 'chat-session'
  | 'pdf'
  | 'image'
;

export type ShortcutDefinitionInput = {
  id: string;
  label: string;
  description?: string;
  scope: ShortcutScope;
  category: string;
  defaultBindings: readonly string[];
};

export const shortcutRegistry = [
  {
    id: 'app.quickSwitcher.open',
    label: 'Open quick switcher',
    description: 'Open the file search palette.',
    scope: 'app',
    category: 'App',
    defaultBindings: ['Mod+O'],
  },
  {
    id: 'app.chat.newSession',
    label: 'New chat session',
    description: 'Start a new chat session in the right panel.',
    scope: 'app',
    category: 'App',
    defaultBindings: ['Mod+N'],
  },
  {
    id: 'app.graph.toggle',
    label: 'Toggle graph view',
    description: 'Open or close the graph view.',
    scope: 'app',
    category: 'App',
    defaultBindings: ['Mod+G'],
  },
  {
    id: 'app.backlinks.toggle',
    label: 'Toggle backlinks',
    description: 'Open or close the backlinks panel.',
    scope: 'app',
    category: 'App',
    defaultBindings: ['Mod+Shift+B'],
  },
  {
    id: 'app.overlay.close',
    label: 'Close overlays',
    description: 'Close modals, dialogs, and popovers.',
    scope: 'app',
    category: 'App',
    defaultBindings: ['Escape'],
  },
  {
    id: 'app.focusMode.exit',
    label: 'Exit focus mode',
    description: 'Leave focus mode when it is active.',
    scope: 'focus-mode',
    category: 'Focus Mode',
    defaultBindings: ['Escape'],
  },
  {
    id: 'quickSwitcher.navigateNext',
    label: 'Next result',
    description: 'Move to the next result.',
    scope: 'quick-switcher',
    category: 'Quick Switcher',
    defaultBindings: ['ArrowDown'],
  },
  {
    id: 'quickSwitcher.navigatePrev',
    label: 'Previous result',
    description: 'Move to the previous result.',
    scope: 'quick-switcher',
    category: 'Quick Switcher',
    defaultBindings: ['ArrowUp'],
  },
  {
    id: 'quickSwitcher.open',
    label: 'Open selection',
    description: 'Open the selected file or create a new one.',
    scope: 'quick-switcher',
    category: 'Quick Switcher',
    defaultBindings: ['Enter'],
  },
  {
    id: 'quickSwitcher.autocomplete',
    label: 'Autocomplete',
    description: 'Autocomplete the selected result.',
    scope: 'quick-switcher',
    category: 'Quick Switcher',
    defaultBindings: ['Tab'],
  },
  {
    id: 'chat.shell.exit',
    label: 'Exit shell mode',
    description: 'Exit shell mode in the chat input.',
    scope: 'chat-shell',
    category: 'Chat',
    defaultBindings: ['Escape'],
  },
  {
    id: 'chat.suggestions.next',
    label: 'Next suggestion',
    description: 'Move to the next prompt suggestion.',
    scope: 'chat-suggestions',
    category: 'Chat - Suggestions',
    defaultBindings: ['ArrowDown'],
  },
  {
    id: 'chat.suggestions.prev',
    label: 'Previous suggestion',
    description: 'Move to the previous prompt suggestion.',
    scope: 'chat-suggestions',
    category: 'Chat - Suggestions',
    defaultBindings: ['ArrowUp'],
  },
  {
    id: 'chat.suggestions.confirm',
    label: 'Insert suggestion',
    description: 'Insert the selected prompt suggestion.',
    scope: 'chat-suggestions',
    category: 'Chat - Suggestions',
    defaultBindings: ['Enter', 'Tab'],
  },
  {
    id: 'chat.suggestions.close',
    label: 'Close suggestions',
    description: 'Close the prompt suggestions list.',
    scope: 'chat-suggestions',
    category: 'Chat - Suggestions',
    defaultBindings: ['Escape'],
  },
  {
    id: 'chat.session.abort',
    label: 'Abort response',
    description: 'Stop the active chat response.',
    scope: 'chat-session',
    category: 'Chat',
    defaultBindings: ['Escape'],
  },
  {
    id: 'chat.newline',
    label: 'Insert newline',
    description: 'Insert a line break in the prompt input.',
    scope: 'chat',
    category: 'Chat',
    defaultBindings: ['Shift+Enter'],
  },
  {
    id: 'chat.submit',
    label: 'Send message',
    description: 'Submit the prompt.',
    scope: 'chat',
    category: 'Chat',
    defaultBindings: ['Enter'],
  },
  {
    id: 'editor.save',
    label: 'Save file',
    description: 'Save the current file.',
    scope: 'editor',
    category: 'Editor',
    defaultBindings: ['Mod+S'],
  },
  {
    id: 'editor.indent',
    label: 'Indent',
    description: 'Indent the current line or selection.',
    scope: 'editor',
    category: 'Editor',
    defaultBindings: ['Tab'],
  },
  {
    id: 'editor.outdent',
    label: 'Outdent',
    description: 'Outdent the current line or selection.',
    scope: 'editor',
    category: 'Editor',
    defaultBindings: ['Shift+Tab'],
  },
  {
    id: 'editor.format.bold',
    label: 'Bold',
    description: 'Toggle bold formatting.',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+B'],
  },
  {
    id: 'editor.format.italic',
    label: 'Italic',
    description: 'Toggle italic formatting.',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+I'],
  },
  {
    id: 'editor.format.strikethrough',
    label: 'Strikethrough',
    description: 'Toggle strikethrough formatting.',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+Shift+S'],
  },
  {
    id: 'editor.format.code',
    label: 'Inline code',
    description: 'Toggle inline code formatting.',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+`'],
  },
  {
    id: 'editor.format.link',
    label: 'Insert link',
    description: 'Insert or wrap selection with link.',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+K'],
  },
  {
    id: 'editor.format.highlight',
    label: 'Highlight',
    description: 'Toggle highlight/mark formatting.',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+Shift+H'],
  },
  {
    id: 'editor.format.inlineMath',
    label: 'Inline math',
    description: 'Toggle inline math formatting ($...$).',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+M'],
  },
  {
    id: 'editor.format.blockMath',
    label: 'Block math',
    description: 'Insert block math (multi-line $$...$$).',
    scope: 'editor',
    category: 'Editor - Formatting',
    defaultBindings: ['Mod+Shift+M'],
  },
  {
    id: 'editor.list.continue',
    label: 'Continue list',
    description: 'Continue a markdown list on the next line.',
    scope: 'editor-list',
    category: 'Editor - Lists',
    defaultBindings: ['Enter'],
  },
  {
    id: 'editor.list.removePrefix',
    label: 'Remove list prefix',
    description: 'Remove the current list marker.',
    scope: 'editor-list',
    category: 'Editor - Lists',
    defaultBindings: ['Backspace', 'Delete'],
  },
  {
    id: 'editor.slashMenu.next',
    label: 'Next command',
    description: 'Move to the next slash command.',
    scope: 'editor-slash',
    category: 'Editor - Slash Menu',
    defaultBindings: ['ArrowDown'],
  },
  {
    id: 'editor.slashMenu.prev',
    label: 'Previous command',
    description: 'Move to the previous slash command.',
    scope: 'editor-slash',
    category: 'Editor - Slash Menu',
    defaultBindings: ['ArrowUp'],
  },
  {
    id: 'editor.slashMenu.confirm',
    label: 'Insert command',
    description: 'Insert the selected slash command.',
    scope: 'editor-slash',
    category: 'Editor - Slash Menu',
    defaultBindings: ['Enter', 'Tab'],
  },
  {
    id: 'editor.slashMenu.close',
    label: 'Close menu',
    description: 'Close the slash command menu.',
    scope: 'editor-slash',
    category: 'Editor - Slash Menu',
    defaultBindings: ['Escape'],
  },
  {
    id: 'editor.checkbox.toggle',
    label: 'Toggle checkbox',
    description: 'Toggle a task list checkbox.',
    scope: 'editor-checkbox',
    category: 'Editor - Checkbox',
    defaultBindings: ['Enter', 'Space'],
  },
  {
    id: 'pdf.search.open',
    label: 'Open search',
    description: 'Open the PDF search bar.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Mod+F'],
  },
  {
    id: 'pdf.search.next',
    label: 'Next match',
    description: 'Jump to the next search match.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Enter', 'Mod+G'],
  },
  {
    id: 'pdf.search.prev',
    label: 'Previous match',
    description: 'Jump to the previous search match.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Shift+Enter', 'Mod+Shift+G'],
  },
  {
    id: 'pdf.search.close',
    label: 'Close search / annotation',
    description: 'Close search or exit annotation mode.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Escape'],
  },
  {
    id: 'pdf.save',
    label: 'Save annotations',
    description: 'Save PDF annotations.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Mod+S'],
  },
  {
    id: 'pdf.zoom.in',
    label: 'Zoom in',
    description: 'Zoom in the PDF view.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Mod+Plus'],
  },
  {
    id: 'pdf.zoom.out',
    label: 'Zoom out',
    description: 'Zoom out the PDF view.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Mod+-'],
  },
  {
    id: 'pdf.zoom.reset',
    label: 'Reset zoom',
    description: 'Reset the PDF zoom to automatic.',
    scope: 'pdf',
    category: 'PDF Viewer',
    defaultBindings: ['Mod+0'],
  },
  {
    id: 'image.zoom.in',
    label: 'Zoom in',
    description: 'Zoom in the image view.',
    scope: 'image',
    category: 'Image Viewer',
    defaultBindings: ['Mod+Plus'],
  },
  {
    id: 'image.zoom.out',
    label: 'Zoom out',
    description: 'Zoom out the image view.',
    scope: 'image',
    category: 'Image Viewer',
    defaultBindings: ['Mod+-'],
  },
  {
    id: 'image.reset',
    label: 'Reset view',
    description: 'Reset image zoom and position.',
    scope: 'image',
    category: 'Image Viewer',
    defaultBindings: ['Mod+0', 'Escape'],
  },
] as const satisfies readonly ShortcutDefinitionInput[];

export type ShortcutDefinition = (typeof shortcutRegistry)[number];
export type ShortcutId = ShortcutDefinition['id'];

const definitionMap = new Map<ShortcutId, ShortcutDefinition>(
  shortcutRegistry.map((def) => [def.id, def])
);

export function getShortcutDefinition(id: ShortcutId): ShortcutDefinition {
  const definition = definitionMap.get(id);
  if (!definition) {
    throw new Error(`Unknown shortcut id: ${id}`);
  }
  return definition;
}

export function getDefaultBindings(id: ShortcutId): string[] {
  const definition = getShortcutDefinition(id);
  return [...definition.defaultBindings];
}
