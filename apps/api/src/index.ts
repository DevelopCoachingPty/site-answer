import { buildServer } from "./server.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { closeQueues } from "./lib/queue.js";

async function main() {
  const server = await buildServer();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info({ signal }, "Received shutdown signal");
      await server.close();
      await closeQueues();
      process.exit(0);
    });
  }

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      "SiteAnswer API server started",
    );
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }
}

main();
