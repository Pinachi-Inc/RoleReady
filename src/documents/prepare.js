// One place decides what a CV contains: which sections exist, their order and headings,
// and which values are dropped. Every style renders this, never the raw model output,
// so styles can differ in looks but not in content.

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

// Only http(s) and mailto survive. A bare domain gets https:// so it is a real link.
export const safeUrl = (raw) => {
  const value = str(raw);
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return /^(https?|mailto):/i.test(value) ? value : null;
  return `https://${value}`;
};

export const SECTION_TITLES = {
  summary: 'Professional Summary',
  skills: 'Core Skills',
  certifications: 'Certifications',
  experience: 'Professional Experience',
  education: 'Education',
  letter: 'Cover Letter',
};

export function prepareHeader(cv) {
  const contact = cv?.contact && typeof cv.contact === 'object' ? cv.contact : {};
  return {
    name: str(cv?.name),
    contact: [contact.location, contact.phone, contact.email].map(str).filter(Boolean),
    // href is what the link opens; label is what is printed (no https:// noise).
    links: (Array.isArray(contact.links) ? contact.links : [])
      .map((raw) => ({ href: safeUrl(raw), label: str(raw).replace(/^(https?:\/\/|mailto:)/i, '').replace(/\/$/, '') }))
      .filter((l) => l.href && l.label),
  };
}

export function prepareCv(cv) {
  const skills = (Array.isArray(cv?.coreSkills) ? cv.coreSkills : [])
    .map((c) => ({
      label: str(c?.category),
      items: (Array.isArray(c?.items) ? c.items : []).map((i) => str(typeof i === 'string' ? i : i?.skill)).filter(Boolean),
    }))
    .filter((c) => c.label && c.items.length);

  const jobs = (Array.isArray(cv?.experience) ? cv.experience : [])
    .filter((j) => j && typeof j === 'object')
    .map((j) => ({
      title: [j.title, j.company, j.location].map(str).filter(Boolean).join(' | '),
      dates: [j.start, j.end].map(str).filter(Boolean).join(' — '),
      bullets: strList(j.achievements),
    }))
    .filter((j) => j.title || j.bullets.length);

  const sections = [];
  const summary = str(cv?.summary);
  if (summary) sections.push({ kind: 'summary', title: SECTION_TITLES.summary, text: summary });
  if (skills.length) sections.push({ kind: 'skills', title: SECTION_TITLES.skills, skills });
  const certifications = strList(cv?.certifications);
  if (certifications.length) sections.push({ kind: 'certifications', title: SECTION_TITLES.certifications, items: certifications });
  if (jobs.length) sections.push({ kind: 'experience', title: SECTION_TITLES.experience, jobs });
  const education = strList(cv?.education);
  if (education.length) sections.push({ kind: 'education', title: SECTION_TITLES.education, items: education });

  return { header: prepareHeader(cv), sections };
}

// The letter arrives with greeting and sign-off assembled. Blank lines split paragraphs;
// a single newline inside one is a real break (the sign-off block) and is kept.
export function prepareLetter(letter, cv) {
  const paragraphs = String(letter || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split('\n').map((l) => l.trim()));
  return { header: { ...prepareHeader(cv), links: [] }, title: SECTION_TITLES.letter, paragraphs };
}
