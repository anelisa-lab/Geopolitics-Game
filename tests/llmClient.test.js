import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LlmClient } from '../src/ai/LlmClient.js';

// Stand-ins for the provider's replies, so these tests never use the internet or an API key
const answer = (text) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) });
const failure = (status) => ({ ok: false, status, text: async () => 'error details' });

// A pretend fetch that gives back the replies in order, and remembers what it was asked
function fakeFetch(...replies) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fetchFn, calls };
}

const settings = { apiKey: 'test-key', baseUrl: 'https://ai.example/v1/', model: 'test-model' };

test("returns the model's answer and sends the prompt, model and key", async () => {
  const { fetchFn, calls } = fakeFetch(answer('  What a roll!  '));
  const client = new LlmClient({ ...settings, fetchFn });

  assert.equal(await client.complete('Describe the battle'), 'What a roll!');
  assert.equal(calls[0].url, 'https://ai.example/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'test-model');
  assert.equal(body.messages[0].content, 'Describe the battle');
});

test('tries once more after a server error', async () => {
  const { fetchFn, calls } = fakeFetch(failure(500), answer('Second time lucky'));
  const client = new LlmClient({ ...settings, fetchFn });

  assert.equal(await client.complete('Hi'), 'Second time lucky');
  assert.equal(calls.length, 2);
});

test('does not retry when the API key is wrong', async () => {
  const { fetchFn, calls } = fakeFetch(failure(401), answer('never reached'));
  const client = new LlmClient({ ...settings, fetchFn });

  await assert.rejects(client.complete('Hi'), /401/);
  assert.equal(calls.length, 1);
});

test('gives up after two failed attempts', async () => {
  const { fetchFn, calls } = fakeFetch(new Error('timeout'), new Error('timeout'));
  const client = new LlmClient({ ...settings, fetchFn });

  await assert.rejects(client.complete('Hi'), /did not answer/);
  assert.equal(calls.length, 2);
});

test('refuses to run without an API key', async () => {
  const { fetchFn, calls } = fakeFetch();
  const client = new LlmClient({ ...settings, apiKey: '', fetchFn });

  assert.equal(client.isConfigured, false);
  await assert.rejects(client.complete('Hi'), /LLM_API_KEY/);
  assert.equal(calls.length, 0);
});