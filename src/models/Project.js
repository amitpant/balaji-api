import mongoose from 'mongoose';
import { imageSchema } from './shared.js';

export const PROJECT_CATEGORIES = ['residential', 'commercial', 'interior', 'renovation'];
export const PROJECT_STATUSES = ['completed', 'ongoing', 'upcoming'];

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: String, enum: PROJECT_CATEGORIES, required: true },
    status: { type: String, enum: PROJECT_STATUSES, required: true },
    coverImage: { type: imageSchema, required: true },
    location: String,
    gallery: [imageSchema],
    videos: [String],
    plotAreaSqft: Number,
    builtUpAreaSqft: Number,
    floors: Number,
    cost: {
      amountInr: Number,
      onRequest: Boolean,
    },
    startDate: Date,
    completionDate: Date,
    description: String,
    highlights: [String],
    published: { type: Boolean, default: false, index: true },
    featured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Project = mongoose.model('Project', projectSchema);
