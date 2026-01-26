import { Asset, Bytes, NetworkEnvironment } from "@minswap/felis-ledger-core";
import { KupoService } from "../src";
import { PoolV2 } from "@minswap/felis-dex-v2";

const fetchMinswapV2Pools = async (kupo: KupoService, networkEnv: NetworkEnvironment) => {
  const poolHash = Bytes.fromHex("d6ba9b7509eac866288ff5072d2a18205ac56f744bc82dcd808cb8fe");
  const poolAsset = Asset.fromString("d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b.4d5350");
  const poolUtxos = await kupo.utxoAtScriptHashWithAsset(poolHash, poolAsset);
  console.log("Fetched pool Utxos:", poolUtxos.length);

  const mapPool: Record<string, { assetA: string; assetB: string }> = {};
  for (const utxo of poolUtxos) {
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
  console.log("Minswap V2 Pools:", mapPool);
};

const main = async () => {
  const kupo = new KupoService("http://testnet-preprod:1442");
  const networkEnv = NetworkEnvironment.TESTNET_PREPROD;
  await fetchMinswapV2Pools(kupo, networkEnv);
};

main();
