// Talks to an AI chat model using the "chat completions" format.
// Google Gemini, Groq, OpenAI and others all accept it, so switching provider
// only means changing three settings in .env.
export class LlmClient {
  #apiKey;
  #baseUrl;
  #model;
  #timeoutMs;
  #fetch;

  constructor({ apiKey, baseUrl, model, timeoutMs = 4000, fetchFn = globalThis.fetch }) {
    this.#apiKey = apiKey;
    this.#baseUrl = (baseUrl ?? '').replace(/\/+$/, ''); // no trailing slash
    this.#model = model;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchFn;
  }

  get isConfigured() {
    return Boolean(this.#apiKey && this.#baseUrl && this.#model);
  }

  // Sends one prompt and returns the model's answer as text.
  // Tries a second time if the first attempt times out or the provider has a hiccup.
  async complete(prompt, { maxTokens = 300 } = {}) {
    if (!this.isConfigured) throw new Error('No AI model is set up. Add LLM_API_KEY to .env.');

    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.#send(prompt, maxTokens);
      } catch (err) {
        lastError = err;
        if (!err.retryable) break; // e.g. a wrong API key: trying again won't help
      }
    }
    throw lastError;
  }

  async #send(prompt, maxTokens) {
    let res;
    try {
      res = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify({
          model: this.#model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      // No answer in time, or no connection
      throw Object.assign(new Error(`The AI did not answer: ${err.message}`), { retryable: true });
    }

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      const retryable = res.status === 429 || res.status >= 500; // too busy, or a server error
      throw Object.assign(new Error(`The AI request failed (${res.status}): ${detail}`), { retryable });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw Object.assign(new Error('The AI returned an empty answer.'), { retryable: true });
    return text;
  }
}