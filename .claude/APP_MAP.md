# RoleBerry — App Map & Dependency Map

AI CV optimizer. React SPA (Vite) + a set of shared request handlers exposed through three
runtimes: local Express, Vercel serverless functions, Firebase Functions.
Last mapped: 2026-08-05 (branch `auth`, all work uncommitted/staged).

---

## 1. Runtime topology

```
Browser (Vite SPA, port 5173)
  |
  |  fetch('/api/...')
  |     dev  -> vite proxy -> http://localhost:8787 (Express)
  |     prod -> Vercel rewrite /api/(.*) -> api/*.js  (serverless)
  |     alt  -> Firebase Hosting rewrite /api/** -> functions/index.js
  v
server/core/*Handler.js   <-- SINGLE SOURCE OF TRUTH for all 3 runtimes
  |
  +-- OpenAI-compatible chat API (OPENAI_BASE_URL, works with OpenRouter)
  +-- pdfjs-dist (text extraction, in-process)

Firebase (client SDK, direct from browser)
  +-- Firebase Auth (Google / GitHub popup, email + password with verification)
  +-- Firestore  collection `users/{uid}`  -> { aiUserInfo, fixedUserInfo, lastUpdated }
```

Key architectural rule: **never put logic in `api/*.js`, `server/index.js`, or
`functions/index.js`** — those are thin adapters. All behavior lives in `server/core/`.

---

## 2. File-by-file map

### Frontend entry
| File | Role |
|---|---|
| `index.html` | Vite entry, mounts `#root` |
| `src/main.jsx` | React root, renders `App.jsx` in StrictMode |
| `src/App.jsx` | 1-line re-export of `components/CVOptimizer.jsx` |
| `main.js` | Orphan re-export of CVOptimizer. Not referenced by anything. Dead. |

