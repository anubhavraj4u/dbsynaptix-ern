// Python original: app/knowledge/prompts.py
//
// The prompt that makes Gemini "understand" one table.
// Backticks (`...`) make a template string: ${value} is filled in, like an
// f-string in Python. Unlike Python f-strings, curly braces on their own
// ({ and }) are fine here, only "${" starts a placeholder.

export function buildKnowledgePrompt(tableName, tableSchema) {
  const schema = JSON.stringify(tableSchema, null, 4);

  return `
You are an expert database architect.

Your task is to understand a database table and generate
structured semantic knowledge.

Table Name:
${tableName}

Schema:
${schema}

Generate ONLY valid JSON.

Return this exact format:

{
    "summary": "...",

    "business_terms": [
        "...",
        "..."
    ],

    "column_descriptions": {
        "column_name": "..."
    },

    "sample_queries": [
        "...",
        "..."
    ]
}

Rules:

1. summary should describe the business purpose of the table.

2. business_terms should contain common business words
related to the table. Return individual business terms. Do not return phrases. Each term should be one word whenever possible. Return only domain/business concepts that uniquely identify the table. Avoid generic database terms or concepts belonging to related tables.

3. column_descriptions should explain every important column.

4. sample_queries should contain natural language questions
that an end user would ask. Do NOT generate SQL.

Examples:

- Show total revenue.
- Find recent orders.
- List customer purchases.

Return JSON only.

Do NOT include markdown.

Do NOT explain your answer.
`;
}
