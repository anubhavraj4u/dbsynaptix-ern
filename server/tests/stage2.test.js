// Stage 2 tests. Run with:   npm test
//
// Gemini is replaced by a fake ("mock") so these tests need no API key and
// make no network calls. They DO need PostgreSQL (same TEST_DB_* variables as
// Stage 1). The semantic index is saved in the same test database.
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { app } from "../src/app.js";
import { AIProvider } from "../src/ai/provider.js";
import { KnowledgeBuilder, parseJsonReply } from "../src/knowledge/knowledgeBuilder.js";
import { DocumentBuilder } from "../src/indexing/documentBuilder.js";
import { EmbeddingBuilder } from "../src/indexing/embeddingBuilder.js";
import { IndexStore } from "../src/indexing/indexStore.js";
import { IndexingService } from "../src/services/indexingService.js";
import { closeAppPool } from "../src/appdb/pool.js";

const db = {
  host: process.env.TEST_DB_HOST ?? "localhost",
  port: Number(process.env.TEST_DB_PORT ?? 5432),
  database: process.env.TEST_DB_NAME ?? "postgres",
  username: process.env.TEST_DB_USER ?? "postgres",
  password: process.env.TEST_DB_PASSWORD ?? "",
};

// The app database for the tests = the same Postgres database.
process.env.APP_DATABASE_URL =
  `postgres://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}` +
  `@${db.host}:${db.port}/${db.database}`;

let server;
let baseUrl;
let embedCalls = 0;
let textCalls = 0;

function fakeKnowledgeJson(prompt) {
  const table = /Table Name:\s*(\S+)/.exec(prompt)[1];
  return JSON.stringify({
    summary: `Fake summary of ${table}.`,
    business_terms: ["fake", table],
    column_descriptions: { country: "Country name." },
    sample_queries: [`Show all ${table}.`],
  });
}

