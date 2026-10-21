// The on-screen CV preview (renderCvHtml) and the downloaded PDF (buildCvPdf) must show
// the same sections. Education was in the PDF but missing from the preview.
import assert from 'node:assert/strict';
import { renderCvHtml } from '../../src/templateRenderer.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

const base = {
  name: 'Test Person',
  contact: { email: 'a@b.c' },
  summary: 'Summary.',
  coreSkills: [{ category: 'Cloud', items: [{ skill: 'AWS' }] }],
  certifications: ['AZ-104'],
  experience: [{ title: 'Engineer', company: 'Acme', achievements: ['Did a thing'] }],
};

test('education is rendered after experience', () => {
  const html = renderCvHtml({ ...base, education: ['BSc Computer Science, YSU, 2015', 'MSc <Security>'] });
  assert.ok(html.includes('EDUCATION'));
  assert.ok(html.includes('<li>BSc Computer Science, YSU, 2015</li>'));
  assert.ok(html.includes('MSc &lt;Security&gt;'), 'entries are escaped');
  assert.ok(html.indexOf('EDUCATION') > html.indexOf('PROFESSIONAL EXPERIENCE'));
});

test('no education section when there is none', () => {
  assert.ok(!renderCvHtml(base).includes('EDUCATION'));
  assert.ok(!renderCvHtml({ ...base, education: ['', '  '] }).includes('EDUCATION'));
  assert.ok(!renderCvHtml({ ...base, education: 'not a list' }).includes('EDUCATION'));
});

console.log(`cv-render: ${passed} passed`);
