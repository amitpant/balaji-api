import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { AdminUser } from './models/AdminUser.js';

// First run: create the owner login from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists yet.
// Remove those two variables from the host after the first successful login.
async function ensureFirstAdmin() {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: name = 'Owner' } = process.env;
  if (!email || !password) return;
  if (await AdminUser.exists({})) return;
  if (password.length < 8) {
    console.warn('ADMIN_PASSWORD must be at least 8 characters; admin not created');
    return;
  }
  await AdminUser.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    role: 'owner',
  });
  console.log(`Created first admin: ${email}`);
}

async function start() {
  if (env.MONGODB_URI) {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
    await ensureFirstAdmin();
  } else {
    console.warn('MONGODB_URI not set; starting without a database');
  }

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
