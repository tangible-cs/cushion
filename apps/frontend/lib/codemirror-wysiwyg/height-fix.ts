import { EditorView, ViewPlugin } from '@codemirror/view';

/**
 * Expands CM6's viewport to render more content, eliminating scroll jumps
 * caused by inaccurate height estimates with proportional fonts.
 *
 * Scales the rendering strategy based on document size:
 *   - Small  (< 50k chars):  full document rendering, zero estimates
 *   - Medium (50k - 200k):   extended margin (3-5x default 1000px)
 *   - Large  (200k - 500k):  moderate margin (2x)
 *   - Huge   (> 500k):       default CM6 behavior (1000px margin)
 */

const DEFAULT_MARGIN = 1000; // CM6's built-in VP.Margin

/** Returns the viewport margin multiplier based on document size. */
function marginForDocSize(docLength: number): number | 'full' {
  if (docLength < 50_000) return 'full';    // ~1250 lines — render everything
  if (docLength < 200_000) return 5;        // ~5000 lines — 5000px margin
  if (docLength < 500_000) return 2;        // ~12500 lines — 2000px margin
  return 1;                                  // huge docs — default CM6
}

export const heightFixPlugin = ViewPlugin.fromClass(
  class {
    private patched = false;

    constructor(private view: EditorView) {
      this.patch();
    }

    private patch() {
      const viewState = (this.view as any).viewState;
      if (!viewState || (viewState as any).__cushionPatched) {
        this.patched = true;
        return;
      }

      viewState.getViewport = function (bias: number, scrollTarget: any) {
        const docLength = this.state.doc.length;
        const strategy = marginForDocSize(docLength);

        if (strategy === 'full') {
          return { from: 0, to: docLength };
        }

        const oracle = this.heightOracle;
        const map = this.heightMap;
        const margin = DEFAULT_MARGIN * strategy;
        const marginTop = 0.5 - Math.max(-0.5, Math.min(0.5, bias / 1000 / 2));
        const { visibleTop, visibleBottom } = this;

        let from = map.lineAt(
          visibleTop - marginTop * margin,
          1 /* QueryType.ByHeight */, oracle, 0, 0,
        ).from;
        let to = map.lineAt(
          visibleBottom + (1 - marginTop) * margin,
          1 /* QueryType.ByHeight */, oracle, 0, 0,
        ).to;

        if (scrollTarget) {
          const { range } = scrollTarget;
          if (range.head < from || range.head > to) {
            const topPos = map.lineAt(range.head, 0 /* QueryType.ByPos */, oracle, 0, 0).top;
            const viewHeight = visibleBottom - visibleTop;
            return {
              from: map.lineAt(topPos - margin / 2, 1, oracle, 0, 0).from,
              to: map.lineAt(topPos + viewHeight + margin / 2, 1, oracle, 0, 0).to,
            };
          }
        }

        return { from, to };
      };

      viewState.viewportIsAppropriate = function ({ from, to }: { from: number; to: number }) {
        if (!this.inView) return true;
        const docLength = this.state.doc.length;
        const strategy = marginForDocSize(docLength);
        if (strategy === 'full') {
          return from === 0 && to === docLength;
        }
        return true;
      };

      (viewState as any).__cushionPatched = true;
      this.patched = true;
    }

    update() {
      if (!this.patched) this.patch();
    }
  },
);
