# SPEC-FE-03: staff-console (PRD J5–J9, partner route group)
- **Requirements:** PRD journeys **J5** (care triages, finds the grower by phone, assigns), **J6** (agronomist investigates and closes), **J8** (admin grants and revokes; isolation), **J9** (territory overview); partner route group (onboard a grower, my growers, cases); PRD §8 staff-console; SPEC-FE-01
- **Status:** Agreed
- **Owner:** growercare-frontend `apps/staff-console`
- **IDs:** rules FE-R200+, examples FE-E200+

## 0. Decisions
| # | Decision | Why |
|---|---|---|
| D1 | **One console, navigation by permission:** Queue (`case:read`), Grower lookup (`grower:read`), Overview (`dashboard:read`), Users & grants (`user:read`), Partner area (PARTNER users: onboard a grower, my growers, our cases). A grower signing in sees "this console is for staff and partners" and a sign-out button | Same app for care, agronomists, TMs, admins and retailers (06_FRONTEND §1) |
| D2 | **Desktop first** (≥ 1280 px), usable at 1024 px; dense tables (TanStack Table, virtualised over 200 rows) | Care agents work queues all day |
| D3 | **The workflow comes from the API:** transition buttons are `allowedTransitions`, the assign button is `canAssign` (SPEC-CASE-09); the assignee picker lists **assignable staff** for the case (SPEC-IAM-04) | No workflow or permission logic duplicated in the UI |
| D4 | **Queue filters live in the URL** (status, type, territory, SLA, assigned to me, grower, product/batch) so a filtered queue can be bookmarked; no personal data in it (the grower filter is an id) | Shareable, reload-safe, PRD §7 no PII in URLs |

## 1. Behaviour (rules)
| Rule | Given | When | Then |
|---|---|---|---|
| FE-R200 | care.in | Queue | cases in scope, SLA risk first by default; filters of D4; cursor paging; grower names masked as the API returns them; polling 30 s |
| FE-R201 | care.in on the phone with a grower | Grower lookup: phone + country | `POST /api/grower/growers/search` (phone in the body, never the URL) → the grower (masked) → "Cases of this grower" opens the queue filtered by `growerId` |
| FE-R202 | case detail | open | summary, SLA badge, activity, comments with **public / internal** switch (internal only with `comment:post-internal`; clearly marked), attachments, transitions from `allowedTransitions` (with a note), Assign when `canAssign` |
| FE-R203 | a transition or assignment | submitted with the case's ETag | 200 → view refreshed; 412 → "changed by someone else" and reload (SPEC-FE-01 R5) |
| FE-R204 | agro.in | Queue → "Assigned to me" | own work list; same detail screen (J6) |
| FE-R205 | tm.in | Overview | open cases by status and type, SLA at risk / breached, workload per assignee (names from the assignable-staff list), unassigned; territory picker limited to the TM's territories; each number links to the queue with the same filters |
| FE-R206 | admin.in | Users & grants | search users (directory), open one: active grants; grant a role with scope (roles and territories from SPEC-IAM-04 reference endpoints) and an optional end date; revoke with a reason |
| FE-R207 | retailer.in | Partner area | onboard a grower (assisted registration + the grower reads the code to the retailer, PRD D3), my growers (`/growers?partner=mine`), our cases (raised by or shared with our org) |
| FE-R208 | care.br | opens an Indian case URL | the not-found page (J8) |

## 2. Examples
| Example | Rule | Persona / input | Expected |
|---|---|---|---|
| FE-E200 | R200 | care.in, filter SLA = AT_RISK, then reload | only at-risk cases; filter kept after reload |
| FE-E201 | R201 | +91 98765 43210 | Ramesh (masked) → his cases |
| FE-E202 | R202 | care.in on a SUBMITTED complaint | "Triage" offered, "Assign" shown; internal note marked "staff only" |
| FE-E203 | R203 | two tabs, triage in the first, assign in the second | second: "changed by someone else", reload |
| FE-E204 | R204 | agro.in | assigned case listed; investigation → decision → closed |
| FE-E205 | R205 | tm.in, Pune | numbers equal the queue counts behind each link |
| FE-E206 | R206 | admin.in grants agro.in TERRITORY_MANAGER for Karnataka until tomorrow, then revokes | grant listed with end date; revoked with reason |
| FE-E207 | R207 | retailer.in onboards "Smoke Grower" with the code read out | grower ACTIVE in "my growers" |
| FE-E208 | R208 | care.br | not-found page |
| FE-E209 | D1 | grower.in1 signs in to the console | "for staff and partners" page |

## 3. Contracts used (through the gateway)
IAM `/me`, `/users`, `/users/{id}`, `/grants`, reference roles, territories and assignable staff (SPEC-IAM-04); grower `/growers/search`, `/growers` (assisted, partner list), `/verifications`; case `/cases` (all filters), `/cases/overview`, `/cases/{id}`, `/transitions`, `/assignee`, `/comments`, `/activity`, `/attachments`.

## 6. Traceability
| Rule / Example | Test |
|---|---|
| R200–R208 / E200–E209 | `apps/staff-console/src/features/*/__tests__` (Vitest + RTL + MSW + axe) |
| Journeys J5–J9 end to end | Playwright (M5) |
