import invariant from "@minswap/tiny-invariant";

import {
  Address,
  AddressType,
  Asset,
  Bytes,
  type CardanoBaseAddress,
  type CardanoEnterpriseAddress,
  type Credential,
  CredentialType,
  NetworkEnvironment,
  NetworkID,
  PlutusVersion,
  RewardAddress,
  TxIn,
  TxOut,
  Utxo,
  Value,
  networkEnvironmentToNetworkID,
} from "@repo/ledger-core";
import { Maybe } from "@repo/ledger-utils";
import mainnetRawScripts from "./scripts/mainnet/dex-v2-script.json";
import mainnetReferenceScripts from "./scripts/mainnet/references-script.json";
import testnetRawScripts from "./scripts/testnet/dex-v2-script.json";
import testnetPreviewRawScripts from "./scripts/testnet/preview-dex-v2-script.json";
import testnetPreviewReferenceScripts from "./scripts/testnet/preview-references-script.json";
import testnetReferenceScripts from "./scripts/testnet/references-script.json";
import { getMinswapStakeAddresses } from "./data/constants";

export type RawDexV2Config = {
  factoryAsset: string;
  poolAuthenAsset: string;
  globalSettingAsset: string;
  lpPolicyId: string;
  globalSettingEnterpriseAddress: string;
  orderEnterpriseAddress: string;
  poolEnterpriseAddress: string;
  poolCreationAddress: string;
  factoryEnterpriseAddress: string;
  expiredOrderCancelAddress: string;
  poolBatchingAddress: string;
  authenScript: string;
  poolScript: string;
  orderScript: string;
  factoryScript: string;
  expiredOrderCancelScript: string;
  poolBatchingScript: string;
  testMultiSignScript: string;
  authenRefTxIn: string;
};

export type DexV2Config = {
  factoryAsset: Asset;
  poolAuthenAsset: Asset;
  globalSettingAsset: Asset;
  lpPolicyId: Bytes;
  globalSettingEnterpriseAddress: CardanoEnterpriseAddress;
  orderEnterpriseAddress: CardanoEnterpriseAddress;
  poolEnterpriseAddress: CardanoEnterpriseAddress;
  poolCreationAddress: Address;
  factoryEnterpriseAddress: CardanoEnterpriseAddress;
  expiredOrderCancelAddress: RewardAddress;
  poolBatchingAddress: RewardAddress;
  authenScript: string;
  poolScript: string;
  orderScript: string;
  factoryScript: string;
  expiredOrderCancelScript: string;
  poolBatchingScript: string;
  testMultiSignScript: string;
  authenRefTxIn: TxIn;
};

export type DexV2ReferencesScripts = {
  poolRef: Utxo;
  orderRef: Utxo;
  lpRef: Utxo;
  factoryRef: Utxo;
  expiredOrderCancelRef: Utxo;
  poolBatchingRef: Utxo;
};

let dexV2TestnetConfigs: DexV2Config | undefined = undefined;
let dexV2MainnetConfigs: DexV2Config | undefined = undefined;
let dexV2TestnetRefScripts: DexV2ReferencesScripts | undefined = undefined;
let dexV2MainnetRefScripts: DexV2ReferencesScripts | undefined = undefined;
let poolAddrsTestnet: Address[] | undefined = undefined;
let poolAddrsMainnet: Address[] | undefined = undefined;
let poolAddrsSetTestnet: Set<string> | undefined = undefined;
let poolAddrsSetMainnet: Set<string> | undefined = undefined;
let orderAddrTestnet: Address | undefined = undefined;
let orderAddrMainnet: Address | undefined = undefined;
let factoryAddrTestnet: Address | undefined = undefined;
let factoryAddrMainnet: Address | undefined = undefined;
let allDexV2ScriptHashList: Bytes[] | undefined = undefined;
let allDexV2ReferencesSetTestnet: Set<string> | undefined = undefined;
let allDexV2ReferencesSetMainnet: Set<string> | undefined = undefined;

