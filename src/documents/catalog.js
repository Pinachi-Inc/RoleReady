// What the template picker shows. Kept apart from index.js on purpose: this file has no
// react-pdf import, so the app can show the picker without loading the PDF renderer.
// Every id here must be a key of STYLES in index.js (the documents test checks it).
//
// `extra: true` templates need the plan's `extraTemplates` entitlement (Max and comped
// accounts; see PLAN_LIMITS in server/core/firestore.js). Everyone gets the others.

export const DEFAULT_STYLE = 'classic';

export const TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Centred, with shaded section bands. Safe for any role.',
    extra: false,
    thumb: '/cv-styles/classic.webp',
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Left-aligned with berry accents. Fits more on a page.',
    extra: true,
    thumb: '/cv-styles/modern.webp',
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Traditional serif with fine rules. For senior and formal roles.',
    extra: true,
    thumb: '/cv-styles/executive.webp',
  },
];

const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

export const templateById = (id) => byId[id] || byId[DEFAULT_STYLE];

// A stored value that is not a known template (typo, removed template) reads as the default.
export const knownStyle = (id) => (byId[id] ? id : DEFAULT_STYLE);

// The template a document is actually drawn in. An account that lost Max keeps its saved
// choice (so it comes back if they upgrade again) but gets the default until then.
export const effectiveStyle = (id, extraTemplates) => {
  const t = templateById(id);
  return !t.extra || extraTemplates ? t.id : DEFAULT_STYLE;
};
