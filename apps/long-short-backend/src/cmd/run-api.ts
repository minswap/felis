import { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { createApiServer } from "../api/server";
import { loadMarketConfigs } from "../config/market";
import type { DB } from "../database";
import { newKyselyClient } from "../database/postgres";
import { CardanoscanProvider } from "../provider";
import { logger } from "../utils";

const API_PORT = Number(process.env.API_PORT) || 9999;
const API_HOST = process.env.API_HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL;
const NETWORK = process.env.NETWORK || "mainnet";
const CARDANOSCAN_API_KEY = process.env.CARDANOSCAN_API_KEY;

async function main() {
  // Validate environment
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  if (!CARDANOSCAN_API_KEY) {
    throw new Error("CARDANOSCAN_API_KEY environment variable is required");
  }

  // Parse network environment
  const networkEnv = NETWORK === "mainnet" ? NetworkEnvironment.MAINNET : NetworkEnvironment.TESTNET_PREVIEW;
  logger.info(`Network environment: ${NETWORK}`);

  logger.info("Loading WASM modules...");
  await RustModule.load();
  logger.info("WASM modules loaded");

  // Connect to database
  logger.info("Connecting to database...");
  const db = await newKyselyClient<DB>(DATABASE_URL, { logSQL: false });
  logger.info("Database connected");

  // Load market configs from database
  logger.info("Loading market configs...");
  const marketConfigs = await loadMarketConfigs(db);
  logger.info(`Loaded ${marketConfigs.size} market configs`);

  // Create Cardanoscan provider
  const cardanoScanBaseUrl =
    networkEnv === NetworkEnvironment.MAINNET ? CardanoscanProvider.MAINNET_URL : CardanoscanProvider.PREVIEW_URL;
  const cardanoscanProvider = new CardanoscanProvider(cardanoScanBaseUrl, CARDANOSCAN_API_KEY);

  // Start API server
  logger.info("Starting API server...");
  await createApiServer({
    port: API_PORT,
    host: API_HOST,
    db,
    networkEnv,
    cardanoscanProvider,
  });

  logger.info("Long-Short Backend started successfully", {
    port: API_PORT,
    host: API_HOST,
    network: NETWORK,
  });
}

main().catch((error) => {
  logger.error("Failed to start application", { error });
  process.exit(1);
});
