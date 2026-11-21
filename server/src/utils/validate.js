// Python original: app/schemas/database.py  (DatabaseConnectionRequest)
//
// In Python, pydantic checked the incoming JSON for you automatically.
// Express does not, so we write a small function that does the same job.
import { HttpError } from "./errors.js";

export function validateConnectionRequest(body) {
  // The five fields every database request needs, and the type of each.
  const required = {
    host: "string",
    port: "number",
    database: "string",
    username: "string",
    password: "string",
  };

  if (body === null || typeof body !== "object") {
    throw new HttpError(422, "Request body must be a JSON object.");
  }

  for (const [field, type] of Object.entries(required)) {
    if (typeof body[field] !== type) {
      throw new HttpError(422, `Field "${field}" is required and must be a ${type}.`);
    }
  }

  // Return a clean object with only the five fields we expect.
  const { host, port, database, username, password } = body;
  return { host, port, database, username, password };
}
