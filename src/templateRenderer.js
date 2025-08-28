export const renderCvHtml = (cv) => {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const join = (arr, sep = ' | ') => arr.filter(Boolean).join(sep);

  const contactParts = [];
  if (cv?.contact?.location) contactParts.push(esc(cv.contact.location));
  if (cv?.contact?.phone) contactParts.push(esc(cv.contact.phone));
  if (cv?.contact?.email) contactParts.push(esc(cv.contact.email));
  const links = Array.isArray(cv?.contact?.links) ? cv.contact.links.map(esc) : [];

  const skillsHtml = (Array.isArray(cv.coreSkills) ? cv.coreSkills : [])
    .map((cat) => {
      const items = (cat.items || []).map((i) => esc(i.skill)).filter(Boolean).join(', ');
      if (!cat.category || !items) return '';
      return `<div class="skills-block"><span class="label">${esc(cat.category)}:</span> <span class="items">${items}</span></div>`;
    })
    .join('');

  const certsHtml = (Array.isArray(cv.certifications) ? cv.certifications : [])
    .map((c) => `<li>${esc(c)}</li>`)
    .join('');

  const jobsHtml = (Array.isArray(cv.experience) ? cv.experience : [])
    .map((job) => {
      const titleLine = join([job?.title, job?.company, job?.location]);
      const dateLine = join([job?.start, job?.end], ' — ');
      const bullets = (Array.isArray(job?.achievements) ? job.achievements : [])
        .map((b) => `<li>${esc(b)}</li>`)
        .join('');
      return `
        <div class="job">
          <div class="job-title">${esc(titleLine)}</div>
          ${dateLine ? `<div class="job-meta">${esc(dateLine)}</div>` : ''}
          <ul class="bullets">${bullets}</ul>
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
      .print-btn { display: none; }
      body { margin: 0; }
      /* Option A: keep header with at least one bullet on the same page */
      .job { break-inside: avoid; page-break-inside: avoid; }
      .job .job-title,
      .job .job-meta { break-after: avoid; page-break-after: avoid; }
      .job ul { break-inside: auto; }
      .job ul li { break-inside: avoid; page-break-inside: avoid; }
      .job ul li:first-child { break-before: avoid; page-break-before: avoid; }
    }
    :root { --text:#111827; --muted:#374151; --border:#d1d5db; --accent:#9ca3af; --section-bg:#f3f4f6; }
    html, body { font-family: Arial, sans-serif; color: var(--text); }
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
    .bullets { margin: 8px 0 0 0; padding-left: 16px; }
    .bullets li { margin-bottom: 6px; }
    .job { margin-bottom: 12px; }
    .job .job-title { font-weight: 700; text-decoration: underline; }
    .job .job-meta { color: var(--muted); margin-bottom: 6px; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print as PDF</button>
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

  ${certsHtml ? `<div class="section">
    <div class="section-title">CERTIFICATIONS</div>
    <div class="section-content"><ul class="bullets">${certsHtml}</ul></div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">PROFESSIONAL EXPERIENCE</div>
    <div class="section-content">${jobsHtml}</div>
  </div>
</body>
</html>`;
};


