import { z } from 'zod';
import { ENQUIRY_STATUSES, PROJECT_CATEGORIES, PROJECT_STATUSES } from './constants.js';

const blank = (v) => (v === '' || v === null ? undefined : v);
const optStr = z.preprocess(blank, z.string().trim().max(2000).optional());
const optUrl = z.preprocess(blank, z.string().trim().url('Must be a full link starting with https://').optional());
// Empty input means "not filled" (hidden on the site), never 0.
const optNum = z.preprocess(blank, z.coerce.number().nonnegative().optional());
const optDate = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Use YYYY-MM or YYYY-MM-DD').optional());

export const image = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
  width: z.number().optional(),
  height: z.number().optional(),
  alt: z.string().optional(),
});

const youtubeId = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const m = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/) || v.match(/^([\w-]{11})$/);
    if (!m) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid YouTube link' });
      return z.NEVER;
    }
    return m[1];
  });

export const projectInput = z.object({
  title: z.string({ error: 'Title is required' }).trim().min(3, 'Title is required').max(120),
  category: z.enum(PROJECT_CATEGORIES, { error: 'Choose a category' }),
  status: z.enum(PROJECT_STATUSES, { error: 'Choose a status' }),
  coverImage: image.optional(),
  location: optStr,
  gallery: z.array(image).max(40).default([]),
  videos: z.array(youtubeId).max(10).default([]),
  plotAreaSqft: optNum,
  builtUpAreaSqft: optNum,
  floors: optNum,
  cost: z.object({ amountInr: optNum, onRequest: z.boolean().optional() }).optional(),
  startDate: optDate,
  completionDate: optDate,
  description: z.preprocess(blank, z.string().trim().max(5000).optional()),
  highlights: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  displayOrder: z.coerce.number().int().default(0),
}).refine((p) => !p.published || p.coverImage || p.gallery.length > 0, {
  message: 'Add at least one photo before publishing',
  path: ['coverImage'],
});

export const testimonialInput = z.object({
  name: z.string().trim().min(2).max(80),
  location: optStr,
  text: z.string().trim().min(5).max(1500),
  rating: z.preprocess(blank, z.coerce.number().int().min(1).max(5).optional()),
  photo: image.optional(),
  published: z.boolean().default(false),
  displayOrder: z.coerce.number().int().default(0),
});

export const enquiryInput = z.object({
  name: z.string({ error: 'Please enter your name' }).trim().min(2, 'Please enter your name').max(80),
  phone: z
    .string({ error: 'Enter a 10-digit mobile number' })
    .trim()
    .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number')),
  email: z.preprocess(blank, z.string().trim().email('Enter a valid email').optional()),
  location: optStr,
  projectType: optStr,
  message: z.preprocess(blank, z.string().trim().max(2000).optional()),
  source: optStr,
  website: z.string().max(0, 'Spam detected').optional(), // honeypot: must stay empty
});

export const enquiryStatusInput = z.object({ status: z.enum(ENQUIRY_STATUSES) });

const whatsapp = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^(91)?\d{10}$/, 'Enter a 10-digit WhatsApp number'))
    .transform((v) => (v.length === 10 ? `91${v}` : v))
    .optional(),
);

export const settingsInput = z.object({
  companyName: optStr,
  tagline: optStr,
  logo: image.optional().nullable(),
  phone: optStr,
  whatsapp,
  email: z.preprocess(blank, z.string().trim().email('Enter a valid email').optional()),
  address: optStr,
  mapUrl: optUrl,
  stats: z.array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) })).max(6).default([]),
  trustBadges: z.array(z.string().trim().min(1)).max(10).default([]),
  social: z
    .object({ facebook: optUrl, instagram: optUrl, youtube: optUrl, whatsappMessage: optStr })
    .default({}),
  marketing: z
    .object({
      facebookPixelId: z.preprocess(blank, z.string().trim().regex(/^\d{10,20}$/, 'Pixel ID is a 15–16 digit number').optional()),
      googleAnalyticsId: z.preprocess(blank, z.string().trim().regex(/^G-[A-Z0-9]+$/, 'Looks like G-XXXXXXX').optional()),
    })
    .default({}),
});

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email('Enter your email'),
  password: z.string().min(1, 'Enter your password'),
});

export const passwordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(200),
});
