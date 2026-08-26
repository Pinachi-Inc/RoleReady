import { jsPDF } from 'jspdf';

// Draws the CV with real text instead of screenshotting the DOM.
//
// The previous export went through html2pdf.js, which is html2canvas + jsPDF.addImage:
// it rasterised the rendered HTML and embedded the bitmap. The resulting PDF contained
// zero extractable text — verified with poppler, mupdf and pdfjs, all returning 0 chars —
// so an ATS parsing it got nothing, and every keyword the prompt works to place was
// invisible to the software the product exists to satisfy. On macOS this was easy to miss:
// Preview's Live Text OCRs the image and lets you select text that is not in the file.
//
// Layout mirrors src/templateRenderer.js (Arial/Helvetica, grey section bands, the same
// section order) rather than reproducing it pixel for pixel.

const MM = {
  pageW: 210,
  pageH: 297,
  margin: 14,
  bandPadX: 3,
  bandH: 7.6,
  gapSection: 5,
  gapAfterBand: 4.0,
  bulletIndent: 4,
};

const COLOR = {
  text: [17, 24, 39],       // #111827
  muted: [55, 65, 81],      // #374151
  band: [243, 244, 246],    // #f3f4f6
};

const FONT = {
  name: 18,
  contact: 11,
  sectionTitle: 12.5,
  body: 12,
  jobTitle: 12,
};

