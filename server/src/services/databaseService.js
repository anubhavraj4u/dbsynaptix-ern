// Python original: app/services/database_service.py
//
// A class, exactly like the Python one. `this` in JavaScript is the same
// idea as `self` in Python.
import {
  createConnection,
  getColumns,
  getPrimaryKeys,
  getForeignKeys,
} from "../database/connection.js";
import { assembleSchema } from "../database/schemaBuilder.js";
import { apiResponse } from "../utils/apiResponse.js";
import { HttpError } from "../utils/errors.js";

export class DatabaseService {
  async connect(request) {
    const connection = await this.getConnection(request);

    await connection.end(); // close the connection

    return apiResponse(true, "Database connection successful");
  }

  async getSchema(request) {
    const connection = await this.getConnection(request);

    try {
      const columns = await getColumns(connection);
      const primaryKeys = await getPrimaryKeys(connection);
      const foreignKeys = await getForeignKeys(connection);

      const schema = assembleSchema(columns, primaryKeys, foreignKeys);

      return apiResponse(true, "Schema retrieved successfully", schema);
    } finally {
      // Runs even if a query above throws, so connections never leak.
      await connection.end();
    }
  }

  // The single place that creates connections. The SQL executor will reuse it.
  // Python turned psycopg's OperationalError into HTTP 400 in the router.
  // Here ANY failure to connect (wrong password, host down, bad database name)
  // becomes the same 400 message, for every route that connects.
  async getConnection(request) {
    try {
      return await createConnection(request);
    } catch (error) {
      throw new HttpError(
        400,
        "Unable to connect to database. Check your connection details."
      );
    }
  }
}
