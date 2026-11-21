// Stage 1 tests. Run with:   npm test
//
// They need a PostgreSQL server. Tell them where it is with environment
// variables (defaults shown):
//   TEST_DB_HOST=localhost TEST_DB_PORT=5432 TEST_DB_NAME=postgres
//   TEST_DB_USER=postgres  TEST_DB_PASSWORD=...
// The tests create two small tables (st_customers, st_orders) and remove
// them again afterwards.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { app } from "../src/app.js";
import { assembleSchema } from "../src/database/schemaBuilder.js";

const db = {
  host: process.env.TEST_DB_HOST ?? "localhost",
  port: Number(process.env.TEST_DB_PORT ?? 5432),
  database: process.env.TEST_DB_NAME ?? "postgres",
  username: process.env.TEST_DB_USER ?? "postgres",
  password: process.env.TEST_DB_PASSWORD ?? "",
};

let server;
let baseUrl;

async function post(path, body) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  const client = new pg.Client({
    host: db.host, port: db.port, database: db.database,
    user: db.username, password: db.password,
  });
  await client.connect();
  await client.query(`
    DROP TABLE IF EXISTS st_orders; DROP TABLE IF EXISTS st_customers;
    CREATE TABLE st_customers (customer_id serial PRIMARY KEY, country text);
    CREATE TABLE st_orders (
      order_id serial PRIMARY KEY,
      customer_id int REFERENCES st_customers(customer_id)
    );
  `);
  await client.end();

  server = app.listen(0); // port 0 = pick any free port
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  const client = new pg.Client({
    host: db.host, port: db.port, database: db.database,
    user: db.username, password: db.password,
  });
  await client.connect();
  await client.query("DROP TABLE IF EXISTS st_orders; DROP TABLE IF EXISTS st_customers;");
  await client.end();
});

test("GET /health", async () => {
  const response = await fetch(baseUrl + "/health");
  assert.deepEqual(await response.json(), { status: "healthy" });
});

test("assembleSchema merges columns, primary keys and foreign keys", () => {
  const schema = assembleSchema(
    { orders: [{ name: "id", type: "integer" }] },
    { orders: ["id"] },
    { orders: [{ column: "c", references: { table: "customers", column: "id" } }] }
  );
  assert.deepEqual(schema.orders.primary_keys, ["id"]);
  assert.equal(schema.orders.foreign_keys[0].references.table, "customers");
});

test("POST /database/connect succeeds with correct login", async () => {
  const { status, body } = await post("/database/connect", db);
  assert.equal(status, 200);
  assert.equal(body.success, true);
});

test("POST /database/connect returns 400 when the database is unreachable", async () => {
  const { status, body } = await post("/database/connect", { ...db, port: 1 });
  assert.equal(status, 400);
  assert.match(body.detail, /Unable to connect/);
});

test("POST /database/connect returns 422 when a field is missing", async () => {
  const { status, body } = await post("/database/connect", { host: "x" });
  assert.equal(status, 422);
  assert.match(body.detail, /port/);
});

test("POST /database/schema returns tables, keys and foreign keys", async () => {
  const { status, body } = await post("/database/schema", db);
  assert.equal(status, 200);
  const orders = body.data.st_orders;
  assert.deepEqual(orders.primary_keys, ["order_id"]);
  assert.deepEqual(orders.foreign_keys, [
    { column: "customer_id", references: { table: "st_customers", column: "customer_id" } },
  ]);
  assert.equal(body.data.st_customers.columns[1].name, "country");
});
