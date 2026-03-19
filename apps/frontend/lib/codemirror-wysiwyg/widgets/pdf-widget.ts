import { WidgetType } from '@codemirror/view';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { isRemoteSrc, getEditorView, createSourceToggle } from '../embed-utils';

const heightCache = new Map<string, number>();
const pdfDocCache = new Map<string, Promise<any>>();

const DEFAULT_HEIGHT = 600;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;
const PAGE_GAP = 8;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parsePdfFragment(fragment: string | null): { page: number; height: number } {
  const result = { page: 1, height: DEFAULT_HEIGHT };
  if (!fragment) return result;

  const parts = fragment.split('&');
  let hasKeys = false;
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 'page') {
      const n = parseInt(val, 10);
      if (n > 0) result.page = n;
      hasKeys = true;
    } else if (key === 'height') {
      const n = parseInt(val, 10);
      if (n > 0) result.height = n;
      hasKeys = true;
    }
  }

  if (!hasKeys) {
    const n = parseInt(fragment, 10);
    if (n > 0) result.page = n;
  }

  return result;
}

async function loadPdfDocument(src: string): Promise<any> {
  const cached = pdfDocCache.get(src);
  if (cached) return cached;

  const promise = (async () => {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

    let data: { data: Uint8Array } | { url: string };
    if (isRemoteSrc(src)) {
      data = { url: src };
    } else {
      const client = await getSharedCoordinatorClient();
      const result = await client.readFileBase64(src);
      data = { data: base64ToUint8Array(result.base64) };
    }

    return pdfjsLib.getDocument(data).promise;
  })();

  pdfDocCache.set(src, promise);
  promise.catch(() => pdfDocCache.delete(src));
  return promise;
}

const ICON_PREV = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ICON_NEXT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
const ICON_ZOOM_IN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
const ICON_ZOOM_OUT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
const ICON_FIT_WIDTH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

function iconButton(icon: string, title: string, className = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `cm-pdf-btn ${className}`.trim();
  btn.innerHTML = icon;
  btn.title = title;
  return btn;
}

export class PdfWidget extends WidgetType {
  private readonly initialPage: number;
  private readonly containerHeight: number;
  private pdfDoc: any = null;
  private observers: IntersectionObserver[] = [];

  constructor(
    readonly src: string,
    readonly alt: string,
    readonly sourceRevealed: boolean = false,
    readonly fragment: string | null = null,
  ) {
    super();
    const parsed = parsePdfFragment(fragment);
    this.initialPage = parsed.page;
    this.containerHeight = parsed.height;
  }

  eq(other: PdfWidget) {
    return this.src === other.src && this.alt === other.alt
      && this.sourceRevealed === other.sourceRevealed && this.fragment === other.fragment;
  }

  get estimatedHeight() {
    return heightCache.get(this.src) ?? (this.containerHeight + 36);
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-pdf-widget';

    const toolbar = document.createElement('div');
    toolbar.className = 'cm-pdf-toolbar';

    const navGroup = document.createElement('div');
    navGroup.className = 'cm-pdf-toolbar-group';

    const prevBtn = iconButton(ICON_PREV, 'Previous page');
    const pageInput = document.createElement('input');
    pageInput.className = 'cm-pdf-page-input';
    pageInput.type = 'text';
    pageInput.value = '1';
    const pageSep = document.createElement('span');
    pageSep.className = 'cm-pdf-page-sep';
    pageSep.textContent = '/';
    const pageTotal = document.createElement('span');
    pageTotal.className = 'cm-pdf-page-total';
    pageTotal.textContent = '–';
    const nextBtn = iconButton(ICON_NEXT, 'Next page');

    navGroup.append(prevBtn, pageInput, pageSep, pageTotal, nextBtn);

    const zoomGroup = document.createElement('div');
    zoomGroup.className = 'cm-pdf-toolbar-group';

    const zoomOutBtn = iconButton(ICON_ZOOM_OUT, 'Zoom out');
    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'cm-pdf-zoom-label';
    zoomLabel.textContent = '100%';
    const zoomInBtn = iconButton(ICON_ZOOM_IN, 'Zoom in');
    const fitWidthBtn = iconButton(ICON_FIT_WIDTH, 'Fit width', 'cm-pdf-fit-btn');

    zoomGroup.append(zoomOutBtn, zoomLabel, zoomInBtn, fitWidthBtn);
    toolbar.append(navGroup, zoomGroup);

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'cm-pdf-scroll-container';
    scrollContainer.style.height = `${this.containerHeight}px`;

    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'cm-pdf-pages';
    scrollContainer.appendChild(pagesContainer);

    wrapper.append(toolbar, scrollContainer);
    if (!this.sourceRevealed) wrapper.appendChild(createSourceToggle(wrapper));

    let currentPage = 1;
    let totalPages = 0;
    let currentScale = 1;
    let baseScale = 1;
    const pageDivs: HTMLDivElement[] = [];
    const renderedPages = new Set<number>();

    const updatePageInfo = () => {
      pageInput.value = String(currentPage);
      pageTotal.textContent = String(totalPages);
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
    };

    const updateZoomLabel = () => {
      zoomLabel.textContent = `${Math.round(currentScale * 100)}%`;
    };

    const renderPage = async (pdfDoc: any, pageNum: number, pageDiv: HTMLDivElement) => {
      if (renderedPages.has(pageNum)) return;
      renderedPages.add(pageNum);

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentScale });

