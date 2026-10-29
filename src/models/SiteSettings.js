import mongoose from 'mongoose';
import { imageSchema } from './shared.js';

// Single document holding everything the admin edits under Settings and Social media.
const siteSettingsSchema = new mongoose.Schema(
  {
    // Settings tab
    companyName: String,
    tagline: String,
    logo: imageSchema,
    phone: String,
    whatsapp: String, // digits with country code, e.g. 919876543210
    email: String,
    address: String,
    mapUrl: String,
    stats: [{ label: String, value: String, _id: false }],
    trustBadges: [String],

    // Social media tab
    social: {
      facebook: String,
      instagram: String,
      youtube: String,
      whatsappMessage: String, // pre-filled text for the WhatsApp button
    },
    marketing: {
      facebookPixelId: String,
      googleAnalyticsId: String,
    },
  },
  { timestamps: true },
);

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);

export async function getSettings() {
  return (await SiteSettings.findOne().lean()) ?? {};
}
