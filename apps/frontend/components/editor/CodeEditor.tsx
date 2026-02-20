'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  type KeyBinding,
} from '@codemirror/view';
import {
  HighlightStyle,
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import {
  indentLess,
  indentMore,
  history,
  defaultKeymap,
  historyKeymap,
} from '@codemirror/commands';
import {
  highlightSelectionMatches,
  searchKeymap,
} from '@codemirror/search';
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { markdown } from '@codemirror/lang-markdown';
import { Table } from '@lezer/markdown';
import { languages } from '@codemirror/language-data';
import type { Extension } from '@codemirror/state';
import type { FileTreeNode } from '@cushion/types';
import {
  wysiwygExtension,
  focusModeExtension,
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  setFocusMode,
  type WikiLinkNavigateCallback,
  setEmbedResolver,
  type EmbedResolver,
} from '@/lib/codemirror-wysiwyg';
import { TaskListWithCanceled, Highlight, DisableSetextHeading, InlineMath } from '@/lib/markdown-extensions';
import { createListKeymap } from '@/lib/codemirror-wysiwyg/list-commands';
import { createFormatKeymap } from '@/lib/codemirror-wysiwyg/format-commands';
import { useShortcutBindings } from '@/lib/shortcuts';
import { toCodeMirrorKey } from '@/lib/shortcuts/utils';

interface CodeEditorProps {
  filePath: string;
  content: string;
  language?: string;
  onChange?: (content: string) => void;
  onSave?: () => void;
  /** File tree for wiki-link resolution */
  fileTree?: FileTreeNode[];
  /** Callback when a wiki-link is clicked (Ctrl+Click) */
  onWikiLinkNavigate?: WikiLinkNavigateCallback;
  /** Resolver for embed content (e.g., ![[file]]) */
  embedResolver?: EmbedResolver;
  /** Whether focus mode is enabled */
  focusModeEnabled?: boolean;
  /** Handle image pastes in markdown */
  onPasteImages?: (params: { files: File[]; view: EditorView; filePath: string }) => void;
}


const EDITOR_SHORTCUT_IDS = [
  'editor.save',
  'editor.indent',
  'editor.outdent',
] as const;

const EDITOR_FORMAT_SHORTCUT_IDS = [
  'editor.format.bold',
  'editor.format.italic',
  'editor.format.strikethrough',
  'editor.format.code',
  'editor.format.link',
  'editor.format.highlight',
  'editor.format.inlineMath',
  'editor.format.blockMath',
] as const;

const EDITOR_LIST_SHORTCUT_IDS = [
  'editor.indent',
  'editor.outdent',
  'editor.list.continue',
  'editor.list.removePrefix',
] as const;

async function getLanguageExtension(filePath: string, language?: string): Promise<Extension | null> {
  const ext = language || filePath.split('.').pop()?.toLowerCase() || '';

  // Markdown is special — needs WYSIWYG extensions
  if (ext === 'md' || ext === 'markdown') {
    return markdown({
      codeLanguages: languages,
      extensions: [Table, TaskListWithCanceled, Highlight, InlineMath, DisableSetextHeading],
    });
  }

  // For all other files, look up language support from the bundle (~30 languages)
  const filename = filePath.split('/').pop() || filePath.split('\\').pop() || '';
  const langDesc = languages.find((lang) =>
    lang.extensions.includes(ext) || lang.filename?.test(filename)
  );
  if (langDesc) {
    const langSupport = await langDesc.load();
    return langSupport;
  }

  return null;
}

function getClipboardImageFiles(clipboard: DataTransfer): File[] {
  const items = Array.from(clipboard.items ?? []);
  const files: File[] = [];

  for (const item of items) {
    if (item.kind !== 'file') continue;
    if (!item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }

  if (files.length > 0) return files;

  return Array.from(clipboard.files ?? []).filter((file) => file.type.startsWith('image/'));
}

export function CodeEditor({
  filePath,
  content,
  language,
  onChange,
  onSave,
  fileTree,
  onWikiLinkNavigate,
  embedResolver,
  focusModeEnabled = false,
  onPasteImages,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onWikiLinkNavigateRef = useRef(onWikiLinkNavigate);
  const embedResolverRef = useRef(embedResolver);
  const focusModeEnabledRef = useRef(focusModeEnabled);
  const onPasteImagesRef = useRef(onPasteImages);
  const typewriterRafRef = useRef<number | null>(null);
  const typewriterScrollRafRef = useRef<number | null>(null);
  const typewriterScrollTargetRef = useRef<number | null>(null);
  const isMouseDownRef = useRef(false);
  const editorKeymapCompartmentRef = useRef(new Compartment());
  const listKeymapCompartmentRef = useRef(new Compartment());
  const formatKeymapCompartmentRef = useRef(new Compartment());

  const editorShortcuts = useShortcutBindings(EDITOR_SHORTCUT_IDS);
  const listShortcuts = useShortcutBindings(EDITOR_LIST_SHORTCUT_IDS);
  const formatShortcuts = useShortcutBindings(EDITOR_FORMAT_SHORTCUT_IDS);

  const isMarkdownFile = useMemo(() => /\.(md|markdown)$/i.test(filePath), [filePath]);

  const editorKeymap = useMemo<KeyBinding[]>(() => {
    const bindings: KeyBinding[] = [];
    const seenKeys = new Set<string>();

    const addBindings = (keys: string[], run: (view: EditorView) => boolean) => {
      keys.forEach((binding) => {
        const key = toCodeMirrorKey(binding);
        if (!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        bindings.push({ key, run });
      });
    };

    addBindings(editorShortcuts['editor.save'], () => {
      onSaveRef.current?.();
      return true;
    });

    addBindings(editorShortcuts['editor.indent'], indentMore);
    addBindings(editorShortcuts['editor.outdent'], indentLess);

    return bindings;
  }, [editorShortcuts]);

  const listKeymap = useMemo(() => {
    return createListKeymap({
      indent: listShortcuts['editor.indent'],
      outdent: listShortcuts['editor.outdent'],
      continueList: listShortcuts['editor.list.continue'],
      removePrefix: listShortcuts['editor.list.removePrefix'],
    });
  }, [listShortcuts]);

  const formatKeymap = useMemo(() => {
    return createFormatKeymap({
      bold: formatShortcuts['editor.format.bold'],
      italic: formatShortcuts['editor.format.italic'],
      strikethrough: formatShortcuts['editor.format.strikethrough'],
      inlineCode: formatShortcuts['editor.format.code'],
      link: formatShortcuts['editor.format.link'],
      highlight: formatShortcuts['editor.format.highlight'],
      inlineMath: formatShortcuts['editor.format.inlineMath'],
      blockMath: formatShortcuts['editor.format.blockMath'],
    });
  }, [formatShortcuts]);

  // Keep callback refs up to date without re-creating the editor
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onWikiLinkNavigateRef.current = onWikiLinkNavigate;
  embedResolverRef.current = embedResolver;
  focusModeEnabledRef.current = focusModeEnabled;
  onPasteImagesRef.current = onPasteImages;

  const stopTypewriterScroll = useCallback(() => {
    if (typewriterScrollRafRef.current !== null) {
      cancelAnimationFrame(typewriterScrollRafRef.current);
      typewriterScrollRafRef.current = null;
    }
    typewriterScrollTargetRef.current = null;
  }, []);

  const smoothScrollTo = useCallback((container: HTMLElement, target: number) => {
    if (typewriterScrollTargetRef.current !== null
      && Math.abs(target - typewriterScrollTargetRef.current) < 1) {
      return;
    }
    typewriterScrollTargetRef.current = target;
    if (typewriterScrollRafRef.current !== null) {
      cancelAnimationFrame(typewriterScrollRafRef.current);
      typewriterScrollRafRef.current = null;
    }
    const startTop = container.scrollTop;
    const distance = target - startTop;
    if (Math.abs(distance) < 1) {
      typewriterScrollTargetRef.current = null;
      return;
    }
    const duration = Math.min(420, Math.max(200, Math.abs(distance) * 0.7));
    const start = performance.now();
    const easeInOutSine = (t: number) => (
      -(Math.cos(Math.PI * t) - 1) / 2
    );
    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      container.scrollTop = startTop + distance * easeInOutSine(t);
      if (t < 1) {
        typewriterScrollRafRef.current = requestAnimationFrame(step);
      } else {
        typewriterScrollRafRef.current = null;
        typewriterScrollTargetRef.current = null;
      }
    };
    typewriterScrollRafRef.current = requestAnimationFrame(step);
  }, []);

  const centerCursorInView = useCallback((view: EditorView) => {
    if (!focusModeEnabledRef.current) return;
    if (!view.hasFocus) return;
    const scrollContainer = view.dom.closest('[data-editor-scroll-container]') as HTMLElement | null;
    const container = scrollContainer ?? view.scrollDOM;
    if (!container) return;
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) return;
    const containerRect = container.getBoundingClientRect();
    const cursorCenter = (coords.top + coords.bottom) / 2;
    const containerCenter = containerRect.top + containerRect.height / 2;
    const delta = cursorCenter - containerCenter;
    if (Math.abs(delta) < 2) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.min(maxScroll, Math.max(0, container.scrollTop + delta));
    if (Math.abs(nextScrollTop - container.scrollTop) < 1) return;
    smoothScrollTo(container, nextScrollTop);
  }, [smoothScrollTo]);

  const scheduleTypewriterCentering = useCallback((view: EditorView) => {
    if (!focusModeEnabledRef.current) return;
    if (isMouseDownRef.current) return;
    if (!view.state.selection.main.empty) return;
    if (typewriterRafRef.current !== null) {
      cancelAnimationFrame(typewriterRafRef.current);
    }
    typewriterRafRef.current = requestAnimationFrame(() => {
      typewriterRafRef.current = null;
      centerCursorInView(view);
    });
  }, [centerCursorInView]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.style.setProperty('--md-code-gutter-width', '0px');
    let cancelled = false;

    // Theme that adapts via CSS variables (supports light/dark)
    const adaptiveTheme = EditorView.theme({
      '&': {
        backgroundColor: 'var(--md-bg, #1a1a1a)',
        color: 'var(--md-text, #e0e0e0)',
        outline: 'none',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-content': {
        caretColor: 'var(--md-text, #e0e0e0)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--md-text, #e0e0e0)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--md-selection-bg, rgba(100, 153, 255, 0.25)) !important',
      },
      '.cm-panels': {
        backgroundColor: 'var(--md-bg-secondary, #242424)',
        color: 'var(--md-text, #e0e0e0)',
      },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--md-border, #3a3a3a)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--md-border, #3a3a3a)' },
      '.cm-searchMatch': {
        backgroundColor: 'var(--md-highlight-yellow, rgba(255, 235, 59, 0.3))',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(128, 128, 128, 0.05)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--md-bg, #1a1a1a)',
        color: 'var(--md-text-faint, #666)',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(128, 128, 128, 0.08)',
      },
    });

    const adaptiveHighlight = HighlightStyle.define([
      { tag: tags.keyword, color: 'var(--md-code-keyword, #c678dd)' },
      { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: 'var(--md-code-text, #e06c75)' },
      { tag: [tags.function(tags.variableName)], color: 'var(--md-link-color, #61afef)' },
      { tag: [tags.labelName], color: 'var(--md-text, #e0e0e0)' },
      { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#d19a66' },
      { tag: [tags.definition(tags.name), tags.separator], color: 'var(--md-text, #e0e0e0)' },
      { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#e5c07b' },
      { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.special(tags.string)], color: '#56b6c2' },
      { tag: [tags.meta, tags.comment], color: 'var(--md-text-faint, #5c6370)', fontStyle: 'italic' },
      { tag: tags.strong, fontWeight: 'bold' },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strikethrough, textDecoration: 'line-through' },
      // Note: tags.link removed - we use .cm-link decoration for links with actual URLs
      // This prevents [0,1,2] from being styled as a link by the syntax highlighter
      { tag: tags.heading, fontWeight: 'bold', color: 'var(--md-code-text, #e06c75)' },
      { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#d19a66' },
      { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#98c379' },
      { tag: tags.invalid, color: 'var(--md-text-faint, #5c6370)' },
    ]);

    // --- Explicit setup (replaces opaque `basicSetup` bundle) ---
    // This gives us full control over which keymaps are active so every
    // binding either lives in the shortcut registry or is explicitly
    // documented as a CM-internal default.
    //
    // Registry-controlled shortcuts (customizable via Settings):
    //   editor.save, editor.indent, editor.outdent,
    //   editor.list.*, editor.slashMenu.*, editor.checkbox.toggle
    //
    // CM-internal shortcuts (not in registry, intentionally kept):
    //   Undo/Redo           Mod-Z / Mod-Y / Mod-Shift-Z
    //   Search               Mod-F / F3 / Shift-F3
    //   Select next occur.   Mod-D
    //   Select line          Alt-L (Ctrl-L on Mac)
    //   Toggle comment       Mod-/
    //   Block comment        Shift-Alt-A
    //   Delete line          Shift-Mod-K
    //   Move line up/down    Alt-Up / Alt-Down
    //   Copy line up/down    Shift-Alt-Up / Shift-Alt-Down
    //   Fold/unfold          Ctrl-Shift-[ / Ctrl-Shift-]
    //   Start completion     Ctrl-Space
    //   Bracket matching     Shift-Mod-\
    //   Cursor navigation    Arrow keys, Home/End, Page Up/Down, etc.
    //   Simplify selection   Escape (collapses multi-cursors)
    //   Close completion     Escape (closes autocomplete popup)
    //
    // Excluded (conflict with registry app-level shortcuts):
    //   Mod-G / Shift-Mod-G  (searchKeymap findNext/findPrevious)
    //     → conflicts with app.graph.toggle (Mod+G)
    //     → use F3/Shift-F3 for find next/prev instead

    // Filter searchKeymap to remove Mod-g / Shift-Mod-g bindings that
    // conflict with the app-level graph toggle shortcut (Mod+G).
    // Find next/prev remain available via F3 / Shift-F3.
    const filteredSearchKeymap = searchKeymap.filter((binding) => {
      const key = binding.key?.toLowerCase() ?? '';
      return key !== 'mod-g' && key !== 'shift-mod-g';
    });

    const extensions: Extension[] = [
      // -- Features (non-keymap) --
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      // -- Keymaps (CM-internal, explicitly listed) --
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...filteredSearchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      focusModeExtension(),
      adaptiveTheme,
      syntaxHighlighting(adaptiveHighlight),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        mousedown: () => {
          isMouseDownRef.current = true;
          stopTypewriterScroll();
          if (typewriterRafRef.current !== null) {
            cancelAnimationFrame(typewriterRafRef.current);
            typewriterRafRef.current = null;
          }
          return false;
        },
        mouseup: (_event, view) => {
          isMouseDownRef.current = false;
          if (focusModeEnabledRef.current) {
            scheduleTypewriterCentering(view);
          }
          return false;
        },
        wheel: () => {
          stopTypewriterScroll();
          return false;
        },
        paste: (event, view) => {
          if (!isMarkdownFile) return false;
          const handler = onPasteImagesRef.current;
          if (!handler) return false;
          const clipboard = event.clipboardData;
          if (!clipboard) return false;

          const files = getClipboardImageFiles(clipboard);
          if (files.length === 0) return false;

          event.preventDefault();
          handler({ files, view, filePath });
          return true;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (!focusModeEnabledRef.current) return;
        if (!update.selectionSet && !update.docChanged) return;
        scheduleTypewriterCentering(update.view);
      }),
      listKeymapCompartmentRef.current.of(
        isMarkdownFile ? Prec.high(keymap.of(listKeymap)) : []
      ),
      formatKeymapCompartmentRef.current.of(
        isMarkdownFile ? Prec.high(keymap.of(formatKeymap)) : []
      ),
      editorKeymapCompartmentRef.current.of(
        Prec.high(keymap.of(editorKeymap))
      ),
      EditorView.theme({
        '&': { width: '100%' },
        /* Let the editor grow with content, parent handles scrolling */
        '.cm-scroller': {
          overflow: 'visible',
          marginLeft: 'calc(-1 * var(--md-code-gutter-width, 0px))',
          width: 'calc(100% + var(--md-code-gutter-width, 0px))',
          paddingLeft: 'var(--md-content-padding-x, 1.25em)',
          paddingRight: 'var(--md-content-padding-x, 1.25em)',
        },
        /* Content area — match markdown layout padding for all file types */
        '.cm-content': {
          maxWidth: 'var(--md-content-max-width, 900px)',
          paddingTop: '1em',
          paddingBottom: '40vh',
          paddingLeft: '0',
          paddingRight: '0',
        },
      }),
    ];

    let gutterObserver: ResizeObserver | null = null;
    let destroyed = false;

    const initEditor = async () => {
      const langExt = await getLanguageExtension(filePath, language);
      if (cancelled) return;

      if (langExt) {
        extensions.push(langExt);
      }

      // Add WYSIWYG rendering for markdown files
      const fileExt = filePath.split('.').pop()?.toLowerCase() || '';
      if (fileExt === 'md' || fileExt === 'markdown') {
        extensions.push(wysiwygExtension());
      }

      const state = EditorState.create({
        doc: content,
        extensions,
      });

      const view = new EditorView({
        state,
        parent: container,
      });

      viewRef.current = view;
      setFocusMode(view, focusModeEnabledRef.current);
      if (focusModeEnabledRef.current) {
        scheduleTypewriterCentering(view);
      }

      if (!isMarkdownFile) {
        const gutterEl = view.dom.querySelector('.cm-gutters') as HTMLElement | null;
        const updateGutterWidth = () => {
          if (destroyed || !gutterEl) return;
          const width = gutterEl.getBoundingClientRect().width;
          if (!Number.isFinite(width)) return;
          let shift = width;
          const parent = container.parentElement;
          if (parent) {
            const parentRect = parent.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const availableLeft = Math.max(0, containerRect.left - parentRect.left);
            shift = Math.min(width, availableLeft);
          }
          container.style.setProperty('--md-code-gutter-width', `${Math.ceil(shift)}px`);
        };

        if (gutterEl) {
          requestAnimationFrame(updateGutterWidth);
          if (typeof ResizeObserver !== 'undefined') {
            gutterObserver = new ResizeObserver(updateGutterWidth);
            gutterObserver.observe(gutterEl);
            gutterObserver.observe(container);
          }
        }
      }

      if (fileTree && fileTree.length > 0) {
        updateWikiLinkFileTree(view, fileTree);
      }

      setWikiLinkNavigateCallback(view, (href, resolvedPath, createIfMissing) => {
        onWikiLinkNavigateRef.current?.(href, resolvedPath, createIfMissing);
      });

      setEmbedResolver(view, (path, options) => {
        if (!embedResolverRef.current) return Promise.resolve(null);
        return embedResolverRef.current(path, options);
      });
    };

    const handleWindowMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener('mouseup', handleWindowMouseUp);

    initEditor();

    return () => {
      cancelled = true;
      destroyed = true;
      gutterObserver?.disconnect();
      if (typewriterRafRef.current !== null) {
        cancelAnimationFrame(typewriterRafRef.current);
        typewriterRafRef.current = null;
      }
      stopTypewriterScroll();
      window.removeEventListener('mouseup', handleWindowMouseUp);
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
    // Re-create editor when filePath or language changes; content is initial only per file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editorKeymapCompartmentRef.current.reconfigure(
        Prec.high(keymap.of(editorKeymap))
      ),
    });
  }, [editorKeymap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: listKeymapCompartmentRef.current.reconfigure(
        isMarkdownFile ? Prec.high(keymap.of(listKeymap)) : []
      ),
    });
  }, [listKeymap, isMarkdownFile]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: formatKeymapCompartmentRef.current.reconfigure(
        isMarkdownFile ? Prec.high(keymap.of(formatKeymap)) : []
      ),
    });
  }, [formatKeymap, isMarkdownFile]);

  // Update file tree when it changes (for wiki-link resolution)
  useEffect(() => {
    if (viewRef.current && fileTree) {
      updateWikiLinkFileTree(viewRef.current, fileTree);
    }
  }, [fileTree]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    setFocusMode(view, focusModeEnabled);
    if (focusModeEnabled) {
      scheduleTypewriterCentering(view);
    } else {
      stopTypewriterScroll();
    }
  }, [focusModeEnabled, scheduleTypewriterCentering, stopTypewriterScroll]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        ...(!isMarkdownFile ? {
          maxWidth: 'var(--md-content-max-width, 900px)',
          margin: '0 auto',
          padding: '0 0 1em',
          boxSizing: 'border-box' as const,
        } : {}),
      }}
    />
  );
}
