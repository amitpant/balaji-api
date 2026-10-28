import mongoose from 'mongoose';

// Single document holding public site details editable from the admin panel.
const siteSettingsSchema = new mongoose.Schema(
  {
    stats: [{ label: String, value: String, _id: false }],
    phone: String,
    whatsapp: String,
    email: String,
    address: String,
    mapUrl: String,
    social: {
      facebook: String,
      instagram: String,
      youtube: String,
    },
    trustBadges: [String],
  },
  { timestamps: true },
);

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);
