// Fonts are embedded in every PDF, so the file looks the same in any viewer and the
// preview draws exactly what the download contains. Built-in PDF fonts (Helvetica) are
// not embedded and only cover Western European letters; a name in Cyrillic came out as
// garbage. Arimo is metric-compatible with Arial, the look the app shipped with.
import { Font } from '@react-pdf/renderer';

// Vite turns `new URL(..., import.meta.url)` into a hashed asset URL. Node gives a
// file: URL, and react-pdf wants a plain path there.
const src = (u) => (u.protocol === 'file:' ? decodeURIComponent(u.pathname) : u.href);

let done = false;
// Use one of these as a style's fontFamily, so any script the fonts cover renders.
export const BODY_FONTS = ['Arimo', 'NotoSansArmenian'];
// Tinos is metric-compatible with Times New Roman, the serif every ATS and Word user knows.
export const SERIF_FONTS = ['Tinos', 'NotoSerifArmenian'];

export function registerFonts() {
  if (done) return;
  done = true;
  Font.register({
    family: 'Arimo',
    fonts: [
      { src: src(new URL('./fonts/Arimo-Regular.ttf', import.meta.url)), fontWeight: 400 },
      { src: src(new URL('./fonts/Arimo-Bold.ttf', import.meta.url)), fontWeight: 700 },
    ],
  });
  // Arimo has no Armenian letters; react-pdf falls back per glyph to the next family.
  Font.register({
    family: 'NotoSansArmenian',
    fonts: [
      { src: src(new URL('./fonts/NotoSansArmenian-Regular.ttf', import.meta.url)), fontWeight: 400 },
      { src: src(new URL('./fonts/NotoSansArmenian-Bold.ttf', import.meta.url)), fontWeight: 700 },
    ],
  });
  // Tinos 1.23 (Apache 2.0), subset to the same ranges as Arimo.
  Font.register({
    family: 'Tinos',
    fonts: [
      { src: src(new URL('./fonts/Tinos-Regular.ttf', import.meta.url)), fontWeight: 400 },
      { src: src(new URL('./fonts/Tinos-Bold.ttf', import.meta.url)), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'NotoSerifArmenian',
    fonts: [
      { src: src(new URL('./fonts/NotoSerifArmenian-Regular.ttf', import.meta.url)), fontWeight: 400 },
      { src: src(new URL('./fonts/NotoSerifArmenian-Bold.ttf', import.meta.url)), fontWeight: 700 },
    ],
  });
  // Long words (URLs) break anywhere rather than hyphenating English rules into them.
  Font.registerHyphenationCallback((word) => [word]);
}
