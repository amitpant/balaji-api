// End-to-end API tests against a real local D1 database (Wrangler's local Cloudflare runtime).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from '../src/index.js';

let proxy;
let env;
let cookie;

const call = async (method, path, json, headers = {}) => {
  const res = await app.request(
    `https://test.local/api${path}`,
    {
      method,
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }), ...headers },
      body: json === undefined ? undefined : JSON.stringify(json),
    },
    env,
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};

const cover = { url: 'https://res.cloudinary.com/demo/image/upload/a.jpg', publicId: 'a' };

beforeAll(async () => {
  proxy = await getPlatformProxy({ persist: false });
  env = {
    ...proxy.env,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    ADMIN_EMAIL: 'Owner@Example.com',
    ADMIN_PASSWORD: 'correct-horse',
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
  };
}, 60_000);

afterAll(() => proxy?.dispose());

describe('auth', () => {
  it('blocks admin routes without a session', async () => {
    expect((await call('GET', '/admin/projects')).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const res = await call('POST', '/auth/login', { email: 'owner@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_LOGIN');
  });

  it('creates the first owner from secrets and logs in with an httpOnly cookie', async () => {
    const res = await call('POST', '/auth/login', { email: 'owner@example.com', password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('owner@example.com');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/session=.+HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    cookie = setCookie.split(';')[0];
  });

  it('returns the current admin', async () => {
    const res = await call('GET', '/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Owner');
  });
});

describe('projects', () => {
  let id;

  it('requires title, category and status', async () => {
    const res = await call('POST', '/admin/projects', {});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['title', 'category', 'status']));
  });

  it('will not publish a project without a photo', async () => {
    const res = await call('POST', '/admin/projects', { title: 'House', category: 'residential', status: 'ongoing', published: true });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.coverImage).toMatch(/photo/);
  });

  it('rejects a bad YouTube link', async () => {
    const res = await call('POST', '/admin/projects', {
      title: 'House',
      category: 'residential',
      status: 'ongoing',
      videos: ['https://vimeo.com/1'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['videos.0']).toMatch(/YouTube/);
  });

  it('saves a draft; empty numbers stay empty and YouTube links become IDs', async () => {
    const res = await call('POST', '/admin/projects', {
      title: 'Family Home',
      category: 'residential',
      status: 'completed',
      coverImage: cover,
      plotAreaSqft: '',
      builtUpAreaSqft: '3100',
      videos: ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'],
    });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('family-home');
    expect(res.body.published).toBe(false);
    expect(res.body.plotAreaSqft).toBeUndefined();
    expect(res.body.builtUpAreaSqft).toBe(3100);
    expect(res.body.videos).toEqual(['dQw4w9WgXcQ', 'dQw4w9WgXcQ']);
    id = res.body.id;
  });

  it('gives a second project with the same title a unique slug', async () => {
    const res = await call('POST', '/admin/projects', { title: 'Family Home', category: 'residential', status: 'ongoing' });
    expect(res.body.slug).toBe('family-home-2');
  });

  it('hides drafts from the public site', async () => {
    expect((await call('GET', '/projects')).body.total).toBe(0);
    expect((await call('GET', '/projects/family-home')).status).toBe(404);
  });

  it('shows a project once published, with filters', async () => {
    const draft = (await call('GET', `/admin/projects/${id}`)).body;
    const res = await call('PUT', `/admin/projects/${id}`, { ...draft, published: true, featured: true });
    expect(res.status).toBe(200);
    expect(res.body.createdAt).toBe(draft.createdAt);

    const list = await call('GET', '/projects?status=completed&category=bogus');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ slug: 'family-home', coverImage: cover });
    expect(list.body.items[0].description).toBeUndefined(); // cards stay small
    expect((await call('GET', '/projects?status=ongoing')).body.total).toBe(0);
    expect((await call('GET', '/projects?featured=true')).body.total).toBe(1);
    expect((await call('GET', '/projects/family-home')).body.builtUpAreaSqft).toBe(3100);
  });

  it('deletes a project', async () => {
    expect((await call('DELETE', `/admin/projects/${id}`)).status).toBe(204);
    expect((await call('DELETE', `/admin/projects/${id}`)).status).toBe(404);
  });
});

describe('enquiries', () => {
  it('validates the phone number', async () => {
    const res = await call('POST', '/enquiries', { name: 'Ravi', phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.phone).toMatch(/10-digit/);
  });

  it('rejects bots that fill the honeypot', async () => {
    expect((await call('POST', '/enquiries', { name: 'Bot', phone: '9876543210', website: 'x.com' })).status).toBe(400);
  });

  it('saves an enquiry with a normalised number and lists it for the admin', async () => {
    const res = await call('POST', '/enquiries', { name: 'Ravi', phone: '+91 98765-43210', website: '' }, { 'cf-connecting-ip': '1.1.1.1' });
    expect(res.status).toBe(201);
    const inbox = await call('GET', '/admin/enquiries');
    expect(inbox.body.newCount).toBe(1);
    expect(inbox.body.items[0]).toMatchObject({ name: 'Ravi', phone: '9876543210', status: 'new' });
    const upd = await call('PATCH', `/admin/enquiries/${res.body.id}`, { status: 'contacted' });
    expect(upd.body.status).toBe('contacted');
  });

  it('limits one visitor to 5 enquiries an hour', async () => {
    const h = { 'cf-connecting-ip': '2.2.2.2' };
    for (let i = 0; i < 5; i++) expect((await call('POST', '/enquiries', { name: 'Spam', phone: '9876543210' }, h)).status).toBe(201);
    expect((await call('POST', '/enquiries', { name: 'Spam', phone: '9876543210' }, h)).status).toBe(429);
  });
});

describe('settings and social media', () => {
  it('normalises WhatsApp and drops empty links', async () => {
    const res = await call('PUT', '/admin/settings', {
      phone: '+91 98765 43210',
      whatsapp: '98765 43210',
      social: { facebook: 'https://facebook.com/balaji', instagram: '' },
      marketing: { facebookPixelId: '123456789012345' },
    });
    expect(res.status).toBe(200);
    const pub = (await call('GET', '/settings')).body;
    expect(pub.whatsapp).toBe('919876543210');
    expect(pub.social).toEqual({ facebook: 'https://facebook.com/balaji' });
    expect(pub.marketing.facebookPixelId).toBe('123456789012345');
  });

  it('rejects a social link that is not a URL, and a bad Pixel ID', async () => {
    const res = await call('PUT', '/admin/settings', { social: { instagram: 'balaji_builders' }, marketing: { facebookPixelId: 'abc' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['social.instagram']).toMatch(/https/);
    expect(res.body.error.fields['marketing.facebookPixelId']).toMatch(/Pixel/);
  });
});

describe('testimonials', () => {
  it('only published testimonials are public', async () => {
    await call('POST', '/admin/testimonials', { name: 'Sunita', text: 'Great work on our home', published: true });
    await call('POST', '/admin/testimonials', { name: 'Draft', text: 'Not yet approved' });
    expect((await call('GET', '/admin/testimonials')).body.items).toHaveLength(2);
    expect((await call('GET', '/testimonials')).body.items.map((t) => t.name)).toEqual(['Sunita']);
  });
});

describe('uploads and password', () => {
  it('returns a signed Cloudinary upload', async () => {
    const res = await call('POST', '/admin/uploads/sign', {});
    expect(res.body.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(res.body.fields.signature).toMatch(/^[a-f0-9]{40}$/);
  });

  it('changes the password', async () => {
    expect((await call('POST', '/auth/password', { currentPassword: 'wrong', newPassword: 'new-password-1' })).status).toBe(400);
    expect((await call('POST', '/auth/password', { currentPassword: 'correct-horse', newPassword: 'new-password-1' })).status).toBe(204);
    const saved = cookie;
    cookie = undefined;
    expect((await call('POST', '/auth/login', { email: 'owner@example.com', password: 'correct-horse' })).status).toBe(401);
    expect((await call('POST', '/auth/login', { email: 'owner@example.com', password: 'new-password-1' })).status).toBe(200);
    cookie = saved;
  });
});
