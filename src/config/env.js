import 'dotenv/config';

const required = ['MONGODB_URI', 'SESSION_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Add them to your .env file.`);
  process.exit(1);
}

export const env = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI,
  sessionSecret: process.env.SESSION_SECRET,
  isProduction: process.env.NODE_ENV === 'production',
};