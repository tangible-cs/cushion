import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { EditorState, Range, StateField } from '@codemirror/state';
import { isSelectRange, isSelectLine, isFocusEvent, mouseSelectEffect } from './reveal-on-cursor';
import { getListNestingDepth } from './list-utils';
import { ImageWidget } from './widgets/image-widget';
import { PdfWidget } from './widgets/pdf-widget';
import { NoteEmbedWidget } from './widgets/note-embed-widget';
import { UnsupportedEmbedWidget } from './widgets/unsupported-embed-widget';
import { classifyEmbed, embedSourceRevealEffect, type EmbedType } from './embed-utils';
import { MathWidget } from './widgets/math-widget';
import { filePathsField } from './wiki-link-plugin';
import { resolveWikiLink } from '../wiki-link-resolver';

function getChildRanges(node: { node: { cursor: () => { iterate: (cb: (node: { type: { name: string }; from: number; to: number }) => void) => void } } }) {
  const ranges: { name: string; from: number; to: number }[] = [];
  const cursor = node.node.cursor();
  cursor.iterate((child) => {
    ranges.push({ name: child.type.name, from: child.from, to: child.to });
  });
  return ranges;
}

function findLinkUrl(state: EditorState, node: { node: { cursor: () => { iterate: (cb: (node: { type: { name: string }; from: number; to: number }) => void) => void } } }): string | null {
  const ranges = getChildRanges(node);
  const urlNode = ranges.find((range) => range.name === 'URL');
  if (!urlNode) return null;
  return state.doc.sliceString(urlNode.from, urlNode.to);
}

function isExternalLinkUrl(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim());
}

const languageLabelMap: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript',
  ts: 'TypeScript', typescript: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX',
  py: 'Python', python: 'Python',
  rb: 'Ruby', ruby: 'Ruby',
  rs: 'Rust', rust: 'Rust',
  go: 'Go', java: 'Java',
  kt: 'Kotlin', kotlin: 'Kotlin',
  cs: 'C#', csharp: 'C#',
  cpp: 'C++', 'c++': 'C++', c: 'C',
  sh: 'Shell', shell: 'Shell',
  bash: 'Bash', zsh: 'Zsh',
  ps1: 'PowerShell', powershell: 'PowerShell',
  yml: 'YAML', yaml: 'YAML',
  json: 'JSON', toml: 'TOML',
  md: 'Markdown', markdown: 'Markdown',
  html: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  sql: 'SQL', gql: 'GraphQL', graphql: 'GraphQL',
  dockerfile: 'Dockerfile', docker: 'Docker',
  xml: 'XML', svg: 'SVG', lua: 'Lua', r: 'R', swift: 'Swift',
  php: 'PHP', perl: 'Perl', elixir: 'Elixir', erlang: 'Erlang',
  haskell: 'Haskell', hs: 'Haskell', clojure: 'Clojure',
  scala: 'Scala', zig: 'Zig', nim: 'Nim', dart: 'Dart',
};

function formatCodeBlockLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  if (languageLabelMap[lower]) return languageLabelMap[lower];
  return lower.length <= 3 ? lower.toUpperCase() : lower.charAt(0).toUpperCase() + lower.slice(1);
}

const COPY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

class CodeBlockInfoWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly codeLength: number,
    readonly contentFrom: number,
    readonly contentTo: number,
  ) {
    super();
  }

  eq(other: CodeBlockInfoWidget) {
    return this.lang === other.lang && this.codeLength === other.codeLength;
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-code-block-info';
    span.title = 'Click to copy';
    if (this.lang) {
      span.textContent = formatCodeBlockLanguage(this.lang);
    } else {
      span.innerHTML = COPY_SVG;
    }
    const { contentFrom, contentTo } = this;
    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = view.state.doc.sliceString(contentFrom, contentTo);
      navigator.clipboard.writeText(code);
      if (this.lang) {
        const original = span.textContent;
        span.textContent = 'Copied!';
        setTimeout(() => { span.textContent = original; }, 2000);
      } else {
        span.innerHTML = CHECK_SVG;
        setTimeout(() => { span.innerHTML = COPY_SVG; }, 2000);
      }
    });
    return span;
  }

  ignoreEvent() { return true; }
}

export const embedRevealedField = StateField.define<number | null>({
  create() { return null; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(embedSourceRevealEffect)) return e.value;
    }
    if (value !== null && tr.docChanged) {
      try {
        return tr.changes.mapPos(value, 1);
      } catch {
        return null;
      }
    }
    if (value !== null && tr.selection) {
      try {
        const line = tr.state.doc.lineAt(value);
        const cursorOnLine = tr.state.selection.ranges.some(r => {
          const headLine = tr.state.doc.lineAt(r.head).number;
          return headLine === line.number;
        });
        if (!cursorOnLine) return null;
      } catch {
        return null;
      }
    }
    return value;
  },
});

