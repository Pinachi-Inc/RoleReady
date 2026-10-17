/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      // Roleberry brand. font-brand is applied only to the signed-out and verify screens, so the
      // app and the generated CV/PDF keep their own fonts.
      fontFamily: {
        brand: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#24131C', muted: '#6E5A64', faint: '#9A8A91' },
        berry: { DEFAULT: '#B8174F', dark: '#9A1342', soft: '#FBE8EF' },
        leaf: { DEFAULT: '#2F8F5B', text: '#25744A', soft: '#EEF7F1' },
        line: '#E8DDE1',
        blush: '#FBF7F8',
      },
    },
  },
  plugins: [],
};


