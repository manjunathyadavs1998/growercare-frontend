# growercare-frontend

The GrowerCare web apps (one of the GrowerCare repositories, ADR-017 / PRD D4):

| App | For | Dev URL |
|---|---|---|
| `apps/grower-web` | growers (mobile first, en/hi/mr) | http://localhost:5173 |
| `apps/staff-console` | care, agronomists, territory managers, admins, retailers | http://localhost:5174 |

- **Specs:** [`docs/specs/frontend/`](docs/specs/frontend/)
- **Stack:** React, TypeScript, Vite, TanStack Query (orval-generated hooks), Zustand, React Router, Radix + Tailwind, FormatJS, oidc-client-ts (PKCE, tokens in memory)
- **Images:** `ghcr.io/manjunathyadavs1998/grower-web`, `…/staff-console` (nginx; runtime `/config.json`)

## Run locally
Needs Node 24 and the local platform with the edge gateway (`growercare-local-platform`, profile `gateway`, `./keycloak/configure-web-clients.sh`).
```bash
corepack enable
pnpm install
pnpm dev:grower     # http://localhost:5173  (API calls are proxied to the gateway on :8080)
pnpm dev:staff      # http://localhost:5174
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
```
