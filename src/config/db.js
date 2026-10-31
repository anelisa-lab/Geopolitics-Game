import mongoose from 'mongoose';

export async function connectDB(uri) {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

  // Give up after 10 seconds instead of waiting forever, so the logs show why
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}