export function buildCvPdf(cv) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setFont('helvetica', 'normal');

  const contentW = MM.pageW - MM.margin * 2;
  let y = MM.margin;

  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);

  // Reserve space, breaking to a new page when the block would not fit.
  const need = (h) => {
    if (y + h > MM.pageH - MM.margin) {
      doc.addPage();
      y = MM.margin;
      return true;
    }
    return false;
  };

  const writeLines = (text, { size = FONT.body, style = 'normal', color = COLOR.text, indent = 0, gap = 1.2 } = {}) => {
    if (!text) return;
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    setColor(color);
    const lineH = size * 0.3528 * 1.32;               // pt -> mm, times line-height
    const lines = doc.splitTextToSize(String(text), contentW - indent);
    for (const line of lines) {
      need(lineH);
      doc.text(line, MM.margin + indent, y + lineH * 0.78);
      y += lineH;
    }
    y += gap;
  };

  const sectionBand = (label) => {
    // A band must never be the last thing on a page. Reserve the band plus two body
    // lines, computed from the current font size rather than a fixed guess — the old
    // fixed 8mm was sized for smaller type and left EDUCATION stranded on its own.
    const bodyLine = FONT.body * 0.3528 * 1.32;
    need(MM.bandH + MM.gapAfterBand + bodyLine * 2);
    doc.setFillColor(COLOR.band[0], COLOR.band[1], COLOR.band[2]);
    doc.rect(MM.margin, y, contentW, MM.bandH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.sectionTitle);
    setColor(COLOR.text);
    doc.text(String(label).toUpperCase(), MM.margin + MM.bandPadX, y + MM.bandH * 0.71);
    y += MM.bandH + MM.gapAfterBand;
  };

  // Bullets get a real glyph plus a hanging indent, so the extracted text keeps its shape.
  const bullet = (text) => {
    if (!text) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT.body);
    setColor(COLOR.text);
    const lineH = FONT.body * 0.3528 * 1.32;
    const lines = doc.splitTextToSize(String(text), contentW - MM.bulletIndent - 2);
    lines.forEach((line, i) => {
      need(lineH);
      if (i === 0) doc.text('•', MM.margin + 1, y + lineH * 0.78);
      doc.text(line, MM.margin + MM.bulletIndent + 2, y + lineH * 0.78);
      y += lineH;
    });
    y += 0.8;
  };

  // ---- header ----------------------------------------------------------------
  if (cv?.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.name);
    setColor(COLOR.text);
    doc.text(String(cv.name).toUpperCase(), MM.pageW / 2, y + 5, { align: 'center', charSpace: 0.35 });
    y += 9;
  }

  const contactBits = [cv?.contact?.location, cv?.contact?.phone, cv?.contact?.email].filter(Boolean);
  const links = (Array.isArray(cv?.contact?.links) ? cv.contact.links : []).filter(Boolean);
  for (const line of [contactBits.join('  |  '), links.join('  |  ')]) {
    if (!line) continue;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT.contact);
    setColor(COLOR.muted);
    const lineH = FONT.contact * 0.3528 * 1.4;
    for (const l of doc.splitTextToSize(line, contentW)) {
      need(lineH);
      doc.text(l, MM.pageW / 2, y + lineH * 0.78, { align: 'center' });
      y += lineH;
    }
  }
  y += MM.gapSection;

  // ---- summary ---------------------------------------------------------------
  if (cv?.summary) {
    sectionBand('Professional Summary');
    writeLines(cv.summary, { gap: MM.gapSection });
  }

  // ---- core skills -----------------------------------------------------------
  const skills = (Array.isArray(cv?.coreSkills) ? cv.coreSkills : [])
    .map((c) => ({ label: c?.category, items: (c?.items || []).map((i) => i?.skill).filter(Boolean) }))
    .filter((c) => c.label && c.items.length);

  if (skills.length) {
    sectionBand('Core Skills');
    for (const cat of skills) {
      // The label is bold and the list follows on the same line, so a parser reads
      // "Category: a, b, c" as one run rather than two disconnected fragments.
      const label = `${cat.label}: `;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(FONT.body);
      const labelW = doc.getTextWidth(label);
      const lineH = FONT.body * 0.3528 * 1.32;

      const itemsText = cat.items.join(', ');
      const firstLineW = contentW - labelW;
      const firstChunk = doc.splitTextToSize(itemsText, firstLineW)[0] || '';
      const rest = itemsText.slice(firstChunk.length).trim();

      need(lineH);
      setColor(COLOR.text);
      doc.setFont('helvetica', 'bold');
      doc.text(label, MM.margin, y + lineH * 0.78);
      doc.setFont('helvetica', 'normal');
      setColor(COLOR.muted);
      doc.text(firstChunk, MM.margin + labelW, y + lineH * 0.78);
      y += lineH;

      if (rest) {
        for (const l of doc.splitTextToSize(rest, contentW)) {
          need(lineH);
          doc.text(l, MM.margin, y + lineH * 0.78);
          y += lineH;
        }
      }
      y += 1.4;
    }
    y += MM.gapSection - 1.4;
  }

  // ---- certifications --------------------------------------------------------
  const certs = (Array.isArray(cv?.certifications) ? cv.certifications : []).filter(Boolean);
  if (certs.length) {
    sectionBand('Certifications');
    writeLines(certs.join('  |  '), { color: COLOR.muted, gap: MM.gapSection });
  }

  // ---- experience ------------------------------------------------------------
  const jobs = (Array.isArray(cv?.experience) ? cv.experience : []).filter(Boolean);
  if (jobs.length) {
    sectionBand('Professional Experience');
    jobs.forEach((job, idx) => {
      const titleLine = [job?.title, job?.company, job?.location].filter(Boolean).join(' | ');
      const dateLine = [job?.start, job?.end].filter(Boolean).join(' — ');

      // Keep the job header with at least its first bullet.
      const bodyLine = FONT.body * 0.3528 * 1.32;
      need(FONT.jobTitle * 0.3528 * 1.32 + FONT.contact * 0.3528 * 1.4 + bodyLine * 2 + 3);
      if (titleLine) writeLines(titleLine, { style: 'bold', size: FONT.jobTitle, gap: 0.6 });
      if (dateLine) writeLines(dateLine, { size: FONT.contact, color: COLOR.muted, gap: 1.4 });
      for (const b of (Array.isArray(job?.achievements) ? job.achievements : [])) bullet(b);
      if (idx < jobs.length - 1) y += 2.4;
    });
    y += MM.gapSection - 2.4;
  }

  // ---- education -------------------------------------------------------------
  const education = (Array.isArray(cv?.education) ? cv.education : []).filter(Boolean);
  if (education.length) {
    sectionBand('Education');
    for (const e of education) bullet(e);
  }

  return doc;
}
