import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Project, PROJECT_CATEGORIES, PROJECT_STATUSES } from '../models/Project.js';
import { Testimonial } from '../models/Testimonial.js';
import { Enquiry } from '../models/Enquiry.js';
import { getSettings } from '../models/SiteSettings.js';
import { ah, validate } from '../lib/validate.js';
import { enquiryInput } from '../lib/schemas.js';
import { HttpError } from '../middleware/error.js';
import { notifyNewEnquiry } from '../services/email.js';

export const publicRouter = Router();

const CARD_FIELDS = 'title slug category status location coverImage builtUpAreaSqft featured displayOrder';

publicRouter.get(
  '/projects',
  ah(async (req, res) => {
    const filter = { published: true };
    if (PROJECT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (PROJECT_CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.featured === 'true') filter.featured = true;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [items, total] = await Promise.all([
      Project.find(filter)
        .select(CARD_FIELDS)
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Project.countDocuments(filter),
    ]);
    res.json({ items, total, page });
  }),
);

publicRouter.get(
  '/projects/:slug',
  ah(async (req, res) => {
    const project = await Project.findOne({ slug: req.params.slug, published: true }).lean();
    if (!project) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
    res.json(project);
  }),
);

publicRouter.get(
  '/testimonials',
  ah(async (req, res) => {
    const items = await Testimonial.find({ published: true }).sort({ displayOrder: 1, createdAt: -1 }).lean();
    res.json({ items });
  }),
);

publicRouter.get(
  '/settings',
  ah(async (req, res) => {
    res.json(await getSettings());
  }),
);

const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please call us instead' } }),
});

publicRouter.post(
  '/enquiries',
  enquiryLimiter,
  validate(enquiryInput),
  ah(async (req, res) => {
    // eslint-disable-next-line no-unused-vars
    const { website, ...data } = req.body;
    const enquiry = await Enquiry.create(data);
    notifyNewEnquiry(enquiry); // fire and forget
    res.status(201).json({ id: enquiry._id });
  }),
);
