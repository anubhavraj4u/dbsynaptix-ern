// Python original: app/main.py
//
// Builds the Express app but does NOT start listening. Keeping this separate
// from index.js lets the tests use the app without opening a real port.
import express from "express";
import cors from "cors";
import { FRONTEND_URL } from "./config.js";
import { databaseRouter } from "./routes/database.js";
import { HttpError } from "./utils/errors.js";

export const app = express();

// CORS: let the React app (port 5173 with Vite) call this API (port 8000).
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...(FRONTEND_URL ? [FRONTEND_URL] : []),
    ],
    credentials: true,
  })
);

// Reads the JSON body of requests and puts it on req.body.
// FastAPI did this for you automatically.
app.use(express.json());

// Python: app.include_router(database_router)
app.use("/database", databaseRouter);

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Error handler: Express recognises it by its FOUR parameters.
// Any error thrown in a route ends up here (Express 5 catches errors from
// async routes automatically).
app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ detail: error.detail });
  }

  // express.json() throws this when the body is not valid JSON.
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ detail: "Request body is not valid JSON." });
  }

  console.error(error);
  res.status(500).json({ detail: "Internal server error." });
});
