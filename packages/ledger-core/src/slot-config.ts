import { Duration } from "@repo/ledger-utils";
import { NetworkEnvironment } from "./network-id";

// Default timeout for txs in ms (to set TTL field)
export const DEFAULT_TIMEOUT = Duration.newHours(3);

export type SlotConfig = {
  zeroTime: string;
  zeroSlot: string;
  slotLength: number;
};

export function getSlotConfig(networkEnvironment: NetworkEnvironment): SlotConfig {
  switch (networkEnvironment) {
    case NetworkEnvironment.MAINNET: {
      return {
        zeroTime: "1596059091000",
        zeroSlot: "4492800",
        slotLength: 1000,
      };
    }
    case NetworkEnvironment.TESTNET_PREPROD: {
      return {
        zeroTime: "1655769600000",
        zeroSlot: "86400",
        slotLength: 1000,
      };
    }
    case NetworkEnvironment.TESTNET_PREVIEW: {
      return {
        zeroTime: "1666656000000",
        zeroSlot: "0",
        slotLength: 1000,
      };
    }
  }
}
