import { RustModule } from "@minswap/felis-ledger-utils";
import { createApiServer } from "./api/server";
import { loadMarketConfigs } from "./config/market";
import { newKyselyClient } from "./database/postgres";
import type { DB } from "./database";
import { logger } from "./utils";

const API_PORT = Number(process.env.API_PORT) || 9999;
const API_HOST = process.env.API_HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  // Validate environment
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Load WASM modules
  logger.info("Loading WASM modules...");
  await RustModule.load();
  logger.info("WASM modules loaded");

  // Connect to database
  logger.info("Connecting to database...");
  const db = await newKyselyClient<DB>(DATABASE_URL);
  logger.info("Database connected");

  // Load market configs from database
  logger.info("Loading market configs...");
  const marketConfigs = await loadMarketConfigs(db);
  logger.info(`Loaded ${marketConfigs.size} market configs`);

  // Start API server
  logger.info("Starting API server...");
  await createApiServer({
    port: API_PORT,
    host: API_HOST,
    db,
  });

  logger.info("Long-Short Backend started successfully", {
    port: API_PORT,
    host: API_HOST,
  });
}

main().catch((error) => {
  logger.error("Failed to start application", { error });
  process.exit(1);
});
