// Python original: app/routers/query.py
import { Router } from "express";
import { IndexingService } from "../services/indexingService.js";
import { TextToSqlService } from "../services/textToSqlService.js";
import { validateQueryRequest } from "../utils/validate.js";

export const queryRouter = Router();

// POST /query  { question, database: { host, port, database, username, password } }
queryRouter.post("/", async (req, res) => {
  const { question, database } = validateQueryRequest(req.body);

  const indexingService = new IndexingService();
  const textToSqlService = new TextToSqlService();

  // Load the saved semantic index (404 if the database was never indexed).
  const documents = await indexingService.loadIndex(database);

  const result = await textToSqlService.answerQuestion({
    question,
    request: database,
    documents,
  });

  res.json(result);
});
