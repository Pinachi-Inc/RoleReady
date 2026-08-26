// Cover letter on the same paper as the CV, so switching between the two in the
// preview does not feel like switching products. Plain text in, paragraphs out.
export const renderCoverLetterHtml = (letter, cv) => {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const contactParts = [];
  if (cv?.contact?.location) contactParts.push(esc(cv.contact.location));
  if (cv?.contact?.phone) contactParts.push(esc(cv.contact.phone));
  if (cv?.contact?.email) contactParts.push(esc(cv.contact.email));

  const paragraphs = String(letter || '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cover Letter</title>
  <style>
    @media print { html, body { margin: 0; } p { orphans: 3; widows: 3; } }
    :root { --text:#111827; --muted:#374151; --section-bg:#f3f4f6; }
    html, body { font-family: Arial, sans-serif; color: var(--text); line-height: 1.55; }
    body { max-width: 900px; margin: 0 auto; padding: 24px; background: white; }
    .header { padding: 12px; text-align: center; }
    .name { font-weight: 800; letter-spacing: 0.04em; }
    .contact { margin-top: 6px; line-height: 1.5; color: var(--muted); }
    .section { margin-top: 18px; }
    .section-title { background: var(--section-bg); font-weight: 700; padding: 8px 12px; }
    .section-content { padding: 12px; }
    .section-content p { margin: 0 0 12px 0; }
    .section-content p:last-child { margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="name">${esc(cv?.name || '')}</div>
    <div class="contact">${esc(contactParts.join(' | '))}</div>
  </div>
  <div class="section">
    <div class="section-title">COVER LETTER</div>
    <div class="section-content">${paragraphs || '<p></p>'}</div>
  </div>
</body>
</html>`;
};

export const renderCvHtml = (cv) => {
  // Escapes quotes too — some of these values land in attribute position.
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const join = (arr, sep = ' | ') => arr.filter(Boolean).join(sep);

  // Only http(s) and mailto reach an href. Anything else (javascript:, data:, …)
  // is dropped; a bare domain gets https:// so it does not resolve relative.
  const safeUrl = (raw) => {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return /^(https?|mailto):/i.test(value) ? value : null;
    }
    return `https://${value}`;
  };

  const contactParts = [];
  if (cv?.contact?.location) contactParts.push(esc(cv.contact.location));
  if (cv?.contact?.phone) contactParts.push(esc(cv.contact.phone));
  if (cv?.contact?.email) contactParts.push(esc(cv.contact.email));
  const links = (Array.isArray(cv?.contact?.links) ? cv.contact.links : [])
    .map(safeUrl)
    .filter(Boolean)
    .map(esc);

  const skillsHtml = (Array.isArray(cv.coreSkills) ? cv.coreSkills : [])
    .map((cat) => {
      const items = (cat.items || []).map((i) => esc(i.skill)).filter(Boolean).join(', ');
      if (!cat.category || !items) return '';
      return `<div class="skills-block"><span class="label">${esc(cat.category)}:</span> <span class="items">${items}</span></div>`;
    })
    .join('');

  const certsInline = (Array.isArray(cv.certifications) ? cv.certifications : [])
    .map((c) => esc(c))
    .join(' | ');

  const jobsHtml = (Array.isArray(cv.experience) ? cv.experience : [])
    .map((job) => {
      const titleLine = join([job?.title, job?.company, job?.location]);
      const dateLine = join([job?.start, job?.end], ' — ');
      const bulletsArr = (Array.isArray(job?.achievements) ? job.achievements : []).map((b) => esc(b));
      const firstBullet = bulletsArr.length > 0 ? bulletsArr[0] : null;
      const restBullets = bulletsArr.length > 1 ? bulletsArr.slice(1) : [];
      const restBulletsHtml = restBullets.map((b) => `<li>${b}</li>`).join('');
      return `
        <div class="job">
          <div class="job-head">
            <div class="job-title">${esc(titleLine)}</div>
            ${dateLine ? `<div class="job-meta">${esc(dateLine)}</div>` : ''}
            ${firstBullet ? `<ul class="bullets first-bullet"><li>${firstBullet}</li></ul>` : ''}
          </div>
          ${restBulletsHtml ? `<ul class=\"bullets\">${restBulletsHtml}</ul>` : ''}
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Optimized CV</title>
  <style>
    @media print {
      html, body { margin: 0; }
      /* Avoid cutting lines across pages */
      *, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* Allow jobs to split across pages at list items, but keep section title + job head together */
      .job { page-break-inside: auto; break-inside: auto; }
      .job-head { page-break-inside: avoid; break-inside: avoid; }
      .job .job-title, .job .job-meta { page-break-after: avoid; break-after: avoid; }
      .job ul { page-break-inside: auto; break-inside: auto; }
      .job ul li { page-break-inside: avoid; break-inside: avoid; }
      /* Keep section header with at least one following item */
      .section-title { page-break-after: avoid; break-after: avoid; }
      .section-content { page-break-inside: auto; break-inside: auto; }
    }
    :root { --text:#111827; --muted:#374151; --border:#d1d5db; --accent:#9ca3af; --section-bg:#f3f4f6; }
    html, body { font-family: Arial, sans-serif; color: var(--text); line-height: 1.4; }
    body { max-width: 900px; margin: 0 auto; padding: 24px; background: white; }
    .header { padding: 12px; text-align: center; }
    .name { font-weight: 800; letter-spacing: 0.04em; }
    .contact { margin-top: 6px; line-height: 1.5; }
    .contact a { color: var(--muted); text-decoration: none; }
    .section { margin-top: 18px; }
    .section-title { background: var(--section-bg); font-weight: 700; padding: 8px 12px; }
    .section-content { padding: 12px; }
    .skills-block { margin-bottom: 8px; }
    .skills-block .label { font-weight: 700; }
    .skills-block .items { color: var(--muted); }
    .certs-inline { color: var(--text); }
    .bullets { margin: 8px 0 0 0; padding-left: 16px; }
    .bullets li { margin-bottom: 6px; }
    .job { margin-bottom: 12px; }
    .job-head .first-bullet { margin-top: 6px; }
    .job .job-title { font-weight: 700; text-decoration: underline; }
    .job .job-meta { color: var(--muted); margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="name">${esc(cv.name || '')}</div>
    <div class="contact">
      ${esc(contactParts.join(' | '))}<br/>
      ${links.length ? `Links: ${links.map((l) => `<a href="${l}">${l}</a>`).join(' | ')}` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">SUMMARY</div>
    <div class="section-content">${esc(cv.summary || '')}</div>
  </div>

  <div class="section">
    <div class="section-title">CORE SKILLS</div>
    <div class="section-content">${skillsHtml}</div>
  </div>

  ${certsInline ? `<div class="section">
    <div class="section-title">CERTIFICATIONS</div>
    <div class="section-content"><div class="certs-inline">${certsInline}</div></div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">PROFESSIONAL EXPERIENCE</div>
    <div class="section-content">${jobsHtml}</div>
  </div>
</body>
</html>`;
};


