// Password hashing and Cloudinary signing with Web Crypto (native in Workers, fast and CPU-cheap).

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const ITERATIONS = 100_000; // Workers' PBKDF2 maximum

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function sha1Hex(text) {
  const buf = await crypto.subtle.digest('SHA-1', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Signed direct upload: the browser sends the photo straight to Cloudinary.
// https://cloudinary.com/documentation/authentication_signatures
export async function signCloudinaryUpload(env, folder) {
  // Trim: a stray space or newline pasted into a secret breaks the signature.
  const cloudName = env.CLOUDINARY_CLOUD_NAME.trim();
  const apiKey = env.CLOUDINARY_API_KEY.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET.trim();
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { api_key: apiKey, timestamp, folder, signature: await sha1Hex(toSign + apiSecret) },
  };
}