function deserializeRawDexV2Config(rawConfig: RawDexV2Config): DexV2Config {
  const orderAddress = Address.fromBech32(rawConfig.orderEnterpriseAddress);
  invariant(
    orderAddress.cardanoAddress.type === AddressType.ENTERPRISE_ADDRESS,
    "order address must be enterprise address",
  );
  const poolAddress = Address.fromBech32(rawConfig.poolEnterpriseAddress);
  invariant(
    poolAddress.cardanoAddress.type === AddressType.ENTERPRISE_ADDRESS,
    "pool address must be enterprise address",
  );
  const factoryAddress = Address.fromBech32(rawConfig.factoryEnterpriseAddress);
  invariant(
    factoryAddress.cardanoAddress.type === AddressType.ENTERPRISE_ADDRESS,
    "factory address must be enterprise address",
  );
  const globalSettingAddress = Address.fromBech32(rawConfig.globalSettingEnterpriseAddress);
  invariant(
    globalSettingAddress.cardanoAddress.type === AddressType.ENTERPRISE_ADDRESS,
    "factory address must be enterprise address",
  );
  return {
    factoryAsset: Asset.fromString(rawConfig.factoryAsset),
    poolAuthenAsset: Asset.fromString(rawConfig.poolAuthenAsset),
    globalSettingAsset: Asset.fromString(rawConfig.globalSettingAsset),
    lpPolicyId: Bytes.fromHex(rawConfig.lpPolicyId),
    globalSettingEnterpriseAddress: globalSettingAddress.cardanoAddress,
    orderEnterpriseAddress: orderAddress.cardanoAddress,
    poolEnterpriseAddress: poolAddress.cardanoAddress,
    poolCreationAddress: Address.fromBech32(rawConfig.poolCreationAddress),
    factoryEnterpriseAddress: factoryAddress.cardanoAddress,
    expiredOrderCancelAddress: RewardAddress.fromBech32(rawConfig.expiredOrderCancelAddress),
    poolBatchingAddress: RewardAddress.fromBech32(rawConfig.poolBatchingAddress),
    authenScript: rawConfig.authenScript,
    poolScript: rawConfig.poolScript,
    orderScript: rawConfig.orderScript,
    factoryScript: rawConfig.factoryScript,
    expiredOrderCancelScript: rawConfig.expiredOrderCancelScript,
    poolBatchingScript: rawConfig.poolBatchingScript,
    testMultiSignScript: rawConfig.testMultiSignScript,
    authenRefTxIn: TxIn.fromString(rawConfig.authenRefTxIn),
  };
}

export function getDexV2Configs(networkEnvironment: NetworkEnvironment): DexV2Config {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.MAINNET: {
      if (dexV2MainnetConfigs) {
        return dexV2MainnetConfigs;
      }
      const rawConfigs: RawDexV2Config = JSON.parse(JSON.stringify(mainnetRawScripts));
      const config = deserializeRawDexV2Config(rawConfigs);
      dexV2MainnetConfigs = config;
      return config;
    }
    case NetworkID.TESTNET: {
      if (dexV2TestnetConfigs) {
        return dexV2TestnetConfigs;
      }
      const rawScripts =
        networkEnvironment === NetworkEnvironment.TESTNET_PREPROD ? testnetRawScripts : testnetPreviewRawScripts;
      const rawConfigs: RawDexV2Config = JSON.parse(JSON.stringify(rawScripts));
      const config = deserializeRawDexV2Config(rawConfigs);
      dexV2TestnetConfigs = config;
      return config;
    }
  }
}

/**
 * This function uses for test suite in order to mock DEX V2 References Script.
 * PLEASE NOT USE THIS FUNCTION ON PRODUCTION
 */
