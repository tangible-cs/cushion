import { WidgetType } from '@codemirror/view';

export class ListPrefixWidget extends WidgetType {
  constructor(
    readonly depth: number,       // 1-based (1-9)
    readonly hasBullet: boolean,  // true on marker lines
    readonly displayText: string, // "•", "1.", "a.", "" for task/nobullet
    readonly rawMarker: string = '',
    readonly revealed: boolean = false,
  ) {
    super();
  }

  eq(other: ListPrefixWidget) {
    return this.depth === other.depth &&
      this.hasBullet === other.hasBullet &&
      this.displayText === other.displayText &&
      this.rawMarker === other.rawMarker &&
      this.revealed === other.revealed;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-list-prefix';

    // Both cases emit depth-1 indent guides; bullet lines add one bullet span after
    const guideCount = this.depth - 1;
    const totalWidth = this.hasBullet ? this.depth : this.depth - 1;

    span.style.marginLeft = `-${totalWidth * 2}em`;

    for (let i = 0; i < guideCount; i++) {
      const guide = document.createElement('span');
      guide.className = 'cm-list-indent-guide';
      span.appendChild(guide);
    }

    if (this.hasBullet) {
      const bullet = document.createElement('span');
      const depthClass = `cm-list-depth-${Math.min((this.depth - 1) % 3, 2)}`;
      bullet.className = `cm-list-bullet ${depthClass}`;
      if (this.revealed) bullet.classList.add('cm-list-bullet-revealed');
      bullet.textContent = (this.revealed ? this.rawMarker : this.displayText) || '';
      span.appendChild(bullet);
    }

    return span;
  }

  updateDOM(dom: HTMLElement): boolean {
    const bullet = dom.querySelector('.cm-list-bullet') as HTMLElement | null;
    if (!bullet) return false;
    bullet.textContent = (this.revealed ? this.rawMarker : this.displayText) || '';
    bullet.classList.toggle('cm-list-bullet-revealed', this.revealed);
    return true;
  }
}
