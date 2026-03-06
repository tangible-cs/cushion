import { syntaxTree, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { EditorState, type Extension, type Range, RangeSetBuilder } from '@codemirror/state';
import { StateField } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';

import { isSelectRange, isFocusEvent } from './reveal-on-cursor';

const hiddenDecoration = Decoration.mark({ class: 'cm-hidden' });

const languageLabelMap: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  rb: 'Ruby',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  csharp: 'C#',
  cs: 'C#',
  cpp: 'C++',
  cxx: 'C++',
  md: 'Markdown',
  plaintext: 'Text',
  text: 'Text',
};

function formatCodeBlockLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) return 'Text';
  const mapped = languageLabelMap[normalized];
  if (mapped) return mapped;
  if (normalized.length <= 3) return normalized.toUpperCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function updateCodeBlockHiddenDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name !== 'FencedCode') return;
      if (isSelectRange(state, node)) return;
      const cursor = node.node.cursor();
      cursor.iterate((child) => {
        if (child.type.name === 'CodeMark' || child.type.name === 'CodeInfo') {
          decorations.push(hiddenDecoration.range(child.from, child.to));
        }
      });
    },
  });
  return Decoration.set(decorations, true);
}

function decorateCodeBlocks(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const visited = new Set<string>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: ({ type, from: nFrom, to: nTo, node }) => {
        if (type.name !== 'FencedCode') return;

        const key = `${nFrom},${nTo}`;
        if (visited.has(key)) return;
        visited.add(key);

        const codeInfoNode = node.getChild('CodeInfo');
        const lang = codeInfoNode
          ? view.state.doc.sliceString(codeInfoNode.from, codeInfoNode.to).trim()
          : '';

        let pos = nFrom;
        while (pos <= nTo) {
          const line = view.state.doc.lineAt(pos);
          const isFirstLine = line.from === nFrom;
          const isLastLine = line.to >= nTo;

          const classes = ['cm-code-block'];
          if (isFirstLine) classes.push('cm-code-block-start');
          if (isLastLine) classes.push('cm-code-block-end');

          builder.add(
            line.from,
            line.from,
            Decoration.line({ class: classes.join(' ') }),
          );

          if (isFirstLine) {
            const codeContent = view.state.doc.sliceString(line.to + 1, nTo);
            const lastNewline = codeContent.lastIndexOf('\n');
            const code = lastNewline >= 0 ? codeContent.slice(0, lastNewline) : codeContent;

            builder.add(
              line.from,
              line.from,
              Decoration.widget({
                widget: new CodeBlockInfoWidget(lang, code),
                side: -1,
              }),
            );
          }

          pos = line.to + 1;
        }
      },
    });
  }

  return builder.finish();
}

class CodeBlockInfoWidget extends WidgetType {
  timeout: number | undefined;
  constructor(
    readonly lang: string,
    readonly code: string,
  ) {
    super();
  }
  eq(other: CodeBlockInfoWidget) {
    return other.lang === this.lang && other.code === this.code;
  }
  toDOM() {
    const dom = document.createElement('div');
    const languageLabel = formatCodeBlockLanguage(this.lang);
    dom.className = 'cm-code-block-info';
    dom.textContent = languageLabel;
    dom.tabIndex = -1;
    dom.onclick = (event) => {
      dom.textContent = 'Copied!';
      if (this.timeout) window.clearTimeout(this.timeout);
      this.timeout = window.setTimeout(() => {
        dom.textContent = languageLabel;
        this.timeout = undefined;
      }, 2000);
      if (window.navigator.clipboard) {
        window.navigator.clipboard.writeText(this.code);
      }
      event.stopPropagation();
      event.preventDefault();
    };
    return dom;
  }
}

const codeBlockHiddenField = StateField.define<DecorationSet>({
  create(state) {
    return updateCodeBlockHiddenDecorations(state);
  },
  update(deco, tr) {
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    if (tr.docChanged || tr.selection || isFocusEvent(tr) || treeChanged) {
      return updateCodeBlockHiddenDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const codeBlockViewPlugin: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorateCodeBlocks(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged
      ) {
        this.decorations = decorateCodeBlocks(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function codeBlockExtension(): Extension {
  return [
    codeBlockHiddenField,
    codeBlockViewPlugin,
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  ];
}
