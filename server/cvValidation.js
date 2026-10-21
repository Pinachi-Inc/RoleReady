export const validateAndFixSkills = (coreSkills, { minCategories = 6, maxCategories = 9, minItems = 3, maxItems = 9 } = {}) => {
  const categories = Array.isArray(coreSkills) ? coreSkills : [];
  const fixed = [];

  // Truncation used to happen silently, which made the `> maxItems` and
  // `> maxCategories` checks downstream unreachable and lost skills without a
  // trace. Count what gets dropped so the caller can report it.
  const dropped = { items: 0, categories: 0, itemsByCategory: [] };

  for (const cat of categories) {
    if (!cat?.category || !Array.isArray(cat.items)) continue;

    if (fixed.length >= maxCategories) {
      dropped.categories++;
      continue;
    }

    const unique = [];
    const seen = new Set();
    for (const item of cat.items) {
      const skill = (typeof item === 'string' ? item : item?.skill || '').trim();
      if (!skill) continue;
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ skill, source: 'base' });
    }
    if (unique.length === 0) continue;

    // Clamp item count (nothing can be synthesized to reach minItems)
    const clampedItems = unique.slice(0, maxItems);
    const lost = unique.length - clampedItems.length;
    if (lost > 0) {
      dropped.items += lost;
      dropped.itemsByCategory.push(`${cat.category}:${lost}`);
    }

    fixed.push({ category: cat.category, items: clampedItems });
  }

  return { coreSkills: fixed, dropped };
};

export const reorderSkills = (coreSkills) => {
  const ordered = [];
  const categoryOrder = [
    'Languages',
    'Frameworks',
    'Databases',
    'Cloud & DevOps',
    'Data',
    'Testing',
    'Tools',
    'Methodologies',
    'Other'
  ];
  const scoreCategory = (name) => {
    const idx = categoryOrder.findIndex((c) => c.toLowerCase() === String(name).toLowerCase());
    return idx === -1 ? 999 : idx;
  };

  for (const cat of coreSkills) {
    const jd = cat.items.filter((i) => i.source === 'jd');
    const base = cat.items.filter((i) => i.source !== 'jd');
    const items = [...jd, ...base];
    ordered.push({ category: cat.category, items });
  }

  ordered.sort((a, b) => scoreCategory(a.category) - scoreCategory(b.category));
  return ordered;
};


