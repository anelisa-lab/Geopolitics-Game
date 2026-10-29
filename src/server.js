import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import app from './app.js';

async function start() {
  try {
    await connectDB(env.mongoUri);
  } catch (err) {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`Server running at http://localhost:${env.port}`);
  });

  process.on('SIGINT', async () => {
    await disconnectDB();
    server.close(() => process.exit(0));
  });
}

start();