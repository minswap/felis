import { NetworkEnvironment } from "@repo/ledger-core";

export namespace LendingMarket {
  // 1 lovelace = ? MIN
  export const fetchAdaMinPrice = async (networkEnv: NetworkEnvironment): Promise<bigint> => {
    // Placeholder implementation - replace with actual API call
    return 0n;
  };
}
