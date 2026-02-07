import { StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type EmbedResolverResult =
  | { type: 'binary'; dataUrl: string; mimeType: string }
  | { type: 'text'; text: string };

export type EmbedResolver = (
  path: string,
  options?: { hint?: 'binary' | 'text' }
) => Promise<EmbedResolverResult | null>;

export const setEmbedResolverEffect = StateEffect.define<EmbedResolver | null>();

export const embedResolverField = StateField.define<EmbedResolver | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEmbedResolverEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

export function setEmbedResolver(view: EditorView, resolver: EmbedResolver | null) {
  view.dispatch({
    effects: setEmbedResolverEffect.of(resolver),
  });
}
