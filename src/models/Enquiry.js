import mongoose from 'mongoose';

export const ENQUIRY_STATUSES = ['new', 'contacted', 'closed'];

const enquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    location: String,
    projectType: String,
    message: String,
    status: { type: String, enum: ENQUIRY_STATUSES, default: 'new', index: true },
    source: String,
  },
  { timestamps: true },
);

export const Enquiry = mongoose.model('Enquiry', enquirySchema);
