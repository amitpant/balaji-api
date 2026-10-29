// D1 access. Each record keeps searchable columns plus a JSON `data` column,
// so adding an optional field later needs no migration.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, status TEXT NOT NULL, category TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, display_order INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS projects_public ON projects (published, status, category, display_order)`,
  `CREATE TABLE IF NOT EXISTS testimonials (
    id TEXT PRIMARY KEY, published INTEGER NOT NULL DEFAULT 0, display_order INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'new', ip TEXT, data TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS enquiries_status ON enquiries (status, created_at)`,
  `CREATE INDEX IF NOT EXISTS enquiries_ip ON enquiries (ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
];

let ready;
// Creates tables on first use in each Worker instance (idempotent), so no manual migration step is needed.
export function ensureSchema(db) {
  ready ??= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

const parse = (row) =>
  row && {
    ...JSON.parse(row.data),
    id: row.id,
    ...(row.slug !== undefined && { slug: row.slug }),
    ...(row.status !== undefined && { status: row.status }),
    ...(row.published !== undefined && { published: !!row.published }),
    ...(row.featured !== undefined && { featured: !!row.featured }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

// ---------- Projects ----------
const PROJECT_COLUMNS = ['slug', 'status', 'category', 'published', 'featured', 'displayOrder'];
const splitProject = (p) => {
  const data = { ...p };
  for (const k of ['slug', 'status', 'published', 'featured']) delete data[k];
  return data;
};

export async function listProjects(db, { publishedOnly, status, category, featured, limit = 100, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (publishedOnly) where.push('published = 1');
  if (status) where.push('status = ?') && args.push(status);
  if (category) where.push('category = ?') && args.push(category);
  if (featured) where.push('featured = 1');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await db.batch([
    db
      .prepare(`SELECT * FROM projects ${clause} ORDER BY display_order ASC, created_at DESC LIMIT ? OFFSET ?`)
      .bind(...args, limit, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM projects ${clause}`).bind(...args),
  ]);
  return { items: rows.results.map(parse), total: count.results[0].n };
}

export async function getProjectBySlug(db, slug, { publishedOnly } = {}) {
  const row = await db
    .prepare(`SELECT * FROM projects WHERE slug = ?${publishedOnly ? ' AND published = 1' : ''}`)
    .bind(slug)
    .first();
  return parse(row);
}

export async function getProject(db, id) {
  return parse(await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first());
}

export async function slugTaken(db, slug, excludeId = '') {
  return !!(await db.prepare('SELECT 1 FROM projects WHERE slug = ? AND id != ?').bind(slug, excludeId).first());
}

export async function saveProject(db, id, p) {
  const t = now();
  const existing = id && (await db.prepare('SELECT created_at FROM projects WHERE id = ?').bind(id).first());
  if (id && !existing) return null;
  const pid = id || newId();
  await db
    .prepare(
      `INSERT INTO projects (id, slug, status, category, published, featured, display_order, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, status = excluded.status, category = excluded.category,
         published = excluded.published, featured = excluded.featured, display_order = excluded.display_order,
         data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(pid, p.slug, p.status, p.category, p.published ? 1 : 0, p.featured ? 1 : 0, p.displayOrder ?? 0, JSON.stringify(splitProject(p)), existing?.created_at ?? t, t)
    .run();
  return getProject(db, pid);
}

export async function deleteRow(db, table, id) {
  const { meta } = await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return meta.changes > 0;
}

// ---------- Testimonials ----------
export async function listTestimonials(db, { publishedOnly } = {}) {
  const { results } = await db
    .prepare(`SELECT * FROM testimonials ${publishedOnly ? 'WHERE published = 1' : ''} ORDER BY display_order ASC, created_at DESC`)
    .all();
  return results.map(parse);
}

export async function saveTestimonial(db, id, t) {
  const ts = now();
  const existing = id && (await db.prepare('SELECT created_at FROM testimonials WHERE id = ?').bind(id).first());
  if (id && !existing) return null;
  const tid = id || newId();
  const data = { ...t };
  delete data.published;
  await db
    .prepare(
      `INSERT INTO testimonials (id, published, display_order, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET published = excluded.published, display_order = excluded.display_order,
         data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(tid, t.published ? 1 : 0, t.displayOrder ?? 0, JSON.stringify(data), existing?.created_at ?? ts, ts)
    .run();
  return parse(await db.prepare('SELECT * FROM testimonials WHERE id = ?').bind(tid).first());
}

// ---------- Enquiries ----------
export async function createEnquiry(db, data, ip) {
  const id = newId();
  const t = now();
  await db
    .prepare('INSERT INTO enquiries (id, status, ip, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, 'new', ip, JSON.stringify(data), t, t)
    .run();
  return id;
}

export async function recentEnquiriesFromIp(db, ip, sinceIso) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM enquiries WHERE ip = ? AND created_at > ?').bind(ip, sinceIso).first();
  return row.n;
}

export async function listEnquiries(db, { status, limit = 25, offset = 0 } = {}) {
  const clause = status ? 'WHERE status = ?' : '';
  const args = status ? [status] : [];
  const [rows, count, fresh] = await db.batch([
    db.prepare(`SELECT id, status, data, created_at, updated_at FROM enquiries ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM enquiries ${clause}`).bind(...args),
    db.prepare(`SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'`),
  ]);
  return { items: rows.results.map(parse), total: count.results[0].n, newCount: fresh.results[0].n };
}

export async function setEnquiryStatus(db, id, status) {
  const { meta } = await db.prepare('UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), id).run();
  if (!meta.changes) return null;
  return parse(await db.prepare('SELECT id, status, data, created_at, updated_at FROM enquiries WHERE id = ?').bind(id).first());
}

// ---------- Settings ----------
export async function getSettings(db) {
  const row = await db.prepare(`SELECT data FROM settings WHERE key = 'site'`).first();
  return row ? JSON.parse(row.data) : {};
}

export async function saveSettings(db, data) {
  await db
    .prepare(`INSERT INTO settings (key, data, updated_at) VALUES ('site', ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .bind(JSON.stringify(data), now())
    .run();
  return data;
}

// ---------- Admin users ----------
export const findAdminByEmail = (db, email) => db.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first();
export const findAdminById = (db, id) => db.prepare('SELECT * FROM admin_users WHERE id = ?').bind(id).first();
export const countAdmins = async (db) => (await db.prepare('SELECT COUNT(*) AS n FROM admin_users').first()).n;

export async function createAdmin(db, { email, name, role, passwordHash }) {
  const id = newId();
  await db
    .prepare('INSERT INTO admin_users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, email, name, role, passwordHash, now())
    .run();
  return findAdminById(db, id);
}

export const setAdminPassword = (db, id, passwordHash) =>
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').bind(passwordHash, id).run();

export { PROJECT_COLUMNS };
