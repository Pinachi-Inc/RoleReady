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
      // Roleberry brand. font-brand goes on every page root (signed-out, verify and signed-in).
      // The CV iframe and the generated PDF keep their own fonts.
      fontFamily: {
        brand: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#24131C', muted: '#6E5A64', faint: '#9A8A91' },
        berry: { DEFAULT: '#B8174F', dark: '#9A1342', soft: '#FBE8EF', light: '#F0457A', line: '#E3B9C8' },
        leaf: { DEFAULT: '#2F8F5B', text: '#25744A', soft: '#EEF7F1', light: '#57C487' },
        line: '#E8DDE1',
        blush: '#FBF7F8',
        paper: '#F5EDF0', // preview column background
        hover: '#F3E9ED', // rail and menu hover
        warn: { bg: '#FFF4E0', line: '#F2C46B', text: '#8A5300' },
        danger: { bg: '#FEF3F2', line: '#FECDCA', text: '#B42318' },
        night: { DEFAULT: '#1A0E14', surface: '#24131C', raised: '#2E1A24', line: '#3A2630', text: '#FBEFF3', muted: '#CDB9C2' },
      },
    },
  },
  plugins: [],
};


