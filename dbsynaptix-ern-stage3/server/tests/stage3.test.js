// Stage 3 tests. Run with:   npm test
//
// Gemini is faked (no API key, no network). PostgreSQL is real: set the same
// TEST_DB_* variables as in the earlier stages.
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { app } from "../src/app.js";
import { AIProvider } from "../src/ai/provider.js";
import { QueryPreprocessor } from "../src/ai/preprocessing.js";
import { SimilarityCalculator } from "../src/ai/similarity.js";
import { RetrievalEngine } from "../src/ai/retrieval.js";
import { ContextBuilder } from "../src/context/contextBuilder.js";
import { PromptBuilder } from "../src/sql/promptBuilder.js";
import { SqlValidator } from "../src/sql/sqlValidator.js";
import { SqlExecutor, SqlExecutionError } from "../src/sql/sqlExecutor.js";
import { SqlRepair } from "../src/sql/sqlRepair.js";
import { IndexingService } from "../src/services/indexingService.js";
import { closeAppPool } from "../src/appdb/pool.js";

const db = {
  host: process.env.TEST_DB_HOST ?? "localhost",
  port: Number(process.env.TEST_DB_PORT ?? 5432),
  database: process.env.TEST_DB_NAME ?? "postgres",
  username: process.env.TEST_DB_USER ?? "postgres",
  password: process.env.TEST_DB_PASSWORD ?? "",
};

process.env.APP_DATABASE_URL =
  `postgres://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}` +
  `@${db.host}:${db.port}/${db.database}`;

let server;
let baseUrl;
let replies = []; // what the fake Gemini will answer, one per call
let prompts = []; // every prompt the fake Gemini received