### Frontend components
| File | Role |
|---|---|
| `components/CVOptimizer.jsx` (~1390 L) | **The entire app.** All state, 3 screens, both modals, download logic. |
| `components/ProfileSwitcher.jsx` | Toolbar dropdown for saved profiles: save current as new, switch, rename, delete. Free keeps 1 and sees a locked second slot that opens the paywall. Pro shows "n of 3"; Max and comped show no count (unlimited, hidden cap 100). |
| `components/LegalPage.jsx` | `/privacy` and `/terms`, chosen by pathname in `src/main.jsx` (no router; no sign-in needed). Text lives in `src/legal/PrivacyPolicy.jsx` and `src/legal/TermsOfService.jsx`; seller (a sole trader), address, contact email, governing law, courts and dates in `src/legal/config.js`. Shows a draft notice while any `[placeholder]` remains. Linked from the sign-in screen and the pricing modal. |
| `components/Landing.jsx` | Signed-out home, rendered by CVOptimizer when nobody is signed in: hero ("20 jobs. 20 CVs. Same you.", card-stack visual) with the existing `<Auth>` sign-in block above the fold, three steps, a static before/after CV slider, pricing from PricingModal's exported `PLANS`, and /privacy and /terms links. No model calls before sign-in. Logo: `public/roleberry-logo.svg` (ink) and `roleberry-logo-dark.svg` (light fill, used on the ink hero). |
| `components/PricingModal.jsx` | The paywall: Free / Pro ("Most popular", middle) / Max columns. Free upgrades via Checkout with `plan`; subscribers see Current plan and go to the Customer Portal for any change. Perks are edited in its `PLANS` list; `soon: true` marks unbuilt ones (Max's extra CV templates). |
| `components/HistoryPage.jsx` | Past runs newest first, open into the result view or download CV/letter PDFs. Free opens its newest 5; older runs show as greyed, blurred rows with an Unlock history button (paywall). |
| `components/FeedbackWidget.jsx` | Floating Feedback button (bottom-right) and its dialog: report a problem / share feedback / something else, optional screenshot (html2canvas, imported lazily, though html2pdf.js already bundles it), reply email when signed out. Mounted once in `src/main.jsx` beside the page, so it is on every screen; opened from elsewhere with `openFeedback()`. |
| `components/Auth.jsx` | Signed out: Google and GitHub buttons, then an email/password form (Sign in / Create account, Forgot password), inline errors. Signed in: avatar dropdown, theme toggle, folder-management toggle + folder picker |
| `components/VerifyEmail.jsx` | "Check your inbox" panel shown instead of the app to a password account whose email is unverified: Resend, I've verified (reload + fresh token), Sign out |
| `components/LoadingShowcase.jsx` (1071 L) | Standalone demo of loading animations. Only reachable via `npm run showcase` (`showcase-index.html` -> `showcase.jsx`). Not in the app bundle. |

### Frontend services (browser-side)
| File | Exports | Talks to |
|---|---|---|
| `services/openai.js` | `optimizeCv` | `POST /api/optimize` |
| `services/pdf.js` | `processPdf` | `POST /api/process-pdf` (multipart, field name `pdf`) |
| `services/profiles.js` | `newProfileId`, `saveProfile`, `renameProfile`, `deleteProfile`, `activateProfile` | Firestore `users/{uid}.profiles.{id}` (free 1, paid 3, comped 10). Cap enforced by firestore.rules. |
| `services/history.js` | `listHistory`, `getHistoryRun` | `POST /api/history` |
| `services/billing.js` | `getBillingStatus`, `startCheckout(plan)`, `openBillingPortal` | `POST /api/billing/{status,checkout,portal}`; checkout takes `pro` or `max` and either redirects to Lemon Squeezy (free account) or resolves to `{ switched }` (subscriber changing plan); portal redirects to Lemon Squeezy's customer portal. |
| `services/feedback.js` | `sendFeedback`, `openFeedback`, `recordAppError`, `getRecentErrors`, `installErrorCapture` | `POST /api/feedback` (token optional); a `roleberry:feedback` window event opens the widget; keeps the last 10 app errors to attach to reports. |
| `services/auth.js` | `signInWithGoogle`, `signInWithGithub`, `signInWithEmail`, `signUpWithEmail`, `sendPasswordReset`, `resendVerification`, `refreshEmailVerified`, `needsEmailVerification`, `friendlyAuthError`, `signOutUser`, `onAuthStateChange`, `saveUserData`, `getUserData` | Firebase Auth + Firestore. A popup that hits account-exists-with-different-credential holds the credential, prefills the email, and links it after the person signs in the original way. After a GitHub sign-in it posts the GitHub token to `/api/auth/github-verify`. |
| `services/folderManager.js` | `isFolderApiSupported`, `getFolderHandle`, `pickNewFolder`, `getStoredFolderName`, `writePdfWithHandle`, `savePdfToFolder`, `clearFolderHandle`, `extractCompanyName` | File System Access API + IndexedDB (`roleberry` / `settings` / `downloadFolderHandle`) |
| `src/firebase.js` | `auth`, `db`, `googleProvider`, `githubProvider` | Firebase SDK init from `VITE_FIREBASE_*` |

### Frontend render/util
| File | Role |
|---|---|
| `src/templateRenderer.js` | `renderCvHtml(cv)` — full standalone HTML doc for the preview iframe **and** the PDF source. Print CSS lives here. |
| `utils/markdown.js` | `convertMarkdownToHtml` — regex markdown, used for the legacy (non-structured) preview |
| `utils/download.js` | `generateDownloadHtml` (wraps markdown HTML in a printable doc), `downloadHtml` (anchor-blob download) |
| `static-cv-template.html`, `Untitled-1.html` | Loose design references. Not imported. |

### Backend — shared core (edit here)
| File | Exports | Notes |
|---|---|---|
| `server/core/optimizeHandler.js` (422 L) | `handleOptimizeRequest` | The big one. Holds the giant prompt, JSON schema, code-fence stripping, structural validation, role-metadata merge from `aiUserInfo.experienceSource`, the parallel cover-letter call, the `analysis` payload. |
| `server/core/pdfHandler.js` (300 L) | `handlePdfProcessing`, `uploadMiddleware` | multer memory storage, 10MB, PDF-only. Extract -> GPT -> two JSON blobs. Also `calculateYearsOfExperience`. |
| `server/core/firestore.js` | `PLAN_LIMITS`, `consumeQuota`, `refundQuota`, `getEntitlement`, `recordRun`, `listRuns`, `countRuns`, user-doc helpers | Admin SDK. Free = 5 optimizations lifetime, 1 saved profile, newest 5 runs visible; paid (Pro, $12) = 1,000/calendar month, 3 profiles, full history; max ($49) = fair-use cap `MAX_MONTHLY_RUNS` (default 5,000/month) shown as unlimited, 100 profiles shown as unlimited, full history. `plan` only ever records the billing provider (Lemon Squeezy). Complimentary Max is separate: `isCompedAccount` = env allowlist (`COMP_MAX_EMAILS`, old `UNLIMITED_EMAILS`/`UNLIMITED_UIDS`), the `comped` flag set by `npm run comp`, or the legacy `plan: 'unlimited'`. Comped gets exactly Max, fair-use cap included. The allowlist is mirrored to `compedEnv` on the doc (status and quota calls) for firestore.rules. Every run is recorded. `BILLING_ENFORCED=true` turns limits into refusals. |
| `server/core/historyHandler.js` | `handleHistory` | `POST /api/history` -> `{ runs, visibleLimit, lockedCount, lockedRuns }`. Every plan's runs are saved; free gets its newest 5 in full and older ones as date-only stubs, paid/comped get all (`visibleLimit` null). `{ id }` returns one run with re-rendered `cvContent`, 402 for a free run outside the newest 5. History is server-read only. |
| `server/core/githubVerifyHandler.js` | `handleGithubVerify` | `POST /api/auth/github-verify` `{ accessToken }` -> `{ verified }`. Firebase marks GitHub emails unverified; this asks GitHub's API, checks the token is the linked GitHub account and the address is verified there, then sets `emailVerified` via the Admin SDK. |
| `server/core/billing.js` | `handleCreateCheckout`, `handleCustomerPortal`, `handleBillingStatus`, `handleBillingWebhook`, `resyncPlanFromBilling` | Lemon Squeezy (merchant of record) over its REST API with axios. Two variants: `LEMONSQUEEZY_VARIANT_ID_PRO` / `_MAX`, plus `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`. Checkout `{ plan: pro|max }`: free -> new checkout with the uid in custom data; subscriber asking for the other plan -> PATCH the subscription's variant (prorated) -> `{ switched }`; same plan -> 409 `use_portal`; comped -> 409. Portal returns the subscription's fresh `urls.customer_portal`. The webhook (X-Signature HMAC-SHA256 of the raw body) is the only thing that sets `plan`: it re-reads the subscription from the API on every event and maps variant -> `paid`/`max`; access for active/on_trial/past_due, cancelled until `ends_at`, none for paused/unpaid/expired. Account found by `meta.custom_data.user_id`, else stored `billingSubscriptionId`/`billingCustomerId`. Never touches comp fields; converts legacy `plan: 'unlimited'` to `comped: true`. |
| `server/core/comp.js` | `grantComp`, `revokeComp`, `listComps` | Complimentary Max by email, behind `scripts/comp.mjs` (`npm run comp -- grant|revoke <email>`, `npm run comp -- list`). The person must have signed in once. Revoke clears the flag and re-syncs from Lemon Squeezy; never deletes data. |
| `server/core/feedbackHandler.js` | `handleFeedback` | `POST /api/feedback`, signed in or not (`optionalAuth`). Honeypot, validation, rate limits (`takeFeedbackQuota`), stores via `saveFeedback`, emails via `mailer.js`; returns `{ ok, ref }` (`RB-XXXXXX`) if either worked, else 503. |
| `server/core/mailer.js` | `sendSupportEmail` | Brevo HTTP API (`BREVO_API_KEY`, `FEEDBACK_TO_EMAIL`, `FEEDBACK_FROM_EMAIL`). Never throws; `{ sent:false, reason }` when unset or failing. |
| Firestore `feedback/{id}` (+ `attachments/screenshot`), `feedbackLimits/{key}` | Collections | Feedback reports and their rate-limit counters. Admin SDK only; firestore.rules deny the browser both. |
| `server/core/PDFTextExtractor.js` (150 L) | `PDFTextExtractor` (default) | pdfjs-dist legacy, worker disabled. `isTextBased` samples N pages; **OCR path throws `IMAGE_BASED_PDF_NOT_SUPPORTED` — deliberately disabled.** |
| `server/cvValidation.js` | `validateAndFixSkills`, `reorderSkills` | dedupe, clamp 3–9 items / max 9 categories, compute `jdShare`, sort by hardcoded `categoryOrder` |
| `server/cvRenderer.js` | `renderCvMarkdown` | server-side markdown build; its output is what `cvContent` returns and what keyword filtering greps |

### Backend — adapters (thin, keep thin)
| File | Runtime |
|---|---|
| `server/index.js` | Express, port `PORT` or 8787. Routes: `/api/optimize`, `/api/process-pdf`, `/api/billing/{checkout,portal,status}`, `/api/history`, `/api/feedback`, `/api/lemonsqueezy-webhook` (raw body, registered before `express.json`) |
| `api/optimize.js`, `api/process-pdf.js`, `api/billing/*.js`, `api/history.js` | Vercel. CORS `*`, OPTIONS, POST-only, delegate to core |
| `api/feedback.js` | Vercel. Same as the others; the handler accepts signed-out visitors too. 15s / 512MB in `vercel.json`. |
| `api/lemonsqueezy-webhook.js` | Vercel. No CORS; must not touch `req.body` (signature is over the raw stream) |
| `functions/index.js` | Firebase. Express-in-function, CJS with dynamic `import()` of the ESM core. Routes `/optimize`, `/process-pdf`, `/health`, `/billing/*`, `/history`, `/feedback`, `/lemonsqueezy-webhook`. |

### Build / ops
| File | Role |
|---|---|
| `vite.config.js` | port 5173, proxy `/api` -> `:8787`, `allowedHosts: true` |
| `vite.showcase.config.js` | separate showcase build, port 5174 |
| `vercel.json` | build -> `dist`, `maxDuration` 300s/1536MB for optimize, SPA rewrite. **`api/process-pdf.js` has no function config** (default 10s/1024MB). |
| `firebase.json` | hosting from `dist`, `/api/**` -> `api` function, node18 |
| `scripts/e2e/` | `npm run test:e2e`. Runs the real optimize/history/billing handlers against an in-memory Firestore, locally signed Firebase tokens, a stubbed model and a stubbed Lemon Squeezy API (both inside `fake-axios.mjs`), via a module hook (`register.mjs` / `loader.mjs`) that swaps `firebase-admin` and `axios` for fakes inside `server/`. |
| `scripts/patch-pdfjs.cjs` | postinstall + vercel-build: rewrites pdfjs worker path to `__dirname`-based so it works in serverless |
| `scripts/setup-vercel-env.js` | pushes `.env` into Vercel env |
| `docker-compose.yml` / `Dockerfile.dev` | node:20 dev container running `npm start` |
| `eng.traineddata` (5MB) | Tesseract English data. Leftover from the disabled OCR path. |

---

## 3. Dependency graph (imports)

```
src/main.jsx
 └─ src/App.jsx
     └─ components/CVOptimizer.jsx
         ├─ components/Auth.jsx
         │   ├─ services/auth.js ─────────────┐
         │   └─ services/folderManager.js     │
         ├─ services/openai.js  → /api/optimize
         ├─ services/pdf.js     → /api/process-pdf
         ├─ services/auth.js ───────────────┐ │
         ├─ services/folderManager.js       │ │
         ├─ src/templateRenderer.js         │ │
         ├─ utils/markdown.js               │ │
         ├─ utils/download.js ─ utils/markdown.js
         └─ html2pdf.js (npm)               │ │
                                            ▼ ▼
                                        src/firebase.js → firebase/{app,auth,firestore}

server/index.js ─┐
api/optimize.js ─┼─→ server/core/optimizeHandler.js ─┬─ server/cvValidation.js
functions/index.js┘                                  ├─ server/cvRenderer.js
                                                     └─ axios

server/index.js ─┐
api/process-pdf.js┼→ server/core/pdfHandler.js ─┬─ server/core/PDFTextExtractor.js ─ pdfjs-dist
functions/index.js┘                             ├─ multer
                                                └─ axios
```

No cycles. Fan-in hotspots: `server/core/optimizeHandler.js` (3 adapters),
`components/CVOptimizer.jsx` (everything frontend), `src/firebase.js`.

### npm deps and who uses them
| Package | Used by |
|---|---|
| `react`, `react-dom` | frontend |
| `lucide-react` | CVOptimizer, Auth (icons) |
| `html2pdf.js` | CVOptimizer download only |
| `firebase` | src/firebase.js, services/auth.js |
| `axios` | all three server/core handlers |
| `express`, `cors`, `dotenv` | server/index.js, functions/index.js |
| `multer` | pdfHandler |
| `pdfjs-dist` | PDFTextExtractor (+ patched by postinstall) |
| `@vercel/speed-insights` | **unused — not imported anywhere** |
| `tesseract.js`, `canvas` | **unused — OCR path is disabled** |
| `tailwindcss`/`postcss`/`autoprefixer` | styling via `src/index.css` |

---

## 4. Data flow (the two contracts that matter)

Two JSON blobs are passed around as **strings** everywhere (Firestore, state, request body):

**`fixedUserInfo`** — never sent to the model except `yearsOfExperience`:
```json
{ "name", "contact": { "email","phone","location","links":[] },
  "certifications": [], "education": [], "yearsOfExperience": number }
```

**`aiUserInfo`** — the model's raw material:
```json
{ "coreSkillsBase": [ { "category", "items": [] } ],
  "experienceSource": [ { "roleId","title","company","location","start","end","baseAchievements":[] } ] }
```

`roleId` is the join key: the model returns only `{ roleId, achievements }` per role, and
`optimizeHandler` re-attaches title/company/location/dates from `experienceSource`.
**If `roleId` drifts, jobs lose their headers.**

### Flow A — PDF onboarding
`Setup page → handlePdfUpload → services/pdf.js → POST /api/process-pdf`
→ multer buffer → `PDFTextExtractor.extract` → GPT with a two-labelled-block prompt
(`SKILLS_AND_EXPERIENCE:` / `PERSONAL_INFO:`, parsed by regex)
→ `calculateYearsOfExperience` → `{ aiUserInfo, fixedUserInfo, extractedText }`
→ `jsonToFormData()` populates `formData`.

### Flow B — Save profile
`formData → formDataToJson() → saveUserData(uid, {...}) → Firestore users/{uid}`.
On sign-in, `onAuthStateChange` reads it back and calls `jsonToFormData`.

### Flow C — Optimize (main)
`handleOptimize → services/openai.js → POST /api/optimize`
→ chat completion → `stripCodeFences` → `JSON.parse` → structural validation
→ `validateAndFixSkills` + `labelSkills` + `reorderSkills` → merge role metadata → merge `fixedUserInfo`
→ `renderCvMarkdown` → `analyzeCoverage` (server/skillMatch.js: the model's `jdKeywords` checked against the JD, the CV and the saved profile)
→ response `{ cvContent, cv, analysis, coverLetter, companyName, jobTitle, quota }`
(the cover letter call starts in parallel with the CV call and reads the saved profile)
→ preview iframe uses `renderCvHtml(cv)`.

### Flow D — Download
`downloadCv()` — order is deliberate:
1. **First**, while user gesture is alive: `getFolderHandle()` (if folder mgmt on).
2. `renderCvHtml(structuredCv)` (or markdown fallback) → `html2pdf` → blob.
3. Save via stored dir handle into `<Folder>/<CompanyName>/` (unique-suffixed), else
   `showSaveFilePicker`, else `html2pdf().save()`.
4. On render failure, retry through an offscreen 794px DOM container.
5. Last resort: HTML download.

---

## 5. State map — `CVOptimizer.jsx`

Screen switch: `currentPage === 'setup'` → setup form; `!user` → sign-in splash; else main.
(Note: setup renders **before** the `!user` check, so setup is reachable signed-out but
`saveUserInfo` alerts.)

| State | Meaning |
|---|---|
| `formData` | the editable profile (source of truth for the setup form) |
| `aiUserInfo` / `fixedUserInfo` | stringified JSON, what's actually sent + persisted |
| `jobDescription` | JD textarea |
| `optimizedCv` / `structuredCv` | markdown / structured result; `structuredCv` wins for preview+PDF |
| `analysis` | Result Analysis dialog payload (`{ total, matched, missing, unsupported, coverage }`) |
| `companyName` | from model, editable; drives download subfolder |
| `folderMgmtEnabled` | persisted in `localStorage.folderMgmtEnabled` |
| `isDark` | toggles `.dark` on `<html>`; not persisted |
| `jdCollapsed` | auto-set true after a successful optimize (desktop) |
| `showAnalysis`, `showTips`, `showUserInfoModal`(unused), `setupTab`(only ever `'personal'`) |

Input caps enforced client-side only: JD 10k, aiUserInfo 20k, fixedUserInfo 10k chars.
Express body limit is 1mb.

---

## 6. Environment variables

Server-side (never `VITE_`-prefixed):
`OPENAI_API_KEY`, `OPENAI_BASE_URL` (default `https://api.openai.com/v1`),
`OPENAI_MODEL` (default `gpt-4o-mini`), `OPENROUTER_SITE_URL`, `OPENROUTER_APP_TITLE`,
`PDF_SAMPLE_PAGES`, `PDF_MAX_PAGES`, `PDF_CHAR_THRESHOLD`, `PDF_OCR_DPI`, `PORT`.

Client-side (bundled, must be `VITE_`): the six `VITE_FIREBASE_*` keys.

Unused: `CLOUDMERSIVE_API_KEY`, `VITE_FIREBASE_MEASURMENT_ID` (also misspelled).

---

## 7. Where to change what

| Change | Touch |
|---|---|
| Prompt / model behavior for optimize | `server/core/optimizeHandler.js` (`instruction`, `jsonSchema`) |
| Prompt for PDF extraction | `server/core/pdfHandler.js` (`prompt`, `aiInfoSchema`, `fixedInfoSchema`) |
| Skill count / category rules | `server/cvValidation.js` + the matching prose in the optimize `instruction` (two places, keep in sync) |
| CV visual design / print layout | `src/templateRenderer.js` only (preview iframe and PDF share it) |
| A new API endpoint | add `server/core/<x>Handler.js`, then wire **all three** adapters |
| Response shape from optimize | optimizeHandler `res.json` + `handleOptimize` destructure in CVOptimizer |
| Anything in the setup form | `formData` shape + `formDataToJson` + `jsonToFormData` (three places, keep in sync) |
| Download/file-system behavior | `services/folderManager.js` + `downloadCv` in CVOptimizer |

---

## 8. Known drift / traps (verify before touching)

1. **`api/process-pdf.js` missing from `vercel.json` functions config** — runs at the 10s default while PDF+GPT easily exceeds it.
2. **`getConfig()` is duplicated** in `optimizeHandler.js` and `pdfHandler.js`, and only the optimize copy has `sanitizeEnv`.
3. **`require('firebase-functions')` inside ESM** in both `getConfig()` Firebase branches — would throw if that branch ever executed.
4. **OCR is dead** but `tesseract.js`, `canvas`, `eng.traineddata` (5MB) and the whole OCR half of `PDF_EXTRACTION_CONFIG.md` remain.
5. `extractCompanyName` in folderManager is exported but unused — company name now comes from the model.
6. `validateAndFixSkills` has two `while (...) { break; }` no-op loops; min bounds are never actually enforced.
7. `showUserInfoModal`, `setupTab`, `main.js` are dead.
8. `renderCvMarkdown` (server) and `renderCvHtml` (client) are two independent renderers of the same `cv` object — changes to CV structure need both.
9. CORS is `*` on all Vercel endpoints; no auth check on any API route — the Firebase user is never verified server-side.
