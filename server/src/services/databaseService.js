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
    let connection;

    try {
      connection = await this.getConnection(request);
    } catch (error) {
      // Python caught psycopg's OperationalError in the router and returned
      // HTTP 400. Here any failure to connect becomes the same 400 message.
      throw new HttpError(
        400,
        "Unable to connect to database. Check your connection details."
      );
    }

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
  async getConnection(request) {
    return createConnection(request);
  }
}
