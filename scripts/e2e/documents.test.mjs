// Renders real PDFs with the shipping code and reads their text back with pdf.js, the
// way an ATS would. Checks content rules (prepare.js) and that every section's text
// actually lands in the file.
import assert from 'node:assert/strict';
import { renderToBuffer } from '@react-pdf/renderer';
import pdfjsPkg from 'pdfjs-dist/legacy/build/pdf.js';
const pdfjs = pdfjsPkg;
import { cvElement, letterElement, STYLES } from '../../src/documents/index.js';
import { prepareCv } from '../../src/documents/prepare.js';
import { TEMPLATES, effectiveStyle, knownStyle } from '../../src/documents/catalog.js';
import { existsSync } from 'node:fs';

const textOf = async (buf) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    out += tc.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
  }
  return { text: out.replace(/[ \t]+/g, ' '), pages: doc.numPages };
};

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`  ok  ${name}`); };

const cv = {
  name: 'Test Person',
  contact: { email: 'a@b.c', phone: '+374 1', location: 'Tbilisi', links: ['linkedin.com/in/x', 'javascript:alert(1)'] },
  summary: 'DevOps engineer with nine years of experience.',
  coreSkills: [{ category: 'Cloud', items: [{ skill: 'AWS' }, { skill: 'Azure' }] }, { category: '', items: [{ skill: 'dropped' }] }],
  certifications: ['AZ-104', ''],
  experience: [{ title: 'Engineer', company: 'Acme', start: '2020', end: 'Present', achievements: ['Built CI/CD', 'Cut MTTR by 40%'] }],
  education: ['BSc Computer Science, YSU, 2019', '  '],
};

await test('prepare: section order, headings and dropped values', () => {
  const p = prepareCv(cv);
  assert.deepEqual(p.sections.map((s) => s.kind), ['summary', 'skills', 'certifications', 'experience', 'education']);
  assert.deepEqual(p.header.links, [{ href: 'https://linkedin.com/in/x', label: 'linkedin.com/in/x' }]);
  assert.equal(p.sections[1].skills.length, 1);
  assert.deepEqual(p.sections[4].items, ['BSc Computer Science, YSU, 2019']);
});

await test('prepare: empty sections are left out', () => {
  const p = prepareCv({ name: 'X', experience: [{ title: 'T', achievements: ['a'] }] });
  assert.deepEqual(p.sections.map((s) => s.kind), ['experience']);
});

await test('catalog: one picker entry per style, each with a thumbnail', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.id).sort(), Object.keys(STYLES).sort());
  for (const t of TEMPLATES) assert.ok(existsSync(new URL(`../../public${t.thumb}`, import.meta.url)), `missing ${t.thumb}`);
});

await test('catalog: extra templates fall back to Classic without the entitlement', () => {
  assert.equal(effectiveStyle('modern', false), 'classic');
  assert.equal(effectiveStyle('modern', true), 'modern');
  assert.equal(effectiveStyle('classic', false), 'classic');
  assert.equal(effectiveStyle('nonsense', true), 'classic');
  assert.equal(knownStyle(undefined), 'classic');
  assert.equal(knownStyle('executive'), 'executive');
});

for (const style of Object.keys(STYLES)) {
  await test(`${style}: CV PDF has real text for every section`, async () => {
    const { text } = await textOf(await renderToBuffer(cvElement(cv, style)));
    for (const needle of ['TEST PERSON', 'Tbilisi', 'linkedin.com/in/x', 'DevOps engineer', 'Cloud:', 'AWS, Azure',
      'AZ-104', 'Engineer | Acme', '2020 — Present', 'Cut MTTR by 40%', 'EDUCATION', 'BSc Computer Science, YSU, 2019',
      // Whole words: wide letter spacing makes pdf.js (and ATS parsers) read "E D U C A T I O N".
      'PROFESSIONAL SUMMARY', 'CORE SKILLS', 'PROFESSIONAL EXPERIENCE']) {
      assert.ok(text.includes(needle), `missing "${needle}" in:\n${text}`);
    }
    assert.ok(!text.includes('javascript:'), 'unsafe link printed');
  });

  await test(`${style}: long CV breaks onto more pages`, async () => {
    const long = { ...cv, experience: Array.from({ length: 12 }, (_, i) => ({ title: `Role ${i}`, company: 'Co', achievements: Array(6).fill('A long achievement line that takes up a fair amount of horizontal space on the page.') })) };
    const { pages, text } = await textOf(await renderToBuffer(cvElement(long, style)));
    assert.ok(pages >= 3, `expected >=3 pages, got ${pages}`);
    assert.ok(text.includes('Role 11'));
  });

  await test(`${style}: non-Latin names and text survive`, async () => {
    const { text } = await textOf(await renderToBuffer(cvElement({ ...cv, name: 'Ваге Явруmyan', summary: 'Վահե Յավրումյան, Tbilisi — İstanbul' }, style)));
    assert.ok(text.includes('ВАГЕ'), `Cyrillic name missing:\n${text}`);
    assert.ok(text.includes('Վահե Յավրումյան'), `Armenian text missing:\n${text}`);
    assert.ok(text.includes('İstanbul'), `Turkish letter missing:\n${text}`);
  });

  await test(`${style}: cover letter keeps paragraphs and sign-off lines`, async () => {
    const { text } = await textOf(await renderToBuffer(letterElement('Dear team,\n\nI am applying.\n\nBest regards,\nTest Person', cv, style)));
    for (const needle of ['COVER LETTER', 'Dear team,', 'I am applying.', 'Best regards,', 'Test Person']) assert.ok(text.includes(needle), `missing "${needle}"`);
  });
}

console.log(`documents: ${passed} passed`);
