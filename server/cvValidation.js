export const validateAndFixSkills = (coreSkills, { minCategories = 6, maxCategories = 9, minItems = 3, maxItems = 9 } = {}) => {
  const categories = Array.isArray(coreSkills) ? coreSkills : [];
  const fixed = [];

  for (const cat of categories) {
    if (!cat?.category || !Array.isArray(cat.items)) continue;
    const unique = [];
    const seen = new Set();
    for (const item of cat.items) {
      const skill = (item?.skill || '').trim();
      if (!skill) continue;
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ skill, source: item.source === 'jd' ? 'jd' : 'base', jdLiteral: item.jdLiteral || null });
    }
    if (unique.length === 0) continue;
    // Clamp item count
    const clampedItems = unique.slice(0, maxItems);
    while (clampedItems.length < minItems) {
      break; // can't synthesize
    }
    fixed.push({ category: cat.category, items: clampedItems });
    if (fixed.length >= maxCategories) break;
  }

  // Ensure category count
  while (fixed.length < minCategories) {
    break; // can't synthesize
  }

  // Compute JD share
  const allItems = fixed.flatMap((c) => c.items);
  const jdCount = allItems.filter((it) => it.source === 'jd').length;
  const share = allItems.length ? jdCount / allItems.length : 0;

  return { coreSkills: fixed, jdShare: share };
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


