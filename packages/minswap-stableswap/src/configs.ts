import {
  Address,
  Asset,
  Bytes,
  type NetworkEnvironment,
  NetworkID,
  networkEnvironmentToNetworkID,
  PlutusVersion,
  RewardAddress,
  TxOut,
  Utxo,
  Value,
  NetworkEnvironment as NetworkEnv,
  ADA,
} from "@minswap/felis-ledger-core";
import { Maybe, Result } from "@minswap/felis-ledger-utils";
import mainnetRawReferencesScripts from "./scripts/mainnet/references-script.json";
import mainnetRawScripts from "./scripts/mainnet/stableswap-script.json";
import testnetRawReferencesScripts from "./scripts/testnet/references-script.json";
import testnetRawScripts from "./scripts/testnet/stableswap-script.json";

export type RawStableswapReferencesScript = {
  orderRef: string;
  poolRef: string;
  lpRef: string;
  orderBatchingRef: string;
};

export type StableswapReferencesScript = {
  orderRef: Utxo;
  poolRef: Utxo;
  lpRef: Utxo;
  orderBatchingRef: Utxo;
};

export type RawStableswapPoolConfig = {
  key: string;
  orderScript: string;
  poolScript: string;
  lpScript: string;
  orderBatchingScript: string;
  orderAddress: string;
  poolAddress: string;
  orderBatchingAddress: string;
  licenseSymbol: string;
  adminAsset: string;
  nftAsset: string;
  lpAsset: string;
  assets: string[];
  multiples: string[];
  fee: string;
  adminFee: string;
  feeDenominator: string;
};

export type StableswapPoolConfig = {
  key: string;
  orderScript: string;
  poolScript: string;
  lpScript: string;
  orderBatchingScript: string;
  orderAddress: Address;
  poolAddress: Address;
  orderBatchingAddress: RewardAddress;
  licenseSymbol: Bytes;
  adminAsset: Asset;
  nftAsset: Asset;
  lpAsset: Asset;
  assets: Asset[];
  multiples: bigint[];
  fee: bigint;
  adminFee: bigint;
  feeDenominator: bigint;
};

export const STABLESWAP_INIT_TIME: Record<NetworkEnvironment, Date> = {
  [NetworkEnv.MAINNET]: new Date("2024-04-08T08:41:01.0000Z"),
  [NetworkEnv.TESTNET_PREPROD]: new Date("2024-01-15T04:51:45.0000Z"),
  [NetworkEnv.TESTNET_PREVIEW]: new Date("2024-01-15T00:00:00.0000Z"),
};

export let stablePoolTestnetConfigs: Record<string, StableswapPoolConfig> | undefined = undefined;
export let stablePoolMainnetConfigs: Record<string, StableswapPoolConfig> | undefined = undefined;
export let stableswapTestnetRefScripts: Record<string, StableswapReferencesScript> | undefined = undefined;
export let stableswapMainnetRefScripts: Record<string, StableswapReferencesScript> | undefined = undefined;
export let stableswapPoolAddressSetTestnet: Set<string> | undefined = undefined;
export let stableswapPoolAddressSetMainnet: Set<string> | undefined = undefined;
export let stableswapOrderAddressSetTestnet: Set<string> | undefined = undefined;
export let stableswapOrderAddressSetMainnet: Set<string> | undefined = undefined;

function deserializeRawPoolConfig(rawConfig: RawStableswapPoolConfig): StableswapPoolConfig {
  return {
    key: rawConfig.key,
    orderScript: rawConfig.orderScript,
    poolScript: rawConfig.poolScript,
    lpScript: rawConfig.lpScript,
    orderBatchingScript: rawConfig.orderBatchingScript,
    orderAddress: Address.fromBech32(rawConfig.orderAddress),
    poolAddress: Address.fromBech32(rawConfig.poolAddress),
    orderBatchingAddress: RewardAddress.fromBech32(rawConfig.orderBatchingAddress),
    licenseSymbol: Bytes.fromHex(rawConfig.licenseSymbol),
    adminAsset: Asset.fromString(rawConfig.adminAsset),
    nftAsset: Asset.fromString(rawConfig.nftAsset),
    lpAsset: Asset.fromString(rawConfig.lpAsset),
    assets: rawConfig.assets.map(Asset.fromString),
    multiples: rawConfig.multiples.map((m) => BigInt(m)),
    fee: BigInt(rawConfig.fee),
    adminFee: BigInt(rawConfig.adminFee),
    feeDenominator: BigInt(rawConfig.feeDenominator),
  };
}