function buildMarkDecorations(view: EditorView): DecorationSet {
  const state = view.state;
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter(node) {
      const type = node.type.name;
      const from = node.from;
      const to = node.to;

      // Tables are decorated by the table plugin — skip entirely
      if (type === 'Table') return false;

      if (type === 'FrontMatter' || type === 'Frontmatter') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;
        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);
          decorations.push(
            Decoration.line({
              class: 'cm-frontmatter',
            }).range(line.from),
          );
        }
        return false;
      }

      if (/^ATXHeading[1-6]$/.test(type)) {
        const level = parseInt(type.charAt(type.length - 1), 10);
        decorations.push(
          Decoration.line({
            class: `cm-heading-${level}`,
          }).range(state.doc.lineAt(from).from),
        );
        return true;
      }

      if (type === 'StrongEmphasis') {
        decorations.push(
          Decoration.mark({ class: 'cm-strong-text' }).range(from, to),
        );
        return false;
      }

      if (type === 'Emphasis') {
        decorations.push(
          Decoration.mark({ class: 'cm-emphasis-text' }).range(from, to),
        );
        return false;
      }

      if (type === 'Strikethrough') {
        decorations.push(
          Decoration.mark({ class: 'cm-strikethrough-text' }).range(from, to),
        );
        return false;
      }

      if (type === 'Highlight') {
        decorations.push(
          Decoration.mark({ class: 'cm-highlight-text' }).range(from, to),
        );
        return false;
      }

      if (type === 'InlineCode') {
        decorations.push(
          Decoration.mark({ class: 'cm-inline-code' }).range(from, to),
        );
        return false;
      }

      if (type === 'InlineMath') {
        return false;
      }

      if (type === 'Link') {
        const linkUrl = findLinkUrl(state, node);
        if (!linkUrl) return false;

        const isExternal = isExternalLinkUrl(linkUrl);

        decorations.push(
          Decoration.mark({
            class: 'cm-link',
            attributes: {
              title: linkUrl,
              'data-href': linkUrl,
              'data-external': isExternal ? 'true' : 'false',
            },
          }).range(from, to),
        );

        if (isSelectRange(state, { from, to })) {
          const childRanges = getChildRanges(node);
          for (const child of childRanges) {
            if (child.name === 'LinkMark') {
              decorations.push(
                Decoration.mark({ class: 'cm-link-syntax' }).range(child.from, child.to),
              );
            }
          }
        }

        return false;
      }

      if (type === 'Image') {
        return false;
      }

      if (type === 'Blockquote') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;
        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);
          decorations.push(Decoration.line({ class: 'cm-blockquote' }).range(line.from));
        }
        return true;
      }

      if (type === 'ListItem') {
        const depth = Math.min(getListNestingDepth(node.node) + 1, 9); // 1-based, capped at 9
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;
        const listMark = node.node.getChild('ListMark');
        const markLine = listMark ? state.doc.lineAt(listMark.from).number : -1;

        const childListLines = [
          ...node.node.getChildren('BulletList'),
          ...node.node.getChildren('OrderedList'),
        ].map(c => ({
          start: state.doc.lineAt(c.from).number,
          end: state.doc.lineAt(Math.min(c.to, state.doc.length)).number,
        }));

        for (let i = startLine; i <= endLine; i++) {
          if (childListLines.some(c => i >= c.start && i <= c.end)) continue;
          const line = state.doc.line(i);
          let cls = `cm-list-line cm-list-line-${depth}`;
          if (i !== markLine) cls += ' cm-list-line-nobullet';
          decorations.push(Decoration.line({ class: cls }).range(line.from));
        }
        return; // continue into children for nested lists + inline marks
      }

      if (type === 'HorizontalRule') {
        const line = state.doc.lineAt(from);
        const cursorOnHr = isSelectLine(state, from, to);

        decorations.push(
          Decoration.line({
            class: cursorOnHr ? 'cm-hr-line cm-hr-line-revealed' : 'cm-hr-line',
          }).range(line.from),
        );
        decorations.push(
          Decoration.mark({
            class: cursorOnHr ? 'cm-hr-content cm-hr-content-revealed' : 'cm-hr-content',
          }).range(from, to),
        );
        return false;
      }

      if (type === 'Escape') {
        return false;
      }

      if (type === 'TaskMarker') {
        const markerText = state.doc.sliceString(from, to);
        const isChecked = markerText.includes('x') || markerText.includes('X');
        if (isChecked) {
          const line = state.doc.lineAt(from);
          decorations.push(
            Decoration.line({ class: 'cm-task-checked' }).range(line.from),
          );
        }
        return false;
      }

      if (type === 'FencedCode') {
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length));

        const cursorOnFence = state.selection.ranges.some(r => {
          const headLine = state.doc.lineAt(r.head).number;
          return headLine === startLine.number || headLine === endLine.number;
        });

        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = state.doc.line(i);
          let cls = 'cm-code-block';
          if (i === startLine.number) cls += ' cm-code-block-start';
          if (i === endLine.number) cls += ' cm-code-block-end';
          if (cursorOnFence && (i === startLine.number || i === endLine.number)) {
            cls += ' cm-code-fence-revealed';
          }
          decorations.push(Decoration.line({ class: cls }).range(line.from));
        }

        return false;
      }

      if (type === 'BlockMath') {
        return false;
      }

      return true;
    },
    });
  }

  for (const { from, to } of view.visibleRanges) {
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.length === 0 || line.text.charCodeAt(0) !== 9) continue;

      let skip = false;
      const resolved = tree.resolveInner(line.from, 1);
      for (let n: typeof resolved | null = resolved; n; n = n.parent) {
        const name = n.type.name;
        if (name === 'ListItem' || name === 'BulletList' || name === 'OrderedList' ||
            name === 'FencedCode' || name === 'CodeBlock' || name === 'Blockquote' ||
            name === 'FrontMatter' || name === 'Frontmatter' || name === 'BlockMath' ||
            name === 'Table' || name === 'HTMLBlock') {
          skip = true;
          break;
        }
      }
      if (skip) continue;

      let tabCount = 0;
      while (tabCount < line.text.length && line.text.charCodeAt(tabCount) === 9) tabCount++;
      const depth = Math.min(tabCount, 9);
      decorations.push(
        Decoration.line({ class: `cm-indent-line cm-indent-line-${depth}` }).range(line.from)
      );
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

