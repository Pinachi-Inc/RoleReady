// Matches terms against text the way a recruiter's keyword search would: case-insensitive,
// whole words, punctuation-insensitive except the characters that make tech names (C++, C#, Node.js).
export function normalizeTerm(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// (term) => boolean: does the term occur in text as a whole phrase, allowing a plural s either way.
export function makeTextMatcher(text) {
  const hay = ` ${normalizeTerm(text)} `;
  return (term) => {
    const n = normalizeTerm(term);
    if (!n) return false;
    if (hay.includes(` ${n} `) || hay.includes(` ${n}s `)) return true;
    return n.length > 3 && n.endsWith('s') && hay.includes(` ${n.slice(0, -1)} `);
  };
}

const uniq = (arr) => [...new Map(arr.map((s) => [normalizeTerm(s), s])).values()].filter((s) => normalizeTerm(s));

// Labels each skill jd/base (used only to put JD skills first inside a category).
export function labelSkills(coreSkills, jobDescription = '') {
  const inJd = makeTextMatcher(jobDescription);
  return (Array.isArray(coreSkills) ? coreSkills : []).map((cat) => ({
    category: cat.category,
    items: cat.items.map((it) => ({ skill: it.skill, source: inJd(it.skill) ? 'jd' : 'base' })),
  }));
}

// The Result Analysis payload.
//   jdKeywords: the model's list of the JD's key requirements (dropped if not literally in the JD)
//   cvText: everything printed on the CV; writtenText: summary + bullets + skills (what the model wrote)
//   profileText: the person's saved profile (aiUserInfo + fixedUserInfo strings)
export function analyzeCoverage({ jdKeywords = [], jobDescription = '', cvText = '', writtenText = '', profileText = '' }) {
  const inJd = makeTextMatcher(jobDescription);
  const inCv = makeTextMatcher(cvText);
  const inWritten = makeTextMatcher(writtenText);
  const inProfile = makeTextMatcher(profileText);
  const keywords = uniq((Array.isArray(jdKeywords) ? jdKeywords : []).map(String).filter(inJd)).slice(0, 30);
  const matched = keywords.filter(inCv);
  const missing = keywords.filter((k) => !inCv(k)).map((term) => ({ term, inProfile: inProfile(term) }));
  const unsupported = keywords.filter((k) => inWritten(k) && !inProfile(k));
  return {
    total: keywords.length,
    matched,
    missing,
    unsupported,
    coverage: keywords.length ? matched.length / keywords.length : null,
  };
}
