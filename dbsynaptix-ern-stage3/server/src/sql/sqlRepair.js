// Python original: app/sql/sql_repair.py
//
// Builds the prompt for the ONE retry when PostgreSQL rejects the first SQL.
// (The Python file also had a repair() method that nothing used. Dropped.)

export class SqlRepair {
  buildPrompt(question, failedSql, error, documents) {
    const lines = [];

    lines.push("You are an expert PostgreSQL database engineer.");
    lines.push("A previously generated SQL query failed during execution.");
    lines.push(
      "Your job is to repair the SQL query using the database error and provided schema."
    );
    lines.push("");

    lines.push("IMPORTANT RULES");
    lines.push("------");
    lines.push("1. Return ONLY the corrected SQL query.");
    lines.push("2. Do NOT explain your reasoning.");
    lines.push("3. Do NOT use markdown.");
    lines.push("4. Do NOT wrap SQL inside ```.");
    lines.push("5. Use ONLY tables and columns provided in the schema.");
    lines.push("6. Never invent tables or columns.");
    lines.push("7. Generate PostgreSQL compatible SQL.");
    lines.push("8. Preserve the intent of the original user question.");
    lines.push("9. Use the database error to identify what was wrong with the failed query.");
    lines.push("10. Prefer JOINs using the provided foreign key relationships.");
    lines.push(
      "11. If the question cannot be answered using the provided schema, return exactly: SCHEMA_NOT_FOUND"
    );
    lines.push("");

    lines.push("=".repeat(70));
    lines.push("ORIGINAL USER QUESTION");
    lines.push("=".repeat(70));
    lines.push(question);
    lines.push("");

    lines.push("=".repeat(70));
    lines.push("FAILED SQL");
    lines.push("=".repeat(70));
    lines.push(failedSql);
    lines.push("");

    lines.push("=".repeat(70));
    lines.push("DATABASE ERROR");
    lines.push("=".repeat(70));
    lines.push(String(error?.message ?? error));
    lines.push("");

    lines.push("=".repeat(70));
    lines.push("RETRIEVED DATABASE SCHEMA");
    lines.push("=".repeat(70));

    for (const document of documents) {
      lines.push(document.text);
      lines.push("");
      lines.push("-".repeat(70));
      lines.push("");
    }

    lines.push("Generate ONLY the corrected SQL query.");

    return lines.join("\n");
  }
}
