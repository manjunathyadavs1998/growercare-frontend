/**
 * SPEC-FE-01 D4: one build for every environment. The app reads /config.json at start-up (written by the nginx image
 * from environment variables, or public/config.json in dev); nothing environment-specific is baked into the bundle.
 */
export interface AppConfig {
  oidcAuthority: string;
  oidcClientId: string;
  apiBase: string;
}

export async function loadConfig(fetcher: typeof fetch = fetch): Promise<AppConfig> {
  const response = await fetcher('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`/config.json: HTTP ${response.status}`);
  const raw = (await response.json()) as Partial<AppConfig>;
  const missing = (['oidcAuthority', 'oidcClientId', 'apiBase'] as const).filter((k) => typeof raw[k] !== 'string' || raw[k] === '');
  if (missing.length > 0) throw new Error(`/config.json is missing ${missing.join(', ')}`);
  return raw as AppConfig;
}