function addEmbedDecoration(
  decorations: Range<Decoration>[],
  from: number, to: number,
  src: string, alt: string,
  isRevealed: boolean,
  width: number | null,
  embedType: EmbedType,
  heading: string | null,
): void {
  let widget: WidgetType;
  switch (embedType) {
    case 'image':
      widget = new ImageWidget(src, alt, isRevealed, width);
      break;
    case 'pdf':
      widget = new PdfWidget(src, alt, isRevealed, heading);
      break;
    case 'note':
      widget = new NoteEmbedWidget(src, heading, alt, isRevealed);
      break;
    case 'unsupported':
      widget = new UnsupportedEmbedWidget(src, alt, isRevealed);
      break;
  }
  if (isRevealed) {
    decorations.push(
      Decoration.widget({ widget, block: true, side: 1 }).range(to),
    );
  } else {
    decorations.push(
      Decoration.replace({ widget, inclusive: false }).range(from, to),
    );
  }
}

const dimensionPattern = /^(\d+)(?:x(\d+))?$/;

function buildWidgetDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const revealedPos = state.field(embedRevealedField, false) ?? null;

  tree.iterate({
    enter(node) {
      const type = node.type.name;
      const from = node.from;
      const to = node.to;

      // Tables use mark/line decorations — skip widget/replace decorations
      // inside tables to avoid breaking cell layout.
      if (type === 'Table') return false;

      if (type === 'Image') {
        if (isSelectRange(state, { from, to })) return false;

        const isRevealed = revealedPos !== null && from === revealedPos;
        const text = state.doc.sliceString(from, to);

        const stdMatch = text.match(/^!\[([^\]]*)\]\((.+?)\)$/);
        if (stdMatch) {
          let alt = stdMatch[1];
          let width: number | null = null;
          const lastPipe = alt.lastIndexOf('|');
          if (lastPipe !== -1) {
            const dimMatch = alt.slice(lastPipe + 1).match(dimensionPattern);
            if (dimMatch) {
              width = parseInt(dimMatch[1], 10);
              alt = alt.slice(0, lastPipe);
            }
          }
          const href = stdMatch[2];
          let heading: string | null = null;
          const hashIdx = href.indexOf('#');
          if (hashIdx !== -1) {
            heading = decodeURIComponent(href.slice(hashIdx + 1));
          }
          const embedType = classifyEmbed(href);
          addEmbedDecoration(decorations, from, to, href, alt, isRevealed, width, embedType, heading);
          return false;
        }

        const wikiMatch = text.match(/^!\[\[(.+?)(?:\|(.+?))?\]\]$/);
        if (wikiMatch) {
          const href = wikiMatch[1];
          let heading: string | null = null;
          const hashIdx = href.indexOf('#');
          let linkPath = href;
          if (hashIdx !== -1) {
            heading = href.slice(hashIdx + 1);
            linkPath = href.slice(0, hashIdx);
          }
          const filePaths = state.field(filePathsField, false) || [];
          const resolved = resolveWikiLink(linkPath, filePaths);
          const filePath = resolved.targets[0] || linkPath;
          let wikiAlt = wikiMatch[2] || '';
          let wikiWidth: number | null = null;
          if (wikiAlt) {
            const dimMatch = wikiAlt.match(dimensionPattern);
            if (dimMatch) {
              wikiWidth = parseInt(dimMatch[1], 10);
              wikiAlt = '';
            }
          }
          const embedType = classifyEmbed(filePath);
          addEmbedDecoration(decorations, from, to, filePath, wikiAlt, isRevealed, wikiWidth, embedType, heading);
        }
        return false;
      }

      if (type === 'InlineMath') {
        const cursorOnRange = isSelectRange(state, { from, to });
        if (!cursorOnRange) {
          const latex = state.doc.sliceString(from + 1, to - 1);
          if (latex.length > 0) {
            decorations.push(
              Decoration.replace({
                widget: new MathWidget(latex, false),
                inclusive: false,
              }).range(from, to),
            );
          }
        } else {
          const cursor = node.node.cursor();
          cursor.iterate((child) => {
            if (child.type.name === 'InlineMathMark') {
              decorations.push(
                Decoration.mark({ class: 'cm-math-syntax' }).range(child.from, child.to),
              );
            }
          });
        }
        return false;
      }

      if (type === 'BlockMath') {
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length));
        if (endLine.number - startLine.number < 2) return false;

        const contentFrom = state.doc.line(startLine.number + 1).from;
        const contentTo = state.doc.line(endLine.number - 1).to;
        const latex = contentFrom <= contentTo
          ? state.doc.sliceString(contentFrom, contentTo)
          : '';
        if (latex.length === 0) return false;

        const cursorInBlock = isSelectLine(state, from, to);

        if (cursorInBlock) {
          for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            let cls = 'cm-math-block';
            if (i === startLine.number) cls += ' cm-math-block-start';
            if (i === endLine.number) cls += ' cm-math-block-end';
            if (i === startLine.number || i === endLine.number) {
              cls += ' cm-math-fence-revealed';
            }
            decorations.push(Decoration.line({ class: cls }).range(line.from));
          }
          decorations.push(
            Decoration.widget({
              widget: new MathWidget(latex, true, true),
              block: true,
              side: 1,
            }).range(to),
          );
        } else {
          decorations.push(
            Decoration.replace({
              widget: new MathWidget(latex, true, false, contentFrom, contentTo),
              inclusive: false,
            }).range(from, to),
          );
        }
        return false;
      }

      if (type === 'FencedCode') {
        const codeInfoNode = node.node.getChild('CodeInfo');
        const lang = codeInfoNode ? state.doc.sliceString(codeInfoNode.from, codeInfoNode.to).trim() : '';
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length));
        let contentFrom = 0, contentTo = 0, codeLength = 0;
        if (endLine.number - startLine.number > 1) {
          contentFrom = state.doc.line(startLine.number + 1).from;
          contentTo = state.doc.line(endLine.number - 1).to;
          if (contentFrom <= contentTo) codeLength = contentTo - contentFrom;
        }
        decorations.push(
          Decoration.widget({
            widget: new CodeBlockInfoWidget(lang, codeLength, contentFrom, contentTo),
            side: -1,
          }).range(from),
        );
        return false;
      }

      if (type === 'HorizontalRule') {
        return false;
      }

      return true;
    },
  });

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

