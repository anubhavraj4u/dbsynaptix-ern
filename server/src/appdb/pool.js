// New in the Node version (Python kept the index in a JSON file).
//
// The semantic index now lives in a table in the app's own Postgres database,
// so it survives server restarts and redeploys. A "Pool" keeps a few
// connections open and reuses them, which is faster than opening a new
// connection for every request.
import pg from "pg";
import "../config.js"; // makes sure the .env file has been read
import { HttpError } from "../utils/errors.js";

let pool = null;

export function getAppPool() {
  if (pool === null) {
    const url = process.env.APP_DATABASE_URL;

    if (!url) {
      throw new HttpError(
        500,
        "APP_DATABASE_URL is not set. Add it to your .env file."
      );
    }

    pool = new pg.Pool({ connectionString: url });
  }

  return pool;
}

export async function closeAppPool() {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
