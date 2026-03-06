import { describe, expect, it } from 'vitest';
import { base64ToUint8Array, uint8ArrayToBase64 } from './pdf-bytes';

describe('pdf byte conversion helpers', () => {
  it('decodes raw base64 into bytes', () => {
    const encoded = btoa('Cushion PDF');
    const decoded = base64ToUint8Array(encoded);

    expect(new TextDecoder().decode(decoded)).toBe('Cushion PDF');
  });

  it('decodes data url payloads', () => {
    const encoded = btoa('Annotated');
    const decoded = base64ToUint8Array(`data:application/pdf;base64,${encoded}`);

    expect(new TextDecoder().decode(decoded)).toBe('Annotated');
  });

  it('encodes empty arrays to an empty base64 string', () => {
    expect(uint8ArrayToBase64(new Uint8Array())).toBe('');
  });

  it('round-trips byte arrays larger than one encode chunk', () => {
    const data = new Uint8Array(0x8000 + 37);

    for (let i = 0; i < data.length; i += 1) {
      data[i] = i % 256;
    }

    const encoded = uint8ArrayToBase64(data);
    const decoded = base64ToUint8Array(encoded);

    expect(decoded).toEqual(data);
  });
});
