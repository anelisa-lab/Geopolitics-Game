import mongoose from 'mongoose';

export async function connectDB(uri) {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

  await mongoose.connect(uri);
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}