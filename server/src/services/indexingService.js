// Python original: app/services/indexing_service.py
//
// The conductor of the indexing phase. It does no work itself; it calls the
// helpers in order:
//
//   Database -> Schema -> Knowledge (Gemini) -> Documents -> Embeddings -> Save
import { createHash } from "node:crypto";
import { DatabaseService } from "./databaseService.js";
import { KnowledgeBuilder } from "../knowledge/knowledgeBuilder.js";
import { DocumentBuilder } from "../indexing/documentBuilder.js";
import { EmbeddingBuilder } from "../indexing/embeddingBuilder.js";
import { IndexStore } from "../indexing/indexStore.js";
import { HttpError } from "../utils/errors.js";

export class IndexingService {
  constructor() {
    this.databaseService = new DatabaseService();
    this.knowledgeBuilder = new KnowledgeBuilder();
    this.documentBuilder = new DocumentBuilder();
    this.embeddingBuilder = new EmbeddingBuilder();
  }

  async buildIndex(request) {
    // 1. Extract the schema from the user's database.
    const schemaResponse = await this.databaseService.getSchema(request);
    const schema = schemaResponse.data;

    if (Object.keys(schema).length === 0) {
      throw new HttpError(422, "No tables were found in the public schema.");
    }

    // 2. Ask Gemini to describe every table.
    const knowledge = await this.knowledgeBuilder.buildDatabaseKnowledge(schema);

    // 3. One text document per table.
    let documents = this.documentBuilder.build(schema, knowledge);

    // 4. Turn each document into an embedding vector.
    documents = await this.embeddingBuilder.buildEmbeddings(documents);

    // 5. Save the finished index.
    await this.getIndexStore(request).save(documents);

    return documents;
  }

  async loadIndex(request) {
    return this.getIndexStore(request).load();
  }

  async indexExists(request) {
    return this.getIndexStore(request).exists();
  }

  getIndexStore(request) {
    return new IndexStore(this.indexKey(request), request.database);
  }

  // Python named the index file after the database name only, so two servers
  // with a database called "shop" shared one index. Here the key combines
  // host + port + database name, so each one gets its own index.
  indexKey(request) {
    const identity = `${request.host.toLowerCase()}:${request.port}/${request.database}`;

    return createHash("sha256").update(identity).digest("hex").slice(0, 32);
  }
}
