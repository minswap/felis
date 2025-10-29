import { NetworkEnvironment } from "@repo/ledger-core";

export namespace LendingMarket {
  const apiEndpoint = "http://localhost";

  export type PriceInAdaResponse = {
    price: string;
    assetA: string;
    assetB: string;
    lpAsset: string;
    datumReserves: [string, string];
    valueReserves: [string, string];
    totalLiquidity: string;
    tradingFee: {
      feeANumerator: string;
      feeBNumerator: string;
    };
    feeSharingNumerator?: string;
  };

  // 1 lovelace = ? MIN
  export const fetchAdaMinPrice = async (networkEnv: NetworkEnvironment): Promise<PriceInAdaResponse> => {
    const mapMINToken = {
      [NetworkEnvironment.MAINNET]: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6.4d494e",
      [NetworkEnvironment.TESTNET_PREPROD]: "16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed72.4d494e",
      [NetworkEnvironment.TESTNET_PREVIEW]: "919d4c2c9455016289341b1a14dedf697687af31751170d56a31466e.744d494e",
    }
    const path = `${apiEndpoint}/wallet/price-in-ada?asset=${mapMINToken[networkEnv]}`;
    const response = await fetch(path);
    const data = await response.json() as PriceInAdaResponse;
    return data;
  };
}
