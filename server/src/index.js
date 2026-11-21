// Python equivalent: running "uvicorn app.main:app"
//
// Starts the server. Run it with:  npm run dev
import { app } from "./app.js";
import { PORT } from "./config.js";

app.listen(PORT, () => {
  console.log(`DBSynaptix API running on http://localhost:${PORT}`);
});
