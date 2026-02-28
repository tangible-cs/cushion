import { WidgetType } from '@codemirror/view';

/**
 * Image widget for inline image rendering.
 * Shows a loading state and handles errors gracefully.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM() {
    const wrapper = document.createElement('figure');
    wrapper.className = 'cm-image-widget';
    
    // Loading placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'cm-image-placeholder';
    placeholder.style.cssText = `
      background: var(--md-bg-secondary);
      border-radius: var(--md-border-radius);
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--md-text-muted);
      font-size: 0.85em;
    `;
    placeholder.textContent = 'Loading image...';
    wrapper.appendChild(placeholder);
    
    // Create image element
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt || 'Image';
    img.title = this.alt || this.src;
    img.style.cssText = `
      max-width: 100%;
      max-height: 500px;
      border-radius: var(--md-border-radius);
      display: none;
      box-shadow: var(--md-image-shadow);
      transition: box-shadow 0.2s ease, transform 0.2s ease;
    `;
    
    // Show image when loaded
    img.onload = () => {
      placeholder.style.display = 'none';
      img.style.display = 'block';
    };
    
    // Show error state
    img.onerror = () => {
      placeholder.textContent = `Failed to load: ${this.alt || this.src}`;
      placeholder.style.color = 'var(--md-link-empty)';
    };
    
    wrapper.appendChild(img);
    
    // Add caption if alt text exists
    if (this.alt) {
      const caption = document.createElement('figcaption');
      caption.textContent = this.alt;
      caption.style.cssText = `
        font-size: 0.85em;
        color: var(--md-text-muted);
        text-align: center;
        margin-top: 8px;
        font-style: italic;
      `;
      wrapper.appendChild(caption);
    }
    
    // Wrapper styling
    wrapper.style.cssText = `
      display: block;
      margin: 16px 0;
      text-align: center;
    `;
    
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}
