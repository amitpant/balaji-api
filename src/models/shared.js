import mongoose from 'mongoose';

export const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: Number,
    height: Number,
    alt: String,
  },
  { _id: false },
);
