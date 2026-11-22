// Python original: app/routers/database.py
//
// A Router is a mini-app that groups related URLs. app.js mounts this one
// under "/database", so router.post("/connect") answers POST /database/connect.
//
// Python:  @router.post("/connect")
//          def connect_database(request: DatabaseConnectionRequest): ...
// Node:    router.post("/connect", async (req, res) => { ... })
//
// (req, res) = the request coming in and the response going out.
import { Router } from "express";
import { DatabaseService } from "../services/databaseService.js";
import { IndexingService } from "../services/indexingService.js";
import { apiResponse } from "../utils/apiResponse.js";
import { validateConnectionRequest } from "../utils/validate.js";

export const databaseRouter = Router();

databaseRouter.post("/connect", async (req, res) => {
  const request = validateConnectionRequest(req.body);
  const service = new DatabaseService();

  res.json(await service.connect(request));
});

databaseRouter.post("/schema", async (req, res) => {
  const request = validateConnectionRequest(req.body);
  const service = new DatabaseService();

  res.json(await service.getSchema(request));
});

// POST /database/index: the slow, one-time step. If this database was already
// indexed, the saved index is reused and Gemini is not called again.
databaseRouter.post("/index", async (req, res) => {
  const request = validateConnectionRequest(req.body);
  const indexingService = new IndexingService();

  if (await indexingService.indexExists(request)) {
    const documents = await indexingService.loadIndex(request);

    return res.json(
      apiResponse(true, "Existing database index loaded", {
        indexed_tables: documents.length,
        reused: true,
      })
    );
  }

  const documents = await indexingService.buildIndex(request);

  res.json(
    apiResponse(true, "Database indexed successfully", {
      indexed_tables: documents.length,
      reused: false,
    })
  );
});
