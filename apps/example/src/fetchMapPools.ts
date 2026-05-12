import fs from "node:fs";
import { getDexV2Configs, PoolV2 } from "@minswap/felis-dex-v2";
import { Bytes, NetworkEnvironment } from "@minswap/felis-ledger-core";
import { KupoService } from "@minswap/felis-provider";
import { SundaeSwapV1 } from "@minswap/felis-sundaeswap-v1";
import { SundaeSwapV3 } from "@minswap/felis-sundaeswap-v3";
import type { MinswapV2Syncer, SundaeSwapV1Syncer, SundaeSwapV3Syncer } from "@minswap/felis-syncer";

const _fetchMinswapV2Pools = async (kupo: KupoService, networkEnv: NetworkEnvironment) => {
  const minswapDexV2Configs = getDexV2Configs(networkEnv);
  const poolScriptHash = minswapDexV2Configs.poolEnterpriseAddress.payment.payload;
  const poolAuthenAsset = minswapDexV2Configs.poolAuthenAsset;
  const minswapV2Utxos = await kupo.utxoAtScriptHashWithAsset(poolScriptHash, poolAuthenAsset);
  console.log("Fetched minswap V2 Utxos:", minswapV2Utxos.length);

  const mapPool: MinswapV2Syncer.MapPool = JSON.parse(fs.readFileSync("data/minswap-dex-v2-map-pool.json", "utf-8"));
  for (const utxo of minswapV2Utxos) {
    const pool = PoolV2.fromUtxo(utxo, networkEnv);
    if (pool.type === "ok") {
      const lpAsset = pool.value.lpAsset.toString();
      const assetA = pool.value.assetA.toString();
      const assetB = pool.value.assetB.toString();
      if (!mapPool[lpAsset]) {
        mapPool[lpAsset] = { assetA, assetB };
      }
    }
  }

  fs.writeFileSync("data/minswap-dex-v2-map-pool.json", JSON.stringify(mapPool, null, 2));
  console.log("Minswap V2 | Done fetching map pool");
};

const _fetchSundaeswapV1Pools = async (kupo: KupoService, networkEnv: NetworkEnvironment) => {
  const sundaeswapV1Utxos = await kupo.utxoAtScriptHashWithPolicyId(
    Bytes.fromHex(SundaeSwapV1.POOL_SCRIPT_HASH),
    Bytes.fromHex(SundaeSwapV1.AUTHEN_POLICY_ID),
  );
  console.log("Fetched sundaeswap v1 Utxos:", sundaeswapV1Utxos.length);
  const mapPool: SundaeSwapV1Syncer.MapPool = JSON.parse(fs.readFileSync("data/sundaeswap-v1-map-pool.json", "utf-8"));
  for (const utxo of sundaeswapV1Utxos) {
    const outlineDatum = utxo.output.getOutlineDatum();
    if (outlineDatum.type === "err") {
      console.error("Utxo missing datum:", outlineDatum.error);
      continue;
    }
    const rawDatum = outlineDatum.value.hex;
    const pool = SundaeSwapV1.Pool.fromUtxo(utxo, rawDatum, networkEnv);
    if (pool.type === "ok") {
      const ident = pool.value.datum.ident.hex;
      const assetA = pool.value.assetA.toString();
      const assetB = pool.value.assetB.toString();
      if (!mapPool[ident]) {
        mapPool[ident] = { assetA, assetB };
      }
    } else {
      console.error(`${utxo.input.txId.hex} Error parsing pool from utxo:`, pool.error);
    }
  }
  console.log("Total SundaeSwap V1 Pools found:", Object.keys(mapPool).length);
  fs.writeFileSync("data/sundaeswap-v1-map-pool.json", JSON.stringify(mapPool, null, 2));
  console.log("SundaeSwap V1 | Done fetching map pool");
};

const fetchSundaeswapV3Pools = async (kupo: KupoService, networkEnv: NetworkEnvironment) => {
  const sundaeswapV3Utxos = await kupo.utxoAtScriptHashWithPolicyId(
    Bytes.fromHex(SundaeSwapV3.POOL_SCRIPT_HASH),
    Bytes.fromHex(SundaeSwapV3.NFT_POLICY_ID),
  );
  console.log("Fetched sundaeswap v3 Utxos:", sundaeswapV3Utxos.length);

  const mapPool: SundaeSwapV3Syncer.MapPool = JSON.parse(fs.readFileSync("data/sundaeswap-v3-map-pool.json", "utf-8"));

  for (const utxo of sundaeswapV3Utxos) {
    // V3 uses inline datums
    const inlineDatum = utxo.output.getInlineDatum();
    if (inlineDatum.type === "err") {
      console.error("Utxo missing inline datum:", inlineDatum.error);
      continue;
    }
    const rawDatum = inlineDatum.value.hex;
    const pool = SundaeSwapV3.Pool.fromUtxo(utxo, rawDatum, networkEnv);
    if (pool.type === "ok") {
      const ident = pool.value.ident.hex;
      const assetA = pool.value.assetA.toString();
      const assetB = pool.value.assetB.toString();
      if (!mapPool[ident]) {
        mapPool[ident] = { assetA, assetB };
      }
    } else {
      console.error(`${utxo.input.txId.hex} Error parsing pool from utxo:`, pool.error);
    }
  }

  console.log("Total SundaeSwap V3 Pools found:", Object.keys(mapPool).length);
  fs.writeFileSync("data/sundaeswap-v3-map-pool.json", JSON.stringify(mapPool, null, 2));
  console.log("SundaeSwap V3 | Done fetching map pool");
};

const main = async () => {
  const kupo = new KupoService("http://mainnet-staging.ts.minswap.org:1442");
  const networkEnv = NetworkEnvironment.MAINNET;
  // await fetchMinswapV2Pools(kupo, networkEnv);
  // await fetchSundaeswapV1Pools(kupo, networkEnv);
  await fetchSundaeswapV3Pools(kupo, networkEnv);
};

main();
