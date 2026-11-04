// Checks the AI settings in .env work. Run with: node scripts/testAi.js
import { env } from '../src/config/env.js';
import { LlmClient } from '../src/ai/LlmClient.js';

const client = new LlmClient({
  apiKey: env.llmApiKey,
  baseUrl: env.llmBaseUrl,
  model: env.llmModel,
  timeoutMs: 15000, // generous for a one-off test
});

if (!client.isConfigured) {
  console.error('Add LLM_API_KEY to your .env file first.');
  process.exit(1);
}

console.log(`Asking ${env.llmModel}...`);
try {
  const started = Date.now();
  const text = await client.complete(
    "You are a lively sports commentator for a board game like Risk. In one sentence of at most 25 words, describe Italy rolling a 6 against the Holy See's 2 and winning.",
  );
  console.log(`Answer in ${Date.now() - started} ms: ${text}`);
} catch (err) {
  console.error('It did not work:', err.message);
  process.exit(1);
}