// Python original: app/config.py
//
// dotenv reads your .env file and copies each line into process.env.
// process.env is Node's version of Python's os.environ / os.getenv.
import dotenv from "dotenv";

dotenv.config({ quiet: true }); // quiet: no startup message

// Python:  GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Python:  int(os.getenv("DB_PORT", "5432"))
// "??" means "use the right side if the left side is missing".
export const PORT = Number(process.env.PORT ?? 8000);
export const FRONTEND_URL = process.env.FRONTEND_URL;

// Default database, only for helper scripts. The real app takes the
// database login from each request instead.
export const DB_HOST = process.env.DB_HOST ?? "localhost";
export const DB_PORT = Number(process.env.DB_PORT ?? 5432);
export const DB_NAME = process.env.DB_NAME ?? "postgres";
export const DB_USER = process.env.DB_USER ?? "postgres";
export const DB_PASSWORD = process.env.DB_PASSWORD;
