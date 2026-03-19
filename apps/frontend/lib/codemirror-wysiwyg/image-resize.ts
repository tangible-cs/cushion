import { EditorView } from '@codemirror/view';

export function commitImageResize(view: EditorView, pos: number, width: number): void {
  const roundedWidth = Math.round(width);
  const line = view.state.doc.lineAt(pos);
  const text = line.text;

  const stdMatch = text.match(/^(!\[)([^\]]*?)(\]\(.+?\))$/);
  if (stdMatch) {
    const [, prefix, altPart, suffix] = stdMatch;
    const cleanAlt = altPart.replace(/\|\d+(?:x\d+)?$/, '');
    view.dispatch({ changes: { from: line.from, to: line.to, insert: `${prefix}${cleanAlt}|${roundedWidth}${suffix}` } });
    return;
  }

  const wikiMatch = text.match(/^(!\[\[)([^\]|]+)(?:\|\d+(?:x\d+)?)?(]])$/);
  if (wikiMatch) {
    const [, prefix, path, suffix] = wikiMatch;
    view.dispatch({ changes: { from: line.from, to: line.to, insert: `${prefix}${path}|${roundedWidth}${suffix}` } });
  }
}
