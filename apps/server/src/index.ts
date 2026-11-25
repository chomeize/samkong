import { loadConfig } from "./config.js";
import { createGameServer } from "./server.js";

const config = loadConfig();
const server = createGameServer(config);
const port = await server.listen();
console.log(`3 กอง server listening on :${port} (CORS: ${config.corsOrigins === true ? "any origin (dev)" : config.corsOrigins.join(", ")})`);

const shutdown = () => {
  console.log("Shutting down…");
  void server.close().then(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