export function getStableswapPoolConfigs(networkEnvironment: NetworkEnvironment): Record<string, StableswapPoolConfig> {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.MAINNET: {
      if (stablePoolMainnetConfigs) {
        return stablePoolMainnetConfigs;
      }
      const rawConfigs: RawStableswapPoolConfig[] = JSON.parse(JSON.stringify(mainnetRawScripts));
      stablePoolMainnetConfigs = {};
      for (const rawConfig of rawConfigs) {
        stablePoolMainnetConfigs[rawConfig.key] = deserializeRawPoolConfig(rawConfig);
      }
      return stablePoolMainnetConfigs;
    }
    case NetworkID.TESTNET: {
      if (stablePoolTestnetConfigs) {
        return stablePoolTestnetConfigs;
      }
      const rawConfigs: RawStableswapPoolConfig[] = JSON.parse(JSON.stringify(testnetRawScripts));
      stablePoolTestnetConfigs = {};
      for (const rawConfig of rawConfigs) {
        stablePoolTestnetConfigs[rawConfig.key] = deserializeRawPoolConfig(rawConfig);
      }
      return stablePoolTestnetConfigs;
    }
  }
}

/**
 * This function uses for test suite in order to mock Stableswap References Script.
 * PLEASE NOT USE THIS FUNCTION ON PRODUCTION
 */
export function _useDummyStableswapRefScripts(networkEnvironment: NetworkEnvironment): void {
  const configs = getStableswapPoolConfigs(networkEnvironment);
  const addr = Address.fromBech32("addr_test1vzztre5epvtj5p72sh28nvrs3e6s4xxn95f66cvg0sqsk7qd3mah0");
  let i = 0;
  stableswapTestnetRefScripts = {};
  stableswapMainnetRefScripts = {};
  for (const [key, cfg] of Object.entries(configs)) {
    const refs = {
      lpRef: {
        input: {
          txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
          index: i,
        },
        output: new TxOut(addr, new Value().add(ADA, 100_000_000n), undefined, {
          plutusVersion: PlutusVersion.V2,
          script: Bytes.fromHex(cfg.lpScript),
        }),
      },
      orderRef: {
        input: {
          txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
          index: i + 1,
        },
        output: new TxOut(addr, new Value().add(ADA, 100_000_000n), undefined, {
          plutusVersion: PlutusVersion.V2,
          script: Bytes.fromHex(cfg.orderScript),
        }),
      },
      poolRef: {
        input: {
          txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
          index: i + 2,
        },
        output: new TxOut(addr, new Value().add(ADA, 100_000_000n), undefined, {
          plutusVersion: PlutusVersion.V2,
          script: Bytes.fromHex(cfg.poolScript),
        }),
      },
      orderBatchingRef: {
        input: {
          txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
          index: i + 3,
        },
        output: new TxOut(addr, new Value().add(ADA, 100_000_000n), undefined, {
          plutusVersion: PlutusVersion.V2,
          script: Bytes.fromHex(cfg.orderBatchingScript),
        }),
      },
    };
    stableswapTestnetRefScripts[key] = refs;
    stableswapMainnetRefScripts[key] = refs;
    i = i + 4;
  }
}

