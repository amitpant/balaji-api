// Creates or resets an admin login.
// Usage: node --env-file=.env scripts/create-admin.js "Name" email@example.com "password"
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { AdminUser } from '../src/models/AdminUser.js';

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 8) {
  console.error('Usage: node scripts/create-admin.js "Name" email "password (8+ chars)"');
  process.exit(1);
}
if (!env.MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);
const passwordHash = await bcrypt.hash(password, 12);
const user = await AdminUser.findOneAndUpdate(
  { email: email.toLowerCase() },
  { name, email: email.toLowerCase(), passwordHash, role: 'owner' },
  { upsert: true, new: true },
);
console.log(`Admin ready: ${user.email}`);
await mongoose.disconnect();
