import { getConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createApp } from "./app.js";

const config = getConfig();
const db = openDatabase(config.databasePath);
const app = createApp({ db, config, serveClient: config.isProduction });

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Vaultboard is running on http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