export function _useDummyDexV2RefScripts(
  networkEnvironment: NetworkEnvironment,
): void {
  const config = getDexV2Configs(networkEnvironment);
  const addr = Address.fromBech32("addr_test1vzztre5epvtj5p72sh28nvrs3e6s4xxn95f66cvg0sqsk7qd3mah0");
  const ref = {
    poolRef: {
      input: {
        txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
        index: 1,
      },
      output: new TxOut(addr, new Value(), undefined, {
        plutusVersion: PlutusVersion.V2,
        script: Bytes.fromHex(config.poolScript),
      }).addMinimumADAIfRequired(networkEnvironment),
    },
    orderRef: {
      input: {
        txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
        index: 2,
      },
      output: new TxOut(addr, new Value(), undefined, {
        plutusVersion: PlutusVersion.V2,
        script: Bytes.fromHex(config.orderScript),
      }).addMinimumADAIfRequired(networkEnvironment),
    },
    lpRef: {
      input: {
        txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
        index: 3,
      },
      output: new TxOut(addr, new Value(), undefined, {
        plutusVersion: PlutusVersion.V2,
        script: Bytes.fromHex(config.authenScript),
      }).addMinimumADAIfRequired(networkEnvironment),
    },
    factoryRef: {
      input: {
        txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
        index: 4,
      },
      output: new TxOut(addr, new Value(), undefined, {
        plutusVersion: PlutusVersion.V2,
        script: Bytes.fromHex(config.factoryScript),
      }).addMinimumADAIfRequired(networkEnvironment),
    },
    expiredOrderCancelRef: {
      input: {
        txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
        index: 5,
      },
      output: new TxOut(addr, new Value(), undefined, {
        plutusVersion: PlutusVersion.V2,
        script: Bytes.fromHex(config.expiredOrderCancelScript),
      }).addMinimumADAIfRequired(networkEnvironment),
    },
    poolBatchingRef: {
      input: {
        txId: Bytes.fromHex("eb5d5d3cf842b171b09a1878fc8c16cf7a5ad6a0d18e3122feb31078e224680a"),
        index: 6,
      },
      output: new TxOut(addr, new Value(), undefined, {
        plutusVersion: PlutusVersion.V2,
        script: Bytes.fromHex(config.poolBatchingScript),
      }).addMinimumADAIfRequired(networkEnvironment),
    },
  };
  dexV2MainnetRefScripts = ref;
  dexV2TestnetRefScripts = ref;
}

export function getDexV2RefScripts(
  networkEnvironment: NetworkEnvironment,
): DexV2ReferencesScripts {
  switch (networkEnvironment) {
    case NetworkEnvironment.MAINNET: {
      if (dexV2MainnetRefScripts) {
        return dexV2MainnetRefScripts;
      }
      dexV2MainnetRefScripts = {
        orderRef: Utxo.fromHex(mainnetReferenceScripts.orderRef),
        expiredOrderCancelRef: Utxo.fromHex(mainnetReferenceScripts.expiredOrderCancelRef),
        factoryRef: Utxo.fromHex(mainnetReferenceScripts.factoryRef),
        lpRef: Utxo.fromHex(mainnetReferenceScripts.authenRef),
        poolRef: Utxo.fromHex(mainnetReferenceScripts.poolRef),
        poolBatchingRef: Utxo.fromHex(mainnetReferenceScripts.poolBatchingRef),
      };
      return dexV2MainnetRefScripts;
    }
    case NetworkEnvironment.TESTNET_PREPROD: {
      if (dexV2TestnetRefScripts) {
        return dexV2TestnetRefScripts;
      }
      dexV2TestnetRefScripts = {
        orderRef: Utxo.fromHex(testnetReferenceScripts.orderRef),
        expiredOrderCancelRef: Utxo.fromHex(testnetReferenceScripts.expiredOrderCancelRef),
        factoryRef: Utxo.fromHex(testnetReferenceScripts.factoryRef),
        lpRef: Utxo.fromHex(testnetReferenceScripts.authenRef),
        poolRef: Utxo.fromHex(testnetReferenceScripts.poolRef),
        poolBatchingRef: Utxo.fromHex(testnetReferenceScripts.poolBatchingRef),
      };
      return dexV2TestnetRefScripts;
    }
    case NetworkEnvironment.TESTNET_PREVIEW: {
      if (dexV2TestnetRefScripts) {
        return dexV2TestnetRefScripts;
      }
      dexV2TestnetRefScripts = {
        orderRef: Utxo.fromHex(testnetPreviewReferenceScripts.orderRef),
        expiredOrderCancelRef: Utxo.fromHex(testnetPreviewReferenceScripts.expiredOrderCancelRef),
        factoryRef: Utxo.fromHex(testnetPreviewReferenceScripts.factoryRef),
        lpRef: Utxo.fromHex(testnetPreviewReferenceScripts.authenRef),
        poolRef: Utxo.fromHex(testnetPreviewReferenceScripts.poolRef),
        poolBatchingRef: Utxo.fromHex(testnetPreviewReferenceScripts.poolBatchingRef),
      };
      return dexV2TestnetRefScripts;
    }
  }
}

