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

// A JD term counts as backed by the profile when the profile names one of these instead.
export const PROFILE_ALIASES = {
  'gitops': ['argo cd', 'argocd', 'flux', 'fluxcd'],
  'ci/cd': ['github actions', 'gitlab ci', 'jenkins', 'circleci', 'argo cd', 'azure devops', 'teamcity', 'bamboo'],
  'infrastructure as code': ['terraform', 'cloudformation', 'pulumi', 'ansible', 'bicep'],
  'iac': ['terraform', 'cloudformation', 'pulumi', 'ansible', 'bicep'],
  'containerization': ['docker', 'podman'],
  'container orchestration': ['kubernetes', 'eks', 'aks', 'gke', 'openshift', 'nomad', 'ecs'],
  'observability': ['prometheus', 'grafana', 'datadog', 'new relic', 'elk', 'opentelemetry', 'splunk'],
  'monitoring': ['prometheus', 'grafana', 'datadog', 'new relic', 'zabbix', 'nagios', 'cloudwatch'],
  'centralized logging': ['elk', 'elasticsearch', 'kibana', 'loki', 'splunk', 'graylog', 'cloudwatch logs'],
};
const ALIASES = new Map(Object.entries(PROFILE_ALIASES).map(([k, v]) => [normalizeTerm(k), v]));

// Words that describe an activity rather than name a technology. A phrase is backed by the profile
// when its full text is there, an alias is there, or any of its other (naming) words is there.
const GENERIC_WORDS = new Set(['administration','admin','response','management','engineering','engineer','development','developer','design','operations','ops','best','practices','practice','networking','network','fundamentals','security','least','privilege','automation','experience','tools','tooling','platform','systems','system','services','service','support','production','cloud','data','team','teams','and','or','with','of','for','the','in','on','at','to','a','an','strong','hands','advanced','basic','skills']);

// (term) => boolean against the profile text, alias-aware and key-word-aware. Used only for the
// profile check, not for JD matching.
export function makeProfileMatcher(profileText) {
  const direct = makeTextMatcher(profileText);
  return (term) => {
    if (direct(term)) return true;
    if ((ALIASES.get(normalizeTerm(term)) || []).some((a) => direct(a))) return true;
    return normalizeTerm(term).split(' ').some((w) => w.length >= 3 && !GENERIC_WORDS.has(w) && direct(w));
  };
}

// Removes every skill that the JD names but the profile does not back. A category left empty goes too.
// Categories are not refilled; the caller's category-size log still records a short one.
export function dropUnbackedSkills(coreSkills, { jobDescription = '', profileText = '' } = {}) {
  const inJd = makeTextMatcher(jobDescription);
  const inProfile = makeProfileMatcher(profileText);
  const removed = [];
  const kept = [];
  for (const cat of Array.isArray(coreSkills) ? coreSkills : []) {
    const items = cat.items.filter((it) => {
      const unbacked = inJd(it.skill) && !inProfile(it.skill);
      if (unbacked) removed.push(it.skill);
      return !unbacked;
    });
    if (items.length) kept.push({ ...cat, items });
  }
  return { coreSkills: kept, removed };
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
  const inProfile = makeProfileMatcher(profileText);
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
