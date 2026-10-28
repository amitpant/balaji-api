import mongoose from 'mongoose';

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'editor'], default: 'editor' },
  },
  { timestamps: true },
);

export const AdminUser = mongoose.model('AdminUser', adminUserSchema);
