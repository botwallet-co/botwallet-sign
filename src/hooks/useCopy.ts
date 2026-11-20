import { useEffect, useRef, useState } from 'react';
import { writeClipboard } from '../lib/clipboard';

/**
 * Copies text to the clipboard. `copied` is true for two seconds after the last copy that
 * worked; a copy the browser refuses changes nothing.
 */
export function useCopy(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string) => {
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return { copied, copy };
}
