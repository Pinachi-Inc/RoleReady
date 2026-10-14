import axios from 'axios';
import { validateAndFixSkills, reorderSkills } from '../cvValidation.js';
import { renderCvMarkdown } from '../cvRenderer.js';
import { requireAuth } from './firebaseAuth.js';
import { consumeQuota, refundQuota, recordRun } from './firestore.js';
import { reasoningConfig, providerConfig } from './modelOptions.js';

// Ensure env values are safe for HTTP headers/URLs
function sanitizeEnv(value) {
  if (typeof value !== 'string') return '';
  // Trim whitespace/newlines and strip surrounding quotes if present
  return value.trim().replace(/^['\"]|['\"]$/g, '');
}

// One greppable line per model call. The question these answer: is Gemini's thinking
// budget eating the output allowance (reasoning>0 and completion near max_tokens), is the
// response being cut off (finish=length), and which provider actually served it. Without
// finish_reason the logs cannot tell "wrote bad JSON" from "was truncated", and those two
// need opposite fixes. Grep production with:  vercel logs <url> | grep '\[usage\]'
function logModelCall(label, result, requestedMaxTokens) {
  try {
    const data = result?.data || {};
    const choice = data.choices?.[0] || {};
    const usage = data.usage || {};
    const details = usage.completion_tokens_details || {};
    // Gemini 2.5 reports prompt-cache hits here. Logged because the cacheable prefix is
    // only worth restructuring the prompt for if it actually hits, and the Gemini cache
    // has a fixed 5-minute TTL that does not extend on reuse — so for spread-out usage
    // this is expected to read 0 most of the time. Measure before optimising.
    const promptDetails = usage.prompt_tokens_details || {};
    const cached = promptDetails.cached_tokens ?? 0;
    const content = choice.message?.content;
    const completion = usage.completion_tokens ?? null;

    console.log(
      '[usage] call=%s model=%s provider=%s finish=%s prompt=%s cached=%s cached_pct=%s completion=%s reasoning=%s total=%s cap=%s used_pct=%s chars=%s empty=%s',
      label,
      data.model || '?',
      data.provider || '?',
      choice.finish_reason || choice.native_finish_reason || '?',
      usage.prompt_tokens ?? '?',
      cached,
      usage.prompt_tokens ? Math.round((cached / usage.prompt_tokens) * 100) : '?',
      completion ?? '?',
      details.reasoning_tokens ?? 0,
      usage.total_tokens ?? '?',
      requestedMaxTokens,
      completion != null && requestedMaxTokens ? Math.round((completion / requestedMaxTokens) * 100) : '?',
      typeof content === 'string' ? content.length : -1,
      !content
    );
  } catch (err) {
    console.warn('[usage] could not read usage for %s: %s', label, err?.message || err);
  }
}

// The cover letter is a SEPARATE completion, deliberately. Folding it into the CV
// schema would grow an already long JSON response and make truncation — which used to
// 500 the whole request — more likely. Plain text out, so there is nothing to parse.
export function buildCoverLetterPrompt() {
  return `<format>
Plain text. Three paragraphs, one blank line between them, nothing else. No greeting and no signature: both are added afterward. No markdown, no bold, no bullets, no headings, no subject line, no address block, no closing salutation.
</format>

<voice>
You are the applicant. The profile in the user message is your history; write as "I", never in the third person and never by name.
Plain verbs: ran, built, cut, moved, replaced, fixed, owned, rewrote. Contractions are fine. Vary sentence length, and let one or two run short.
</voice>

<paragraphs>
One, four sentences. Sentence one: what I do and how long, taken from my profile alone.
Sentence two: the one thing this posting most needs, described as theirs, not as something I already focus on.
Then two sentences connecting my actual work to it.
Two, four or five sentences. One piece of work from my profile that meets that need: what was slow, breaking or missing before, what I changed, what happened after. Include one detail a reader could not get from my CV.
Three, three sentences. One thing the posting names, a tool, a scale figure, an awkward constraint, in their term for it and at most a few words of it, with no quotation marks and no lists copied from the posting; my real experience of it; and a closing sentence offering to talk about that specific thing.
Write full sentences that carry content. Eleven or twelve sentences in total.
</paragraphs>

<sourcing>
Every number, tool, system and employer in the letter comes from my profile or from the posting.
Every claim about what I do or what my work achieved is one my profile supports. Keep the profile's own hedging: "roughly in half" stays roughly in half. Improvements stay improvements, so where my profile says something happened less often, say less often.
Name a system and its size only where my profile names them; where it does not, say what kind of work it was and what was at stake.
Where my profile has no number, name the thing that stopped happening.
If my profile holds nothing on the thing the posting emphasises, pick a different thing the posting names that it does cover.
Re-angling real work toward this job is right; the letter holds only work I did.
</sourcing>

<register note="pitch and rhythm only; write my own sentences from my own profile">
"The reports went out late most months and nobody owned them. I rewrote the part that kept failing and put one name against it. They have been on time since."
"You mention the scale you are running at. I have worked at that size, and the hard part was keeping everything consistent."
</register>

Three paragraphs of plain text. No greeting, no signature, no markdown.`;
}

async function generateCoverLetter({ config, model, jobDescription, cv, temperature, companyName }) {
  const me = {
    name: cv?.name || null,
    summary: cv?.summary || '',
    experience: (Array.isArray(cv?.experience) ? cv.experience : []).slice(0, 3).map(job => ({
      title: job.title,
      company: job.company,
      start: job.start,
      end: job.end,
      achievements: (job.achievements || []).slice(0, 4)
    })),
    skills: (Array.isArray(cv?.coreSkills) ? cv.coreSkills : []).flatMap(c => (c.items || []).map(i => i.skill)).slice(0, 25)
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.OPENAI_API_KEY}`
  };
  if (config.API_BASE_URL.includes('openrouter.ai')) {
    if (config.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = config.OPENROUTER_SITE_URL;
    if (config.OPENROUTER_APP_TITLE) headers['X-Title'] = config.OPENROUTER_APP_TITLE;
  }

  const result = await axios.post(`${config.API_BASE_URL}/chat/completions`, {
    model,
    max_tokens: 900,
    temperature,
    ...reasoningConfig(),
    ...providerConfig(),
    messages: [
      { role: 'system', content: buildCoverLetterPrompt() },
      { role: 'user', content: JSON.stringify({ jobDescription, myProfile: me }) }
    ]
  }, { headers });

  logModelCall('cover-letter', result, 900);

  const text = result.data?.choices?.[0]?.message?.content;
  if (!text) {
    // Previously this returned '' and the caller reported a blank letter with no cause.
    console.warn('[usage] cover-letter returned empty content — see the [usage] line above for finish/reasoning');
    return '';
  }

  // Greeting and signature are assembled here rather than asked of the model. They are
  // pure slot-fills from data the server already holds; in the prompt they cost two
  // instruction slots and risked a literal placeholder reaching the rendered PDF.
  const body = String(text).trim();
  const greeting = companyName ? `Dear ${companyName} hiring team,` : 'Dear hiring team,';
  return [greeting, body, cv?.name].filter(Boolean).join('\n\n');
}

// Config getter. Reads process.env only — this module is ESM, so the old
// `require('firebase-functions')` branch threw ReferenceError on every request
// under Firebase Functions. Set the same env vars there as everywhere else.
function getConfig() {
  return {
    OPENAI_API_KEY: sanitizeEnv(process.env.OPENAI_API_KEY),
    DEFAULT_MODEL: sanitizeEnv(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
    API_BASE_URL: sanitizeEnv(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
    OPENROUTER_SITE_URL: sanitizeEnv(process.env.OPENROUTER_SITE_URL || ''),
    OPENROUTER_APP_TITLE: sanitizeEnv(process.env.OPENROUTER_APP_TITLE || '')
  };
}

// The CV instruction, lifted out of the request handler so it can be exercised without an
// HTTP request or a Firebase token. Moved verbatim: the template literals are byte-identical
// to what the handler sent before, because re-indenting inside a template literal would
// silently change the prompt.
export function buildCvInstruction() {
  const jsonSchema = `{
    "summary": "string",
    "coreSkills": [
      { "category": "string", "items": [ { "skill": "string", "source": "jd|base", "jdLiteral": "string|null" } ] }
    ],
    "experience": [
      { "roleId": "string|null", "achievements": ["string"] }
    ],
    "keywordsUsed": ["string"],
    "overlapSkills": ["string"],
    "companyName": "string",
    "jobTitle": "string"
  }`;

  const instruction = `You rewrite one candidate's real CV data to fit one job description. Your output is parsed by a program, not read by a person.

<output_contract>
Reply with exactly one JSON object and nothing else: no code fences, no commentary, no text before or after it.
${jsonSchema}
Exactly these six keys, no others. Name, contact, education and certifications are supplied separately, and anything written for them is discarded.
experience: one entry per role in aiUserInfo.experienceSource, in the same order, with that role's roleId copied character for character. The server attaches job titles and dates by roleId.
</output_contract>

<plan>
Before writing, name to yourself the five things this job description needs most. Everything below is written to those five.
</plan>

<voice>
Summary and achievement text read like the candidate typed them quickly:
"Built the whole CI/CD setup from scratch since the team was deploying manually. Cut release time from about an hour to 12 minutes."
Verbs stay plain: built, set up, ran, cut, fixed, moved, wrote, shipped, added, tested, handled, rewrote, reduced, merged.
Bullet shapes vary: some open with a verb, some with the problem; some under 10 words, some 15 to 20. Consecutive bullets open differently.
Number formats vary too: exact ("45 min to 12"), approximate ("about 10 hours a week"), tilde ("~30 deploys a week").
</voice>

<summary>
Four full sentences, each doing its own job.
One: the profession itself as the first word, matching the role title in the job description, then a connector, then the years: "DevOps engineer with 7 years across AWS and Azure." Use yearsOfExperience exactly as given when it is provided; the JD's experience requirement describes the vacancy, not the candidate.
Two: what this candidate is strongest at, drawn from their own experience.
Three: two concrete things from the JD, a tool, a responsibility, a domain, that the candidate has genuinely worked with.
Four: how they work or what they leave behind, in the plain voice above.
Third person throughout, no pronouns for the candidate.
<example note="tone and opening shape only; write new sentences">
"SRE with over 8 years in cloud infrastructure. Strongest at taking systems that page people at night and making them boring. Has run Kubernetes across two regions and owned the Terraform that provisions them. Most of that time went into making sure teams weren't stuck waiting on environments or deploys."
</example>
</summary>

<skills>
8 or 9 categories, 4 to 6 skills in each, around 36 to 50 skills in total. More categories is better: split broad groupings into specific ones rather than lumping them together.
Every category carries at least 4. A category holding two or three is not shipped: either fill it out from the candidate's base skills and the JD, or merge it into the nearest category.
Half or more of all skills are lifted literally from the job description in its exact spelling. Those carry source:"jd" and jdLiteral set to the exact JD substring; the rest carry source:"base" and jdLiteral:null.
overlapSkills = skills present in both aiUserInfo.coreSkillsBase and the JD, written in JD spelling. Every one of them stays in coreSkills.
Order inside a category: JD skills first by prominence, then base skills.
Prefer skills that also appear in the experience bullets; a reader checks the two against each other.
When these pull against each other, the category and per-category counts win, then overlapSkills, then the JD share. Drop non-overlap base skills first.
</skills>

<experience>
4 to 6 bullets per role, the ones that matter most for THIS job first; weaker ones move down or go.
Reframe the candidate's real work toward the JD's priorities: same work, different angle. If the JD cares about reliability and the base achievement is a CI/CD build, angle it at fewer failed deploys.
baseAchievements are evidence of scope, not text to reuse. Paraphrase them.
At least one bullet per role says what was broken, slow, or missing before the work.
Carry over every number that exists in baseAchievements, rounded conversationally where that reads better. A number needs its before-state or its scale to mean anything ("from 45 min to 12", "across 40 services"); a bare percentage reads as filler. Where the real work carries no number, give the scope instead.
Use the JD's literal wording inside bullets wherever it fits the real work.
</experience>

<hard_limits>
Only real experience. Naming a task the described work necessarily included is fine, and so is calling Docker work container orchestration. Stating a role, employer, domain or technology the candidate has not touched is not, and a JD priority with no counterpart in their history is left out rather than filled in.
Organisation names from the JD stay out of the summary, the skills and the bullets: the hiring company, its customers, partners, parent, competitors, plus req numbers, posting ids and URLs. Technologies are not organisations, so AWS, Kubernetes, Terraform, React and PostgreSQL are used verbatim wherever the JD uses them. The candidate's own employers are rendered separately from saved data, so bullets do not repeat them.
companyName holds the hiring company's name. It is metadata, never rendered into the CV; empty string if the JD does not say.
jobTitle holds the title of the advertised role as the JD states it. Also metadata, never rendered; empty string if the JD does not say.
keywordsUsed: JD terms that actually appear in the text you wrote.
Reply with the JSON object only.
</hard_limits>`;

  return instruction;
}

export async function handleOptimizeRequest(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { jobDescription, aiUserInfo } = req.body || {};
  if (!jobDescription || !aiUserInfo) {
    return res.status(400).json({ error: 'jobDescription and aiUserInfo are required' });
  }

  // Consumed before the model call rather than after, so ten parallel requests from a free
  // account cannot all slip under the limit. Refunded below if the run then fails.
  const quota = await consumeQuota(user.uid, 'optimizations', { email: user.email });
  console.log('[optimize] quota uid=%s plan=%s used=%s limit=%s window=%s allowed=%s enforced=%s',
    user.uid, quota.plan, quota.used, quota.limit ?? 'none', quota.window || '?', quota.allowed, quota.enforced);

  if (!quota.allowed) {
    if (quota.enforced) {
      const unavailable = quota.reason === 'quota_unavailable';
      return res.status(unavailable ? 503 : 402).json({
        error: unavailable
          ? 'Usage tracking is temporarily unavailable. Please try again shortly.'
          : quota.plan === 'free'
            ? `You have used all ${quota.limit} free optimizations. Upgrade to keep going.`
            : `You have used all ${quota.limit} optimizations for this month. Your allowance resets on the 1st.`,
        code: unavailable ? 'quota_unavailable' : 'upgrade_required',
        quota: publicQuota(quota),
      });
    }
    console.warn('[optimize] uid=%s is over its %s limit; allowed because BILLING_ENFORCED is off', user.uid, quota.plan);
  }

  const consumed = quota.allowed && quota.used > 0;
  let result = null;
  try {
    result = await runOptimize(req, res, publicQuota(quota));
  } finally {
    // Every failure path in runOptimize answers with a 4xx/5xx rather than throwing.
    if (consumed && res.statusCode >= 400) await refundQuota(user.uid, 'optimizations');
  }

  // Saved history is a paid feature. Recorded after the response has gone out, and recordRun
  // never throws, so it cannot cost the user the CV they just got.
  if (result && quota.plan !== 'free') {
    // The profile the run was made from, as the browser reports it. Display-only metadata,
    // so it is length-capped rather than trusted.
    const { profileId, profileName } = req.body || {};
    await recordRun(user.uid, {
      profileId: typeof profileId === 'string' ? profileId.slice(0, 64) : null,
      profileName: typeof profileName === 'string' ? profileName.slice(0, 80) : null,
      companyName: result.companyName,
      jobTitle: result.jobTitle,
      cv: result.cv,
      coverLetter: result.coverLetter,
    });
  }
}

// The subset of the quota result the browser is told about.
function publicQuota(quota) {
  const remaining = quota.limit == null ? null : Math.max(0, quota.limit - quota.used);
  return { plan: quota.plan, used: quota.used, limit: quota.limit ?? null, remaining, window: quota.window || null };
}

async function runOptimize(req, res, quota) {
  const { jobDescription, aiUserInfo, fixedUserInfo, max_tokens = 4000, temperature = 0.45, includeCoverLetter = false } = req.body || {};

  const config = getConfig();
  const model = config.DEFAULT_MODEL;

  console.log('[optimize] model=%s baseUrl=%s', model, config.API_BASE_URL);
  console.log('[optimize] sizes jd=%s chars, aiUserInfo=%s chars, max_tokens=%s, temp=%s',
    jobDescription?.length ?? 0,
    aiUserInfo?.length ?? 0,
    max_tokens,
    temperature
  );

  if (!jobDescription || !aiUserInfo) {
    return res.status(400).json({ error: 'jobDescription and aiUserInfo are required' });
  }

  if (!config.OPENAI_API_KEY) {
    console.warn('[optimize] OPENAI_API_KEY not set');
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const instruction = buildCvInstruction();

  // Extract only yearsOfExperience from fixedUserInfo
  let yearsOfExperience = null;
  if (fixedUserInfo) {
    try {
      const fixed = JSON.parse(fixedUserInfo);
      yearsOfExperience = fixed.yearsOfExperience || null;
    } catch (e) {
      // If parsing fails, ignore
    }
  }

  const userPayload = { jobDescription, aiUserInfo, yearsOfExperience };

  try {
    const url = `${config.API_BASE_URL}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`
    };
    
    // Add OpenRouter-specific headers if using OpenRouter
    if (config.API_BASE_URL.includes('openrouter.ai')) {
      if (config.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = config.OPENROUTER_SITE_URL;
      if (config.OPENROUTER_APP_TITLE) headers['X-Title'] = config.OPENROUTER_APP_TITLE;
    }

    console.log('[optimize] POST %s/chat/completions', config.API_BASE_URL);
    const initialBody = {
      model,
      max_tokens,
      temperature,
      top_p: 0.9,
      ...reasoningConfig(),
      ...providerConfig(),
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(userPayload) }
      ]
    };
    console.log(
      '[optimize] request preview: instructionLen=%s, userPayloadLen=%s, userPayloadPreview=%s',
      instruction.length,
      JSON.stringify(userPayload).length,
      JSON.stringify(userPayload).slice(0, 400)
    );
    const result = await axios.post(url, initialBody, { headers });

    logModelCall('cv', result, max_tokens);

    let content = result.data?.choices?.[0]?.message?.content;
    console.log('[optimize] success; tokens_requested=%s content_length=%s', max_tokens, content?.length ?? 0);
    if (content) {
      const preview = String(content).slice(0, 400);
      console.log('[optimize] model output preview (first 400 chars): %s', preview);
    }
    if (!content) {
      const keys = Object.keys(result.data || {}).join(', ') || '(none)';
      const choicesCount = Array.isArray(result.data?.choices) ? result.data.choices.length : '(none)';
      console.error('[optimize] empty content. response keys=%s choices=%s', keys, choicesCount);
      try {
        const respPreview = JSON.stringify(result.data).slice(0, 800);
        console.error('[optimize] full response preview (first 800): %s', respPreview);
      } catch {}
      return res.status(500).json({ error: 'Invalid response from model (empty content)' });
    }

    const stripCodeFences = (raw) => {
      if (typeof raw !== 'string') return '';
      // Full fence (opening + closing)
      if (/```[a-zA-Z]*\n[\s\S]*?```/.test(raw)) {
        console.log('[optimize] stripping code fences from model output');
        return raw.replace(/```[a-zA-Z]*\n([\s\S]*?)```/, '$1').trim();
      }
      // Opening fence only (truncated response — strip the prefix and take what we have)
      if (/^```[a-zA-Z]*\n/.test(raw.trim())) {
        console.log('[optimize] stripping opening-only code fence (truncated response)');
        return raw.trim().replace(/^```[a-zA-Z]*\n/, '').trim();
      }
      return raw.trim();
    };

    const parseAndPrepare = (raw) => {
      const clean = stripCodeFences(raw);
      let parsed;
      try { parsed = JSON.parse(clean); } catch (e) {
        const msg = e && e.message ? String(e.message) : 'unknown error';
        let pos = null;
        const m = msg.match(/position\s+(\d+)/i);
        if (m) pos = Number(m[1]);
        let around = '';
        if (pos !== null && !Number.isNaN(pos)) {
          const start = Math.max(0, pos - 120);
          const end = Math.min(clean.length, pos + 120);
          around = clean.slice(start, end).replace(/\n/g, '\\n');
        }
        // Heuristics
        const hasCurlyQuotes = /[""]/.test(clean);
        const trailingComma = /(,\s*[}\]])/.test(clean);
        const bracesDelta = (clean.match(/[\{\[]/g) || []).length - (clean.match(/[\}\]]/g) || []).length;
        const likely = [];
        if (/Unexpected end of JSON input/i.test(msg) || bracesDelta > 0) likely.push('incomplete JSON (truncated or missing closing brace/bracket)');
        if (trailingComma) likely.push('trailing comma before } or ]');
        if (hasCurlyQuotes) likely.push('curly quotes " " used instead of "');
        console.error('[optimize] JSON parse failed: %s', msg);
        if (pos !== null) console.error('[optimize] error at position %s. Context: %s', pos, around);
        if (likely.length) console.error('[optimize] likely causes: %s', likely.join('; '));
        console.error('[optimize] Clean preview (first 400): %s', clean.slice(0, 400));
        return { error: 'parse' };
      }
      console.log('[optimize] parsed keys: %s', Object.keys(parsed || {}).join(', ') || '(none)');
      console.log('[optimize] companyName: %s', parsed?.companyName ?? '(missing)');

      // Structural validation to explain why JSON may be considered invalid
      const structureIssues = [];
      const allowedKeys = new Set(['summary', 'coreSkills', 'experience', 'keywordsUsed', 'overlapSkills', 'companyName', 'jobTitle']);
      for (const k of Object.keys(parsed || {})) {
        if (!allowedKeys.has(k)) structureIssues.push(`Unexpected key: ${k}`);
      }
      if (typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
        structureIssues.push('Missing or empty "summary" (string expected)');
      }
      if (!Array.isArray(parsed.coreSkills) || parsed.coreSkills.length === 0) {
        structureIssues.push('Missing or empty "coreSkills" (array expected)');
      } else {
        parsed.coreSkills.forEach((cat, idx) => {
          if (!cat || typeof cat.category !== 'string' || !Array.isArray(cat.items)) {
            structureIssues.push(`coreSkills[${idx}] must have {category: string, items: array}`);
          } else if (cat.items.length === 0) {
            structureIssues.push(`coreSkills[${idx}].items is empty`);
          } else {
            cat.items.forEach((it, jdx) => {
              if (!it || typeof it.skill !== 'string') {
                structureIssues.push(`coreSkills[${idx}].items[${jdx}].skill must be string`);
              }
              if (it && it.source && !['jd', 'base'].includes(it.source)) {
                structureIssues.push(`coreSkills[${idx}].items[${jdx}].source must be "jd"|"base"`);
              }
            });
          }
        });
      }
      if (!Array.isArray(parsed.experience)) {
        structureIssues.push('Missing or invalid "experience" (array expected)');
      } else if (parsed.experience.length === 0) {
        structureIssues.push('"experience" is empty');
      } else {
        parsed.experience.forEach((job, idx) => {
          if (!job || !Array.isArray(job.achievements)) {
            structureIssues.push(`experience[${idx}].achievements must be array`);
          } else if (job.achievements.length === 0) {
            structureIssues.push(`experience[${idx}].achievements is empty`);
          }
        });
      }
      const { coreSkills, jdShare, dropped } = validateAndFixSkills(parsed.coreSkills);
      const orderedSkills = reorderSkills(coreSkills);
      if (dropped && (dropped.items > 0 || dropped.categories > 0)) {
        console.warn('[optimize] over-production trimmed: %s skills (%s), %s categories',
          dropped.items, dropped.itemsByCategory.join(', ') || 'none', dropped.categories);
        structureIssues.push(`Model over-produced: ${dropped.items} skill(s) and ${dropped.categories} category(ies) dropped to fit the limits`);
      }

      // Merge role metadata from aiUserInfo (if JSON with experienceSource is provided)
      const roleMetaMap = (() => {
        try {
          const aiClean = stripCodeFences(aiUserInfo || '');
          const aiParsed = JSON.parse(aiClean);
          const src = Array.isArray(aiParsed?.experienceSource) ? aiParsed.experienceSource : [];
          const map = new Map();
          for (const r of src) {
            if (!r || !r.roleId) continue;
            if (map.has(r.roleId)) {
              // Duplicates make every job inherit the last one's header. Should be
              // impossible now that ids are uuid-based; log it if it ever recurs.
              console.warn('[optimize] duplicate roleId %s — job headers will collide', r.roleId);
            }
            map.set(r.roleId, {
              title: r.title || null,
              company: r.company || null,
              location: r.location || null,
              start: r.start || null,
              end: r.end || null
            });
          }
          return map;
        } catch {
          return new Map();
        }
      })();

      const enrichedExperience = Array.isArray(parsed.experience)
        ? parsed.experience.map((job) => {
            const meta = job && job.roleId ? roleMetaMap.get(job.roleId) : null;
            return {
              roleId: job.roleId || null,
              title: meta?.title || job.title || null,
              company: meta?.company || job.company || null,
              location: meta?.location || job.location || null,
              start: meta?.start || job.start || null,
              end: meta?.end || job.end || null,
              achievements: Array.isArray(job.achievements) ? job.achievements : []
            };
          })
        : [];
      const prepared = {
        name: parsed.name || undefined,
        contact: parsed.contact || undefined,
        summary: parsed.summary || '',
        coreSkills: orderedSkills,
        certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
        experience: enrichedExperience,
        education: Array.isArray(parsed.education) ? parsed.education : []
      };
      return { cv: prepared, jdShare, dropped, keywords: Array.isArray(parsed.keywordsUsed) ? parsed.keywordsUsed : [], overlapSkills: Array.isArray(parsed.overlapSkills) ? parsed.overlapSkills : [], structureIssues, companyName: typeof parsed.companyName === 'string' ? parsed.companyName.trim() : '', jobTitle: typeof parsed.jobTitle === 'string' ? parsed.jobTitle.trim() : '' };
    };

    let { cv, jdShare, dropped, keywords, overlapSkills, structureIssues, companyName, jobTitle } = parseAndPrepare(content);

    let totals = 0;
    let categoryCount = 0;
    let needsFix = false;
    let boundsViolations = [];
    if (cv && Array.isArray(cv.coreSkills)) {
      totals = cv.coreSkills.reduce((acc, c) => acc + c.items.length, 0);
      categoryCount = cv.coreSkills.length;
      boundsViolations = cv.coreSkills
        .filter(c => c.items.length < 3 || c.items.length > 9)
        .map(c => `${c.category}:${c.items.length}`);
      needsFix = (jdShare ?? 0) < 0.5 || categoryCount < 6 || categoryCount > 9 || boundsViolations.length > 0;
      console.log('[optimize] skills stats: jdShare=%s, categories=%s, totalSkills=%s', jdShare, categoryCount, totals);
      if (boundsViolations.length > 0) {
        console.log('[optimize] category size violations: %s', boundsViolations.join(', '));
      }
    } else {
      needsFix = true; // parsing failed
    }

    if (!cv || !Array.isArray(cv.coreSkills) || cv.coreSkills.length === 0) {
      console.error('[optimize] JSON invalid or empty. Last output preview (first 400): %s', String(content || '').slice(0, 400));
      return res.status(500).json({ error: 'Model did not return valid structured JSON for skills. Please try again.' });
    }

    // Merge fixed user info (name, contact, certifications, education) if provided by client
    if (fixedUserInfo) {
      try {
        const fixedClean = stripCodeFences(fixedUserInfo);
        const fixed = JSON.parse(fixedClean);
        if (fixed && typeof fixed === 'object') {
          if (fixed.name) cv.name = fixed.name;
          if (fixed.contact) cv.contact = fixed.contact;
          if (Array.isArray(fixed.certifications)) cv.certifications = fixed.certifications;
          if (Array.isArray(fixed.education)) cv.education = fixed.education;
        }
      } catch {}
    }

    // Debug: print first bullet from each job returned by the model
    try {
      if (Array.isArray(cv.experience)) {
        for (const job of cv.experience) {
          const first = Array.isArray(job.achievements) && job.achievements.length > 0 ? job.achievements[0] : '(none)';
          console.log('[debug] experience first bullet roleId=%s title=%s -> %s', job.roleId || '(unknown)', job.title || '(no-title)', String(first).slice(0, 200));
        }
      }
    } catch {}

    // Compute filtered keywords that actually appear in the rendered CV content
    const markdown = renderCvMarkdown(cv);
    const plainText = (() => {
      try {
        // very simple strip of markdown markers
        return String(markdown)
          .replace(/[#*_`>\-]/g, ' ')
          .replace(/\s+/g, ' ')
          .toLowerCase();
      } catch { return ''; }
    })();
    const filteredKeywords = (Array.isArray(keywords) ? keywords : [])
      .filter(k => {
        const term = String(k || '').trim().toLowerCase();
        if (!term) return false;
        return plainText.includes(term);
      });

    if (Array.isArray(structureIssues) && structureIssues.length) {
      console.warn('[optimize] structure issues:', structureIssues.join(' | '));
    }

    // Optional second pass. A failure here must not cost the user their CV, so it is
    // caught and reported as an empty letter rather than failing the request.
    let coverLetter = '';
    if (includeCoverLetter) {
      try {
        console.log('[optimize] generating cover letter');
        coverLetter = await generateCoverLetter({ config, model, jobDescription, cv, temperature, companyName });
        console.log('[optimize] cover letter length=%s', coverLetter.length);
      } catch (err) {
        console.error('[optimize] cover letter failed: %s', err.response?.status || err.message);
      }
    }
    const stats = {
      jdShare: jdShare ?? 0,
      categories: categoryCount,
      totalSkills: totals,
      categorySizeViolations: boundsViolations,
      structureIssues: structureIssues || [],
      overlapCount: Array.isArray(overlapSkills) ? overlapSkills.length : 0,
      droppedSkills: dropped?.items ?? 0,
      droppedCategories: dropped?.categories ?? 0
    };
    const payload = {
      cvContent: markdown,
      keywords: (keywords || []).slice(0, 20),
      keywordsFiltered: filteredKeywords.slice(0, 20),
      cv,
      coverLetter,
      needsFix,
      stats,
      overlapSkills: Array.isArray(overlapSkills) ? overlapSkills : [],
      companyName: companyName || '',
      jobTitle: jobTitle || '',
      quota
    };
    res.json(payload);
    return payload;
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || err.message;
    console.error('[optimize] error status=%s message=%s data=%j', status, err.message, data);
    res.status(status).json({ error: data });
  }
}