      const canvas = document.createElement('canvas');
      canvas.className = 'cm-pdf-canvas';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport }).promise;

      pageDiv.innerHTML = '';
      pageDiv.appendChild(canvas);
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;
    };

    const setupObservers = (pdfDoc: any) => {
      this.observers.forEach(o => o.disconnect());
      this.observers = [];

      for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const div = pageDivs[i];
        const obs = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) renderPage(pdfDoc, pageNum, div);
          },
          { root: scrollContainer, rootMargin: '200px' },
        );
        obs.observe(div);
        this.observers.push(obs);
      }
    };

    const rerender = async (pdfDoc: any) => {
      renderedPages.clear();

      for (let i = 0; i < totalPages; i++) {
        const page = await pdfDoc.getPage(i + 1);
        const viewport = page.getViewport({ scale: currentScale });
        const div = pageDivs[i];
        div.innerHTML = '';
        div.style.width = `${viewport.width}px`;
        div.style.height = `${viewport.height}px`;
      }

      setupObservers(pdfDoc);
      updateZoomLabel();

      queueMicrotask(() => {
        if (wrapper.isConnected) {
          heightCache.set(this.src, wrapper.getBoundingClientRect().height);
          getEditorView(wrapper)?.requestMeasure();
        }
      });
    };

    scrollContainer.addEventListener('scroll', () => {
      const containerMid = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
      let accum = 0;
      for (let i = 0; i < pageDivs.length; i++) {
        accum += pageDivs[i].offsetHeight + PAGE_GAP;
        if (accum >= containerMid) {
          const newPage = i + 1;
          if (newPage !== currentPage) {
            currentPage = newPage;
            updatePageInfo();
          }
          break;
        }
      }
    });

    const scrollToPage = (pageNum: number) => {
      const clamped = Math.max(1, Math.min(pageNum, totalPages));
      if (clamped === currentPage && pageDivs[clamped - 1]) return;
      currentPage = clamped;
      updatePageInfo();
      pageDivs[clamped - 1]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    };

    prevBtn.onclick = () => scrollToPage(currentPage - 1);
    nextBtn.onclick = () => scrollToPage(currentPage + 1);

    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = parseInt(pageInput.value, 10);
        if (n > 0 && n <= totalPages) {
          scrollToPage(n);
        } else {
          pageInput.value = String(currentPage);
        }
      }
    });
    pageInput.addEventListener('blur', () => {
      pageInput.value = String(currentPage);
    });

    zoomInBtn.onclick = () => {
      if (!this.pdfDoc) return;
      currentScale = Math.min(MAX_SCALE, currentScale + SCALE_STEP);
      rerender(this.pdfDoc);
    };

    zoomOutBtn.onclick = () => {
      if (!this.pdfDoc) return;
      currentScale = Math.max(MIN_SCALE, currentScale - SCALE_STEP);
      rerender(this.pdfDoc);
    };

    fitWidthBtn.onclick = () => {
      if (!this.pdfDoc) return;
      currentScale = baseScale;
      rerender(this.pdfDoc);
    };

    loadPdfDocument(this.src)
      .then(async (pdfDoc) => {
        this.pdfDoc = pdfDoc;
        totalPages = pdfDoc.numPages;

        const firstPage = await pdfDoc.getPage(1);
        const rawViewport = firstPage.getViewport({ scale: 1 });
        const availableWidth = scrollContainer.clientWidth - 24;
        baseScale = availableWidth > 0 ? availableWidth / rawViewport.width : 1;
        currentScale = baseScale;

        for (let i = 0; i < totalPages; i++) {
          const page = await pdfDoc.getPage(i + 1);
          const viewport = page.getViewport({ scale: currentScale });
          const pageDiv = document.createElement('div');
          pageDiv.className = 'cm-pdf-page';
          pageDiv.style.width = `${viewport.width}px`;
          pageDiv.style.height = `${viewport.height}px`;
          pageDivs.push(pageDiv);
          pagesContainer.appendChild(pageDiv);
        }

        updatePageInfo();
        updateZoomLabel();
        setupObservers(pdfDoc);

        if (this.initialPage > 1 && this.initialPage <= totalPages) {
          requestAnimationFrame(() => scrollToPage(this.initialPage));
        }

        queueMicrotask(() => {
          if (wrapper.isConnected) {
            heightCache.set(this.src, wrapper.getBoundingClientRect().height);
            getEditorView(wrapper)?.requestMeasure();
          }
        });
      })
      .catch(() => {
        pagesContainer.innerHTML = '';
        const errorMsg = document.createElement('div');
        errorMsg.className = 'cm-pdf-error';
        errorMsg.textContent = 'Failed to load PDF';
        pagesContainer.appendChild(errorMsg);
        pageTotal.textContent = '–';
      });

    return wrapper;
  }

  destroy() {
    this.observers.forEach(o => o.disconnect());
    this.observers = [];
    this.pdfDoc = null;
  }

  ignoreEvent(e: Event) {
    return e instanceof MouseEvent;
  }
}
