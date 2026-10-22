// "Classic": the look Roleberry shipped with. Centred name, grey section bands,
// Arimo (Arial metrics). Written with createElement rather than JSX so Node tests can import it.
import { createElement as h } from 'react';
import { Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { registerFonts, BODY_FONTS } from '../fonts.js';

registerFonts();

const C = { text: '#111827', muted: '#374151', band: '#f3f4f6' };

// Sizes in pt, matching the jsPDF export this replaced.
const s = StyleSheet.create({
  page: { paddingVertical: '14mm', paddingHorizontal: '14mm', fontFamily: BODY_FONTS, fontSize: 12, lineHeight: 1.32, color: C.text },
  name: { fontWeight: 700, fontSize: 18, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  contact: { fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.4 },
  link: { color: C.muted, textDecoration: 'none' },
  header: { marginBottom: 14 },
  section: { marginBottom: 12 },
  band: { backgroundColor: C.band, paddingVertical: 5, paddingHorizontal: 8.5, marginBottom: 11 },
  bandText: { fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase' },
  skillRow: { marginBottom: 4 },
  bold: { fontWeight: 700 },
  muted: { color: C.muted },
  job: { marginBottom: 7 },
  jobTitle: { fontWeight: 700, fontSize: 12, marginBottom: 2 },
  jobDates: { fontSize: 11, color: C.muted, marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  bulletGlyph: { width: 14, paddingLeft: 3 },
  bulletText: { flex: 1 },
  para: { marginBottom: 8 },
});

const Header = ({ header }) => h(View, { style: s.header },
  header.name ? h(Text, { style: s.name }, header.name) : null,
  header.contact.length ? h(Text, { style: s.contact }, header.contact.join('  |  ')) : null,
  header.links.length
    ? h(Text, { style: s.contact }, ...header.links.flatMap((l, i) => [
        i ? '  |  ' : null,
        h(Link, { key: l.href, src: l.href, style: s.link }, l.label),
      ]).filter(Boolean))
    : null,
);

// minPresenceAhead keeps a band from being the last thing on a page.
const Band = ({ title }) => h(View, { style: s.band, minPresenceAhead: 40, wrap: false },
  h(Text, { style: s.bandText }, title));

const Bullet = ({ text }) => h(View, { style: s.bullet, wrap: false },
  h(Text, { style: s.bulletGlyph }, '•'),
  h(Text, { style: s.bulletText }, text));

const sectionBody = (sec) => {
  switch (sec.kind) {
    case 'summary': return h(Text, null, sec.text);
    case 'skills': return sec.skills.map((c) => h(Text, { key: c.label, style: s.skillRow },
      h(Text, { style: s.bold }, `${c.label}: `), h(Text, { style: s.muted }, c.items.join(', '))));
    case 'certifications': return h(Text, { style: s.muted }, sec.items.join('  |  '));
    case 'experience': return sec.jobs.map((j, i) => h(View, { key: i, style: s.job },
      h(View, { wrap: false },
        j.title ? h(Text, { style: s.jobTitle }, j.title) : null,
        j.dates ? h(Text, { style: s.jobDates }, j.dates) : null,
        j.bullets[0] ? h(Bullet, { text: j.bullets[0] }) : null),
      ...j.bullets.slice(1).map((b, k) => h(Bullet, { key: k, text: b }))));
    case 'education': return sec.items.map((e, i) => h(Bullet, { key: i, text: e }));
    default: return null;
  }
};

export const CvDocument = ({ prepared }) => h(Document, { title: prepared.header.name || 'CV' },
  h(Page, { size: 'A4', style: s.page },
    h(Header, { header: prepared.header }),
    ...prepared.sections.map((sec) => h(View, { key: sec.kind, style: s.section },
      h(Band, { title: sec.title }),
      sectionBody(sec)))));

export const LetterDocument = ({ prepared }) => h(Document, { title: 'Cover Letter' },
  h(Page, { size: 'A4', style: { ...s.page, lineHeight: 1.42 } },
    h(Header, { header: prepared.header }),
    h(Band, { title: prepared.title }),
    ...prepared.paragraphs.map((lines, i) => h(Text, { key: i, style: s.para, orphans: 3, widows: 3 }, lines.join('\n')))));
