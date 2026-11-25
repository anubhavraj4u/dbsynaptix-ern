// Python original: app/sql/sql_executor.py
//
// Runs the validated SQL on the user's database.
// IMPROVED vs the Python version: runs inside a READ ONLY transaction with a
// time limit, so even a query that slipped past the validator cannot change
// data or run forever.
import { DatabaseService } from "../services/databaseService.js";
import { HttpError } from "../utils/errors.js";

const STATEMENT_TIMEOUT_MS = 15000;
const MAX_ROWS = 1000; // protects the server and the browser from huge results

// Thrown when PostgreSQL itself rejects the SQL (unknown column, bad syntax...).
// The service catches this one specifically and asks Gemini to repair the SQL.
export class SqlExecutionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SqlExecutionError";
    this.code = code;
  }
}

// Errors that come from PostgreSQL carry a 5-character SQLSTATE code such as
// "42703". Node's own network errors have longer codes like "ECONNRESET".
function isPostgresError(error) {
  return typeof error.code === "string" && error.code.length === 5;
}

export class SqlExecutor {
  constructor() {
    this.database = new DatabaseService();
  }

  async execute(sql, request) {
    const connection = await this.database.getConnection(request);

    try {
      await connection.query("BEGIN READ ONLY");
      await connection.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

      const result = await connection.query(sql);

      await connection.query("ROLLBACK"); // nothing to save, it was read-only

      // pg already returns each row as an object { column: value }.
      // Python needed zip(column_names, row) to build that.
      return result.rows.slice(0, MAX_ROWS);
    } catch (error) {
      if (error.code === "57014") {
        throw new HttpError(408, "The query took too long and was stopped.");
      }

      if (isPostgresError(error)) {
        throw new SqlExecutionError(error.message, error.code);
      }

      throw error;
    } finally {
      await connection.end();
    }
  }
}
