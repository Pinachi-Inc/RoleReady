// Renders the sample CV and letter in every style: node scripts/cv-styles/render.mjs <outDir>
// Writes <style>-cv.pdf and <style>-letter.pdf. Thumbnails for the picker are made from the
// CV PDFs with pdftoppm (see the plan / README in this folder).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { renderToBuffer } from '@react-pdf/renderer';
import { cvElement, letterElement, STYLES } from '../../src/documents/index.js';

const out = process.argv[2] || 'cv-style-samples';
mkdirSync(out, { recursive: true });
const cv = JSON.parse(readFileSync(new URL('./sample-cv.json', import.meta.url), 'utf8'));
const letter = readFileSync(new URL('./sample-letter.txt', import.meta.url), 'utf8');
for (const style of Object.keys(STYLES)) {
  writeFileSync(`${out}/${style}-cv.pdf`, await renderToBuffer(cvElement(cv, style)));
  writeFileSync(`${out}/${style}-letter.pdf`, await renderToBuffer(letterElement(letter, cv, style)));
  console.log(`rendered ${style}`);
}
