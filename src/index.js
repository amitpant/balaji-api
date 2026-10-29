import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import * as db from './db.js';
import { ENQUIRY_STATUSES, PROJECT_CATEGORIES, PROJECT_STATUSES } from './constants.js';
import {
  enquiryInput,
  enquiryStatusInput,
  loginInput,
  passwordInput,
  projectInput,
  settingsInput,
  testimonialInput,
} from './schemas.js';
import { hashPassword, signCloudinaryUpload, verifyPassword } from './crypto.js';

const COOKIE = 'session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

// ---------- helpers ----------
const fail = (status, code, message, fields) =>
  new HTTPException(status, { res: Response.json({ error: { code, message, ...(fields && { fields }) } }, { status }) });

async function body(c, schema) {
  let raw;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    throw fail(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', fields);
  }
  return result.data;
}

const pageArgs = (c, def = 12, max = 50) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit'), 10) || def, 1), max);
  const page = Math.max(parseInt(c.req.query('page'), 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
};

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 80) || 'project';

async function uniqueSlug(DB, title, excludeId) {
  const base = slugify(title);
  let slug = base;
  for (let n = 2; await db.slugTaken(DB, slug, excludeId); n++) slug = `${base}-${n}`;
  return slug;
}

const jwtSecret = (env) => {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw fail(500, 'SERVER_MISCONFIGURED', 'JWT_SECRET is not set');
  return env.JWT_SECRET;
};

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// ---------- app ----------
const app = new Hono().basePath('/api');

app.use('*', async (c, next) => {
  await db.ensureSchema(c.env.DB);
  await next();
  c.header('Cache-Control', 'no-store');
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } }, 500);
});
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

app.get('/health', (c) => c.json({ status: 'ok', db: 'connected' }));

// ---------- public ----------
const CARD_FIELDS = ['id', 'title', 'slug', 'category', 'status', 'location', 'coverImage', 'gallery', 'builtUpAreaSqft', 'featured'];
const toCard = (p) => {
  const card = Object.fromEntries(CARD_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
  card.coverImage ??= p.gallery?.[0];
  delete card.gallery;
  return card;
};

app.get('/projects', async (c) => {
  const { limit, page, offset } = pageArgs(c);
  const status = PROJECT_STATUSES.includes(c.req.query('status')) ? c.req.query('status') : undefined;
  const category = PROJECT_CATEGORIES.includes(c.req.query('category')) ? c.req.query('category') : undefined;
  const { items, total } = await db.listProjects(c.env.DB, {
    publishedOnly: true,
    status,
    category,
    featured: c.req.query('featured') === 'true',
    limit,
    offset,
  });
  return c.json({ items: items.map(toCard), total, page });
});

app.get('/projects/:slug', async (c) => {
  const p = await db.getProjectBySlug(c.env.DB, c.req.param('slug'), { publishedOnly: true });
  if (!p) throw fail(404, 'NOT_FOUND', 'Project not found');
  return c.json(p);
});

app.get('/testimonials', async (c) => c.json({ items: await db.listTestimonials(c.env.DB, { publishedOnly: true }) }));

app.get('/settings', async (c) => c.json(await db.getSettings(c.env.DB)));

app.post('/enquiries', async (c) => {
  const data = await body(c, enquiryInput);
  delete data.website;
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  if ((await db.recentEnquiriesFromIp(c.env.DB, ip, hourAgo)) >= 5) {
    throw fail(429, 'TOO_MANY_REQUESTS', 'Too many requests, please call us instead');
  }
  const id = await db.createEnquiry(c.env.DB, data, ip);
  return c.json({ id }, 201);
});

// ---------- auth ----------
app.post('/auth/login', async (c) => {
  const { email, password } = await body(c, loginInput);
  const DB = c.env.DB;

  // First run: create the owner from ADMIN_EMAIL / ADMIN_PASSWORD secrets if no admin exists.
  if ((await db.countAdmins(DB)) === 0 && c.env.ADMIN_EMAIL && c.env.ADMIN_PASSWORD?.length >= 8) {
    await db.createAdmin(DB, {
      email: c.env.ADMIN_EMAIL.trim().toLowerCase(),
      name: c.env.ADMIN_NAME || 'Owner',
      role: 'owner',
      passwordHash: await hashPassword(c.env.ADMIN_PASSWORD),
    });
  }

  const user = await db.findAdminByEmail(DB, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw fail(401, 'INVALID_LOGIN', 'Wrong email or password');
  }
  const token = await sign(
    { sub: user.id, role: user.role, name: user.name, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS },
    jwtSecret(c.env),
  );
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return c.json({ user: publicUser(user) });
});

app.post('/auth/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.body(null, 204);
});

