// Python original: app/services/text_to_sql_service.py
//
// THE HEART OF THE PROJECT. It runs the stages in order:
//   retrieve -> expand context -> build prompt -> Gemini writes SQL
//   -> validate -> execute -> (repair once if PostgreSQL rejects it)
import { AIProvider } from "../ai/provider.js";
import { RetrievalEngine } from "../ai/retrieval.js";
import { ContextBuilder } from "../context/contextBuilder.js";
import { PromptBuilder } from "../sql/promptBuilder.js";
import { SqlValidator } from "../sql/sqlValidator.js";
import { SqlExecutor, SqlExecutionError } from "../sql/sqlExecutor.js";
import { SqlRepair } from "../sql/sqlRepair.js";
import { HttpError } from "../utils/errors.js";

// Python: round(x, 2)
const round2 = (number) => Math.round(number * 100) / 100;

// Python read response.usage_metadata.prompt_token_count.
// The JS SDK calls it response.usageMetadata.promptTokenCount.
function tokensOf(response) {
  const usage = response.usageMetadata ?? {};

  return {
    prompt: usage.promptTokenCount ?? 0,
    completion: usage.candidatesTokenCount ?? 0,
    total: usage.totalTokenCount ?? 0,
  };
}

export class TextToSqlService {
  constructor() {
    // One shared AI provider for the whole request.
    this.ai = new AIProvider();
    this.retriever = new RetrievalEngine(this.ai);
    this.contextBuilder = new ContextBuilder();
    this.promptBuilder = new PromptBuilder();
    this.validator = new SqlValidator();
    this.executor = new SqlExecutor();
    this.repairer = new SqlRepair();
  }

  async answerQuestion({ question, request, documents }) {
    const timings = {};
    const pipelineStart = performance.now();

    // Stage 1: score every table against the question.
    let start = performance.now();
    const retrieved = await this.retriever.retrieve(documents, question);
    timings.retrieval_ms = round2(performance.now() - start);

    // Stage 2: add foreign-key neighbours of the top tables.
    start = performance.now();
    const context = this.contextBuilder.expand(retrieved, documents);
    timings.context_ms = round2(performance.now() - start);

    // Stage 3: build the prompt.
    const prompt = this.promptBuilder.build(question, context);

    // Stage 4: Gemini writes the SQL, the validator checks it.
    start = performance.now();
    const llmResponse = await this.ai.generateTextWithMetadata(prompt);
    let sql = this.validator.validate(llmResponse.text ?? "");
    timings.generation_ms = round2(performance.now() - start);

    let repairAttempted = false;
    let repairSuccessful = false;
    let results;
    let tokens = tokensOf(llmResponse);

    // Stage 5: run it.
    try {
      start = performance.now();
      results = await this.executor.execute(sql, request);
      timings.execution_ms = round2(performance.now() - start);
    } catch (executionError) {
      // Only errors from PostgreSQL itself are worth repairing.
      if (!(executionError instanceof SqlExecutionError)) {
        throw executionError;
      }

      // Stage 6: ONE repair attempt. Send Gemini the question, the failed SQL,
      // PostgreSQL's error message and the same schema.
      repairAttempted = true;

      const repairedResponse = await this.ai.generateTextWithMetadata(
        this.repairer.buildPrompt(question, sql, executionError, context)
      );
      const repairedSql = this.validator.validate(repairedResponse.text ?? "");

      try {
        start = performance.now();
        results = await this.executor.execute(repairedSql, request);
        timings.execution_ms = round2(performance.now() - start);
      } catch (secondError) {
        if (secondError instanceof SqlExecutionError) {
          throw new HttpError(
            400,
            `The generated SQL could not be run, even after a repair attempt: ${secondError.message}`
          );
        }
        throw secondError;
      }

      sql = repairedSql;
      repairSuccessful = true;

      // Count BOTH Gemini calls in the token totals.
      const second = tokensOf(repairedResponse);
      tokens = {
        prompt: tokens.prompt + second.prompt,
        completion: tokens.completion + second.completion,
        total: tokens.total + second.total,
      };
    }

    timings.total_ms = round2(performance.now() - pipelineStart);

    // The key names stay snake_case so the frontend gets the same JSON as before.
    return {
      question,
      sql,
      results,

      repair_attempted: repairAttempted,
      repair_successful: repairSuccessful,

      prompt_tokens: tokens.prompt,
      completion_tokens: tokens.completion,
      total_tokens: tokens.total,

      timings,
    };
  }
}
