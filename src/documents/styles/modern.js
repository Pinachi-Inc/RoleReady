// "Modern": left-aligned, Roleberry berry for the name rule, headings and bullets, dates on
// the right of each role. Same one-column text flow as Classic, so ATS parsing is the same:
// no tables, columns, icons or images, every word is real text in reading order.
import { createElement as h } from 'react';
import { Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { registerFonts, BODY_FONTS } from '../fonts.js';

registerFonts();

const C = { text: '#24131C', muted: '#5B4A52', accent: '#B8174F', rule: '#E8D5DC' };

const s = StyleSheet.create({
  page: { paddingVertical: '13mm', paddingHorizontal: '15mm', fontFamily: BODY_FONTS, fontSize: 11, lineHeight: 1.36, color: C.text },
  header: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: C.accent },
  name: { fontWeight: 700, fontSize: 21, lineHeight: 1.2, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  contact: { fontSize: 10, color: C.muted, lineHeight: 1.45 },
  link: { color: C.muted, textDecoration: 'none' },
  section: { marginBottom: 10 },
  heading: { borderBottomWidth: 0.75, borderBottomColor: C.rule, paddingBottom: 2, marginBottom: 6 },
  headingText: { fontWeight: 700, fontSize: 11, color: C.accent, textTransform: 'uppercase' },
  skillRow: { marginBottom: 2.5 },
  bold: { fontWeight: 700 },
  muted: { color: C.muted },
  job: { marginBottom: 7 },
  jobHead: { flexDirection: 'row', marginBottom: 2.5 },
  jobTitle: { flex: 1, fontWeight: 700 },
  jobDates: { marginLeft: 10, fontSize: 10, color: C.muted, textAlign: 'right' },
  bullet: { flexDirection: 'row', marginBottom: 1.8 },
  bulletGlyph: { width: 11, color: C.accent },
  bulletText: { flex: 1 },
  para: { marginBottom: 8 },
});

const SEP = '   ·   ';

const Header = ({ header }) => h(View, { style: s.header },
  header.name ? h(Text, { style: s.name }, header.name) : null,
  header.contact.length ? h(Text, { style: s.contact }, header.contact.join(SEP)) : null,
  header.links.length
    ? h(Text, { style: s.contact }, ...header.links.flatMap((l, i) => [
        i ? SEP : null,
        h(Link, { key: l.href, src: l.href, style: s.link }, l.label),
      ]).filter(Boolean))
    : null,
);

const Heading = ({ title }) => h(View, { style: s.heading, minPresenceAhead: 40, wrap: false },
  h(Text, { style: s.headingText }, title));

const Bullet = ({ text }) => h(View, { style: s.bullet, wrap: false },
  h(Text, { style: s.bulletGlyph }, '•'),
  h(Text, { style: s.bulletText }, text));

const sectionBody = (sec) => {
  switch (sec.kind) {
    case 'summary': return h(Text, null, sec.text);
    case 'skills': return sec.skills.map((c) => h(Text, { key: c.label, style: s.skillRow },
      h(Text, { style: s.bold }, `${c.label}: `), h(Text, { style: s.muted }, c.items.join(', '))));
    case 'certifications': return sec.items.map((e, i) => h(Bullet, { key: i, text: e }));
    case 'experience': return sec.jobs.map((j, i) => h(View, { key: i, style: i < sec.jobs.length - 1 ? s.job : null },
      h(View, { wrap: false },
        (j.title || j.dates) ? h(View, { style: s.jobHead },
          h(Text, { style: s.jobTitle }, j.title),
          j.dates ? h(Text, { style: s.jobDates }, j.dates) : null) : null,
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
      h(Heading, { title: sec.title }),
      sectionBody(sec)))));

export const LetterDocument = ({ prepared }) => h(Document, { title: 'Cover Letter' },
  h(Page, { size: 'A4', style: { ...s.page, fontSize: 11, lineHeight: 1.45 } },
    h(Header, { header: prepared.header }),
    h(Heading, { title: prepared.title }),
    ...prepared.paragraphs.map((lines, i) => h(Text, { key: i, style: s.para, orphans: 3, widows: 3 }, lines.join('\n')))));
