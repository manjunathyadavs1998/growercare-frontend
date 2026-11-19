# SPEC-FE-04: End-to-end journeys (PRD M5)
- **Requirements:** PRD Phase 1 §4 journeys **J1–J9**, §7 (testability: Playwright per persona against the local stack; WCAG 2.1 AA basics with axe; budgets), §10 M5 ("full local run green; exit criteria met"), D2 (OTPs read from the dev mailbox)
- **Status:** Implemented
- **Owner:** growercare-frontend (`e2e/`) with growercare-local-platform (stack, CI job)
- **IDs:** rules FE-R400+, examples FE-E400+

## 0. Decisions (to agree with this spec)
| # | Decision | Why |
|---|---|---|
| D1 | **Playwright in `growercare-frontend/e2e`** (TypeScript, its own `package.json` in the workspace). Tests drive the **built apps in their nginx images** (`grower-web` :5173, `staff-console` :5174) in front of the edge gateway; never the Vite dev server | What growers and staff get is what is tested (CSP, runtime `/config.json`, `/api` proxy) |
| D2 | **The stack gets a `web` profile** in growercare-local-platform: both images, `/api` proxied to `gc-edge:8080`, Keycloak and the object store allowed by the CSP (`CONNECT_EXTRA`). SeaweedFS answers CORS for the two app origins, so the browser can PUT photos to presigned URLs | Today uploads work only from curl (smoke); the browser needs CORS |
| D3 | **The full run is CI** (the existing e2e workflow in local-platform: all profiles, released images, then `smoke.sh`, then Playwright from growercare-frontend `main`); laptops run **one journey at a time** against the profiles it needs (a table in the guide) | The whole stack plus a browser does not fit next to an IDE on a 16 GB laptop (lessons of M2/M3) |
| D4 | **One spec file per journey, one persona per test**, real Keycloak sign-ins (seeded users; the J1 grower signs up through Keycloak's registration page with a fresh phone number per run). OTPs come from `GET :8085/dev/mailbox?recipient=` (local only, PRD D2). Tests create their own data and never depend on another test's leftovers | Independent, repeatable runs on a long-lived local stack |
| D5 | **Accessibility and budgets:** axe (`@axe-core/playwright`) on every screen a journey visits, failing on serious/critical; Lighthouse is out of scope for M5 (the bundle budget already runs in CI) | PRD §7 asks for axe basics; Lighthouse in CI is flaky on shared runners |
| D6 | **The guide:** `docs/run-everything.md` in growercare-local-platform: start, sign-in users, which profiles per journey, the mailbox, resetting data, troubleshooting (Docker VM, Flyway drift) | PRD M5 deliverable; today the knowledge is spread over READMEs and memory |

## 1. Behaviour (rules)
| Rule | Given | When | Then |
|---|---|---|---|
| FE-R400 | the `web` profile up | open :5173 / :5174 | the apps load from nginx with CSP and `/config.json`; `/api` reaches the gateway |
| FE-R401 | a browser on :5173 | a presigned PUT to the object store | allowed (CORS) for the two app origins only |
| FE-R402 | each journey J1–J9 | Playwright runs it | it passes with the persona's own sign-in, and axe finds no serious violation on any screen it visits |
| FE-R403 | the e2e workflow | a PR or a nightly run on local-platform | infrastructure + services + web images up, `smoke.sh` green, then all Playwright journeys green; the HTML report is kept as an artefact |
| FE-R404 | a laptop | the guide's command for one journey | only that journey's profiles start, and the journey passes |

## 2. Examples (one Playwright test each)
| Example | Journey | Persona(s) | Steps (abridged) | Expected |
|---|---|---|---|---|
| FE-E401 | J1 sign up | new phone user | Keycloak registration → account → details → consent → code from the mailbox | grower ACTIVE; "My cases" empty |
| FE-E402 | J2 assisted onboarding | retailer.in + the grower's phone | onboard → notices in Marathi → code from the mailbox | grower ACTIVE in "My growers" (consent ASSISTED) |
| FE-E403 | J3 farms | grower.in1 | add a farm, edit it, archive it | as SPEC-FE-02 E105, against the real API |
| FE-E404 | J4 raise a case | grower.in1 | complaint about 9001 / AZX2604-117 with a photo | case listed; the photo becomes CLEAN within 60 s and downloads |
| FE-E405 | J5 triage and assign | grower.in1, then care.in | grower raises; care finds them by phone, triages with a note, adds an internal note and a public reply, assigns agro.in | the grower sees the reply, not the note; agro.in has it in "Assigned to me" |
| FE-E406 | J6 investigate and close | agro.in | offered transitions to a closing status; a stale second tab is refused | closed; the grower sees "Closed" |
| FE-E407 | J7 notifications | the J5 grower | after J5 | the mailbox holds the case-created and reply messages in the grower's language and not the internal note; agro.in has the assignment email (SPEC-NOT-02 E48) |
| FE-E408 | J8 grants and isolation | admin.in, agro.in, care.br | admin grants agro.in TM for Karnataka until tomorrow, revokes; care.br opens an Indian case URL | the grant shows and goes; care.br gets "Not found" |
| FE-E409 | J9 overview | tm.in | open the overview, follow "Submitted" | the queue count equals the tile |

## 2a. Backend work in M5 (agreed with this spec)
| Spec | Repository | Why |
|---|---|---|
| SPEC-NOT-02 case notifications | notification-service | J7 |
| SPEC-GRW-07 grower contact + PATCH body schemas | grower-service | NOT-02 contacts; typed UI bodies (follow-up) |
| SPEC-IAM-05 staff names + staff contact | identity-access-service | overview workload by name (follow-up); NOT-02 emails |
| SPEC-CASE-11 share state in the case view | case-service | grower app sharing (follow-up) |

## 3. Contracts used
The apps' own (FE-01..03) plus the dev mailbox (`notification-service`, local only).

## 4. Data
Each run uses fresh identifiers (phone numbers `+9199…` with a run suffix, titles with a run id); nothing is deleted afterwards (the 90-day hot data stays small locally).

## 5. Security
The mailbox and the dev users exist only in the local stack (`GC_DEV_MAILBOX=true`, the dev realm); the e2e job never runs against anything else.

## 6. Traceability
| Rule / Example | Test |
|---|---|
| R400, R401 | local-platform: `web` profile, smoke checks for both apps and a CORS preflight |
| R402 / E401–E409 | `growercare-frontend/e2e/journeys/j1…j9.spec.ts` |
| R403 | local-platform `.github/workflows/e2e.yml` |
| R404 | `docs/run-everything.md` (followed once on the laptop and noted in the PR) |
