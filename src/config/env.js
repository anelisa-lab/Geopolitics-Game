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

  // AI commentary. Optional: without a key, the game uses ready-made commentary lines
  llmApiKey: process.env.LLM_API_KEY || '',
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  llmModel: process.env.LLM_MODEL || 'gemini-2.5-flash-lite',
};