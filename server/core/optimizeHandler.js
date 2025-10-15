import axios from 'axios';
import { validateAndFixSkills, reorderSkills } from '../cvValidation.js';
import { renderCvMarkdown } from '../cvRenderer.js';

// Ensure env values are safe for HTTP headers/URLs
function sanitizeEnv(value) {
  if (typeof value !== 'string') return '';
  // Trim whitespace/newlines and strip surrounding quotes if present
  return value.trim().replace(/^['\"]|['\"]$/g, '');
}

// Environment-aware config getter
function getConfig() {
  // Check if running in Firebase Functions
  const isFirebase = process.env.FUNCTIONS_EMULATOR || process.env.FUNCTION_NAME;
  
  if (isFirebase) {
    // Firebase Functions - try secrets first, fall back to config
    const functions = require('firebase-functions');
    return {
      OPENAI_API_KEY: sanitizeEnv(process.env.OPENAI_API_KEY || functions.config().openai?.key),
      DEFAULT_MODEL: sanitizeEnv(process.env.OPENAI_MODEL || functions.config().openai?.model || 'gpt-4o-mini'),
      API_BASE_URL: sanitizeEnv(process.env.OPENAI_BASE_URL || functions.config().openai?.base_url || 'https://api.openai.com/v1'),
      OPENROUTER_SITE_URL: sanitizeEnv(process.env.OPENROUTER_SITE_URL || functions.config().openrouter?.site_url || ''),
      OPENROUTER_APP_TITLE: sanitizeEnv(process.env.OPENROUTER_APP_TITLE || functions.config().openrouter?.app_title || '')
    };
  } else {
    // Express/local environment
    return {
      OPENAI_API_KEY: sanitizeEnv(process.env.OPENAI_API_KEY),
      DEFAULT_MODEL: sanitizeEnv(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
      API_BASE_URL: sanitizeEnv(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
      OPENROUTER_SITE_URL: sanitizeEnv(process.env.OPENROUTER_SITE_URL || ''),
      OPENROUTER_APP_TITLE: sanitizeEnv(process.env.OPENROUTER_APP_TITLE || '')
    };
  }
}

export async function handleOptimizeRequest(req, res) {
  const { jobDescription, aiUserInfo, fixedUserInfo, max_tokens = 4000, temperature = 0.7 } = req.body || {};
  
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

  const jsonSchema = `{
    "summary": "string",
    "coreSkills": [
      { "category": "string", "items": [ { "skill": "string", "source": "jd|base", "jdLiteral": "string|null" } ] }
    ],
    "experience": [
      { "roleId": "string|null", "achievements": ["string"] }
    ],
    "keywordsUsed": ["string"],
    "overlapSkills": ["string"]
  }`;

  const instruction = `You are a CV optimizer. Return ONLY valid JSON matching the schema below. No extra text, no code fences. Do not include name, contact, certifications, or education in the JSON.

Rules:
- Core Skills must have 6–9 categories; each category has 3–9 skills.
- At least 50% of ALL skills across all categories must be taken literally from the job description.
- When a concept appears in both base skills and the job description, USE THE EXACT JD SPELLING in the final list.
- Within each category: list JD skills first (sorted by prominence in the JD), then base skills.
- Compute overlapSkills = skills that appear BOTH in aiUserInfo.coreSkillsBase (case-insensitive) AND literally in the jobDescription. Every skill in overlapSkills MUST appear in coreSkills using the EXACT spelling from the job description.
- If category limits force removal, drop non-overlap items first; NEVER drop items from overlapSkills.
- If the most suitable category does not exist, create it or place the skill in the closest relevant category.
- Experience achievements: 4–6 concise bullets per job, action-led, include metrics if possible. For each role, use the provided baseAchievements ONLY as examples of scope and outcomes; GENERATE NEW bullet points tailored to the specific job description. Do not copy or lightly rephrase the input bullets; write fresh, JD-aligned achievements and incorporate literal JD keywords where appropriate.
- Summary: 2–4 sentences tailored to the job.
- Remove exact duplicates (case-insensitive). If both JD and base forms exist, keep the JD form.
- Do NOT copy the input text verbatim. Paraphrase base bullets to match the job description and integrate literal JD keywords where appropriate.
- Never include the employer/company name, product or brand names, or any job-post identifiers from the job description anywhere in the output. Keep wording generic and not addressed to a specific company.

Schema:
${jsonSchema}`;

  const userPayload = { jobDescription, aiUserInfo };

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
      temperature: 0.2,
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
      const fenced = raw.match(/```[a-zA-Z]*\n[\s\S]*?```/);
      if (fenced) {
        console.log('[optimize] stripping code fences from model output');
        return raw.replace(/```[a-zA-Z]*\n([\s\S]*?)```/, '$1').trim();
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

      // Structural validation to explain why JSON may be considered invalid
      const structureIssues = [];
      const allowedKeys = new Set(['summary', 'coreSkills', 'experience', 'keywordsUsed', 'overlapSkills']);
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
      const { coreSkills, jdShare } = validateAndFixSkills(parsed.coreSkills);
      const orderedSkills = reorderSkills(coreSkills);

      // Merge role metadata from aiUserInfo (if JSON with experienceSource is provided)
      const roleMetaMap = (() => {
        try {
          const aiClean = stripCodeFences(aiUserInfo || '');
          const aiParsed = JSON.parse(aiClean);
          const src = Array.isArray(aiParsed?.experienceSource) ? aiParsed.experienceSource : [];
          const map = new Map();
          for (const r of src) {
            if (!r || !r.roleId) continue;
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
      return { cv: prepared, jdShare, keywords: Array.isArray(parsed.keywordsUsed) ? parsed.keywordsUsed : [], overlapSkills: Array.isArray(parsed.overlapSkills) ? parsed.overlapSkills : [], structureIssues };
    };

    let { cv, jdShare, keywords, overlapSkills, structureIssues } = parseAndPrepare(content);

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
      needsFix = true; // parsing failed; request strict JSON
    }

    if (!cv || !Array.isArray(cv.coreSkills) || cv.coreSkills.length === 0) {
      console.error('[optimize] final JSON invalid or empty after retry. Last output preview (first 400): %s', String(content || '').slice(0, 400));
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
    const stats = {
      jdShare: jdShare ?? 0,
      categories: categoryCount,
      totalSkills: totals,
      categorySizeViolations: boundsViolations,
      structureIssues: structureIssues || [],
      overlapCount: Array.isArray(overlapSkills) ? overlapSkills.length : 0
    };
    res.json({
      cvContent: markdown,
      keywords: (keywords || []).slice(0, 20),
      keywordsFiltered: filteredKeywords.slice(0, 20),
      cv,
      needsFix,
      stats,
      overlapSkills: Array.isArray(overlapSkills) ? overlapSkills : []
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || err.message;
    console.error('[optimize] error status=%s message=%s data=%j', status, err.message, data);
    res.status(status).json({ error: data });
  }
}

