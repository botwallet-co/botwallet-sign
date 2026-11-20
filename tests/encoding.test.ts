import { describe, it, expect } from 'vitest';
import { toBase64, fromBase64 } from '../src/lib/encoding';
import { hexToBytes } from './helpers';

describe('base64', () => {
  it('encodes bytes as standard base64', () => {
    expect(toBase64(Uint8Array.from([0, 1, 2, 253, 254, 255]))).toBe('AAEC/f7/');
    expect(toBase64(new Uint8Array(0))).toBe('');
    expect(fromBase64('AAEC/f7/')).toEqual(Uint8Array.from([0, 1, 2, 253, 254, 255]));
  });

  it('round-trips a 64-byte signature', () => {
    const bytes = hexToBytes('a8ecf899375896f5e27e1bf17cf8b7bdf91e7a3add63d2f270f2c93941920b32264ceb52bcb38d45a745c81731938a87dcc6a460684b141ffb651b218d2b1100');
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('refuses text that is not base64', () => {
    expect(() => fromBase64('not base64!')).toThrow();
  });
});
