// Route tests without a live database: Mongoose model methods are stubbed.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.CLOUDINARY_CLOUD_NAME = 'demo';
process.env.CLOUDINARY_API_KEY = 'key';
process.env.CLOUDINARY_API_SECRET = 'secret';

const { createApp } = await import('../src/app.js');
const { Project } = await import('../src/models/Project.js');
const { Enquiry } = await import('../src/models/Enquiry.js');
const { AdminUser } = await import('../src/models/AdminUser.js');
const { SiteSettings } = await import('../src/models/SiteSettings.js');

// Chainable stand-in for a Mongoose Query that resolves to `result`.
const q = (result) => {
  const query = {};
  for (const m of ['select', 'sort', 'skip', 'limit', 'lean']) query[m] = () => query;
  query.then = (res, rej) => Promise.resolve(result).then(res, rej);
  return query;
};

const app = createApp();
const cover = { url: 'https://res.cloudinary.com/demo/image/upload/a.jpg', publicId: 'a' };
let cookie;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('correct-horse', 4);
  vi.spyOn(AdminUser, 'findOne').mockImplementation(({ email }) =>
    q(email === 'owner@example.com' ? { _id: '507f1f77bcf86cd799439011', name: 'Owner', email, role: 'owner', passwordHash } : null),
  );
  const res = await request(app).post('/api/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
  cookie = res.headers['set-cookie'];
});

afterEach(() => {
  for (const spy of [Project, Enquiry, SiteSettings].flatMap((M) => Object.values(M))) {
    if (vi.isMockFunction(spy)) spy.mockRestore();
  }
});

describe('auth', () => {
  it('logs in with the right password and sets an httpOnly cookie', () => {
    expect(cookie?.[0]).toMatch(/session=.+HttpOnly/);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'owner@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_LOGIN');
  });

  it('protects admin routes', async () => {
    const res = await request(app).get('/api/admin/projects');
    expect(res.status).toBe(401);
  });

  it('returns the current admin', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Owner');
  });
});

describe('public projects', () => {
  it('only queries published projects', async () => {
    const find = vi.spyOn(Project, 'find').mockReturnValue(q([{ title: 'A' }]));
    vi.spyOn(Project, 'countDocuments').mockResolvedValue(1);
    const res = await request(app).get('/api/projects?status=completed&category=bogus');
    expect(res.status).toBe(200);
    expect(find).toHaveBeenCalledWith({ published: true, status: 'completed' });
    expect(res.body.total).toBe(1);
  });

  it('404s for unknown or unpublished slugs', async () => {
    const findOne = vi.spyOn(Project, 'findOne').mockReturnValue(q(null));
    const res = await request(app).get('/api/projects/secret');
    expect(res.status).toBe(404);
    expect(findOne).toHaveBeenCalledWith({ slug: 'secret', published: true });
  });
});

describe('enquiries', () => {
  it('validates the phone number', async () => {
    const res = await request(app).post('/api/enquiries').send({ name: 'Ravi', phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.phone).toMatch(/10-digit/);
  });

  it('normalises +91 numbers and drops the honeypot field', async () => {
    const create = vi.spyOn(Enquiry, 'create').mockResolvedValue({ _id: 'e1' });
    const res = await request(app).post('/api/enquiries').send({ name: 'Ravi', phone: '+91 98765-43210', website: '' });
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ name: 'Ravi', phone: '9876543210' });
  });

  it('rejects bots that fill the honeypot', async () => {
    const res = await request(app).post('/api/enquiries').send({ name: 'Bot', phone: '9876543210', website: 'x.com' });
    expect(res.status).toBe(400);
  });
});

describe('admin projects', () => {
  it('creates a project with a unique slug and YouTube IDs', async () => {
    vi.spyOn(Project, 'exists').mockImplementation(async ({ slug }) => slug === 'family-home');
    const create = vi.spyOn(Project, 'create').mockImplementation(async (d) => d);
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', cookie)
      .send({
        title: 'Family Home',
        category: 'residential',
        status: 'completed',
        coverImage: cover,
        videos: ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'],
        plotAreaSqft: '',
      });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('family-home-2');
    expect(res.body.videos).toEqual(['dQw4w9WgXcQ', 'dQw4w9WgXcQ']);
    expect(create.mock.calls[0][0].plotAreaSqft).toBeUndefined();
  });

  it('requires title, category, status and cover', async () => {
    const res = await request(app).post('/api/admin/projects').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['title', 'category', 'status', 'coverImage']));
  });

  it('rejects a bad YouTube link', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', cookie)
      .send({ title: 'House', category: 'residential', status: 'ongoing', coverImage: cover, videos: ['https://vimeo.com/1'] });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['videos.0']).toMatch(/YouTube/);
  });

  it('404s on an invalid id', async () => {
    const res = await request(app).delete('/api/admin/projects/not-an-id').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('settings and social media', () => {
  it('normalises WhatsApp and validates social links and Pixel ID', async () => {
    const upsert = vi.spyOn(SiteSettings, 'findOneAndUpdate').mockImplementation((f, d) => q(d));
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Cookie', cookie)
      .send({
        whatsapp: '98765 43210',
        social: { facebook: 'https://facebook.com/balaji', instagram: '' },
        marketing: { facebookPixelId: '123456789012345' },
      });
    expect(res.status).toBe(200);
    expect(res.body.whatsapp).toBe('919876543210');
    expect(res.body.social).toEqual({ facebook: 'https://facebook.com/balaji' });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('rejects a social link that is not a URL', async () => {
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Cookie', cookie)
      .send({ social: { instagram: 'balaji_builders' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['social.instagram']).toMatch(/https/);
  });
});

describe('uploads', () => {
  it('returns a signed Cloudinary upload', async () => {
    const res = await request(app).post('/api/admin/uploads/sign').set('Cookie', cookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(res.body.fields.signature).toMatch(/^[a-f0-9]{40}$/);
  });
});
