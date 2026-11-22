// Python original: app/indexing/embedding_builder.py
import { AIProvider } from "../ai/provider.js";

export class EmbeddingBuilder {
  constructor(provider = new AIProvider()) {
    this.provider = provider;
  }

  // Fills in document.embedding for every document that does not have one.
  async buildEmbeddings(documents) {
    for (const document of documents) {
      if (document.embedding !== null) {
        continue;
      }

      document.embedding = await this.provider.generateEmbedding(document.text);
    }

    return documents;
  }
}
