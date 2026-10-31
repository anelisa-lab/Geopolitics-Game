import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import app from './app.js';

// Shows which database server we're connecting to, without the password
function databaseHost(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return 'unreadable connection string. Check MONGODB_URI';
  }
}

async function start() {
  console.log(`Starting in ${env.isProduction ? 'production' : 'development'} mode`);
  console.log(`Connecting to MongoDB at ${databaseHost(env.mongoUri)}...`);

  try {
    await connectDB(env.mongoUri);
  } catch (err) {
    console.error(`Could not connect to MongoDB (${err.name}): ${err.message}`);
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