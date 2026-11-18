# SPEC-FE-02: grower-web (PRD J1–J4, my cases)
- **Requirements:** PRD journeys **J1** (sign up), **J2** (phone verification + consent), **J3** (farms), **J4** (raise a complaint about a product/batch), my cases (status, timeline, conversation, attachments, share with retailer), profile (language); PRD §8 grower-web; SPEC-FE-01
- **Status:** Implemented
- **Owner:** growercare-frontend `apps/grower-web`
- **IDs:** rules FE-R100+, examples FE-E100+

## 0. Decisions
| # | Decision | Why |
|---|---|---|
| D1 | **Mobile first:** designed at 360 px, works to desktop; installable (web manifest), no offline mode in Phase 1 | PRD §8, 2G/3G growers |
| D2 | **Onboarding is a wizard driven by state, not by routes:** after sign-in the app asks `/api/iam/me` (account?) → `/api/grower/growers/me` (grower?) → its consents; it resumes at the first missing step on any device | A grower who closes the app mid-way continues where they stopped |
| D3 | **Photos are compressed in the browser** (longest side 1600 px, JPEG ~0.8) before the presigned upload; PDFs as they are; max 10 MB after compression | 06_FRONTEND media rule; mobile data cost |
| D4 | **Case form lists only what the grower can use:** their active farms, products registered in their country (search), and the case types (SPEC-CASE-10). There is no batch list: the grower types the **batch number from the pack** and the app checks it against the catalog (`GET /products/{id}/batches/{batchNo}`; an unknown batch is said so and cannot be sent) | No hard-coded country data (convention 4) |
| D6 | **A case without a product names what it is about:** crop protection, seeds, biologicals, professional (the seeded business units CP, SEEDS, BIO, PROF), labelled by the app; case-service requires a BU when there is no product and validates the code | Growers do not know BU codes; no BU endpoint exists in Phase 1 |
| D5 | **Crops are the codes of SPEC-GRW-02 D4** (GRAPE, ONION, SOYBEAN, RAGI, PADDY, COTTON, MAIZE, WHEAT, TOMATO, CHILLI, SUGARCANE), labelled in en/hi/mr by the app, until the crop list comes from catalog-registry (GRW-02 D4); the server still validates every code | No crop endpoint exists in Phase 1; the list is part of the agreed grower spec |

## 1. Behaviour (rules)
| Rule | Given | When | Then |
|---|---|---|---|
| FE-R100 | new Keycloak user (phone username) without an IAM account | first sign-in | "Create your account": country (IN only listed in Phase 1) and name → `POST /api/iam/self-registration` → next step |
| FE-R101 | account without a grower | next | registration form: territory (from the territories list), language, preferred retailer (optional) → `POST /api/grower/growers` |
| FE-R102 | grower `PENDING_CONSENT` | next | the consent screen shows each **current notice's title and text** in the grower's language (`GET /api/grower/consent-notices`); SERVICE is required, the others optional |
| FE-R103 | consent chosen | continue | `POST …/verifications` → the code screen; `…/confirm` with the code; wrong code shows attempts left; expired or too many attempts offers a new code (429 wait honoured) |
| FE-R104 | grower `ACTIVE` | home | "My cases" (newest first, status chip, polling 30 s) and "Raise a case" |
| FE-R105 | farms | add / edit / archive | `…/farms`: add (name, area in ha, 1–5 crops; Idempotency-Key), edit (merge patch with `If-Match`; 412 → reload), archive after an inline confirmation; an archived farm is no longer listed nor offered in the case form |
| FE-R106 | raise a case | submit | type, farm (optional), product (search; else what it is about, D6) and batch (checked), title (≤ 200), description (≤ 4000), up to 5 photos or PDFs → `POST /api/cases/cases` with an Idempotency-Key (reused on retry), then per file: compress (D3), `POST …/attachments` with SHA-256, PUT to the presigned URL, `complete`. Back on My cases with "case … raised"; a failed upload never loses the case and is reported (the file can be added from the case, R107) |
| FE-R107 | case detail | open | status, the public timeline (`/activity`, staff notes already hidden by the API), public comments oldest first (older pages on demand; a new comment shows at once and is rolled back if refused; polling 30 s), attachments (download the clean ones; add up to 5 while the case is open), share with my retailer (the preferred partner) / stop sharing. The case view carries no share state, so the latest SHARED / UNSHARED trail entry decides |
| FE-R108 | another grower's case id | opened by URL | the not-found page (API 404) |
| FE-R109 | profile | change language | `PATCH /api/grower/growers/{id}` (If-Match) and the UI language |

## 2. Examples (each becomes a component test; the journeys also a Playwright test in M5)
| Example | Rule | Persona / input | Expected |
|---|---|---|---|
| FE-E100 | R100 | new phone user signs in | account form; submit → 201 → registration form |
| FE-E101 | R101 | territory Pune, language Marathi | grower created (`PENDING_CONSENT`) → consent screen |
| FE-E102 | R102 | language mr | Marathi notice texts; SERVICE checkbox required |
| FE-E103 | R103 | code 000000 (wrong) · right code · 6th wrong | "2 attempts left" · `ACTIVE` home · "too many attempts, new code in N s" |
| FE-E104 | R104 | grower.in1 | own cases only, newest first |
| FE-E105 | R105 | add farm "Plot 2", 1.5 ha, cotton; archive it | listed; then gone from the case form |
| FE-E106 | R106 | complaint about 9001 / AZX2604-117 with a 6 MB photo | photo compressed under 2 MB, uploaded, case opens with the attachment PENDING → CLEAN |
| FE-E107 | R107 | comment "Leaves still yellow"; share with retailer 501 | comment appears at once (optimistic) and stays; share toggled |
| FE-E108 | R108 | grower.in2 opens grower.in1's case URL | not-found page |
| FE-E109 | R109 | switch to हिंदी | saved (200, new ETag); UI in Hindi |
| FE-E110 | budget | production build | initial JS ≤ 170 KB gzip; Lighthouse a11y ≥ 95 at 360 px |

## 3. Contracts used (through the gateway)
IAM `/me`, `/self-registration`, reference territories and case types (SPEC-IAM-04); grower `/growers`, `/growers/me`, `/growers/{id}` (PATCH), `/consent-notices`, `/consents`, `/verifications`, `/farms`; catalog `/products`, `/products/{id}/batches/…`; case `/cases` (mine), `/cases/{id}`, `/activity`, `/comments`, `/attachments`, `/shares`.

## 6. Traceability
| Rule / Example | Test |
|---|---|
| R100–R109 / E100–E109 | `apps/grower-web/src/features/*/__tests__` (Vitest + RTL + MSW + axe) |
| E110 | CI bundle budget + Lighthouse CI |
| Journeys J1–J4 end to end | Playwright (M5) |
