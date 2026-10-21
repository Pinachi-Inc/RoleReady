// Generation benchmark: builds the CV request exactly like runOptimize does and times it.
//   node scripts/bench-optimize.mjs --runs 5 --providers "Venice,AtlasCloud" --letter --label after
// Dev tool only, not wired into CI. Needs OPENAI_API_KEY (OpenRouter) in ./.env or ../../.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

for (const p of [path.join(root, '.env'), path.join(root, '../../.env')]) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break; }
}

const runs = Number(opt('runs', 3));
const label = opt('label', 'run');
const withLetter = flag('letter');
const fixturePath = path.resolve(root, opt('fixture', 'scripts/bench/fixture.json'));
const providers = opt('providers', null);
if (providers !== null) process.env.MODEL_PROVIDERS = providers === 'none' ? '' : providers;

const { buildCvInstruction, buildCoverLetterPrompt, ...handlerExports } = await import('../server/core/optimizeHandler.js');
const { reasoningConfig, providerConfig } = await import('../server/core/modelOptions.js');
const { makeTextMatcher, analyzeCoverage, dropUnbackedSkills } = await import('../server/skillMatch.js');
const { buildLetterProfile } = handlerExports;

const key = process.env.OPENAI_API_KEY;
if (!key) { console.error('OPENAI_API_KEY is not set'); process.exit(1); }
const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/^['"]|['"]$/g, '');
const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').replace(/^['"]|['"]$/g, '');
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
if (baseUrl.includes('openrouter.ai')) {
  if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_APP_TITLE) headers['X-Title'] = process.env.OPENROUTER_APP_TITLE;
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const { jobDescription } = fixture;
const aiUserInfoRaw = JSON.stringify(fixture.aiUserInfo, null, 2);
const fixedUserInfoRaw = JSON.stringify(fixture.fixedUserInfo);
const PROBES = ['Azure', 'GCP', 'Istio', 'Linkerd', 'Vault', 'OpenTelemetry', 'GitLab', 'FinOps'];

const stripFences = (s) => String(s || '').replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
const median = (xs) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

async function call(body) {
  const started = Date.now();
  const res = await axios.post(`${baseUrl}/chat/completions`, body, { headers, timeout: 180000 });
  return { res, ms: Date.now() - started };
}

function cvBody() {
  return {
    model, max_tokens: 4000, temperature: 0.45, top_p: 0.9,
    ...reasoningConfig(), ...providerConfig(),
    messages: [
      { role: 'system', content: buildCvInstruction() },
      { role: 'user', content: JSON.stringify({ jobDescription, aiUserInfo: aiUserInfoRaw, yearsOfExperience: fixture.fixedUserInfo.yearsOfExperience }) },
    ],
  };
}

function letterBody(profile) {
  return {
    model, max_tokens: 900, temperature: 0.45,
    ...reasoningConfig(), ...providerConfig(),
    messages: [
      { role: 'system', content: buildCoverLetterPrompt() },
      { role: 'user', content: JSON.stringify({ jobDescription, myProfile: profile }) },
    ],
  };
}

// The letter payload built from the generated CV: today's behaviour before the letter
// reads the saved profile instead.
function profileFromCv(cv) {
  return {
    name: cv?.name || null,
    summary: cv?.summary || '',
    experience: (cv?.experience || []).slice(0, 3).map((j) => ({ ...j, achievements: (j.achievements || []).slice(0, 4) })),
    skills: (cv?.coreSkills || []).flatMap((c) => (c.items || []).map((i) => (typeof i === 'string' ? i : i.skill))).slice(0, 25),
  };
}

