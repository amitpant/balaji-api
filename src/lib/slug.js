import { Project } from '../models/Project.js';

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 80) || 'project';

// Returns a slug not used by another project (appends -2, -3 … when needed).
export async function uniqueSlug(title, excludeId) {
  const base = slugify(title);
  let slug = base;
  for (let n = 2; await Project.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}
