// Python original: app/database/connection.py
//
// The lowest layer: talks to PostgreSQL. We use the "pg" library, which is
// Node's equivalent of Python's psycopg.
//
// Big difference from Python: database calls are ASYNC. They take time, so
// they return a "promise". Putting `await` in front means "pause this
// function here until the database answers". A function that uses `await`
// must be declared `async`.
import pg from "pg";

const { Client } = pg;

// Python:  psycopg.connect(host=..., port=..., dbname=..., user=..., password=...)
export async function createConnection(request) {
  const client = new Client({
    host: request.host,
    port: request.port,
    database: request.database,
    user: request.username,
    password: request.password,
    connectionTimeoutMillis: 10000, // give up after 10 seconds
  });

  await client.connect();
  return client;
}

// Python: get_tables(connection)   (it was never used, but it is kept for parity)
export async function getTables(connection) {
  const result = await connection.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  // result.rows is an array of objects like { table_name: "customers" }.
  // In Python the rows were tuples (row[0]); here they are already named.
  // .map(...) is the same idea as a Python list comprehension.
  return result.rows.map((row) => row.table_name);
}

// Result shape: { customers: [ {name: "country", type: "text"}, ... ], ... }
export async function getColumns(connection) {
  const result = await connection.query(`
    SELECT
      table_name,
      column_name,
      data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const columns = {};

  for (const row of result.rows) {
    // Python:  if table_name not in columns: columns[table_name] = []
    if (!columns[row.table_name]) {
      columns[row.table_name] = [];
    }

    columns[row.table_name].push({
      name: row.column_name,
      type: row.data_type,
    });
  }

  return columns;
}

// Result shape: { customers: ["customer_id"], order_details: ["order_id", "product_id"] }
export async function getPrimaryKeys(connection) {
  const result = await connection.query(`
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);

  const primaryKeys = {};

  for (const row of result.rows) {
    if (!primaryKeys[row.table_name]) {
      primaryKeys[row.table_name] = [];
    }

    primaryKeys[row.table_name].push(row.column_name);
  }

  return primaryKeys;
}

// Result shape:
// { orders: [ { column: "customer_id", references: { table: "customers", column: "customer_id" } } ] }
export async function getForeignKeys(connection) {
  const result = await connection.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);

  const foreignKeys = {};

  for (const row of result.rows) {
    if (!foreignKeys[row.table_name]) {
      foreignKeys[row.table_name] = [];
    }

    foreignKeys[row.table_name].push({
      column: row.column_name,
      references: {
        table: row.foreign_table_name,
        column: row.foreign_column_name,
      },
    });
  }

  return foreignKeys;
}