// ---------- admin guard ----------
const requireAdmin = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token) throw fail(401, 'UNAUTHORIZED', 'Please log in');
  try {
    const p = await verify(token, jwtSecret(c.env), 'HS256');
    c.set('user', { id: p.sub, role: p.role, name: p.name });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw fail(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  }
  await next();
};

app.get('/auth/me', requireAdmin, (c) => c.json({ user: c.get('user') }));

app.post('/auth/password', requireAdmin, async (c) => {
  const { currentPassword, newPassword } = await body(c, passwordInput);
  const user = await db.findAdminById(c.env.DB, c.get('user').id);
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    throw fail(400, 'VALIDATION_ERROR', 'Current password is wrong', { currentPassword: 'Current password is wrong' });
  }
  await db.setAdminPassword(c.env.DB, user.id, await hashPassword(newPassword));
  return c.body(null, 204);
});

const admin = new Hono();
admin.use('*', requireAdmin);

const orNotFound = (x) => {
  if (!x) throw fail(404, 'NOT_FOUND', 'Not found');
  return x;
};

// Projects
admin.get('/projects', async (c) => {
  const { items } = await db.listProjects(c.env.DB, { limit: 500 });
  return c.json({ items });
});
admin.get('/projects/:id', async (c) => c.json(orNotFound(await db.getProject(c.env.DB, c.req.param('id')))));
admin.post('/projects', async (c) => {
  const input = await body(c, projectInput);
  const slug = await uniqueSlug(c.env.DB, input.title);
  return c.json(await db.saveProject(c.env.DB, null, { ...input, slug }), 201);
});
admin.put('/projects/:id', async (c) => {
  const input = await body(c, projectInput);
  const id = c.req.param('id');
  const slug = await uniqueSlug(c.env.DB, input.title, id);
  return c.json(orNotFound(await db.saveProject(c.env.DB, id, { ...input, slug })));
});
admin.delete('/projects/:id', async (c) => {
  orNotFound(await db.deleteRow(c.env.DB, 'projects', c.req.param('id')));
  return c.body(null, 204);
});

// Uploads
admin.post('/uploads/sign', async (c) => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = c.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw fail(503, 'UPLOADS_NOT_CONFIGURED', 'Photo uploads are not set up yet');
  }
  let folder = 'balaji/projects';
  try {
    if ((await c.req.json()).folder === 'site') folder = 'balaji/site';
  } catch {
    /* default folder */
  }
  return c.json(await signCloudinaryUpload(c.env, folder));
});

// Testimonials
admin.get('/testimonials', async (c) => c.json({ items: await db.listTestimonials(c.env.DB) }));
admin.post('/testimonials', async (c) => c.json(await db.saveTestimonial(c.env.DB, null, await body(c, testimonialInput)), 201));
admin.put('/testimonials/:id', async (c) =>
  c.json(orNotFound(await db.saveTestimonial(c.env.DB, c.req.param('id'), await body(c, testimonialInput)))),
);
admin.delete('/testimonials/:id', async (c) => {
  orNotFound(await db.deleteRow(c.env.DB, 'testimonials', c.req.param('id')));
  return c.body(null, 204);
});

// Enquiries
admin.get('/enquiries', async (c) => {
  const { limit, page, offset } = pageArgs(c, 25, 100);
  const status = ENQUIRY_STATUSES.includes(c.req.query('status')) ? c.req.query('status') : undefined;
  return c.json({ ...(await db.listEnquiries(c.env.DB, { status, limit, offset })), page });
});
admin.patch('/enquiries/:id', async (c) => {
  const { status } = await body(c, enquiryStatusInput);
  return c.json(orNotFound(await db.setEnquiryStatus(c.env.DB, c.req.param('id'), status)));
});

// Settings + Social media
admin.get('/settings', async (c) => c.json(await db.getSettings(c.env.DB)));
admin.put('/settings', async (c) => c.json(await db.saveSettings(c.env.DB, await body(c, settingsInput))));

app.route('/admin', admin);

export default app;
