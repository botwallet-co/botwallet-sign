import { useLayoutEffect, useRef } from 'react';

/**
 * A ref holding the latest `value`, for an effect that runs on its own conditions but
 * calls the current version of a callback. Updated before effects run.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
