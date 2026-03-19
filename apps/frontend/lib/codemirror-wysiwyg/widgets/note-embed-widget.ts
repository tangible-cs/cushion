import { WidgetType } from '@codemirror/view';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { getEditorView, createSourceToggle } from '../embed-utils';
import { marked } from 'marked';

const heightCache = new Map<string, number>();

function extractHeadingSection(content: string, heading: string): string {
  const lines = content.split('\n');
  let startIndex = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match && match[2].trim().toLowerCase() === heading.toLowerCase()) {
      startIndex = i;
      startLevel = match[1].length;
      break;
    }
  }

  if (startIndex === -1) return content;

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s/);
    if (match && match[1].length <= startLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n');
}

function stripScriptTags(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

export class NoteEmbedWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly heading: string | null,
    readonly displayText: string,
    readonly sourceRevealed: boolean = false,
  ) {
    super();
  }

  eq(other: NoteEmbedWidget) {
    return this.src === other.src && this.heading === other.heading
      && this.displayText === other.displayText
      && this.sourceRevealed === other.sourceRevealed;
  }

  get estimatedHeight() {
    const key = `${this.src}:${this.heading || ''}`;
    return heightCache.get(key) ?? 150;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-note-embed-widget';

    const container = document.createElement('div');
    container.className = 'cm-note-embed-container';

    const header = document.createElement('div');
    header.className = 'cm-note-embed-header';

    const link = document.createElement('a');
    link.className = 'cm-note-embed-link';
    link.textContent = this.displayText || this.src.replace(/\.md$/, '');
    link.title = `Open ${this.src}`;
    link.href = '#';
    link.onclick = (e) => e.preventDefault();
    header.appendChild(link);

    const content = document.createElement('div');
    content.className = 'cm-note-embed-content';
    content.innerHTML = '<span class="cm-note-embed-loading">Loading...</span>';

    container.appendChild(header);
    container.appendChild(content);
    if (!this.sourceRevealed) container.appendChild(createSourceToggle(wrapper));
    wrapper.appendChild(container);

    const cacheKey = `${this.src}:${this.heading || ''}`;

    getSharedCoordinatorClient()
      .then(client => client.readFile(this.src))
      .then(result => {
        let markdown = result.content;
        if (this.heading) {
          markdown = extractHeadingSection(markdown, this.heading);
        }

        const html = stripScriptTags(marked.parse(markdown, { async: false }) as string);
        content.innerHTML = html;

        queueMicrotask(() => {
          if (wrapper.isConnected) {
            heightCache.set(cacheKey, wrapper.getBoundingClientRect().height);
            getEditorView(wrapper)?.requestMeasure();
          }
        });
      })
      .catch(() => {
        content.innerHTML = '<span class="cm-note-embed-error">Failed to load note</span>';
      });

    return wrapper;
  }

  ignoreEvent(e: Event) {
    return e instanceof MouseEvent;
  }
}
