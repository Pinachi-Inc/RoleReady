## RoleBerry (working title)

Opinionated CV optimizer that tailors your CV to a specific Job Description (JD), injects literal JD keywords into skills, and renders a consistent, professional HTML layout you can print to PDF.

### Highlights
- React + Vite frontend, Express server proxy
- OpenAI/OpenRouter compatible chat API
- Strict JSON output + server validation of skills
- Deterministic HTML template (no model-dependent formatting)
- Stats and guardrails surfaced in UI (JD share, category counts)

### How it works (high level)
1. You paste:
   - Job Description (JD)
   - AI Input (what the model needs): base skills; per role → title, company, dates, bullet pool
   - Fixed User Info (NOT sent to AI): name, contact, certifications, education
2. Server asks the model for a structured JSON with:
   - summary
   - coreSkills (6–9 categories; each 3–9 items; ≥50% literal JD skills; JD wording wins)
   - experience[].achievements (fresh, JD‑tailored bullets per role; not copied)
   - keywordsUsed
3. Server validates results, merges role metadata, and returns:
   - `cv` JSON
   - markdown fallback
   - `stats` (JD share, counts, violations)
4. Client renders `cv` into the approved HTML template (iframe preview and downloadable HTML).

### Prerequisites
- Node 18+ (Node 20+ recommended)

### Setup
1. Install deps
```
npm install
```
2. Create `.env` in project root with one of the following:

OpenRouter (recommended for quick start)
```
PORT=8787
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-REPLACE_ME
OPENAI_MODEL=openai/gpt-4o-mini

# Optional but recommended for OpenRouter attribution
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_TITLE=RoleBerry
```

OpenAI
```
PORT=8787
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-REPLACE_ME
OPENAI_MODEL=gpt-4o-mini
```

3. Start dev servers (proxy + Vite)
```
npm run start
```
Vite runs on 5173 and proxies `/api` to the local server on 8787.

### Using the app
- Job Description: paste the full JD.
- AI Input (sent to AI):
  - Base skills in categories
  - For each role: `roleId`, `title`, `company`, `location`, `start`, `end`, `baseAchievements` (bullets to use as examples)
- Fixed User Info (NOT sent to AI): `name`, `contact`, `certifications`, `education`

**PDF Upload:**
- You can upload a PDF CV to auto-extract your information
- **Only text-based PDFs are supported** (created from Word, Google Docs, etc.)
- **Scanned/image-based PDFs are NOT supported** - please use the manual input instead

Click Optimize. You'll get:
- Template HTML preview (iframe)
- Download button for an HTML file you can Print → Save as PDF
- Keywords Integrated (from response, filtered to those present in CV)
- AI Stats (JD share %, category counts). If constraints aren't met, a red banner appears.

### JSON schemas (also available in the UI modal)

Fixed User Info (not sent to AI)
```
{
  "name": "string",
  "contact": { "email": "string", "phone": "string", "location": "string", "links": ["string"] },
  "certifications": ["string"],
  "education": ["string"]
}
```

AI Input (sent to AI)
```
{
  "coreSkillsBase": [
    { "category": "string", "items": ["string"] }
  ],
  "experienceSource": [
    {
      "roleId": "string",
      "title": "string",
      "company": "string",
      "location": "string",
      "start": "YYYY or YYYY-MM",
      "end": "YYYY or YYYY-MM | Present",
      "baseAchievements": ["string"]
    }
  ]
}
```

### Rendering template
- Runtime renderer: `src/templateRenderer.js`
- Sections: Summary, Core Skills (category: item, item…), Certifications, Professional Experience (Title | Company | Location; Start — End; bullets), Education
- Header (name + contact) centered, no borders; section headers with subtle background

### Environment variables
- `PORT`: server port (default 8787)
- `OPENAI_BASE_URL`: `https://api.openai.com/v1` or `https://openrouter.ai/api/v1`
- `OPENAI_API_KEY`: your API key
- `OPENAI_MODEL`: model id (e.g., `openai/gpt-4o-mini`, or another supported id)
- `OPENROUTER_SITE_URL`, `OPENROUTER_APP_TITLE`: optional attribution for OpenRouter

### Share via ngrok
- Vite is configured to allow any host and listen on all interfaces
- Example:
```
ngrok http 5173
```
Open the forwarded URL; the dev server will proxy `/api` back to your local server.

### Troubleshooting
- 404 “No endpoints found for model”: the model id isn’t supported on the selected API. Pick a listed model id and restart.
- 429 rate limit: switch models, add your own key, or retry later.
- JSON parse failed / truncated: large outputs can be cut; try a smaller JD or a model that obeys JSON mode better; you can also reduce temperature.
- Company name in summary: the server instructs to avoid company/brand names; refine JD or switch models if leakage persists.

### Scripts
- `npm run start` → run Express server (8787) + Vite (5173)
- `npm run server` → server only
- `npm run dev` → Vite only

### Folder structure
```
encver/
  components/CVOptimizer.jsx        # UI
  services/openai.js                # client → /api/optimize
  server/index.js                   # proxy, prompting, validation, merging
  server/cvValidation.js            # skills validation + JD share
  server/cvRenderer.js              # markdown fallback renderer
  src/templateRenderer.js           # HTML template renderer
  utils/markdown.js, utils/download.js
  vite.config.js                    # dev proxy + host allowances
```

### Security notes
- Never ship API keys to the client. Keys are used only on the server.
- If you deploy, put the server behind HTTPS and add proper CORS/host checks.

### License
MIT (or your preferred license)


