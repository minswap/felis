import { ADA, type Asset, DatumSourceType, type NetworkEnvironment } from "@repo/ledger-core";
import { Maybe } from "@repo/ledger-utils";
import {
  getStableswapPoolConfigByNFTAsset,
  getStableswapPoolConfigs,
  StableswapOrderDatum,
  StableswapPoolDatum,
  type StableswapPoolConfig,
  StableswapStepType,
} from "@repo/minswap-stableswap";
import type { Transaction } from "./transaction";
import type { WrapAddress, WrapAsset, WrapNum } from "./types";

export namespace MinswapStableswapSyncer {
  export enum TxType {
    CREATE_POOL = "CREATE_POOL",
    CREATE_ORDER = "CREATE_ORDER",
  }

  export type TxCreateOrder = {
    type: TxType.CREATE_ORDER;
    newOrders: {
      sender: WrapAddress;
      receiver: WrapAddress;
      lpAsset: WrapAsset;
      assetIn: WrapAsset;
      amountIn: WrapNum;
      assetOut: WrapAsset;
      minimumReceive: WrapNum;
      batcherFee: WrapNum;
      deposit: WrapNum;
    }[];
  };

  export type TxCreatePool = {
    type: TxType.CREATE_POOL;
    lpAsset: WrapAsset;
    assets: WrapAsset[];
    balances: WrapNum[];
    totalLiquidity: WrapNum;
    amplificationCoefficient: WrapNum;
    fee: WrapNum;
    adminFee: WrapNum;
    feeDenominator: WrapNum;
  };

  export type MinswapStableswapTx = TxCreateOrder | TxCreatePool;

  type NewOrder = TxCreateOrder["newOrders"][number];

  function tryParseSwapOrder(
    output: Transaction["body"]["outputs"][number],
    plutusData: Transaction["witnessSet"]["plutusData"],
    networkEnv: NetworkEnvironment,
  ): Maybe<NewOrder> {
    // Get all stableswap pool configs to check order addresses
    const allConfigs = getStableswapPoolConfigs(networkEnv);

    // Check if output is to one of the stableswap order script addresses
    const scriptHash = output.address.toScriptHash();
    if (!scriptHash) {
      return null;
    }

    // Find the pool config that matches this order address
    let matchedConfig: StableswapPoolConfig | null = null;
    for (const config of Object.values(allConfigs) as StableswapPoolConfig[]) {
      const configScriptHash = config.orderAddress.toScriptHash();
      if (configScriptHash && configScriptHash.hex === scriptHash.hex) {
        matchedConfig = config;
        break;
      }
    }

    if (!matchedConfig) {
      return null;
    }

    // Stableswap can use inline datum or datum hash
    let datumHex: string | undefined;
    if (output.datumSource?.type === DatumSourceType.INLINE_DATUM) {
      datumHex = output.datumSource.data.hex;
    } else if (output.datumSource?.type === DatumSourceType.DATUM_HASH) {
      const datum = plutusData[output.datumSource.hash.hex];
      if (datum) {
        datumHex = datum.hex;
      }
    }

    if (!datumHex) {
      return null;
    }

    try {
      const orderDatum = StableswapOrderDatum.fromDataHex(datumHex, networkEnv);

      // Only handle EXCHANGE step for swap orders
      if (orderDatum.step.type !== StableswapStepType.EXCHANGE) {
        return null;
      }

      const { assetInIndex, assetOutIndex, minimumAssetOut } = orderDatum.step;
      const poolAssets = matchedConfig.assets;

      // Validate indices
      if (
        assetInIndex < 0n ||
        assetOutIndex < 0n ||
        assetInIndex >= BigInt(poolAssets.length) ||
        assetOutIndex >= BigInt(poolAssets.length) ||
        assetInIndex === assetOutIndex
      ) {
        return null;
      }

      const assetIn = poolAssets[Number(assetInIndex)];
      const assetOut = poolAssets[Number(assetOutIndex)];

      // Calculate amount in by subtracting fees from value
      const valueWithoutFee = output.value
        .clone()
        .subtract(ADA, orderDatum.batcherFee + orderDatum.outputADA)
        .trim();
      const amountIn = valueWithoutFee.get(assetIn);

      if (amountIn <= 0n) {
        return null;
      }

      return {
        sender: orderDatum.sender.bech32,
        receiver: orderDatum.receiver.bech32,
        lpAsset: matchedConfig.lpAsset.toString(),
        assetIn: assetIn.toString(),
        amountIn: amountIn.toString(),
        assetOut: assetOut.toString(),
        minimumReceive: minimumAssetOut.toString(),
        batcherFee: orderDatum.batcherFee.toString(),
        deposit: orderDatum.outputADA.toString(),
      };
    } catch {
      return null;
    }
  }

