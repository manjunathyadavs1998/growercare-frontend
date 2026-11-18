import { useCallback, useRef } from 'react';

/**
 * SPEC-FE-01 R6: one Idempotency-Key per user intent. The same key is reused when the same submit is retried (after a
 * network error or a 5xx), and a new one starts only after a success or when the form is reset, so the server can
 * replay instead of creating twice.
 */
export function useIdempotencyKey(): { key: () => string; done: () => void } {
  const current = useRef<string | null>(null);
  const key = useCallback(() => {
    current.current ??= crypto.randomUUID();
    return current.current;
  }, []);
  const done = useCallback(() => {
    current.current = null;
  }, []);
  return { key, done };
}