async function post(path, body) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function sql(text, params = []) {
  const client = new pg.Client({
    host: db.host, port: db.port, database: db.database,
    user: db.username, password: db.password,
  });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

// A tiny fake "embedding": how often each word appears in the text.
const VOCAB = ["customer", "order", "product", "country"];
function fakeEmbed(text) {
  const lower = text.toLowerCase();
  return VOCAB.map((word) => lower.split(word).length - 1 + 0.01);
}

function usage(prompt, completion) {
  return { promptTokenCount: prompt, candidatesTokenCount: completion, totalTokenCount: prompt + completion };
}

before(async () => {
  await sql(`
    DROP TABLE IF EXISTS st_orders; DROP TABLE IF EXISTS st_customers;
    CREATE TABLE st_customers (
      customer_id serial PRIMARY KEY,
      country text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE st_orders (
      order_id serial PRIMARY KEY,
      customer_id int REFERENCES st_customers(customer_id)
    );
    INSERT INTO st_customers (country) VALUES ('Germany'), ('Mexico'), ('Germany');
  `);

  mock.method(AIProvider.prototype, "generateText", async (prompt) => {
    const table = /Table Name:\s*(\S+)/.exec(prompt)[1];
    return JSON.stringify({
      summary: `Fake summary of ${table}.`,
      business_terms: [table],
      column_descriptions: {},
      sample_queries: [`Show all ${table}.`],
    });
  });
  mock.method(AIProvider.prototype, "generateEmbedding", async (text) => fakeEmbed(text));
  mock.method(AIProvider.prototype, "generateTextWithMetadata", async (prompt) => {
    prompts.push(prompt);
    const next = replies.shift();
    assert.ok(next !== undefined, "fake Gemini ran out of replies");
    return { text: next, usageMetadata: usage(100, 10) };
  });

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const built = await post("/database/index", db);
  assert.equal(built.status, 200);
});

after(async () => {
  server.close();
  mock.restoreAll();
  const key = new IndexingService().indexKey(db);
  await sql("DELETE FROM db_indexes WHERE index_key = $1", [key]).catch(() => {});
  await sql("DROP TABLE IF EXISTS st_orders; DROP TABLE IF EXISTS st_customers;");
  await closeAppPool();
});

// ---------------------------------------------------------------- unit tests

test("QueryPreprocessor: lowercase, no punctuation, singular, no duplicates", () => {
  const result = new QueryPreprocessor().preprocess("Show total Orders by Customer, orders & companies?");
  assert.deepEqual(result.keywords, ["show", "total", "order", "by", "customer", "company"]);
  assert.equal(result.normalized, "show total orders by customer orders companies");
});

test("SimilarityCalculator", () => {
  const sim = new SimilarityCalculator();
  assert.equal(sim.cosineSimilarity([1, 2], [2, 4]).toFixed(6), "1.000000");
  assert.equal(sim.cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(sim.cosineSimilarity([0, 0], [1, 1]), 0);
});

function doc(table, columns, foreignKeys = [], embedding = [0, 0]) {
  return {
    table,
    structured: {
      columns: columns.map((name) => ({ name, type: "text" })),
      primary_keys: [],
      foreign_keys: foreignKeys.map((target) => ({
        column: `${target}_id`,
        references: { table: target, column: "id" },
      })),
    },
    text: `TABLE: ${table.toUpperCase()}`,
    embedding,
  };
}

test("RetrievalEngine ranks by keywords (40%) + meaning (60%)", async () => {
  const documents = [
    doc("customers", ["customer_id", "country"], [], [1, 0]),
    doc("orders", ["order_id"], [], [0, 1]),
    doc("products", ["product_id"], [], [0.5, 0.5]),
  ];
  const engine = new RetrievalEngine({ generateEmbedding: async () => [1, 0] });
  const ranked = await engine.retrieve(documents, "Show customers");

  // "orders" scores exactly 0 (no keyword match, opposite meaning), so it is left out.
  assert.deepEqual(ranked.map((r) => r.table), ["customers", "products"]);
  // keywords: show, customer.  table score 10/20=0.5, column score 5/10=0.5
  assert.equal(ranked[0].keywordScore, 0.5);
  assert.equal(ranked[0].semanticScore, 1);
  assert.ok(Math.abs(ranked[0].finalScore - (0.4 * 0.5 + 0.6 * 1)) < 1e-9);
  assert.deepEqual(ranked[0].reasons.tableMatches, ["customer"]);
});

test("ContextBuilder adds parents and children through foreign keys", () => {
  const documents = [
    doc("customers", ["id"]),
    doc("orders", ["id"], ["customers"]),
    doc("order_items", ["id"], ["orders"]),
    doc("products", ["id"]),
  ];
  const retrieved = [{ table: "orders", document: documents[1] }];
  const tables = new ContextBuilder().expand(retrieved, documents).map((d) => d.table);

  assert.deepEqual(tables, ["orders", "customers", "order_items"]);
  assert.ok(!tables.includes("products"));
});

test("ContextBuilder only expands the top K results", () => {
  const documents = ["a", "b", "c", "d"].map((t) => doc(t, ["id"]));
  const retrieved = documents.map((d) => ({ table: d.table, document: d }));
  const tables = new ContextBuilder().expand(retrieved, documents, 2).map((d) => d.table);
  assert.deepEqual(tables, ["a", "b"]);
});

test("PromptBuilder includes the rules, the question and each table's text", () => {
  const prompt = new PromptBuilder().build("How many?", [{ text: "TABLE: X" }, { text: "TABLE: Y" }]);
  assert.match(prompt, /IMPORTANT RULES/);
  assert.match(prompt, /USER QUESTION\n=+\nHow many\?/);
  assert.match(prompt, /TABLE: X[\s\S]*TABLE: Y/);
  assert.match(prompt, /SCHEMA_NOT_FOUND/);
});

test("SqlRepair prompt contains the failed SQL, the database error and the schema", () => {
  const prompt = new SqlRepair().buildPrompt("Q?", "SELECT bad", new Error('column "bad" does not exist'), [{ text: "TABLE: X" }]);
  assert.match(prompt, /FAILED SQL\n=+\nSELECT bad/);
  assert.match(prompt, /DATABASE ERROR\n=+\ncolumn "bad" does not exist/);
  assert.match(prompt, /TABLE: X/);
});

// ---------------------------------------------------------------- validator

const validator = new SqlValidator();
const rejects = (input, status, pattern) =>
  assert.throws(() => validator.validate(input), (e) => e.status === status && pattern.test(e.detail));

test("SqlValidator removes markdown and explanations", () => {
  assert.equal(validator.validate("```sql\nSELECT 1\n```"), "SELECT 1");
  assert.equal(validator.validate("Here you go:\nSELECT a\nFROM t;"), "SELECT a\nFROM t;");
  assert.equal(validator.validate("WITH x AS (SELECT 1) SELECT * FROM x"), "WITH x AS (SELECT 1) SELECT * FROM x");
});

test("SqlValidator accepts created_at / updated_at (bug in the Python version)", () => {
  assert.equal(
    validator.validate("SELECT created_at, updated_at FROM users"),
    "SELECT created_at, updated_at FROM users"
  );
});

test("SqlValidator ignores forbidden words inside quotes and comments", () => {
  validator.validate("SELECT * FROM notes WHERE text = 'please update this'");
  validator.validate("SELECT 1 -- delete nothing");
});

test("SqlValidator rejects dangerous or non-SELECT SQL", () => {
  rejects("DROP TABLE users", 422, /DROP/);
  rejects("SELECT 1; DELETE FROM users", 422, /DELETE/);
  rejects("SELECT 1; SELECT 2", 422, /one SQL statement/);
  rejects("SHOW TABLES", 422, /Only SELECT/);
  rejects("SCHEMA_NOT_FOUND", 422, /not available in the database schema/);
});

// ---------------------------------------------------------------- executor

test("SqlExecutor returns rows as objects", async () => {
  const rows = await new SqlExecutor().execute("SELECT country FROM st_customers ORDER BY customer_id", db);
  assert.deepEqual(rows, [{ country: "Germany" }, { country: "Mexico" }, { country: "Germany" }]);
});

test("SqlExecutor refuses to change data (read-only transaction)", async () => {
  await assert.rejects(
    new SqlExecutor().execute("INSERT INTO st_customers (country) VALUES ('Hacked')", db),
    SqlExecutionError
  );
  const { rows } = await sql("SELECT count(*)::int AS n FROM st_customers");
  assert.equal(rows[0].n, 3);
});

test("SqlExecutor raises SqlExecutionError for a bad column", async () => {
  await assert.rejects(
    new SqlExecutor().execute("SELECT nope FROM st_customers", db),
    (e) => e instanceof SqlExecutionError && e.code === "42703"
  );
});

// ---------------------------------------------------------------- full /query

test("POST /query: question -> SQL -> rows, with timings and tokens", async () => {
  prompts = [];
  replies = ["```sql\nSELECT country, created_at FROM st_customers WHERE country = 'Germany'\n```"];

  const { status, body } = await post("/query", { question: "List customers from Germany", database: db });

  assert.equal(status, 200);
  assert.equal(body.question, "List customers from Germany");
  assert.equal(body.sql, "SELECT country, created_at FROM st_customers WHERE country = 'Germany'");
  assert.equal(body.results.length, 2);
  assert.equal(body.results[0].country, "Germany");
  assert.equal(body.repair_attempted, false);
  assert.equal(body.repair_successful, false);
  assert.deepEqual(
    [body.prompt_tokens, body.completion_tokens, body.total_tokens],
    [100, 10, 110]
  );
  assert.deepEqual(
    Object.keys(body.timings).sort(),
    ["context_ms", "execution_ms", "generation_ms", "retrieval_ms", "total_ms"]
  );

  // The prompt Gemini received contained the question and the best table.
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /List customers from Germany/);
  assert.match(prompts[0], /TABLE: ST_CUSTOMERS/);
});

test("POST /query repairs a failing query once and adds both token counts", async () => {
  prompts = [];
  replies = ["SELECT countri FROM st_customers", "SELECT country FROM st_customers"];

  const { status, body } = await post("/query", { question: "Which countries?", database: db });

  assert.equal(status, 200);
  assert.equal(body.sql, "SELECT country FROM st_customers");
  assert.equal(body.results.length, 3);
  assert.equal(body.repair_attempted, true);
  assert.equal(body.repair_successful, true);
  assert.deepEqual([body.prompt_tokens, body.completion_tokens, body.total_tokens], [200, 20, 220]);

  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /DATABASE ERROR/);
  assert.match(prompts[1], /countri/);
});

