import mongoose from 'mongoose';
import { imageSchema } from './shared.js';

const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: String,
    text: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    photo: imageSchema,
    published: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Testimonial = mongoose.model('Testimonial', testimonialSchema);