export function getDexV2PoolAddresses(
  networkEnvironment: NetworkEnvironment,
): Address[] {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  const dexV2Configs = getDexV2Configs(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!poolAddrsTestnet) {
        poolAddrsTestnet = [];
        const enterpriseAddr = dexV2Configs.poolEnterpriseAddress;
        for (const stakeAddr of getMinswapStakeAddresses(networkEnvironment)) {
          const baseAddr: CardanoBaseAddress = {
            type: AddressType.BASE_ADDRESS,
            network: networkId,
            payment: enterpriseAddr.payment,
            stake: stakeAddr.stake,
          };
          poolAddrsTestnet.push(Address.fromCardanoAddress(baseAddr));
        }
      }
      return poolAddrsTestnet;
    }
    case NetworkID.MAINNET: {
      if (!poolAddrsMainnet) {
        poolAddrsMainnet = [];
        const enterpriseAddr = dexV2Configs.poolEnterpriseAddress;
        for (const stakeAddr of getMinswapStakeAddresses(networkEnvironment)) {
          const baseAddr: CardanoBaseAddress = {
            type: AddressType.BASE_ADDRESS,
            network: networkId,
            payment: enterpriseAddr.payment,
            stake: stakeAddr.stake,
          };
          poolAddrsMainnet.push(Address.fromCardanoAddress(baseAddr));
        }
      }
      return poolAddrsMainnet;
    }
  }
}

export function getDexV2PoolAddressesSet(
  networkEnvironment: NetworkEnvironment,
): Set<string> {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!poolAddrsSetTestnet) {
        const poolAddresses = getDexV2PoolAddresses(networkEnvironment);
        poolAddrsSetTestnet = new Set<string>();
        for (const addr of poolAddresses) {
          poolAddrsSetTestnet.add(addr.bech32);
        }
      }
      return poolAddrsSetTestnet;
    }
    case NetworkID.MAINNET: {
      if (!poolAddrsSetMainnet) {
        const poolAddresses = getDexV2PoolAddresses(networkEnvironment);
        poolAddrsSetMainnet = new Set<string>();
        for (const addr of poolAddresses) {
          poolAddrsSetMainnet.add(addr.bech32);
        }
      }
      return poolAddrsSetMainnet;
    }
  }
}

export function getDexV2PoolCreationAddress(
  networkEnvironment: NetworkEnvironment,
): Address {
  const cfg = getDexV2Configs(networkEnvironment);
  return cfg.poolCreationAddress;
}

export function getDefaultDexV2OrderAddress(
  networkEnvironment: NetworkEnvironment,
): Address {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  const dexV2Configs = getDexV2Configs(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!orderAddrTestnet) {
        const orderEnterpriseAddress = dexV2Configs.orderEnterpriseAddress;
        const orderAddress = Address.fromCardanoAddress({
          network: networkId,
          type: AddressType.BASE_ADDRESS,
          payment: orderEnterpriseAddress.payment,
          stake: {
            type: CredentialType.PUB_KEY_CREDENTIAL,
            payload: Bytes.fromHex("83ec96719dc0591034b78e472d6f477446261fec4bc517fa4d047f02"),
          },
        });
        orderAddrTestnet = orderAddress;
      }
      return orderAddrTestnet;
    }
    case NetworkID.MAINNET: {
      if (!orderAddrMainnet) {
        const orderEnterpriseAddress = dexV2Configs.orderEnterpriseAddress;
        const orderAddress = Address.fromCardanoAddress({
          network: networkId,
          type: AddressType.BASE_ADDRESS,
          payment: orderEnterpriseAddress.payment,
          stake: {
            type: CredentialType.PUB_KEY_CREDENTIAL,
            payload: Bytes.fromHex("52563c5410bff6a0d43ccebb7c37e1f69f5eb260552521adff33b9c2"),
          },
        });
        orderAddrMainnet = orderAddress;
      }
      return orderAddrMainnet;
    }
  }
}

