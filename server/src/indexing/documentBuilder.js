// Python original: app/indexing/document_builder.py
//
// Turns schema + knowledge into one text document per table. That text is
// (a) embedded for semantic search and (b) pasted into the SQL prompt later.
//
// A document is a plain object with four keys:
//   table, structured (the raw schema), text, embedding (null for now)

export class DocumentBuilder {
  build(schema, knowledgeStore) {
    const documents = [];

    for (const [tableName, tableSchema] of Object.entries(schema)) {
      const knowledge = knowledgeStore[tableName];
      documents.push(this.buildTableDocument(tableName, tableSchema, knowledge));
    }

    return documents;
  }

  buildTableDocument(tableName, tableSchema, knowledge) {
    const lines = [];

    lines.push("=".repeat(60)); // Python: "=" * 60
    lines.push(`TABLE: ${tableName.toUpperCase()}`);
    lines.push("=".repeat(60));
    lines.push("");
    lines.push("SUMMARY");
    lines.push("");
    lines.push(knowledge.summary);
    lines.push("");
    lines.push("BUSINESS TERMS");
    lines.push("");

    for (const term of knowledge.business_terms) {
      lines.push(`- ${term}`);
    }

    lines.push("");

    lines.push("Columns:");

    for (const column of tableSchema.columns) {
      lines.push(`- ${column.name} (${column.type})`);

      // Python: knowledge.column_descriptions.get(name, "")
      const description = knowledge.column_descriptions[column.name] ?? "";

      if (description) {
        lines.push(`  ${description}`);
      }
    }

    lines.push("");

    lines.push("Primary Keys:");

    if (tableSchema.primary_keys.length > 0) {
      for (const key of tableSchema.primary_keys) {
        lines.push(`- ${key}`);
      }
    } else {
      lines.push("None");
    }

    lines.push("");

    lines.push("FOREIGN KEYS:");

    if (tableSchema.foreign_keys.length > 0) {
      for (const fk of tableSchema.foreign_keys) {
        lines.push(this.describeForeignKey(fk));
      }
    } else {
      lines.push("None");
    }

    lines.push("");

    lines.push("EXAMPLE QUESTIONS");
    lines.push("");

    for (const query of knowledge.sample_queries) {
      lines.push(`- ${query}`);
    }

    return {
      table: tableName,
      structured: tableSchema,
      text: lines.join("\n"),
      embedding: null,
    };
  }

  describeForeignKey(fk) {
    return (
      `- ${fk.column} references ` +
      `${fk.references.table}.${fk.references.column}.`
    );
  }
}
