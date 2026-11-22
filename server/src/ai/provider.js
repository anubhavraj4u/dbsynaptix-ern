// Python original: app/ai/provider.py
//
// The ONLY file that talks to Gemini. Change the model or the vendor here and
// nothing else needs to change.
import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from "../config.js";
import { HttpError } from "../utils/errors.js";

export class AIProvider {
  // Python created the client in __init__. Here the client is created the
  // first time it is needed ("lazy"), so the server can start and the tests
  // can run even when no API key is set.
  get client() {
    if (!this._client) {
      if (!GEMINI_API_KEY) {
        throw new HttpError(500, "GEMINI_API_KEY is not set. Add it to your .env file.");
      }
      this._client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }

    return this._client;
  }

  // Text -> list of numbers that capture its meaning.
  async generateEmbedding(text) {
    const response = await this.client.models.embedContent({
      model: "gemini-embedding-2",
      contents: text,
    });

    return response.embeddings[0].values;
  }

  // Prompt -> text answer (just the string).
  async generateText(prompt) {
    const response = await this.client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });

    return response.text;
  }

  // Prompt -> full response object, so the caller can read token counts.
  // Python read response.usage_metadata.prompt_token_count; the JS SDK names
  // them response.usageMetadata.promptTokenCount (camelCase).
  async generateTextWithMetadata(prompt) {
    return this.client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });
  }
}
