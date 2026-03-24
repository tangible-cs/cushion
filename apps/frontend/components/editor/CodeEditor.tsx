
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
  panels,
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
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  wysiwygExtension,
  focusModeExtension,
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  setFocusMode,
  diffTheme,
  enterDiffReview,
  exitDiffReview,
  acceptAllChunks,
  rejectAllChunks,
  getChunkCount,
  diffReviewKeymap,
} from '@/lib/codemirror-wysiwyg';
import { useDiffReviewStore } from '@/stores/diffReviewStore';
import { TaskListWithCanceled, Highlight, DisableSetextHeading, InlineMath, BlockMath } from '@/lib/markdown-extensions';
import { createListKeymap } from '@/lib/codemirror-wysiwyg/list-commands';
import { createFormatKeymap } from '@/lib/codemirror-wysiwyg/format-commands';
import { modernSearchExtension } from '@/lib/codemirror-search-panel';
import { useShortcutBindings } from '@/lib/shortcuts';
import { toCodeMirrorKey } from '@/lib/shortcuts/utils';
import { useEditorPanelContext } from './EditorPanelContext';

interface CodeEditorProps {
  filePath: string;
}


const EDITOR_SHORTCUT_IDS = [
  'editor.save',
  'editor.indent',
  'editor.outdent',
  'editor.addSelectionToChat',
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
      extensions: [Table, TaskListWithCanceled, Highlight, InlineMath, BlockMath, DisableSetextHeading],
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

export function CodeEditor({ filePath }: CodeEditorProps) {
  const {
    handleChange: onChange,
    handleSave: onSave,
    fileTree,
    handleWikiLinkNavigate: onWikiLinkNavigate,
    focusModeEnabled,
    handlePasteImages: onPasteImages,
    searchPanelContainerRef,
    diffAcceptAllRef: onDiffAcceptAll,
    diffRejectAllRef: onDiffRejectAll,
    diffExitReviewRef: onDiffExitReview,
    diffSaveRef: onDiffSave,
    onAddSelectionToChat,
  } = useEditorPanelContext();
  const content = useWorkspaceStore((s) => s.openFiles.get(filePath)?.content ?? '');
  const language = useWorkspaceStore((s) => s.openFiles.get(filePath)?.language);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onWikiLinkNavigateRef = useRef(onWikiLinkNavigate);
  const focusModeEnabledRef = useRef(focusModeEnabled);
  const onPasteImagesRef = useRef(onPasteImages);
  const onAddSelectionToChatRef = useRef(onAddSelectionToChat);
  const typewriterRafRef = useRef<number | null>(null);
  const typewriterScrollRafRef = useRef<number | null>(null);
  const typewriterScrollTargetRef = useRef<number | null>(null);
  const isMouseDownRef = useRef(false);
  const editorKeymapCompartmentRef = useRef(new Compartment());
  const listKeymapCompartmentRef = useRef(new Compartment());
  const formatKeymapCompartmentRef = useRef(new Compartment());
  const lineNumbersCompartmentRef = useRef(new Compartment());
  const spellcheckCompartmentRef = useRef(new Compartment());
  const closeBracketsCompartmentRef = useRef(new Compartment());
  const foldGutterCompartmentRef = useRef(new Compartment());
  const readableLineLengthCompartmentRef = useRef(new Compartment());
  const mergeViewCompartmentRef = useRef(new Compartment());
  const diffKeymapCompartmentRef = useRef(new Compartment());
  const isReviewingRef = useRef(false);

  const editorShortcuts = useShortcutBindings(EDITOR_SHORTCUT_IDS);
  const listShortcuts = useShortcutBindings(EDITOR_LIST_SHORTCUT_IDS);
  const formatShortcuts = useShortcutBindings(EDITOR_FORMAT_SHORTCUT_IDS);
  const preferences = useWorkspaceStore((state) => state.preferences);

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

    addBindings(editorShortcuts['editor.addSelectionToChat'], (view) => {
      const sel = view.state.selection.main;
      if (sel.empty) return false;
      const startLine = view.state.doc.lineAt(sel.from);
      const endLine = view.state.doc.lineAt(sel.to);
      const text = view.state.sliceDoc(sel.from, sel.to);
      const preview = text.length > 200 ? text.slice(0, 200) + '…' : text;
      onAddSelectionToChatRef.current?.({
        path: filePath,
        selection: {
          startLine: startLine.number,
          startChar: sel.from - startLine.from,
          endLine: endLine.number,
          endChar: sel.to - endLine.from,
        },
        preview,
      });
      return true;
    });

    return bindings;
  }, [editorShortcuts, filePath]);

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

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onWikiLinkNavigateRef.current = onWikiLinkNavigate;
  focusModeEnabledRef.current = focusModeEnabled;
  onPasteImagesRef.current = onPasteImages;
  onAddSelectionToChatRef.current = onAddSelectionToChat;

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

  const onDiffSaveRef = useRef(onDiffSave);
  onDiffSaveRef.current = onDiffSave;

  const resolveReview = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!isReviewingRef.current) return;

    const mixedContent = view.state.doc.toString();

    // prevent re-entry
    isReviewingRef.current = false;

    exitDiffReview(view, mergeViewCompartmentRef.current);
    view.dispatch({
      effects: diffKeymapCompartmentRef.current.reconfigure([]),
    });

    const { reviewAfter, reviewingFilePath } = useDiffReviewStore.getState();

    onChangeRef.current?.(mixedContent);

    // Always save — file watcher was blocked during review so store needs sync
    if (reviewingFilePath) {
      const saveRef = onDiffSaveRef.current;
      if (saveRef?.current) {
        saveRef.current(reviewingFilePath, mixedContent).catch((err) => {
          console.error('[resolveReview] save failed:', err);
        });
      } else {
        console.warn('[resolveReview] no save ref available');
      }
    }

    useDiffReviewStore.getState().finishReview();
  }, []);

  const handleAcceptAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    acceptAllChunks(view);
    resolveReview();
  }, [resolveReview]);

  const handleRejectAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    rejectAllChunks(view);
    resolveReview();
  }, [resolveReview]);

  const handleExitReview = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    // Unresolved chunks keep AI content
    acceptAllChunks(view);
    resolveReview();
  }, [resolveReview]);

  // Expose diff review handlers to parent
  useEffect(() => {
    if (onDiffAcceptAll) onDiffAcceptAll.current = handleAcceptAll;
    if (onDiffRejectAll) onDiffRejectAll.current = handleRejectAll;
    if (onDiffExitReview) onDiffExitReview.current = handleExitReview;
    return () => {
      if (onDiffAcceptAll) onDiffAcceptAll.current = null;
      if (onDiffRejectAll) onDiffRejectAll.current = null;
      if (onDiffExitReview) onDiffExitReview.current = null;
    };
  }, [handleAcceptAll, handleRejectAll, handleExitReview, onDiffAcceptAll, onDiffRejectAll, onDiffExitReview]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let cancelled = false;

    // Theme that adapts via CSS variables (supports light/dark)
    const adaptiveTheme = EditorView.theme({
      '&': {
        backgroundColor: 'var(--md-bg)',
        color: 'var(--md-text)',
        outline: 'none',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-content': {
        caretColor: 'var(--md-text)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--md-text)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--md-selection-bg) !important',
      },
      '.cm-panels': {
        backgroundColor: 'var(--md-bg-secondary)',
        color: 'var(--md-text)',
      },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--md-border)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--md-border)' },
      '.cm-searchMatch': {
        backgroundColor: 'var(--accent-primary-12)',
        outline: '1px solid var(--border-subtle)',
        borderRadius: '2px',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--accent-primary-12)',
        outline: '1px solid var(--accent-primary)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--md-active-line-bg)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--md-bg)',
        color: 'var(--md-text-faint)',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--md-active-line-gutter-bg)',
      },
    });

    const adaptiveHighlight = HighlightStyle.define([
      { tag: tags.keyword, color: 'var(--md-code-keyword)' },
      { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: 'var(--md-code-variable)' },
      { tag: [tags.function(tags.variableName)], color: 'var(--md-code-function)' },
      { tag: [tags.labelName], color: 'var(--md-text)' },
      { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: 'var(--md-code-number)' },
      { tag: [tags.definition(tags.name), tags.separator], color: 'var(--md-text)' },
      { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: 'var(--md-code-type)' },
      { tag: [tags.operator, tags.operatorKeyword, tags.escape, tags.regexp, tags.special(tags.string)], color: 'var(--md-code-operator)' },
      { tag: tags.url, color: 'var(--md-link-color)' },
      { tag: [tags.meta, tags.comment], color: 'var(--md-code-comment)', fontStyle: 'italic' },
      { tag: tags.strong, fontWeight: '500' },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strikethrough, textDecoration: 'line-through' },
      { tag: tags.heading, fontWeight: '600', color: 'var(--md-text)' },
      { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: 'var(--md-code-boolean)' },
      { tag: tags.processingInstruction, color: 'var(--md-text)' },
      { tag: [tags.string, tags.inserted], color: 'var(--md-code-string)' },
      { tag: tags.invalid, color: 'var(--md-text-faint)' },
    ]);

    // Filter out Mod-g / Shift-Mod-g (conflicts with app.graph.toggle)
    const filteredSearchKeymap = searchKeymap.filter((binding) => {
      const key = binding.key?.toLowerCase() ?? '';
      return key !== 'mod-g' && key !== 'shift-mod-g';
    });

    const prefs = useWorkspaceStore.getState().preferences;

    const extensions: Extension[] = [
      // -- Features (non-keymap) --
      lineNumbersCompartmentRef.current.of(
        prefs.showLineNumber ? [lineNumbers(), highlightActiveLineGutter()] : []
      ),
      highlightSpecialChars(),
      history(),
      foldGutterCompartmentRef.current.of(
        prefs.foldHeading || prefs.foldIndent ? foldGutter() : []
      ),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBracketsCompartmentRef.current.of(
        prefs.autoPairBrackets ? closeBrackets() : []
      ),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      ...(searchPanelContainerRef?.current
        ? [panels({ topContainer: searchPanelContainerRef.current })]
        : []),
      modernSearchExtension,
      highlightSelectionMatches(),
      spellcheckCompartmentRef.current.of(
        prefs.spellcheck
          ? EditorView.contentAttributes.of({ spellcheck: 'true' })
          : EditorView.contentAttributes.of({ spellcheck: 'false' })
      ),
      EditorView.lineWrapping,
      // -- Keymaps (CM-internal, explicitly listed) --
      keymap.of([
        ...(prefs.autoPairBrackets ? closeBracketsKeymap : []),
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
        if (update.docChanged && !isReviewingRef.current) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      // Sync chunk count during diff review
      EditorView.updateListener.of((update) => {
        if (!isReviewingRef.current) return;
        const count = getChunkCount(update.state);
        useDiffReviewStore.getState().updateChunkCount(count);
        // Auto-exit when all chunks are resolved (individual accept/reject)
        if (count === 0) {
          resolveReview();
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
        '&': { width: '100%', maxWidth: '100%', overflow: 'visible' },
        /* Let the editor grow with content, parent handles scrolling */
        '.cm-scroller': {
          overflow: 'visible',
          paddingLeft: 'var(--md-content-padding-x, 1.25em)',
          paddingRight: 'var(--md-content-padding-x, 1.25em)',
          minWidth: '0',
        },
        /* Content area — match markdown layout padding for all file types */
        '.cm-content': {
          minWidth: '0',
          ...(isMarkdownFile ? { width: '100%' } : {}),
          paddingTop: '1em',
          paddingBottom: '40vh',
          paddingLeft: '0',
          paddingRight: '0',
        },
      }),
      readableLineLengthCompartmentRef.current.of(
        prefs.readableLineLength
          ? EditorView.theme({ '.cm-content': { maxWidth: 'var(--md-content-max-width, 900px)' } })
          : EditorView.theme({ '.cm-content': { maxWidth: 'none' } })
      ),
      // Diff review: merge view (starts empty, enabled dynamically)
      mergeViewCompartmentRef.current.of([]),
      diffKeymapCompartmentRef.current.of([]),
      diffTheme,
    ];

    const initEditor = async () => {
      const langExt = await getLanguageExtension(filePath, language);
      if (cancelled) return;

      if (langExt) {
        extensions.push(langExt);
      }

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

      if (fileTree && fileTree.length > 0) {
        updateWikiLinkFileTree(view, fileTree);
      }

      setWikiLinkNavigateCallback(view, (href, resolvedPath, createIfMissing) => {
        onWikiLinkNavigateRef.current?.(href, resolvedPath, createIfMissing);
      });
    };

    const handleWindowMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener('mouseup', handleWindowMouseUp);

    initEditor();

    return () => {
      cancelled = true;
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
    // content intentionally omitted — initial-value only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, language]);

  // Sync external content changes (e.g. file changed on disk) into CodeMirror
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (content !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: content },
      });
    }
  }, [content]);

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

  // Reconfigure editor compartments when preferences change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const effects = [
      lineNumbersCompartmentRef.current.reconfigure(
        preferences.showLineNumber ? [lineNumbers(), highlightActiveLineGutter()] : []
      ),
      spellcheckCompartmentRef.current.reconfigure(
        preferences.spellcheck
          ? EditorView.contentAttributes.of({ spellcheck: 'true' })
          : EditorView.contentAttributes.of({ spellcheck: 'false' })
      ),
      closeBracketsCompartmentRef.current.reconfigure(
        preferences.autoPairBrackets ? closeBrackets() : []
      ),
      foldGutterCompartmentRef.current.reconfigure(
        preferences.foldHeading || preferences.foldIndent ? foldGutter() : []
      ),
      readableLineLengthCompartmentRef.current.reconfigure(
        preferences.readableLineLength
          ? EditorView.theme({ '.cm-content': { maxWidth: 'var(--md-content-max-width, 900px)' } })
          : EditorView.theme({ '.cm-content': { maxWidth: 'none' } })
      ),
    ];

    view.dispatch({ effects });
  }, [
    preferences.showLineNumber,
    preferences.spellcheck,
    preferences.autoPairBrackets,
    preferences.foldHeading,
    preferences.foldIndent,
    preferences.readableLineLength,
  ]);

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

  // Subscribe to pending diff reviews
  useEffect(() => {
    const unsub = useDiffReviewStore.subscribe(
      (state) => state.pendingDiff,
      (pendingDiff) => {
        const view = viewRef.current;
        if (!view || !pendingDiff) return;
        if (pendingDiff.filePath !== filePath) return;
        if (pendingDiff.before === pendingDiff.after) return;

        // Enable diff review keymap
        view.dispatch({
          effects: diffKeymapCompartmentRef.current.reconfigure(
            Prec.highest(diffReviewKeymap(handleAcceptAll, handleRejectAll))
          ),
        });

        // Enter diff review
        isReviewingRef.current = true;
        useDiffReviewStore.getState().startReview(filePath);
        enterDiffReview(view, mergeViewCompartmentRef.current, pendingDiff.before, pendingDiff.after);

        // Sync initial chunk count
        const count = getChunkCount(view.state);
        useDiffReviewStore.getState().updateChunkCount(count);
      }
    );
    return unsub;
  }, [filePath, handleAcceptAll, handleRejectAll]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        ...(!isMarkdownFile ? {
          maxWidth: preferences.readableLineLength ? 'var(--md-content-max-width, 900px)' : 'none',
          margin: '0 auto',
          padding: '0 0 1em',
          boxSizing: 'border-box' as const,
        } : {}),
      }}
    />
  );
}
