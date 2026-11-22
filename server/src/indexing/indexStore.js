// Python original: app/indexing/index_store.py
//
// BIG CHANGE: the Python version saved the index as a JSON file on disk
// (data/indexes/<dbname>.json). That file disappears when a free hosting
// service restarts. Here the index is a row in a Postgres table instead.
//
//   db_indexes( index_key, database_name, documents (jsonb), updated_at )
//
// jsonb is Postgres's column type for JSON data.
import { getAppPool } from "../appdb/pool.js";
import { HttpError } from "../utils/errors.js";

export class IndexStore {
  constructor(indexKey, databaseName = "") {
    this.indexKey = indexKey;
    this.databaseName = databaseName;
  }

  // Create the table the first time. "IF NOT EXISTS" makes it safe to repeat.
  async ensureTable() {
    await getAppPool().query(`
      CREATE TABLE IF NOT EXISTS db_indexes (
        index_key     text PRIMARY KEY,
        database_name text NOT NULL,
        documents     jsonb NOT NULL,
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async save(documents) {
    await this.ensureTable();

    // $1, $2, $3 are placeholders. The values go in separately, which keeps
    // user input out of the SQL text (this prevents SQL injection).
    // ON CONFLICT ... DO UPDATE = "insert, or overwrite if the key exists".
    await getAppPool().query(
      `
      INSERT INTO db_indexes (index_key, database_name, documents, updated_at)
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (index_key)
      DO UPDATE SET documents = EXCLUDED.documents, updated_at = now()
      `,
      [this.indexKey, this.databaseName, JSON.stringify(documents)]
    );
  }

  async load() {
    await this.ensureTable();

    const result = await getAppPool().query(
      "SELECT documents FROM db_indexes WHERE index_key = $1",
      [this.indexKey]
    );

    if (result.rows.length === 0) {
      // Python raised FileNotFoundError, which became a 500.
      // Here it becomes a clear 404 message.
      throw new HttpError(
        404,
        "This database has not been indexed yet. Index it first."
      );
    }

    return result.rows[0].documents;
  }

  async exists() {
    await this.ensureTable();

    const result = await getAppPool().query(
      "SELECT 1 FROM db_indexes WHERE index_key = $1",
      [this.indexKey]
    );

    return result.rows.length > 0;
  }
}
