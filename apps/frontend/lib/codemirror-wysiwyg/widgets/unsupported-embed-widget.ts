import { WidgetType } from '@codemirror/view';
import { createSourceToggle } from '../embed-utils';

function getFileExtension(src: string): string {
  const dot = src.lastIndexOf('.');
  return dot !== -1 ? src.slice(dot) : '';
}

function getFileName(src: string): string {
  const slash = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'));
  return slash !== -1 ? src.slice(slash + 1) : src;
}

export class UnsupportedEmbedWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly sourceRevealed: boolean = false,
  ) {
    super();
  }

  eq(other: UnsupportedEmbedWidget) {
    return this.src === other.src && this.alt === other.alt
      && this.sourceRevealed === other.sourceRevealed;
  }

  get estimatedHeight() {
    return 48;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-unsupported-embed-widget';

    const icon = document.createElement('span');
    icon.className = 'cm-embed-file-icon';
    const ext = getFileExtension(this.src);
    icon.textContent = ext || '\uD83D\uDCC4';

    const filename = document.createElement('span');
    filename.className = 'cm-embed-filename';
    filename.textContent = this.alt || getFileName(this.src);

    wrapper.appendChild(icon);
    wrapper.appendChild(filename);
    if (!this.sourceRevealed) wrapper.appendChild(createSourceToggle(wrapper));

    return wrapper;
  }

  ignoreEvent(e: Event) {
    return e instanceof MouseEvent;
  }
}
