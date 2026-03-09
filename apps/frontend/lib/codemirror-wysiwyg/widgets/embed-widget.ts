import { WidgetType } from '@codemirror/view';
import { marked } from 'marked';
import type { WikiLinkState } from '@cushion/types';
import type { EmbedResolver, EmbedResolverResult } from '../embed-resolver';

type EmbedWidgetOptions = {
  href: string;
  resolvedPath: string | null;
  linkState: WikiLinkState;
  displayText?: string;
  contentId?: string;
  block: boolean;
  resolver: EmbedResolver | null;
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const PDF_EXTENSIONS = new Set(['pdf']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);

type EmbedKind = 'image' | 'audio' | 'video' | 'pdf' | 'markdown' | 'unknown';

function getExtension(path: string): string {
  const name = path.split('/').pop() || path;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function getEmbedKind(ext: string): EmbedKind {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  return 'unknown';
}

function parseEmbedDisplay(text?: string): {
  width?: number;
  height?: number;
  float?: 'left' | 'right';
  caption?: string;
} {
  if (!text) return {};

  const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  let width: number | undefined;
  let height: number | undefined;
  let float: 'left' | 'right' | undefined;
  const captionTokens: string[] = [];

  for (const token of tokens) {
    const sizeMatch = token.match(/^(\d+)(x(\d+))?$/i);
    if (sizeMatch) {
      width = Number.parseInt(sizeMatch[1], 10);
      if (sizeMatch[3]) {
        height = Number.parseInt(sizeMatch[3], 10);
      }
      continue;
    }

    const lower = token.toLowerCase();
    if (lower === 'left' || lower === 'right') {
      float = lower as 'left' | 'right';
      continue;
    }

    captionTokens.push(token);
  }

  return {
    width,
    height,
    float,
    caption: captionTokens.length ? captionTokens.join(' ') : undefined,
  };
}

function createPlaceholder(message: string, isError = false): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = `cm-embed-placeholder${isError ? ' cm-embed-error' : ''}`;
  placeholder.textContent = message;
  return placeholder;
}

function applySizing(element: HTMLElement, sizing: ReturnType<typeof parseEmbedDisplay>) {
  if (sizing.width && sizing.width >= 10) {
    element.style.width = `${sizing.width}px`;
  }
  if (sizing.height && sizing.height >= 10) {
    element.style.height = `${sizing.height}px`;
  }
  if (sizing.float) {
    element.style.float = sizing.float;
  }
}

export class EmbedWidget extends WidgetType {
  private _dom: HTMLElement | null = null;
  private _destroyed = false;

  constructor(private options: EmbedWidgetOptions) {
    super();
  }

  eq(other: EmbedWidget) {
    return (
      this.options.href === other.options.href &&
      this.options.resolvedPath === other.options.resolvedPath &&
      this.options.linkState === other.options.linkState &&
      this.options.displayText === other.options.displayText &&
      this.options.contentId === other.options.contentId &&
      this.options.block === other.options.block &&
      this.options.resolver === other.options.resolver
    );
  }

  toDOM(): HTMLElement {
    if (this._dom) return this._dom;

    const {
      href,
      resolvedPath,
      linkState,
      displayText,
      contentId,
      block,
      resolver,
    } = this.options;

    const wrapper = document.createElement('div');
    wrapper.className = `cm-embed-widget cm-embed-${linkState}${block ? ' cm-embed-block' : ' cm-embed-inline'}`;
    wrapper.setAttribute('data-wiki-link', 'true');
    wrapper.setAttribute('data-href', href);
    wrapper.setAttribute('data-resolved-path', resolvedPath || '');
    wrapper.setAttribute('data-link-state', linkState);
    wrapper.title = resolvedPath || href;

    if (!resolvedPath || linkState !== 'resolved') {
      const message = linkState === 'ambiguous'
        ? `Ambiguous embed: ${href}`
        : `Missing embed: ${href}`;
      wrapper.appendChild(createPlaceholder(message, true));
      this._dom = wrapper;
      return wrapper;
    }

    if (!resolver) {
      wrapper.appendChild(createPlaceholder('Embed resolver not available', true));
      this._dom = wrapper;
      return wrapper;
    }

    const ext = getExtension(resolvedPath);
    const kind = getEmbedKind(ext);
    const sizing = parseEmbedDisplay(displayText);
    const displayName = resolvedPath.split('/').pop() || resolvedPath;

    if (kind === 'unknown') {
      wrapper.appendChild(createPlaceholder(`Unsupported embed: ${displayName}`, true));
      this._dom = wrapper;
      return wrapper;
    }

    if (contentId && kind !== 'markdown') {
      wrapper.appendChild(createPlaceholder(`Embed anchor not supported: ${displayName}`, true));
      this._dom = wrapper;
      return wrapper;
    }

    const placeholder = createPlaceholder('Loading embed...');
    wrapper.appendChild(placeholder);

    const hint = kind === 'markdown' ? 'text' : 'binary';
    resolver(resolvedPath, { hint }).then((result) => {
      if (this._destroyed || !wrapper.isConnected) return;

      placeholder.remove();

      if (!result) {
        wrapper.appendChild(createPlaceholder(`Failed to load: ${displayName}`, true));
        return;
      }

      this.renderResult(wrapper, kind, result, sizing, displayName);
    }).catch(() => {
      if (this._destroyed || !wrapper.isConnected) return;
      placeholder.remove();
      wrapper.appendChild(createPlaceholder(`Failed to load: ${displayName}`, true));
    });

    this._dom = wrapper;
    return wrapper;
  }

  private renderResult(
    wrapper: HTMLElement,
    kind: EmbedKind,
    result: EmbedResolverResult,
    sizing: ReturnType<typeof parseEmbedDisplay>,
    displayName: string,
  ) {
    switch (kind) {
      case 'image': {
        if (result.type !== 'binary') {
          wrapper.appendChild(createPlaceholder(`Invalid image embed: ${displayName}`, true));
          return;
        }
        const img = document.createElement('img');
        img.className = 'cm-embed-image';
        img.src = result.dataUrl;
        img.alt = sizing.caption || displayName;
        img.title = displayName;
        applySizing(img, sizing);
        wrapper.appendChild(img);
        if (sizing.caption) {
          const caption = document.createElement('div');
          caption.className = 'cm-embed-caption';
          caption.textContent = sizing.caption;
          wrapper.appendChild(caption);
        }
        return;
      }
      case 'audio': {
        if (result.type !== 'binary') {
          wrapper.appendChild(createPlaceholder(`Invalid audio embed: ${displayName}`, true));
          return;
        }
        const audio = document.createElement('audio');
        audio.className = 'cm-embed-audio';
        audio.controls = true;
        audio.src = result.dataUrl;
        applySizing(audio, sizing);
        wrapper.appendChild(audio);
        return;
      }
      case 'video': {
        if (result.type !== 'binary') {
          wrapper.appendChild(createPlaceholder(`Invalid video embed: ${displayName}`, true));
          return;
        }
        const video = document.createElement('video');
        video.className = 'cm-embed-video';
        video.controls = true;
        video.src = result.dataUrl;
        applySizing(video, sizing);
        wrapper.appendChild(video);
        return;
      }
      case 'pdf': {
        if (result.type !== 'binary') {
          wrapper.appendChild(createPlaceholder(`Invalid PDF embed: ${displayName}`, true));
          return;
        }
        const frame = document.createElement('iframe');
        frame.className = 'cm-embed-pdf';
        frame.src = result.dataUrl;
        frame.title = displayName;
        frame.loading = 'lazy';
        applySizing(frame, sizing);
        wrapper.appendChild(frame);
        return;
      }
      case 'markdown': {
        if (result.type !== 'text') {
          wrapper.appendChild(createPlaceholder(`Invalid markdown embed: ${displayName}`, true));
          return;
        }
        const container = document.createElement('div');
        container.className = 'cm-embed-markdown';
        Promise.resolve(marked.parse(result.text)).then((html) => {
          if (this._destroyed || !wrapper.isConnected) return;
          container.innerHTML = typeof html === 'string' ? html : '';
        }).catch(() => {
          container.textContent = result.text;
        });
        wrapper.appendChild(container);
        return;
      }
      default: {
        wrapper.appendChild(createPlaceholder(`Unsupported embed: ${displayName}`, true));
        return;
      }
    }
  }

  destroy() {
    this._destroyed = true;
    this._dom = null;
  }

  ignoreEvent() {
    return false;
  }
}
