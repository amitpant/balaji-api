import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';

async function start() {
  if (env.MONGODB_URI) {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected');
  } else {
    console.warn('MONGODB_URI not set; starting without a database');
  }

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
