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

// Python original: app/schemas/query.py  (QueryRequest)
// A question plus the database login.
const MAX_QUESTION_LENGTH = 2000;

export function validateQueryRequest(body) {
  if (body === null || typeof body !== "object") {
    throw new HttpError(422, "Request body must be a JSON object.");
  }

  if (typeof body.question !== "string" || body.question.trim() === "") {
    throw new HttpError(422, 'Field "question" is required and must be text.');
  }

  if (body.question.length > MAX_QUESTION_LENGTH) {
    throw new HttpError(422, `The question is too long (maximum ${MAX_QUESTION_LENGTH} characters).`);
  }

  if (body.database === null || typeof body.database !== "object") {
    throw new HttpError(422, 'Field "database" is required.');
  }

  return {
    question: body.question.trim(),
    database: validateConnectionRequest(body.database),
  };
}
