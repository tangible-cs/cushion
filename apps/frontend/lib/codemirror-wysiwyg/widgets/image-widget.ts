import { WidgetType } from '@codemirror/view';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { isRemoteSrc, getEditorView, dataUriCache, embedSourceRevealEffect } from '../embed-utils';
import { commitImageResize } from '../image-resize';

const heightCache = new Map<string, number>();

function heightKey(src: string, width: number | null): string {
  return width ? `${src}|w=${width}` : src;
}

function showError(wrapper: HTMLElement, img: HTMLImageElement) {
  wrapper.classList.remove('cm-image-loading');
  wrapper.classList.add('cm-image-error');
  wrapper.style.minHeight = '';
  img.remove();
  getEditorView(wrapper)?.requestMeasure();
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly sourceRevealed: boolean = false,
    readonly width: number | null = null,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt
      && this.sourceRevealed === other.sourceRevealed && this.width === other.width;
  }

  get estimatedHeight() {
    return heightCache.get(heightKey(this.src, this.width)) ?? 200;
  }

  toDOM() {
    const key = heightKey(this.src, this.width);
    const cachedHeight = heightCache.get(key);
    const knownImage = cachedHeight !== undefined;
    const src = this.src;
    const width = this.width;

    const wrapper = document.createElement('div');
    wrapper.className = knownImage ? 'cm-image-widget' : 'cm-image-widget cm-image-loading';
    if (cachedHeight) wrapper.style.minHeight = `${cachedHeight}px`;

    const img = document.createElement('img');
    img.className = 'cm-image';
    img.alt = this.alt || '';

    if (this.width) {
      img.style.width = `${this.width}px`;
      img.style.maxWidth = '100%';
    }

    img.onload = () => {
      wrapper.classList.remove('cm-image-loading');
      queueMicrotask(() => {
        if (wrapper.isConnected) {
          const h = wrapper.getBoundingClientRect().height;
          heightCache.set(heightKey(src, width), h);
          // Keep minHeight in sync with actual height to avoid geometry
          // flicker when the widget exits and re-enters the viewport.
          wrapper.style.minHeight = `${h}px`;
          getEditorView(wrapper)?.requestMeasure();
        }
      });
    };

    img.onerror = () => showError(wrapper, img);

    const container = document.createElement('span');
    container.className = 'cm-image-container';
    container.appendChild(img);

    if (!this.sourceRevealed) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'cm-image-source-toggle';
      toggleBtn.setAttribute('aria-label', 'Show source');
      toggleBtn.textContent = '</>';
      toggleBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = getEditorView(wrapper);
        if (!view) return;
        const pos = view.posAtDOM(wrapper);
        const line = view.state.doc.lineAt(pos);
        view.dispatch({
          effects: embedSourceRevealEffect.of(pos),
          selection: { anchor: line.from, head: line.to },
        });
      };
      container.appendChild(toggleBtn);

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'cm-resize-handle';
      container.appendChild(resizeHandle);

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = img.offsetWidth;

        document.body.style.userSelect = 'none';
        wrapper.classList.add('cm-image-resizing');

        const onMouseMove = (ev: MouseEvent) => {
          const newWidth = Math.max(50, startWidth + (ev.clientX - startX));
          img.style.width = `${newWidth}px`;
          img.style.maxWidth = '100%';
          getEditorView(wrapper)?.requestMeasure();
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.userSelect = '';
          wrapper.classList.remove('cm-image-resizing');

          const h = wrapper.getBoundingClientRect().height;
          heightCache.set(heightKey(src, width), h);
          wrapper.style.minHeight = `${h}px`;

          const view = getEditorView(wrapper);
          if (!view) return;
          commitImageResize(view, view.posAtDOM(wrapper), img.offsetWidth);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      let dismissListener: ((e: MouseEvent) => void) | null = null;

      img.addEventListener('click', () => {
        container.classList.add('cm-image-selected');
        if (dismissListener) return;
        dismissListener = (e: MouseEvent) => {
          if (!container.contains(e.target as Node)) {
            container.classList.remove('cm-image-selected');
            document.removeEventListener('mousedown', dismissListener!);
            dismissListener = null;
          }
        };
        document.addEventListener('mousedown', dismissListener);
      });
    }

    wrapper.appendChild(container);

    if (isRemoteSrc(this.src)) {
      img.src = this.src;
    } else {
      const cached = dataUriCache.get(this.src);
      if (cached) {
        img.src = cached;
      } else {
        getSharedCoordinatorClient()
          .then(client => client.readFileBase64(this.src))
          .then(result => {
            const dataUri = `data:${result.mimeType};base64,${result.base64}`;
            dataUriCache.set(src, dataUri);
            img.src = dataUri;
          })
          .catch(() => showError(wrapper, img));
      }
    }

    return wrapper;
  }

  updateDOM(dom: HTMLElement) {
    const img = dom.querySelector('img');
    if (!img) return false;

    if (isRemoteSrc(this.src)) {
      if (img.src !== this.src) {
        img.src = this.src;
        dom.classList.remove('cm-image-error');
        dom.classList.add('cm-image-loading');
      }
    } else {
      const cached = dataUriCache.get(this.src);
      if (!cached) return false;
      if (img.src !== cached) img.src = cached;
    }

    if (img.alt !== (this.alt || '')) img.alt = this.alt || '';

    if (this.width) {
      img.style.width = `${this.width}px`;
      img.style.maxWidth = '100%';
    } else {
      img.style.width = '';
      img.style.maxWidth = '';
    }

    return true;
  }

  ignoreEvent(e: Event) {
    return e instanceof MouseEvent;
  }
}
