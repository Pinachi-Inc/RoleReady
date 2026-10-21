// "Executive": a traditional serif CV. Centred name, black hairline rules under the section
// headings, dates on the right of each role. Tinos has Times New Roman metrics, the look
// finance, law and senior roles expect. One column of real text, like every style.
import { createElement as h } from 'react';
import { Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { registerFonts, SERIF_FONTS } from '../fonts.js';

registerFonts();

const C = { text: '#111111', muted: '#3F3F3F', rule: '#111111' };

const s = StyleSheet.create({
  page: { paddingVertical: '15mm', paddingHorizontal: '17mm', fontFamily: SERIF_FONTS, fontSize: 11.5, lineHeight: 1.3, color: C.text },
  header: { marginBottom: 12, alignItems: 'center' },
  name: { fontWeight: 700, fontSize: 22, lineHeight: 1.2, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 5 },
  contact: { fontSize: 10.5, color: C.muted, textAlign: 'center', lineHeight: 1.4 },
  link: { color: C.muted, textDecoration: 'none' },
  section: { marginBottom: 11 },
  heading: { borderBottomWidth: 0.8, borderBottomColor: C.rule, paddingBottom: 2, marginBottom: 7 },
  headingText: { fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase' },
  skillRow: { marginBottom: 2.5 },
  bold: { fontWeight: 700 },
  job: { marginBottom: 8 },
  jobHead: { flexDirection: 'row', marginBottom: 2.5 },
  jobTitle: { flex: 1, fontWeight: 700 },
  jobDates: { marginLeft: 10, textAlign: 'right' },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  bulletGlyph: { width: 13, paddingLeft: 2 },
  bulletText: { flex: 1 },
  para: { marginBottom: 9 },
});

const SEP = '  |  ';

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
      h(Text, { style: s.bold }, `${c.label}: `), c.items.join(', ')));
    case 'certifications': return h(Text, null, sec.items.join(SEP));
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
  h(Page, { size: 'A4', style: { ...s.page, lineHeight: 1.42 } },
    h(Header, { header: prepared.header }),
    h(Heading, { title: prepared.title }),
    ...prepared.paragraphs.map((lines, i) => h(Text, { key: i, style: s.para, orphans: 3, widows: 3 }, lines.join('\n')))));
