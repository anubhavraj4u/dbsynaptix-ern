// Python original: app/database/schema_builder.py
//
// Merges columns + primary keys + foreign keys into one schema object:
//
// { orders: { columns: [...], primary_keys: [...], foreign_keys: [...] } }
//
// The key names stay snake_case (primary_keys, foreign_keys) on purpose, so
// the frontend and the saved index files keep the same shape as before.

export function createTableSchema(columns) {
  return {
    columns,
    primary_keys: [],
    foreign_keys: [],
  };
}

export function assembleSchema(columns, primaryKeys, foreignKeys) {
  const schema = {};

  // Python:  for table_name, table_columns in columns.items():
  for (const [tableName, tableColumns] of Object.entries(columns)) {
    schema[tableName] = createTableSchema(tableColumns);
  }

  for (const [tableName, keys] of Object.entries(primaryKeys)) {
    if (tableName in schema) {
      schema[tableName].primary_keys = keys;
    }
  }

  for (const [tableName, keys] of Object.entries(foreignKeys)) {
    if (tableName in schema) {
      schema[tableName].foreign_keys = keys;
    }
  }

  return schema;
}
