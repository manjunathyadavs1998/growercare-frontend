import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** The parts of IAM's /me the UI needs (SPEC-FE-01 D8). */
export interface Me {
  userId?: string;
  userType?: string;
  homeCountry?: string;
  partnerOrgId?: string;
  grants?: { permissions?: string[]; validTo?: string }[];
}

export interface Policy {
  me: Me | null;
  can(permission: string): boolean;
}

/** Permissions of the grants still valid now (the server re-checks every call; this only hides what it would refuse). */
export function policyFor(me: Me | null, now: Date = new Date()): Policy {
  const permissions = new Set<string>();
  for (const grant of me?.grants ?? []) {
    if (grant.validTo && new Date(grant.validTo) <= now) continue;
    grant.permissions?.forEach((p) => permissions.add(p));
  }
  return { me, can: (permission) => permissions.has(permission) };
}

const PolicyContext = createContext<Policy>(policyFor(null));

export function PolicyProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  const policy = useMemo(() => policyFor(me), [me]);
  return <PolicyContext.Provider value={policy}>{children}</PolicyContext.Provider>;
}

export function usePolicy(): Policy {
  return useContext(PolicyContext);
}

/** SPEC-FE-01 R7: renders its children only when the signed-in user holds {@code permission}. */
export function Can({ permission, children, otherwise = null }: { permission: string; children: ReactNode; otherwise?: ReactNode }) {
  return <>{usePolicy().can(permission) ? children : otherwise}</>;
}
