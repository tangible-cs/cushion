'use client';

import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { Table } from '@lezer/markdown';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { LanguageDescription } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { FileTreeNode } from '@cushion/types';
import {
  wysiwygExtension,
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from '@/lib/codemirror-wysiwyg';

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
}

/**
 * Language descriptions for code blocks inside markdown.
 * Maps common language identifiers to their CodeMirror language support.
 */
const markdownCodeLanguages = [
  // JavaScript/TypeScript variants
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'jsx'],
    support: javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts', 'tsx'],
    support: javascript({ jsx: true, typescript: true }),
  }),
  // Other languages
  LanguageDescription.of({
    name: 'json',
    support: json(),
  }),
  LanguageDescription.of({
    name: 'css',
    support: css(),
  }),
  LanguageDescription.of({
    name: 'html',
    alias: ['htm'],
    support: html(),
  }),
  LanguageDescription.of({
    name: 'python',
    alias: ['py'],
    support: python(),
  }),
];

function getLanguageExtension(filePath: string, language?: string): Extension | null {
  const ext = language || filePath.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'md':
    case 'markdown':
      // Configure markdown with code block syntax highlighting
      return markdown({ codeLanguages: markdownCodeLanguages, extensions: [Table] });
    case 'js':
    case 'jsx':
    case 'javascript':
      return javascript({ jsx: true });
    case 'ts':
    case 'tsx':
    case 'typescript':
    case 'typescriptreact':
      return javascript({ jsx: true, typescript: true });
    case 'json':
      return json();
    case 'css':
      return css();
    case 'html':
      return html();
    case 'py':
    case 'python':
      return python();
    default:
      return null;
  }
}

export function CodeEditor({
  filePath,
  content,
  language,
  onChange,
  onSave,
  fileTree,
  onWikiLinkNavigate,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onWikiLinkNavigateRef = useRef(onWikiLinkNavigate);

  // Keep callback refs up to date without re-creating the editor
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onWikiLinkNavigateRef.current = onWikiLinkNavigate;

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(filePath, language);

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
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
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
      { tag: tags.link, color: 'var(--md-link-color, #61afef)', textDecoration: 'underline' },
      { tag: tags.heading, fontWeight: 'bold', color: 'var(--md-code-text, #e06c75)' },
      { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#d19a66' },
      { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#98c379' },
      { tag: tags.invalid, color: 'var(--md-text-faint, #5c6370)' },
    ]);

    const extensions: Extension[] = [
      basicSetup,
      adaptiveTheme,
      syntaxHighlighting(adaptiveHighlight),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      keymap.of([
        indentWithTab,
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ]),
      EditorView.theme({
        '&': { width: '100%' },
        /* Let the editor grow with content, parent handles scrolling */
        '.cm-scroller': { overflow: 'visible' },
        /* Content area — match markdown layout padding for all file types */
        '.cm-content': {
          maxWidth: 'var(--md-content-max-width, 900px)',
          padding: 'var(--md-content-padding, 1em 1.25em)',
          paddingBottom: '40vh',
        },
      }),
    ];

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
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Set initial file tree for wiki-links
    if (fileTree && fileTree.length > 0) {
      console.log('[CodeEditor] Setting initial file tree:', fileTree.length, 'items');
      updateWikiLinkFileTree(view, fileTree);
    }
    
    // Always set up the navigation callback wrapper that uses the ref
    // This ensures we always use the latest callback from props
    console.log('[CodeEditor] Setting up wiki-link navigation callback');
    setWikiLinkNavigateCallback(view, (href, resolvedPath, createIfMissing) => {
      console.log('[CodeEditor] Navigation callback invoked, ref exists:', !!onWikiLinkNavigateRef.current);
      onWikiLinkNavigateRef.current?.(href, resolvedPath, createIfMissing);
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create editor when filePath or language changes; content is initial only per file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, language]);

  // Update file tree when it changes (for wiki-link resolution)
  useEffect(() => {
    if (viewRef.current && fileTree) {
      console.log('[CodeEditor] Updating file tree:', fileTree.length, 'items');
      updateWikiLinkFileTree(viewRef.current, fileTree);
    }
  }, [fileTree]);

  const isMarkdown = /\.(md|markdown)$/i.test(filePath);
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        ...(!isMarkdown ? {
          maxWidth: 'var(--md-content-max-width, 900px)',
          margin: '0 auto',
          padding: '0 1.25em 1em',
          boxSizing: 'border-box' as const,
        } : {}),
      }}
    />
  );
}