export function getStableswapReferencesScripts(
  networkEnvironment: NetworkEnvironment,
): Record<string, StableswapReferencesScript> {
  switch (networkEnvironment) {
    case NetworkEnv.MAINNET: {
      if (stableswapMainnetRefScripts) {
        return stableswapMainnetRefScripts;
      }
      const rawReferencesScripts: Record<string, RawStableswapReferencesScript> = JSON.parse(
        JSON.stringify(mainnetRawReferencesScripts),
      );
      const referencesScript: Record<string, StableswapReferencesScript> = {};
      for (const [key, rawRef] of Object.entries(rawReferencesScripts)) {
        referencesScript[key] = {
          orderRef: Utxo.fromHex(rawRef.orderRef),
          poolRef: Utxo.fromHex(rawRef.poolRef),
          lpRef: Utxo.fromHex(rawRef.lpRef),
          orderBatchingRef: Utxo.fromHex(rawRef.orderBatchingRef),
        };
      }
      stableswapMainnetRefScripts = referencesScript;
      return stableswapMainnetRefScripts;
    }
    case NetworkEnv.TESTNET_PREPROD: {
      if (stableswapTestnetRefScripts) {
        return stableswapTestnetRefScripts;
      }
      const rawReferencesScripts: Record<string, RawStableswapReferencesScript> = JSON.parse(
        JSON.stringify(testnetRawReferencesScripts),
      );
      const referencesScript: Record<string, StableswapReferencesScript> = {};
      for (const [key, rawRef] of Object.entries(rawReferencesScripts)) {
        referencesScript[key] = {
          orderRef: Utxo.fromHex(rawRef.orderRef),
          poolRef: Utxo.fromHex(rawRef.poolRef),
          lpRef: Utxo.fromHex(rawRef.lpRef),
          orderBatchingRef: Utxo.fromHex(rawRef.orderBatchingRef),
        };
      }
      stableswapTestnetRefScripts = referencesScript;
      return stableswapTestnetRefScripts;
    }
    case NetworkEnv.TESTNET_PREVIEW: {
      return {};
    }
  }
}

export function getStableswapPoolConfig(key: string, networkEnvironment: NetworkEnvironment): StableswapPoolConfig {
  const data = getStableswapPoolConfigs(networkEnvironment)[key];
  if (!data) {
    throw new Error(`Not found Stableswap config matching with ${key}`);
  }
  return data;
}

export function getMapLpAssetStableswapPoolConfig(
  networkEnvironment: NetworkEnvironment,
): Record<string, StableswapPoolConfig> {
  const map: Record<string, StableswapPoolConfig> = {};
  for (const config of Object.values(getStableswapPoolConfigs(networkEnvironment))) {
    map[config.lpAsset.toString()] = config;
  }
  return map;
}

export function getMapLpAssetToStableswapPoolAssets(networkEnvironment: NetworkEnvironment): Record<string, Asset[]> {
  const map: Record<string, Asset[]> = {};
  for (const config of Object.values(getStableswapPoolConfigs(networkEnvironment))) {
    map[config.lpAsset.toString()] = config.assets;
  }
  return map;
}

export function getStableswapReferencesScript(
  key: string,
  networkEnvironment: NetworkEnvironment,
): StableswapReferencesScript {
  const data = getStableswapReferencesScripts(networkEnvironment)[key];
  if (!data) {
    throw new Error(`Not found Stableswap references script matching with ${key}`);
  }
  return data;
}

export function getStableswapPoolConfigByLPAsset(
  lpAsset: Asset,
  networkEnvironment: NetworkEnvironment,
): StableswapPoolConfig | null {
  for (const config of Object.values(getStableswapPoolConfigs(networkEnvironment))) {
    if (config.lpAsset.equals(lpAsset)) {
      return config;
    }
  }
  return null;
}

export function getStableswapPoolConfigByNFTAsset(
  nftAsset: Asset,
  networkEnvironment: NetworkEnvironment,
): StableswapPoolConfig | null {
  for (const config of Object.values(getStableswapPoolConfigs(networkEnvironment))) {
    if (config.nftAsset.equals(nftAsset)) {
      return config;
    }
  }
  return null;
}

export function getStablePoolLPAssets(networkEnvironment: NetworkEnvironment): Asset[] {
  const stablePoolConfigs = getStableswapPoolConfigs(networkEnvironment);
  return Object.values(stablePoolConfigs).map((pool) => pool.lpAsset);
}

export function getStableswapLicensePolicyID(networkEnvironment: NetworkEnvironment): Bytes {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      return Bytes.fromHex("defbf038da8ec085f9a304f13946f34522c2f7866bac9def8391685b");
    }
    case NetworkID.MAINNET: {
      return Bytes.fromHex("53299e1f266eec1030b07866b3c4c4824c8bb4097ccd3d5765204d64");
    }
  }
}

export function getLPAssetFromStableswapOrderAddress(
  orderAddress: Address,
  networkEnvironment: NetworkEnvironment,
): Result<Asset, Error> {
  const configs = getStableswapPoolConfigs(networkEnvironment);
  const poolConfig = Object.values(configs).find((config) => config.orderAddress.equals(orderAddress));
  if (!poolConfig) {
    return Result.err(new Error(`Not found LP Asset matching with Order Address: ${orderAddress.bech32}`));
  }
  return Result.ok(poolConfig.lpAsset);
}

