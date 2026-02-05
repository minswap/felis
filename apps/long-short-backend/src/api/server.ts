import cors from "@fastify/cors";
import type { NetworkEnvironment } from "@minswap/felis-ledger-core";
import Fastify, { type FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { API_ENDPOINTS } from "../constants";
import type { DB } from "../database";
import type { CardanoscanProvider } from "../provider";
import { PositionService } from "../services/position-service";
import { logger } from "../utils";
import { registerMetadataRoutes } from "./routes/metadata";
import { registerPositionRoutes } from "./routes/position";

export type ApiServerOptions = {
  port: number;
  host: string;
  db: Kysely<DB>;
  cardanoscanProvider: CardanoscanProvider;
  networkEnv: NetworkEnvironment;
};

export async function createApiServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const { port, host, db, networkEnv, cardanoscanProvider } = options;

  const fastify = Fastify({
    logger: {
      level: "info",
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  // Health check endpoint (disable logging to reduce noise)
  fastify.get(API_ENDPOINTS.HEALTH, { logLevel: "silent" }, async () => {
    return { status: "ok" };
  });

  // Create services
  const positionService = new PositionService(db, networkEnv, cardanoscanProvider);

  // Register routes
  registerMetadataRoutes(fastify);
  registerPositionRoutes(fastify, positionService);

  // Start server
  try {
    await fastify.listen({ port, host });
    logger.info(`API server listening on ${host}:${port}`);
  } catch (err) {
    logger.error("Failed to start API server", { error: err });
    throw err;
  }

  return fastify;
}
