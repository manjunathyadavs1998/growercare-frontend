import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Can, PolicyProvider, policyFor, type Me } from './policy';

const careIn: Me = { userId: '101', userType: 'STAFF', grants: [{ permissions: ['case:read', 'case:assign'] }] };
const growerIn1: Me = { userId: '1', userType: 'GROWER', grants: [{ permissions: ['case:read', 'case:create'] }] };

describe('SPEC-FE-01 R7 actions follow the grants', () => {
  it.each([
    ['FE-E7 care.in sees Assign', careIn, true],
    ['FE-E7 grower.in1 does not', growerIn1, false],
    ['FE-E7 nobody signed in does not', null, false],
  ])('%s', (_name, me, shown) => {
    render(<PolicyProvider me={me}><Can permission="case:assign" otherwise={<span>hidden</span>}><button type="button">Assign</button></Can></PolicyProvider>);
    expect(screen.queryByRole('button', { name: 'Assign' }) !== null).toBe(shown);
    expect(screen.queryByText('hidden') !== null).toBe(!shown);
  });

  it('FE-E7 an expired grant gives nothing', () => {
    const me: Me = { grants: [{ permissions: ['case:assign'], validTo: '2026-01-01T00:00:00Z' }] };
    expect(policyFor(me, new Date('2026-06-01T00:00:00Z')).can('case:assign')).toBe(false);
    expect(policyFor(me, new Date('2025-06-01T00:00:00Z')).can('case:assign')).toBe(true);
  });
});
