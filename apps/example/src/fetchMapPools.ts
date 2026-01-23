import fs from "node:fs";
import { NetworkEnvironment } from "@repo/ledger-core";
import { getDexV2Configs, PoolV2 } from "@repo/minswap-dex-v2";
import { KupoService } from "@repo/provider";
import { MinswapV2Syncer } from "@repo/syncer";

const main = async () => {
  const kupo = new KupoService("http://mainnet-staging.ts.minswap.org:1442");
  const networkEnv = NetworkEnvironment.MAINNET;
  const minswapDexV2Configs = getDexV2Configs(networkEnv);
  const poolScriptHash = minswapDexV2Configs.poolEnterpriseAddress.payment.payload;
  const poolAuthenAsset = minswapDexV2Configs.poolAuthenAsset;
  const minswapV2Utxos = await kupo.utxoAtScriptHashWithAsset(poolScriptHash, poolAuthenAsset);
  console.log("Fetched minswap V2 Utxos:", minswapV2Utxos.length);

  const mapPool: MinswapV2Syncer.MapPool = JSON.parse(fs.readFileSync("data/minswap-dex-v2-map-pool.json", "utf-8"));
  for (const utxo of minswapV2Utxos) {
    const pool = PoolV2.fromUtxo(utxo, networkEnv);
    if (pool.type === "ok") {``
      const lpAsset = pool.value.lpAsset.toString();
      const assetA = pool.value.assetA.toString();
      const assetB = pool.value.assetB.toString();
      if (!mapPool[lpAsset]) {
        mapPool[lpAsset] = { assetA, assetB };
      }
    }
  }

  fs.writeFileSync("data/minswap-dex-v2-map-pool.json", JSON.stringify(mapPool, null, 2));
  console.log("Done fetching map pool");
};

main();
