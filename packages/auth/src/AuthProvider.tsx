import { createContext, useContext, type ReactNode } from 'react';
import type { AuthClient } from './auth';

const AuthContext = createContext<AuthClient | null>(null);

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  return <AuthContext.Provider value={client}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthClient {
  const client = useContext(AuthContext);
  if (client === null) throw new Error('useAuth() outside <AuthProvider>');
  return client;
}
