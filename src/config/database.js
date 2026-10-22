import mongoose from 'mongoose';
import { config } from './index.js';

export async function connectDatabase() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    throw new Error(
      `Could not connect to MongoDB at ${hideCredentials(config.mongoUri)}. Is MongoDB running? (${error.message})`,
      { cause: error },
    );
  }

  // Wait until indexes (unique usernames and emails, ...) exist before taking traffic.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  console.log(`[db] Connected to MongoDB database "${mongoose.connection.name}"`);
  return mongoose.connection;
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}

function hideCredentials(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//***@');
}
