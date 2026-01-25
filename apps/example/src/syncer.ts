import fs from "node:fs";
import * as Ogmios from "@cardano-ogmios/client";
import invariant from "@minswap/tiny-invariant";
import { NetworkEnvironment } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { MinswapStableswapSyncer, MinswapV1Syncer, MinswapV2Syncer, SplashSyncer, SundaeSwapV1Syncer, SundaeSwapV3Syncer, Transaction, WingridersV1Syncer, WingridersV2Syncer } from "@repo/syncer";

const main = async () => {
  await RustModule.load();
  const ECSL = RustModule.getE;
  const networkEnv = NetworkEnvironment.TESTNET_PREPROD;
  const context = await Ogmios.createInteractionContext(
    (err: Error) => console.error("ogmios error", err),
    (code, reason) =>
      console.info("ogmios connection closed", { code, reason }),
    { connection: { host: "dev-6", port: 1338 } },
  );
  const stateQueryClient = await Ogmios.createLedgerStateQueryClient(context);
  await Ogmios.createTransactionSubmissionClient(context);

  const tip = await stateQueryClient.ledgerTip();
  console.info("Current tip:", tip);

  const minswapV2MapPool: MinswapV2Syncer.MapPool = JSON.parse(fs.readFileSync("data/minswap-dex-v2-map-pool.json", "utf-8"));
  const sundaeSwapV1MapPool: SundaeSwapV1Syncer.MapPool = JSON.parse(fs.readFileSync("data/sundaeswap-v1-map-pool.json", "utf-8"));
  const sundaeSwapV3MapPool: SundaeSwapV3Syncer.MapPool = JSON.parse(fs.readFileSync("data/sundaeswap-v3-map-pool.json", "utf-8"));

  const client = await Ogmios.createChainSynchronizationClient(
    context,
    {
      rollBackward: async (_, nextBlock) => {
        nextBlock();
      },
      rollForward: async ({ block }, nextBlock) => {
        try {
          invariant(block.type === "praos", "block must be praos type");
          invariant(block.transactions && block.transactions.length >= 0, "no txs in block");
          for (const transaction of block.transactions) {
            console.log("Processing tx:", transaction.id);
            const txRaw = transaction.cbor;
            invariant(txRaw, "tx cbor is missing");
            const eTx = ECSL.Transaction.from_hex(txRaw);
            const wrapTx = Transaction.fromECSL(eTx);

            const minswapV2Tx = MinswapV2Syncer.parseTx({
              tx: wrapTx,
              networkEnv,
              mapPool: minswapV2MapPool,
            });

            const minswapV1Tx = MinswapV1Syncer.parseTx({
              tx: wrapTx,
              networkEnv,
            });

            const minswapStableswapTx = MinswapStableswapSyncer.parseTx({
              tx: wrapTx,
              networkEnv: NetworkEnvironment.MAINNET,
            });

            const sundaeSwapV1Tx = SundaeSwapV1Syncer.parseTx({
              tx: wrapTx,
              networkEnv,
              mapPool: sundaeSwapV1MapPool,
            });

            const sundaeSwapV3Tx = SundaeSwapV3Syncer.parseTx({
              tx: wrapTx,
              networkEnv,
              mapPool: sundaeSwapV3MapPool,
            });

            const wingridersV1Tx = WingridersV1Syncer.parseTx({
              tx: wrapTx,
              networkEnv: NetworkEnvironment.MAINNET,
            });

            const wingridersV2Tx = WingridersV2Syncer.parseTx({
              tx: wrapTx,
              networkEnv: NetworkEnvironment.MAINNET,
            });

            const splashTx = SplashSyncer.parseTx({
              tx: wrapTx,
              networkEnv: NetworkEnvironment.MAINNET,
            });

            // handle your business logic here
            if (minswapV1Tx) {
              console.log(JSON.stringify(minswapV1Tx, null, 2));
            } else if (minswapV2Tx) {
              console.log(JSON.stringify(minswapV2Tx, null, 2));
            } else if (sundaeSwapV1Tx) {
              console.log(JSON.stringify(sundaeSwapV1Tx, null, 2));
            } else if (sundaeSwapV3Tx) {
              console.log(JSON.stringify(sundaeSwapV3Tx, null, 2));
            } else if (wingridersV1Tx) {
              console.log(JSON.stringify(wingridersV1Tx, null, 2));
            } else if (wingridersV2Tx) {
              console.log(JSON.stringify(wingridersV2Tx, null, 2));
            } else if (splashTx) {
              console.log(JSON.stringify(splashTx, null, 2));
            } else if (minswapStableswapTx) {
              console.log(JSON.stringify(minswapStableswapTx, null, 2));
            }

            // update @mapPool when a new pool is created
            if (minswapV2Tx?.type === MinswapV2Syncer.TxType.CREATE_POOL) {
              const { lpAsset, assetA, assetB } = minswapV2Tx;
              minswapV2MapPool[lpAsset] = { assetA, assetB };
            }

            if (sundaeSwapV1Tx?.type === SundaeSwapV1Syncer.TxType.CREATE_POOL) {
              const { poolIdent, assetA, assetB } = sundaeSwapV1Tx;
              sundaeSwapV1MapPool[poolIdent] = { assetA, assetB };
            }

            if (sundaeSwapV3Tx?.type === SundaeSwapV3Syncer.TxType.CREATE_POOL) {
              const { poolIdent, assetA, assetB } = sundaeSwapV3Tx;
              sundaeSwapV3MapPool[poolIdent] = { assetA, assetB };
            }
          }
        }
        catch(err) {
          console.error("Error processing block:", err);
        }

        nextBlock();
      },
    },
    { sequential: true },
  );

  // await client.resume([tip], 1000);
  await client.resume([ { id: "13bd544f11f186bf9cddb8a1bd0f47be9c1a9976264612e55838e41c680f271a", slot: 113539634 }], 1000);
};

main();
