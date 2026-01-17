import { NetworkEnvironment } from "@repo/ledger-core";

type Config = {
  networkEnv: NetworkEnvironment;
};

const networkEnv =
  process.env["NETWORK_ENV"] === "mainnet" ? NetworkEnvironment.MAINNET : NetworkEnvironment.TESTNET_PREVIEW;
export const CONFIG: Config = {
  networkEnv,
};
