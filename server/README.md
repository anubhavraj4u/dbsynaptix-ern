# DBSynaptix server (Express + Node)

## Run

```
cd server
npm install
cp .env.example .env      # on Windows: copy .env.example .env
npm run dev               # http://localhost:8000/health
```

## Run the tests

They need a PostgreSQL server and create two tiny temporary tables.

```
# macOS/Linux
TEST_DB_PASSWORD=yourpassword npm test
# Windows PowerShell
$env:TEST_DB_PASSWORD="yourpassword"; npm test
```
Optional: TEST_DB_HOST, TEST_DB_PORT, TEST_DB_NAME, TEST_DB_USER.

## Python to Node file map (Stage 1)

| Python | Node |
|--------|------|
| `app/main.py` | `src/app.js` (the app) and `src/index.js` (starts the server) |
| `app/config.py` | `src/config.js` |
| `app/schemas/database.py` (pydantic) | `src/utils/validate.js` |
| `app/schemas/response.py` | `src/utils/apiResponse.js` |
| `HTTPException` | `src/utils/errors.js` |
| `app/database/connection.py` | `src/database/connection.js` |
| `app/database/schema_builder.py` | `src/database/schemaBuilder.js` |
| `app/services/database_service.py` | `src/services/databaseService.js` |
| `app/routers/database.py` | `src/routes/database.js` |
