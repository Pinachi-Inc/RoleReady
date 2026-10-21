// Fonts are embedded in every PDF, so the file looks the same in any viewer and the
// preview draws exactly what the download contains. Built-in PDF fonts (Helvetica) are
// not embedded and only cover Western European letters; a name in Cyrillic came out as
// garbage. Arimo is metric-compatible with Arial, the look the app shipped with.
import { Font } from '@react-pdf/renderer';

// Vite turns `new URL(..., import.meta.url)` into a hashed asset URL. Node gives a
// file: URL, and react-pdf wants a plain path there.
const src = (u) => (u.protocol === 'file:' ? decodeURIComponent(u.pathname) : u.href);

let done = false;
// Use as fontFamily in every style, so any script the fonts cover renders.
export const BODY_FONTS = ['Arimo', 'NotoSansArmenian'];

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
  // Long words (URLs) break anywhere rather than hyphenating English rules into them.
  Font.registerHyphenationCallback((word) => [word]);
}