async function post(path, body) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function appQuery(sql, params = []) {
  const client = new pg.Client({
    host: db.host, port: db.port, database: db.database,
    user: db.username, password: db.password,
  });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

before(async () => {
  await appQuery(`
    DROP TABLE IF EXISTS st_orders; DROP TABLE IF EXISTS st_customers;
    CREATE TABLE st_customers (customer_id serial PRIMARY KEY, country text);
    CREATE TABLE st_orders (
      order_id serial PRIMARY KEY,
      customer_id int REFERENCES st_customers(customer_id)
    );
  `);

  // Replace the two Gemini methods with fakes for the whole file.
  mock.method(AIProvider.prototype, "generateText", async (prompt) => {
    textCalls += 1;
    // The first table gets a reply wrapped in a markdown fence, on purpose.
    const json = fakeKnowledgeJson(prompt);
    return textCalls % 2 === 1 ? "```json\n" + json + "\n```" : json;
  });
  mock.method(AIProvider.prototype, "generateEmbedding", async (text) => {
    embedCalls += 1;
    return [text.length, 1, 0];
  });

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  mock.restoreAll();
  const key = new IndexingService().indexKey(db);
  await appQuery("DELETE FROM db_indexes WHERE index_key = $1", [key]).catch(() => {});
  await appQuery("DROP TABLE IF EXISTS st_orders; DROP TABLE IF EXISTS st_customers;");
  await closeAppPool();
});

test("parseJsonReply handles plain and fenced JSON", () => {
  assert.deepEqual(parseJsonReply('{"a": 1}'), { a: 1 });
  assert.deepEqual(parseJsonReply('```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(() => parseJsonReply("sorry, no json"), /did not contain JSON/);
});

test("KnowledgeBuilder gives a clear error when Gemini returns junk", async () => {
  const fake = { generateText: async () => "I cannot help with that." };
  const builder = new KnowledgeBuilder(fake);
  await assert.rejects(
    builder.buildTableKnowledge("orders", { columns: [] }),
    /table "orders"/
  );
});

test("DocumentBuilder writes the table text and keeps embedding null", () => {
  const schema = {
    st_orders: {
      columns: [{ name: "country", type: "text" }],
      primary_keys: ["order_id"],
      foreign_keys: [{ column: "customer_id", references: { table: "st_customers", column: "customer_id" } }],
    },
  };
  const knowledge = {
    st_orders: {
      summary: "Orders.", business_terms: ["order"],
      column_descriptions: { country: "Ship country." }, sample_queries: ["Show orders."],
    },
  };
  const [doc] = new DocumentBuilder().build(schema, knowledge);
  assert.equal(doc.table, "st_orders");
  assert.equal(doc.embedding, null);
  assert.match(doc.text, /TABLE: ST_ORDERS/);
  assert.match(doc.text, /- country \(text\)\n {2}Ship country\./);
  assert.match(doc.text, /- customer_id references st_customers\.customer_id\./);
  assert.match(doc.text, /- Show orders\./);
});

test("EmbeddingBuilder fills missing embeddings and skips existing ones", async () => {
  const calls = [];
  const fake = { generateEmbedding: async (t) => { calls.push(t); return [1, 2]; } };
  const docs = [
    { text: "a", embedding: null },
    { text: "b", embedding: [9] },
  ];
  await new EmbeddingBuilder(fake).buildEmbeddings(docs);
  assert.deepEqual(docs.map((d) => d.embedding), [[1, 2], [9]]);
  assert.deepEqual(calls, ["a"]);
});

test("IndexStore saves, checks, loads and overwrites", async () => {
  const store = new IndexStore("test-key-stage2", "demo");
  await appQuery("DELETE FROM db_indexes WHERE index_key = 'test-key-stage2'").catch(() => {});
  assert.equal(await store.exists(), false);
  await assert.rejects(store.load(), (error) => error.status === 404);

  await store.save([{ table: "a", embedding: [0.5] }]);
  assert.equal(await store.exists(), true);
  assert.deepEqual(await store.load(), [{ table: "a", embedding: [0.5] }]);

  await store.save([{ table: "b" }]); // overwrite, not duplicate
  assert.deepEqual(await store.load(), [{ table: "b" }]);

  await appQuery("DELETE FROM db_indexes WHERE index_key = 'test-key-stage2'");
});

test("indexKey differs per host, port and database", () => {
  const service = new IndexingService();
  const a = service.indexKey({ host: "h", port: 1, database: "shop" });
  assert.notEqual(a, service.indexKey({ host: "h", port: 2, database: "shop" }));
  assert.notEqual(a, service.indexKey({ host: "other", port: 1, database: "shop" }));
  assert.equal(a, service.indexKey({ host: "H", port: 1, database: "shop" }));
});

test("POST /database/index builds the index, then reuses it", async () => {
  const first = await post("/database/index", db);
  assert.equal(first.status, 200);
  assert.equal(first.body.data.reused, false);
  assert.ok(first.body.data.indexed_tables >= 2);

  const callsAfterFirst = { text: textCalls, embed: embedCalls };

  const second = await post("/database/index", db);
  assert.equal(second.body.data.reused, true);
  assert.equal(second.body.data.indexed_tables, first.body.data.indexed_tables);
  // Reusing must not call Gemini again.
  assert.deepEqual({ text: textCalls, embed: embedCalls }, callsAfterFirst);

  // Check what was saved.
  const documents = await new IndexingService().loadIndex(db);
  const orders = documents.find((d) => d.table === "st_orders");
  assert.ok(orders);
  assert.equal(orders.structured.foreign_keys[0].references.table, "st_customers");
  assert.ok(Array.isArray(orders.embedding) && orders.embedding.length === 3);
});

test("POST /database/index returns 400 when the database is unreachable", async () => {
  const { status, body } = await post("/database/index", { ...db, port: 1 });
  assert.equal(status, 400);
  assert.match(body.detail, /Unable to connect/);
});
