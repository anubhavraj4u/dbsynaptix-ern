# DBSynaptix server (Express + Node)

## Setup

You need Node.js 20 or newer and a PostgreSQL server.

1. Create an empty database for the app's own data (the semantic index):

   ```
   createdb dbsynaptix
   ```
   (or create a database called `dbsynaptix` in pgAdmin)

2. Install and configure:

   ```
   npm install
   cp .env.example .env
   ```
   Open `.env` and set `APP_DATABASE_URL` (password and port for your Postgres) and `GEMINI_API_KEY`
   (get a key at https://aistudio.google.com/apikey).

3. Start the server:

   ```
   npm run dev
   ```
   Open http://localhost:8000/health

## Try the indexing endpoint

Replace the values with a database you want to ask questions about:

```
curl -X POST http://localhost:8000/database/index -H "Content-Type: application/json" -d '{"host":"localhost","port":5432,"database":"yourdb","username":"postgres","password":"yourpassword"}'
```

First call: Gemini describes every table (slow) and the index is saved. Second call: `"reused": true`, instant.

## Ask a question

After the database is indexed (previous step), ask in plain English:

```
curl -X POST http://localhost:8000/query -H "Content-Type: application/json" -d '{"question":"List all customers from Germany","database":{"host":"localhost","port":5432,"database":"yourdb","username":"postgres","password":"yourpassword"}}'
```

The reply contains the generated `sql`, the `results` rows, token counts and a `timings` breakdown.
If PostgreSQL rejects the first SQL, it is repaired once (`repair_attempted` / `repair_successful`).

Error replies are JSON like `{"detail": "..."}`:

| Status | Meaning |
|--------|---------|
| 400 | Could not connect, or the SQL still failed after one repair |
| 404 | This database has not been indexed yet |
| 408 | The query took longer than 15 seconds |
| 422 | Bad request, the schema cannot answer the question, or the SQL was not a safe single SELECT |

## Tests

They need PostgreSQL but not a Gemini key (Gemini is faked in the tests).

```
# macOS/Linux/Git Bash
TEST_DB_PASSWORD=yourpassword npm test
# Windows PowerShell
$env:TEST_DB_PASSWORD="yourpassword"
npm test
```
Optional: TEST_DB_HOST, TEST_DB_PORT, TEST_DB_NAME, TEST_DB_USER.

## Python to Node file map

| Python | Node |
|--------|------|
| `app/main.py` | `src/app.js`, `src/index.js` |
| `app/config.py` | `src/config.js` |
| `app/schemas/*` (pydantic) | `src/utils/validate.js`, `src/utils/apiResponse.js`, `src/utils/errors.js` |
| `app/database/connection.py` | `src/database/connection.js` |
| `app/database/schema_builder.py` | `src/database/schemaBuilder.js` |
| `app/services/database_service.py` | `src/services/databaseService.js` |
| `app/routers/database.py` | `src/routes/database.js` |
| `app/ai/provider.py` | `src/ai/provider.js` |
| `app/knowledge/prompts.py`, `knowledge_builder.py`, `models.py` | `src/knowledge/prompts.js`, `knowledgeBuilder.js` |
| `app/indexing/document_builder.py` | `src/indexing/documentBuilder.js` |
| `app/indexing/embedding_builder.py` | `src/indexing/embeddingBuilder.js` |
| `app/indexing/index_store.py` (JSON file) | `src/indexing/indexStore.js` (Postgres table) + `src/appdb/pool.js` |
| `app/services/indexing_service.py` | `src/services/indexingService.js` |
| `app/ai/preprocessing.py` | `src/ai/preprocessing.js` |
| `app/ai/similarity.py` | `src/ai/similarity.js` |
| `app/ai/retrieval.py` | `src/ai/retrieval.js` |
| `app/context/context_builder.py` | `src/context/contextBuilder.js` |
| `app/sql/prompt_builder.py` | `src/sql/promptBuilder.js` |
| `app/sql/sql_validator.py` | `src/sql/sqlValidator.js` (fixed: whole-word matching, one statement only) |
| `app/sql/sql_executor.py` | `src/sql/sqlExecutor.js` (read-only transaction, 15 s limit, 1000 rows max) |
| `app/sql/sql_repair.py` | `src/sql/sqlRepair.js` |
| `app/services/text_to_sql_service.py` | `src/services/textToSqlService.js` |
| `app/routers/query.py` | `src/routes/query.js` |