export function getDexV2OrderScriptHash(
  networkEnvironment: NetworkEnvironment,
): Bytes {
  return Maybe.unwrap(
    getDefaultDexV2OrderAddress(networkEnvironment).toScriptHash(),
    "Dex V2 order address must have script hash",
  );
}

export function buildDexV2OrderAddress(
  stakeAddress: RewardAddress,
  networkEnvironment: NetworkEnvironment,
): Address {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  const dexV2Configs = getDexV2Configs(networkEnvironment);
  return Address.fromCardanoAddress({
    type: AddressType.BASE_ADDRESS,
    network: networkId,
    payment: dexV2Configs.orderEnterpriseAddress.payment,
    stake: stakeAddress.cardanoAddress.stake,
  });
}

export function getDexV2GlobalSettingScriptHash(
  networkEnvironment: NetworkEnvironment,
): Bytes {
  const config = getDexV2Configs(networkEnvironment);
  return config.lpPolicyId;
}

export function getDexV2FactoryAddress(
  networkEnvironment: NetworkEnvironment,
): Address {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  const dexV2Configs = getDexV2Configs(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!factoryAddrTestnet) {
        const factoryEnterpriseAddress = dexV2Configs.factoryEnterpriseAddress;
        const factoryAddress = Address.fromCardanoAddress({
          network: networkId,
          type: AddressType.BASE_ADDRESS,
          payment: factoryEnterpriseAddress.payment,
          stake: {
            type: CredentialType.PUB_KEY_CREDENTIAL,
            payload: Bytes.fromHex("83ec96719dc0591034b78e472d6f477446261fec4bc517fa4d047f02"),
          },
        });
        factoryAddrTestnet = factoryAddress;
      }
      return factoryAddrTestnet;
    }
    case NetworkID.MAINNET: {
      if (!factoryAddrMainnet) {
        const factoryEnterpriseAddress = dexV2Configs.factoryEnterpriseAddress;
        const factoryAddress = Address.fromCardanoAddress({
          network: networkId,
          type: AddressType.BASE_ADDRESS,
          payment: factoryEnterpriseAddress.payment,
          stake: {
            type: CredentialType.PUB_KEY_CREDENTIAL,
            payload: Bytes.fromHex("52563c5410bff6a0d43ccebb7c37e1f69f5eb260552521adff33b9c2"),
          },
        });
        factoryAddrMainnet = factoryAddress;
      }
      return factoryAddrMainnet;
    }
  }
}

export function getDexV2FactoryScriptHash(
  networkEnvironment: NetworkEnvironment,
): Bytes {
  const dexV2Configs = getDexV2Configs(networkEnvironment);
  return dexV2Configs.factoryEnterpriseAddress.payment.payload;
}

export function getAllDexV2ScriptHashSet(
  networkEnvironment: NetworkEnvironment,
): Set<string> {
  return new Set(getAllDexV2ScriptHashList(networkEnvironment).map((sh) => sh.hex));
}

export function getAllDexV2ScriptHashList(
  networkEnvironment: NetworkEnvironment,
): Bytes[] {
  if (allDexV2ScriptHashList) {
    return allDexV2ScriptHashList;
  }
  const dexV2Configs = getDexV2Configs(networkEnvironment);
  allDexV2ScriptHashList = [
    dexV2Configs.lpPolicyId,
    dexV2Configs.orderEnterpriseAddress.payment.payload,
    dexV2Configs.factoryEnterpriseAddress.payment.payload,
    dexV2Configs.poolEnterpriseAddress.payment.payload,
  ];

  return allDexV2ScriptHashList;
}

