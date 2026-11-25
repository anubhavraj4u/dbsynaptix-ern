// Python original: app/sql/sql_validator.py
//
// The safety gate between Gemini and your database.
// IMPROVED vs the Python version:
//  - Keywords are matched as WHOLE WORDS, so a column such as "created_at" or
//    "updated_at" no longer triggers CREATE / UPDATE.
//  - Words inside 'string literals' and comments are ignored.
//  - Only ONE statement is allowed.
// (The executor adds a second layer: it runs in a read-only transaction.)
import { HttpError } from "../utils/errors.js";

const FORBIDDEN_KEYWORDS = [
  "DROP",
  "DELETE",
  "UPDATE",
  "INSERT",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "GRANT",
  "REVOKE",
];

// \b means "word boundary": it matches between a letter and a non-letter.
// "CREATE" matches in "CREATE TABLE" but not in "CREATED_AT".
const FORBIDDEN_PATTERN = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`, "i");

// Remove comments and the insides of 'quoted strings' before inspecting SQL.
function stripLiteralsAndComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block comments */
    .replace(/--[^\n]*/g, " ") //          -- line comments
    .replace(/'(?:[^']|'')*'/g, "''"); //  'text' -> ''
}

export class SqlValidator {
  validate(response) {
    const text = this.removeMarkdown(response);

    this.checkSchemaNotFound(text);
    this.checkForbiddenKeywords(text);

    const sql = this.extractSql(text);

    this.checkSelectStatement(sql);
    this.checkSingleStatement(sql);

    return sql;
  }

  // Remove ```sql fences.
  removeMarkdown(text) {
    return String(text ?? "")
      .replaceAll("```sql", "")
      .replaceAll("```", "")
      .trim();
  }

  // Throw away any explanation before the first line that starts with SELECT or WITH.
  extractSql(text) {
    const sqlLines = [];
    let foundSql = false;

    for (const line of text.split("\n")) {
      const stripped = line.trim();

      if (stripped === "") continue;

      const upper = stripped.toUpperCase();

      if (upper.startsWith("SELECT") || upper.startsWith("WITH")) {
        foundSql = true;
      }

      if (foundSql) {
        sqlLines.push(stripped);
      }
    }

    return sqlLines.join("\n").trim();
  }

  // The prompt tells Gemini to answer exactly SCHEMA_NOT_FOUND when the
  // schema can't answer the question.
  checkSchemaNotFound(text) {
    if (text.toUpperCase().includes("SCHEMA_NOT_FOUND")) {
      throw new HttpError(
        422,
        "Requested information is not available in the database schema."
      );
    }
  }

  checkForbiddenKeywords(sql) {
    const match = FORBIDDEN_PATTERN.exec(stripLiteralsAndComments(sql));

    if (match) {
      throw new HttpError(
        422,
        `Forbidden SQL statement detected: ${match[1].toUpperCase()}`
      );
    }
  }

  checkSelectStatement(sql) {
    const upper = sql.trim().toUpperCase();

    if (!(upper.startsWith("SELECT") || upper.startsWith("WITH"))) {
      throw new HttpError(422, "Only SELECT queries are allowed.");
    }
  }

  // One trailing ";" is fine. Any other ";" would mean a second statement.
  checkSingleStatement(sql) {
    const cleaned = stripLiteralsAndComments(sql).trim().replace(/;\s*$/, "");

    if (cleaned.includes(";")) {
      throw new HttpError(422, "Only one SQL statement is allowed.");
    }
  }
}
