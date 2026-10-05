/**
 * Empties the clipboard once pasted words are no longer needed there. Browsers allow
 * this only right after a click or paste, and some never do, so it can fail: returns
 * whether it worked. Clipboard history and clipboard sync keep their own copy anyway.
 */
export async function clearClipboard(): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText('');
    return true;
  } catch {
    return false;
  }
}

/** What to tell the owner after trying to clear pasted words (or a whole backup) from the clipboard. */
export function clipboardMessage(cleared: boolean, fullBackup: boolean): string {
  if (fullBackup) {
    return cleared
      ? 'Your full backup was on your clipboard, so we removed it. If you use clipboard history or sync, delete it there too.'
      : 'Your full backup is still on your clipboard. Copy something else to replace it.';
  }
  return cleared
    ? 'We removed the words from your clipboard. If you use clipboard history or sync, delete them there too.'
    : 'The words are still on your clipboard. Copy something else to replace them.';
}
