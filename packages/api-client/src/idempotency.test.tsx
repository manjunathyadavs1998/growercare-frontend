import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdempotencyKey } from './idempotency';

describe('SPEC-FE-01 R6 one Idempotency-Key per intent', () => {
  it('FE-E6 a retried submit reuses the key; after success the next submit gets a new one', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current.key();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.key()).toBe(first);        // retry after a network error
    result.current.done();                            // success
    expect(result.current.key()).not.toBe(first);
  });
});