async function oneRun(n) {
  const row = { run: n, label, parsed: false };
  const endToEnd = Date.now();
  const parallelLetter = withLetter && typeof buildLetterProfile === 'function';
  const lp = parallelLetter
    ? call(letterBody(buildLetterProfile(fixture.aiUserInfo, fixedUserInfoRaw, aiUserInfoRaw))).catch((e) => ({ error: e }))
    : null;
  let cvRes;
  try { cvRes = await call(cvBody()); } catch (e) {
    row.error = e.response?.status ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 160)}` : e.message;
    return row;
  }
  row.cvMs = cvRes.ms;
  const data = cvRes.res.data;
  row.provider = data.provider;
  row.completionTokens = data.usage?.completion_tokens ?? null;
  row.finish = data.choices?.[0]?.finish_reason ?? null;
  let cv;
  try { cv = JSON.parse(stripFences(data.choices?.[0]?.message?.content)); row.parsed = true; } catch { /* leave parsed=false */ }

  if (cv) {
    const rawCats = Array.isArray(cv.coreSkills) ? cv.coreSkills : [];
    const items = rawCats.flatMap((c) => c.items || []);
    row.labels = { jd: 0, base: 0, other: 0 };
    // Same guard the server applies before labelling: JD skills the profile does not back are removed.
    const guarded = dropUnbackedSkills(
      rawCats.map((c) => ({ category: c.category, items: (c.items || []).map((i) => ({ skill: typeof i === 'string' ? i : i?.skill })).filter((i) => i.skill) })),
      { jobDescription, profileText: `${aiUserInfoRaw}\n${fixedUserInfoRaw}` },
    );
    row.removedSkills = guarded.removed;
    const cats = guarded.coreSkills;
    const skills = cats.flatMap((c) => c.items.map((i) => i.skill));
    row.categories = cats.length;
    row.totalSkills = skills.length;
    for (const i of items) {
      if (i && i.source === 'jd') row.labels.jd++;
      else if (i && i.source === 'base') row.labels.base++;
      else row.labels.other++;
    }
    const inJd = makeTextMatcher(jobDescription);
    row.literalJdShare = skills.length ? +(skills.filter(inJd).length / skills.length).toFixed(3) : 0;
    const bullets = (cv.experience || []).flatMap((j) => j.achievements || []);
    const written = [cv.summary, ...skills, ...bullets].join('\n');
    const prose = [cv.summary, ...bullets].join('\n');
    const hasProbe = makeTextMatcher(prose);
    row.probes = PROBES.filter(hasProbe).length;
    const a = analyzeCoverage({
      jdKeywords: cv.jdKeywords || [], jobDescription, cvText: written, writtenText: written,
      profileText: `${aiUserInfoRaw}\n${fixedUserInfoRaw}`,
    });
    row.analysisTotal = a.total;
    row.coverage = a.coverage == null ? null : +a.coverage.toFixed(2);
    row.unsupported = a.unsupported.length;
    row.unsupportedTerms = a.unsupported;
    row.missingTerms = a.missing.map((m) => (m.inProfile ? `${m.term}*` : m.term));
  }

  if (withLetter) {
    if (parallelLetter) {
      const l = await lp;
      row.letterMs = l.error ? null : l.ms;
      row.letterOk = !l.error && !!l.res?.data?.choices?.[0]?.message?.content;
    } else if (cv) {
      try {
        const l = await call(letterBody(profileFromCv(cv)));
        row.letterMs = l.ms;
        row.letterOk = !!l.res.data?.choices?.[0]?.message?.content;
      } catch { row.letterMs = null; row.letterOk = false; }
    }
  }
  row.totalMs = Date.now() - endToEnd;
  return row;
}

const rows = [];
for (let i = 1; i <= runs; i++) {
  const r = await oneRun(i);
  rows.push(r);
  console.log(JSON.stringify(r));
}
const ok = rows.filter((r) => r.parsed);
const summary = {
  label, providersEnv: process.env.MODEL_PROVIDERS || '(none)', runs, parsed: ok.length,
  medianCvMs: median(rows.map((r) => r.cvMs)),
  medianLetterMs: median(rows.map((r) => r.letterMs)),
  medianTotalMs: median(rows.map((r) => r.totalMs)),
  medianCompletionTokens: median(rows.map((r) => r.completionTokens)),
  medianLiteralJdShare: median(ok.map((r) => r.literalJdShare)),
  medianProbes: median(ok.map((r) => r.probes)),
  medianAnalysisTotal: median(ok.map((r) => r.analysisTotal)),
  categories: ok.map((r) => r.categories).join('/'),
};
console.log('MEDIAN ' + JSON.stringify(summary));
fs.writeFileSync(`/tmp/bench-${label}.json`, JSON.stringify({ summary, rows }, null, 2));
