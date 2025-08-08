import { NetworkEnvironment } from "./network-id";

export const TIME_SLOT_MAGIC: Record<NetworkEnvironment, number> = {
  [NetworkEnvironment.MAINNET]: 1591566291,
  [NetworkEnvironment.TESTNET_PREPROD]: 1655683200,
  [NetworkEnvironment.TESTNET_PREVIEW]: 1660003200,
};

// only for Shelley era onwards (1 slot = 1s)
export function getTimeFromSlotMagic(network: NetworkEnvironment, slot: number): Date {
  return new Date((TIME_SLOT_MAGIC[network] + slot) * 1000);
}

// only for Shelley era onwards (1 slot = 1s)
export function getSlotFromTimeMagic(network: NetworkEnvironment, time: Date): number {
  return Math.trunc(time.getTime() / 1000) - TIME_SLOT_MAGIC[network];
}