export function getStableswapOrderScriptHash(key: string, networkEnvironment: NetworkEnvironment): Bytes {
  const config = getStableswapPoolConfig(key, networkEnvironment);
  return Maybe.unwrap(config.orderAddress.toScriptHash(), "stableswap order address must have script hash");
}

export function getAllStableswapOrderScriptHashes(networkEnvironment: NetworkEnvironment): Bytes[] {
  const configs = getStableswapPoolConfigs(networkEnvironment);
  return Object.values(configs).map((cfg) =>
    Maybe.unwrap(cfg.orderAddress.toScriptHash(), "stableswap order address must have script hash"),
  );
}

export function getAllStableswapPoolScriptHashes(networkEnvironment: NetworkEnvironment): Bytes[] {
  const configs = getStableswapPoolConfigs(networkEnvironment);
  return Object.values(configs).map((cfg) =>
    Maybe.unwrap(cfg.poolAddress.toScriptHash(), "stableswap pool address must have script hash"),
  );
}

export function getStableswapPoolAddressSet(networkEnvironment: NetworkEnvironment): Set<string> {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (stableswapPoolAddressSetTestnet) {
        return stableswapPoolAddressSetTestnet;
      }
      stableswapPoolAddressSetTestnet = new Set<string>();
      const poolConfigs = getStableswapPoolConfigs(networkEnvironment);
      for (const cfg of Object.values(poolConfigs)) {
        stableswapPoolAddressSetTestnet.add(cfg.poolAddress.bech32);
      }
      return stableswapPoolAddressSetTestnet;
    }
    case NetworkID.MAINNET: {
      if (stableswapPoolAddressSetMainnet) {
        return stableswapPoolAddressSetMainnet;
      }
      stableswapPoolAddressSetMainnet = new Set<string>();
      const poolConfigs = getStableswapPoolConfigs(networkEnvironment);
      for (const cfg of Object.values(poolConfigs)) {
        stableswapPoolAddressSetMainnet.add(cfg.poolAddress.bech32);
      }
      return stableswapPoolAddressSetMainnet;
    }
  }
}

export function getStableswapOrderAddressSet(networkEnvironment: NetworkEnvironment): Set<string> {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (stableswapOrderAddressSetTestnet) {
        return stableswapOrderAddressSetTestnet;
      }
      stableswapOrderAddressSetTestnet = new Set<string>();
      const poolConfigs = getStableswapPoolConfigs(networkEnvironment);
      for (const cfg of Object.values(poolConfigs)) {
        stableswapOrderAddressSetTestnet.add(cfg.orderAddress.bech32);
      }
      return stableswapOrderAddressSetTestnet;
    }
    case NetworkID.MAINNET: {
      if (stableswapOrderAddressSetMainnet) {
        return stableswapOrderAddressSetMainnet;
      }
      stableswapOrderAddressSetMainnet = new Set<string>();
      const poolConfigs = getStableswapPoolConfigs(networkEnvironment);
      for (const cfg of Object.values(poolConfigs)) {
        stableswapOrderAddressSetMainnet.add(cfg.orderAddress.bech32);
      }
      return stableswapOrderAddressSetMainnet;
    }
  }
}

export function getStableswapLPAssetsByPair(
  [assetA, assetB]: [Asset, Asset],
  networkEnvironment: NetworkEnvironment,
): Asset[] | null {
  const pools = Object.values(getStableswapPoolConfigs(networkEnvironment));
  const lpAssets: Asset[] = [];
  for (const pool of pools) {
    if (Asset.hasIncludeAsset(assetA, pool.assets) && Asset.hasIncludeAsset(assetB, pool.assets)) {
      lpAssets.push(pool.lpAsset);
    }
  }
  if (lpAssets.length === 0) {
    return null;
  }
  return lpAssets.sort((a, b) => a.compare(b));
}

export function getStableswapAssets(networkEnvironment: NetworkEnvironment): Asset[] {
  const pools = Object.values(getStableswapPoolConfigs(networkEnvironment));
  const uniqueAssets = new Set<Asset>();
  for (const pool of pools) {
    for (const asset of pool.assets) {
      uniqueAssets.add(asset);
    }
  }
  return Array.from(uniqueAssets);
}