  export function parseTxCreatePool(tx: Transaction, networkEnv: NetworkEnvironment): Maybe<TxCreatePool> {
    // Check if any stableswap pool NFT is minted
    const allConfigs = getStableswapPoolConfigs(networkEnv);

    let mintedNftAsset: Asset | null = null;
    for (const config of Object.values(allConfigs) as StableswapPoolConfig[]) {
      if (tx.body.mint.get(config.nftAsset) > 0n) {
        mintedNftAsset = config.nftAsset;
        break;
      }
    }

    if (!mintedNftAsset) {
      return null;
    }

    // Find the output that contains the pool NFT
    const poolOutput = tx.body.outputs.find((o) => o.value.get(mintedNftAsset!) > 0n);
    if (!poolOutput) {
      return null;
    }

    // Get the pool config
    const poolConfig = getStableswapPoolConfigByNFTAsset(mintedNftAsset, networkEnv);
    if (!poolConfig) {
      return null;
    }

    // Parse the pool datum
    let datumHex: string | undefined;
    if (poolOutput.datumSource?.type === DatumSourceType.INLINE_DATUM) {
      datumHex = poolOutput.datumSource.data.hex;
    } else if (poolOutput.datumSource?.type === DatumSourceType.DATUM_HASH) {
      const datum = tx.witnessSet.plutusData[poolOutput.datumSource.hash.hex];
      if (datum) {
        datumHex = datum.hex;
      }
    }

    if (!datumHex) {
      return null;
    }

    try {
      const poolDatum = StableswapPoolDatum.fromDataHex(datumHex);

      return {
        type: TxType.CREATE_POOL,
        lpAsset: poolConfig.lpAsset.toString(),
        assets: poolConfig.assets.map((a) => a.toString()),
        balances: poolDatum.balances.map((b) => b.toString()),
        totalLiquidity: poolDatum.totalLiquidity.toString(),
        amplificationCoefficient: poolDatum.amplificationCoefficient.toString(),
        fee: poolConfig.fee.toString(),
        adminFee: poolConfig.adminFee.toString(),
        feeDenominator: poolConfig.feeDenominator.toString(),
      };
    } catch {
      return null;
    }
  }

  export function parseTxCreateOrder(tx: Transaction, networkEnv: NetworkEnvironment): Maybe<TxCreateOrder> {
    const newOrders = tx.body.outputs
      .map((output) => tryParseSwapOrder(output, tx.witnessSet.plutusData, networkEnv))
      .filter((order): order is NewOrder => order !== null);

    if (newOrders.length === 0) {
      return null;
    }

    return {
      type: TxType.CREATE_ORDER,
      newOrders,
    };
  }

  export function parseTx(options: { tx: Transaction; networkEnv: NetworkEnvironment }): Maybe<MinswapStableswapTx> {
    const { tx, networkEnv } = options;

    // const txCreatePool = parseTxCreatePool(tx, networkEnv);
    // if (Maybe.isJust(txCreatePool)) {
    //   return txCreatePool;
    // }

    const txCreateOrder = parseTxCreateOrder(tx, networkEnv);
    if (Maybe.isJust(txCreateOrder)) {
      return txCreateOrder;
    }

    return null;
  }
}
