// Python original: app/knowledge/knowledge_builder.py  (+ models.py)
//
// Asks Gemini to describe each table. The Python version used a dataclass
// called TableKnowledge. In JavaScript a plain object does the same job:
//   { table, summary, business_terms, column_descriptions, sample_queries }
import { AIProvider } from "../ai/provider.js";
import { buildKnowledgePrompt } from "./prompts.js";

// Gemini sometimes wraps JSON in ```json ... ``` even when told not to.
// The Python version crashed in that case. This helper cuts the JSON out.
export function parseJsonReply(text) {
  const cleaned = String(text ?? "").replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Gemini reply did not contain JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

export class KnowledgeBuilder {
  constructor(provider = new AIProvider()) {
    this.provider = provider;
  }

  async buildTableKnowledge(tableName, tableSchema) {
    const prompt = buildKnowledgePrompt(tableName, tableSchema);
    const response = await this.provider.generateText(prompt);

    let knowledge;

    try {
      knowledge = parseJsonReply(response);
    } catch (error) {
      throw new Error(
        `Could not read Gemini's description of table "${tableName}": ${error.message}`
      );
    }

    return {
      table: tableName,
      summary: knowledge.summary ?? "",
      business_terms: knowledge.business_terms ?? [],
      column_descriptions: knowledge.column_descriptions ?? {},
      sample_queries: knowledge.sample_queries ?? [],
    };
  }

  async buildDatabaseKnowledge(schema) {
    const knowledgeStore = {};

    for (const [tableName, tableSchema] of Object.entries(schema)) {
      console.log(`Building knowledge for ${tableName}...`);

      // One Gemini call per table, one after the other.
      knowledgeStore[tableName] = await this.buildTableKnowledge(
        tableName,
        tableSchema
      );
    }

    return knowledgeStore;
  }
}
