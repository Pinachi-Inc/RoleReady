export const renderCvMarkdown = (cv) => {
  const lines = [];

  if (cv.name) {
    lines.push(`# ${cv.name}`);
  }

  const contactParts = [];
  if (cv.contact?.email) contactParts.push(cv.contact.email);
  if (cv.contact?.phone) contactParts.push(cv.contact.phone);
  if (cv.contact?.location) contactParts.push(cv.contact.location);
  if (Array.isArray(cv.contact?.links) && cv.contact.links.length > 0) {
    contactParts.push(cv.contact.links.join(' | '));
  }
  if (contactParts.length > 0) {
    lines.push(contactParts.join(' | '));
  }

  if (cv.summary) {
    lines.push('');
    lines.push('## Professional Summary');
    lines.push(cv.summary.trim());
  }

  if (Array.isArray(cv.coreSkills) && cv.coreSkills.length > 0) {
    lines.push('');
    lines.push('## Core Skills');
    for (const category of cv.coreSkills) {
      if (!category?.category || !Array.isArray(category.items) || category.items.length === 0) continue;
      const skills = category.items
        .map((item) => (item?.skill || '').trim())
        .filter((s) => s.length > 0)
        .join(', ');
      lines.push('');
      lines.push(`### ${category.category}: ${skills}`);
    }
  }

  if (Array.isArray(cv.certifications) && cv.certifications.length > 0) {
    lines.push('');
    lines.push('## Certifications');
    for (const c of cv.certifications) {
      lines.push(`- ${c}`);
    }
  }

  if (Array.isArray(cv.experience) && cv.experience.length > 0) {
    lines.push('');
    lines.push('## Professional Experience');
    for (const job of cv.experience) {
      const headerParts = [];
      if (job.title) headerParts.push(job.title);
      if (job.company) headerParts.push(job.company);
      if (job.location) headerParts.push(job.location);
      if (headerParts.length > 0) {
        lines.push('');
        lines.push(`### ${headerParts.join(' | ')}`);
      }
      const dateParts = [];
      if (job.start) dateParts.push(job.start);
      if (job.end) dateParts.push(job.end);
      if (dateParts.length > 0) {
        lines.push(dateParts.join(' — '));
      }
      if (Array.isArray(job.achievements) && job.achievements.length > 0) {
        for (const a of job.achievements) {
          lines.push(`- ${a}`);
        }
      }
    }
  }

  if (Array.isArray(cv.education) && cv.education.length > 0) {
    lines.push('');
    lines.push('## Education');
    for (const e of cv.education) {
      lines.push(`- ${e}`);
    }
  }

  return lines.join('\n');
};


