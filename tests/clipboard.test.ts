// Clearing pasted Key 1 words from the clipboard is best effort, and the page must only
// say it worked when it did.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { clearClipboard, clipboardMessage } from '../src/lib/clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clearClipboard', () => {
  it('writes an empty string and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await clearClipboard()).toBe(true);
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('reports failure when the browser refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } });
    expect(await clearClipboard()).toBe(false);
  });

  it('reports failure when there is no clipboard API', async () => {
    vi.stubGlobal('navigator', {});
    expect(await clearClipboard()).toBe(false);
  });
});

describe('clipboardMessage', () => {
  it('only says the words were removed when they were', () => {
    expect(clipboardMessage(true, false)).toMatch(/We removed the words/);
    expect(clipboardMessage(false, false)).toMatch(/still on your clipboard/);
    expect(clipboardMessage(false, false)).not.toMatch(/removed/);
  });

  it('names the full backup plainly', () => {
    expect(clipboardMessage(true, true)).toMatch(/full backup was on your clipboard, so we removed it/);
    expect(clipboardMessage(false, true)).toMatch(/full backup is still on your clipboard/);
  });

  it('mentions clipboard history after clearing, which keeps its own copy', () => {
    expect(clipboardMessage(true, false)).toMatch(/clipboard history/);
    expect(clipboardMessage(true, true)).toMatch(/clipboard history/);
  });
});
