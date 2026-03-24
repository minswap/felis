import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { NetworkEnvironment } from "@minswap/felis-ledger-core";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { API_ENDPOINTS } from "../constants";
import type { DB } from "../database";
import { type CardanoscanProvider, MinswapAggregatorProvider } from "../provider";
import { PositionService } from "../services/position-service";
import { logger } from "../utils";
import { registerLiqwidRoutes } from "./routes/liqwid";
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
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API-only server
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1"],
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  // Global error handler
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Validation errors (schema validation failures)
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: error.message,
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: "Too many requests, please try again later",
      });
    }

    // Log unexpected errors
    request.log.error({ err: error, url: request.url, method: request.method }, "Unhandled error");

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.status(statusCode).send({
      success: false,
      error: statusCode >= 500 ? "Internal server error" : error.message,
    });
  });

  // Health check endpoint (disable logging to reduce noise)
  fastify.get(API_ENDPOINTS.HEALTH, { logLevel: "silent", config: { rateLimit: false } }, async () => {
    return { status: "ok" };
  });

  // Create services
  const aggregatorProvider = new MinswapAggregatorProvider(networkEnv);
  const positionService = new PositionService(db, networkEnv, cardanoscanProvider, aggregatorProvider);

  // Register routes
  registerLiqwidRoutes(fastify, networkEnv);
  registerMetadataRoutes(fastify, networkEnv);
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
