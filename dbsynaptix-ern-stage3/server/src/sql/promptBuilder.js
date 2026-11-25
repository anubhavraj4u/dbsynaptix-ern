// Python original: app/sql/prompt_builder.py
//
// Builds the prompt sent to Gemini to WRITE the SQL:
//   role + rules + the question + the text of every selected table.

export class PromptBuilder {
  build(question, documents) {
    const lines = [];

    lines.push("You are an expert PostgreSQL database engineer.");
    lines.push(
      "Your job is to convert natural language questions into valid PostgreSQL SQL queries."
    );
    lines.push("");

    lines.push("IMPORTANT RULES");
    lines.push("------");
    lines.push(
      "1. Return ONLY SQL. Generate SQL that fully answers the user's question. If multiple entities are mentioned (e.g. customers and products), include information about all of them whenever appropriate."
    );
    lines.push("2. Do NOT explain your reasoning.");
    lines.push("3. Do NOT use markdown.");
    lines.push("4. Do NOT wrap SQL inside ```.");
    lines.push("5. Use ONLY tables and columns provided.");
    lines.push("6. Never invent schema.");
    lines.push("7. Generate PostgreSQL compatible SQL.");
    lines.push(
      "8. If the requested information cannot be answered using the provided schema, return exactly: SCHEMA_NOT_FOUND"
    );
    lines.push("9. Prefer JOINs using the provided foreign key relationships.");
    lines.push("10. Select only the columns required to answer the question.");
    lines.push("");

    lines.push("=".repeat(70));
    lines.push("USER QUESTION");
    lines.push("=".repeat(70));
    lines.push(question);
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

    lines.push("Generate ONLY the SQL query.");

    return lines.join("\n");
  }
}
