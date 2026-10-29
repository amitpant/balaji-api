import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';

// Signed direct upload: the browser uploads the file straight to Cloudinary,
// so large photos never pass through our API. See https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
export function signUpload({ folder = 'balaji/projects' } = {}) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(503, 'UPLOADS_NOT_CONFIGURED', 'Photo uploads are not set up yet');
  }
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { api_key: apiKey, timestamp, folder, signature },
  };
}