export function getAllDexV2ReferencesSet(
  networkEnvironment: NetworkEnvironment,
): Set<string> {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      if (!allDexV2ReferencesSetTestnet) {
        allDexV2ReferencesSetTestnet = new Set<string>();
        const references = getDexV2RefScripts(networkEnvironment);
        allDexV2ReferencesSetTestnet.add(TxIn.toString(references.factoryRef.input));
        allDexV2ReferencesSetTestnet.add(TxIn.toString(references.lpRef.input));
        allDexV2ReferencesSetTestnet.add(TxIn.toString(references.expiredOrderCancelRef.input));
        allDexV2ReferencesSetTestnet.add(TxIn.toString(references.orderRef.input));
        allDexV2ReferencesSetTestnet.add(TxIn.toString(references.poolRef.input));
      }
      return allDexV2ReferencesSetTestnet;
    }
    case NetworkID.MAINNET: {
      if (!allDexV2ReferencesSetMainnet) {
        allDexV2ReferencesSetMainnet = new Set<string>();
        const references = getDexV2RefScripts(networkEnvironment);
        allDexV2ReferencesSetMainnet.add(TxIn.toString(references.factoryRef.input));
        allDexV2ReferencesSetMainnet.add(TxIn.toString(references.lpRef.input));
        allDexV2ReferencesSetMainnet.add(TxIn.toString(references.expiredOrderCancelRef.input));
        allDexV2ReferencesSetMainnet.add(TxIn.toString(references.orderRef.input));
        allDexV2ReferencesSetMainnet.add(TxIn.toString(references.poolRef.input));
      }
      return allDexV2ReferencesSetMainnet;
    }
  }
}

export function getDexV2PoolScriptHash(networkEnvironment: NetworkEnvironment): Bytes {
  return getDexV2Configs(networkEnvironment).poolEnterpriseAddress.payment.payload;
}

export function getDexV2LiquidityMigrationBot(
  networkEnvironment: NetworkEnvironment,
): Address {
  const networkId = networkEnvironmentToNetworkID(networkEnvironment);
  switch (networkId) {
    case NetworkID.TESTNET: {
      return Address.fromBech32("addr_test1vpxdtcsh943ws43672qyx0z5f9l70qam34v4kft4lfkw9fs9vq2jy");
    }
    case NetworkID.MAINNET: {
      return Address.fromBech32(
        "addr1q899m85hrw58ecxwxvayvj500swxv59c563gcnwvu5a4vmfghrq6m0hms6ffwz52gu75tscd53l65utvwqntpmfk9fmqy60wpq",
      );
    }
  }
}

export function getDexV2PoolBatchingStakeCredential(
  networkEnvironment: NetworkEnvironment,
): Credential {
  return getDexV2Configs(networkEnvironment).poolBatchingAddress.cardanoAddress.stake;
}

export const DEX_V2_DEFAULT_POOL_ADA = 4_500_000n;
export const DEX_V2_MAX_LIQUIDITY = 9_223_372_036_854_775_807n;
export const DEX_V2_INIT_FACTORY_HEAD = Bytes.fromHex("00");
export const DEX_V2_INIT_FACTORY_TAIL = Bytes.fromHex(
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00",
);

// 1/6 <=numeratorFeeSharing/ nenominatorFeeSharing<=1/2;
export const DEX_V2_MAX_FEE_SHARING: bigint = 5000n;
export const DEX_V2_MIN_FEE_SHARING: bigint = 1666n;

// 0.05% <=numeratorTradingFee / nenominatorTradingFee<=10%;
export const DEX_V2_MIN_TRADING_FEE: bigint = 5n;
export const DEX_V2_MAX_TRADING_FEE: bigint = 2000n;

export const DEX_V2_INIT_TIME: Record<NetworkEnvironment, Date> = {
  [NetworkEnvironment.MAINNET]: new Date("2024-07-01T09:54:07.0000Z"),
  [NetworkEnvironment.TESTNET_PREPROD]: new Date("2024-06-17T03:07:03.0000Z"),
  [NetworkEnvironment.TESTNET_PREVIEW]: new Date("2024-06-17T00:00:00.0000Z"),
};

export const DEX_V2_DEFAULT_AUTO_CANCEL_TIP = 300_000n;
export const OUTPUT_ADA = 2_000_000n; // deposit ada to order
