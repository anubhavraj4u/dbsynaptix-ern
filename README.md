# DBSynaptix

Ask a question about your PostgreSQL database in plain English. DBSynaptix finds the relevant tables, asks Gemini to write a safe SELECT, runs it, and shows you the rows.

This repository is the **ERN version** of the project: **E**xpress, **R**eact, **N**ode, with **P**ostgreSQL as the database.

## How it works

1. **Index (once per database).** Read the schema, ask Gemini to describe every table, turn each table into a text document, embed the documents, and save the index.
2. **Ask (every question).** Retrieve the best tables (keywords + embeddings), add their foreign-key neighbours, build a prompt, let Gemini write SQL, validate it, run it, and repair it once if Postgres rejects it.

## Repository layout

```
server/   Express API (Node.js)
client/   React app (Vite)
```

## Build log

The project is built in stages. Each stage is one commit and one git tag.

| Tag | What it adds |
|-----|--------------|
| `stage-0` | Repository structure |
| `stage-1` | Express server, Postgres connection, schema reading |
| `stage-2` | Gemini, knowledge builder, documents, embeddings, indexing endpoint |
| `stage-3` | Retrieval, SQL validation, execution, repair, query endpoint |
| `stage-4` | Tests and benchmark scripts |
| `stage-5` | React frontend |
| `stage-6` | Docker Compose and GitHub Actions |
| `stage-7` | Deployment |

## License

MIT