test("POST /query gives a clear 400 when the repair also fails", async () => {
  replies = ["SELECT countri FROM st_customers", "SELECT still_wrong FROM st_customers"];

  const { status, body } = await post("/query", { question: "Which countries?", database: db });

  assert.equal(status, 400);
  assert.match(body.detail, /even after a repair attempt/);
});

test("POST /query: SCHEMA_NOT_FOUND becomes a 422 with a message", async () => {
  replies = ["SCHEMA_NOT_FOUND"];
  const { status, body } = await post("/query", { question: "What is the weather?", database: db });
  assert.equal(status, 422);
  assert.match(body.detail, /not available in the database schema/);
});

test("POST /query blocks a destructive query and leaves the data untouched", async () => {
  replies = ["DELETE FROM st_customers"];
  const { status, body } = await post("/query", { question: "Remove everyone", database: db });
  assert.equal(status, 422);
  assert.match(body.detail, /DELETE/);

  const { rows } = await sql("SELECT count(*)::int AS n FROM st_customers");
  assert.equal(rows[0].n, 3);
});

test("POST /query returns 404 when the database was never indexed", async () => {
  const { status, body } = await post("/query", {
    question: "Anything?",
    database: { ...db, database: "database_that_was_never_indexed" },
  });
  assert.equal(status, 404);
  assert.match(body.detail, /not been indexed/);
});

test("POST /query returns 422 for a missing question or database", async () => {
  assert.equal((await post("/query", { database: db })).status, 422);
  assert.equal((await post("/query", { question: "   ", database: db })).status, 422);
  assert.equal((await post("/query", { question: "Hi" })).status, 422);
  assert.equal((await post("/query", { question: "Hi", database: { host: "x" } })).status, 422);
});
