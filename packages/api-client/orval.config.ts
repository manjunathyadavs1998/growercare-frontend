// SPEC-FE-01 D5: TanStack Query hooks per service, generated from the committed contracts (pnpm api:generate).
// Each service gets its own fetcher bound to its gateway prefix (/api/<service>).
import { defineConfig } from 'orval';

const service = (name: string, fetcher: string) => ({
  input: { target: `./contracts/${name}.openapi.json` },
  output: {
    target: `./src/generated/${name}.ts`,
    client: 'react-query' as const,
    httpClient: 'fetch' as const,
    mode: 'single' as const,
    prettier: false,
    override: {
      mutator: { path: './src/fetcher.ts', name: fetcher },
      query: { useQuery: true, useInfinite: false, signal: true },
    },
  },
});

export default defineConfig({
  iam: service('iam', 'iamFetch'),
  case: service('case', 'caseFetch'),
  grower: service('grower', 'growerFetch'),
  catalog: service('catalog', 'catalogFetch'),
});