export const markDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkDecorations(view);
    }
    update(update: ViewUpdate) {
      const treeChanged = syntaxTree(update.state) !== syntaxTree(update.startState);
      const focusEvent = update.transactions.some(tr => isFocusEvent(tr));
      const mouseSelectChanged = update.transactions.some(tr =>
        tr.effects.some(e => e.is(mouseSelectEffect))
      );
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        treeChanged ||
        focusEvent ||
        mouseSelectChanged
      ) {
        this.decorations = buildMarkDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const widgetDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildWidgetDecorations(state);
  },
  update(value, tr) {
    if (tr.effects.some(e => e.is(embedSourceRevealEffect) || e.is(mouseSelectEffect))) {
      return buildWidgetDecorations(tr.state);
    }
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    if (tr.docChanged) {
      if (treeChanged || tr.selection) {
        return buildWidgetDecorations(tr.state);
      }
      return value.map(tr.changes);
    }
    if (tr.selection) {
      return buildWidgetDecorations(tr.state);
    }
    if (treeChanged) {
      return buildWidgetDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const linkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const target = event.target as HTMLElement;
    const href = target.getAttribute('data-href') || target.closest('[data-href]')?.getAttribute('data-href');
    if (href) {
      window.open(href, '_blank');
      return true;
    }
    return false;
  },
});
