import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAdmin } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { ah, validate } from '../lib/validate.js';
import { enquiryStatusInput, projectInput, settingsInput, testimonialInput } from '../lib/schemas.js';
import { uniqueSlug } from '../lib/slug.js';
import { Project } from '../models/Project.js';
import { Testimonial } from '../models/Testimonial.js';
import { Enquiry, ENQUIRY_STATUSES } from '../models/Enquiry.js';
import { SiteSettings, getSettings } from '../models/SiteSettings.js';
import { signUpload } from '../services/cloudinary.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const checkId = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'NOT_FOUND', 'Not found');
};
const orNotFound = (doc) => {
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Not found');
  return doc;
};

// ---------- Projects ----------
adminRouter.get(
  '/projects',
  ah(async (req, res) => {
    const items = await Project.find().sort({ displayOrder: 1, createdAt: -1 }).lean();
    res.json({ items });
  }),
);

adminRouter.post(
  '/projects',
  validate(projectInput),
  ah(async (req, res) => {
    const slug = await uniqueSlug(req.body.title);
    const project = await Project.create({ ...req.body, slug });
    res.status(201).json(project);
  }),
);

adminRouter.get(
  '/projects/:id',
  ah(async (req, res) => {
    checkId(req);
    res.json(orNotFound(await Project.findById(req.params.id).lean()));
  }),
);

adminRouter.put(
  '/projects/:id',
  validate(projectInput),
  ah(async (req, res) => {
    checkId(req);
    const slug = await uniqueSlug(req.body.title, req.params.id);
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { ...req.body, slug },
      { new: true, runValidators: true },
    ).lean();
    res.json(orNotFound(project));
  }),
);

adminRouter.delete(
  '/projects/:id',
  ah(async (req, res) => {
    checkId(req);
    orNotFound(await Project.findByIdAndDelete(req.params.id));
    res.status(204).end();
  }),
);

// ---------- Uploads ----------
adminRouter.post('/uploads/sign', (req, res) => {
  const folder = req.body?.folder === 'site' ? 'balaji/site' : 'balaji/projects';
  res.json(signUpload({ folder }));
});

// ---------- Testimonials ----------
adminRouter.get(
  '/testimonials',
  ah(async (req, res) => {
    res.json({ items: await Testimonial.find().sort({ displayOrder: 1, createdAt: -1 }).lean() });
  }),
);

adminRouter.post(
  '/testimonials',
  validate(testimonialInput),
  ah(async (req, res) => {
    res.status(201).json(await Testimonial.create(req.body));
  }),
);

adminRouter.put(
  '/testimonials/:id',
  validate(testimonialInput),
  ah(async (req, res) => {
    checkId(req);
    const t = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    res.json(orNotFound(t));
  }),
);

adminRouter.delete(
  '/testimonials/:id',
  ah(async (req, res) => {
    checkId(req);
    orNotFound(await Testimonial.findByIdAndDelete(req.params.id));
    res.status(204).end();
  }),
);

// ---------- Enquiries ----------
adminRouter.get(
  '/enquiries',
  ah(async (req, res) => {
    const filter = ENQUIRY_STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
    const limit = 25;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [items, total, newCount] = await Promise.all([
      Enquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Enquiry.countDocuments(filter),
      Enquiry.countDocuments({ status: 'new' }),
    ]);
    res.json({ items, total, page, newCount });
  }),
);

adminRouter.patch(
  '/enquiries/:id',
  validate(enquiryStatusInput),
  ah(async (req, res) => {
    checkId(req);
    const e = await Enquiry.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).lean();
    res.json(orNotFound(e));
  }),
);

// ---------- Settings + Social media ----------
adminRouter.get(
  '/settings',
  ah(async (req, res) => {
    res.json(await getSettings());
  }),
);

adminRouter.put(
  '/settings',
  validate(settingsInput),
  ah(async (req, res) => {
    const doc = await SiteSettings.findOneAndUpdate({}, req.body, {
      new: true,
      upsert: true,
      overwrite: true,
      runValidators: true,
    }).lean();
    res.json(doc);
  }),
);
