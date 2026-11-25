// Python original: app/ai/retrieval.py
//
// Decides which tables are relevant to a question.
// Hybrid search: keywords (40%) + meaning/embeddings (60%).
import { QueryPreprocessor } from "./preprocessing.js";
import { AIProvider } from "./provider.js";
import { SimilarityCalculator } from "./similarity.js";

const TABLE_MATCH_SCORE = 10;
const COLUMN_MATCH_SCORE = 5;

const KEYWORD_WEIGHT = 0.4;
const SEMANTIC_WEIGHT = 0.6;

export class RetrievalEngine {
  constructor(provider = new AIProvider()) {
    this.preprocessor = new QueryPreprocessor();
    this.provider = provider;
    this.similarity = new SimilarityCalculator();
  }

  // ---- Keyword scoring ----------------------------------------------------

  // +10 for every keyword that appears inside the table name,
  // then divided by the best possible score so the result is 0..1.
  scoreTableName(tableName, keywords) {
    let score = 0;
    const matches = [];
    const lowerName = tableName.toLowerCase();

    for (const keyword of keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        score += TABLE_MATCH_SCORE;
        matches.push(keyword);
      }
    }

    const maxScore = keywords.length * TABLE_MATCH_SCORE;
    const normalizedScore = maxScore !== 0 ? score / maxScore : 0;

    return { rawScore: score, normalizedScore, matches };
  }

  // +5 for every keyword that appears in at least one column name.
  scoreColumns(columns, keywords) {
    let score = 0;
    const matches = [];

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();

      for (const column of columns) {
        if (column.name.toLowerCase().includes(lowerKeyword)) {
          score += COLUMN_MATCH_SCORE;
          matches.push(column.name);

          // One keyword should not score several columns.
          break;
        }
      }
    }

    const maxScore = keywords.length * COLUMN_MATCH_SCORE;
    const normalizedScore = maxScore !== 0 ? score / maxScore : 0;

    return { rawScore: score, normalizedScore, matches };
  }

  // ---- Semantic scoring ---------------------------------------------------

  scoreSemantic(document, questionEmbedding) {
    return this.similarity.cosineSimilarity(questionEmbedding, document.embedding);
  }

  // ---- Hybrid scoring -----------------------------------------------------

  scoreDocument(document, keywords, semanticScore) {
    const tableResult = this.scoreTableName(document.table, keywords);
    const columnResult = this.scoreColumns(document.structured.columns, keywords);

    const keywordScore =
      (tableResult.normalizedScore + columnResult.normalizedScore) / 2;

    const finalScore =
      KEYWORD_WEIGHT * keywordScore + SEMANTIC_WEIGHT * semanticScore;

    return {
      table: document.table,
      keywordScore,
      semanticScore,
      finalScore,
      reasons: {
        tableMatches: tableResult.matches,
        columnMatches: columnResult.matches,
        rawTableScore: tableResult.rawScore,
        rawColumnScore: columnResult.rawScore,
      },
      document,
    };
  }

  // ---- Main pipeline ------------------------------------------------------

  // Returns every table, best match first.
  async retrieve(documents, question) {
    const { keywords } = this.preprocessor.preprocess(question);

    // One Gemini call for the question, reused for every table.
    const questionEmbedding = await this.provider.generateEmbedding(question);

    const scoredDocuments = [];

    for (const document of documents) {
      const semanticScore = this.scoreSemantic(document, questionEmbedding);
      const result = this.scoreDocument(document, keywords, semanticScore);

      if (result.finalScore > 0) {
        scoredDocuments.push(result);
      }
    }

    // Python: sort(key=lambda doc: doc["final_score"], reverse=True)
    // JS sort() takes a function that returns negative/zero/positive.
    // (b - a) puts the larger score first.
    scoredDocuments.sort((a, b) => b.finalScore - a.finalScore);

    return scoredDocuments;
  }
}
