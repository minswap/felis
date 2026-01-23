import * as Ogmios from "@cardano-ogmios/client";
import invariant from "@minswap/tiny-invariant";
import { NetworkEnvironment } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { MinswapV1Syncer, MinswapV2Syncer, Transaction } from "@repo/syncer";

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

  const mapPool: MinswapV2Syncer.MapPool = {};
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
              mapPool,
            });

            const minswapV1Tx = MinswapV1Syncer.parseTx({
              tx: wrapTx,
              networkEnv,
            });

            // handle your business logic here
            if (minswapV1Tx) {
              console.log(JSON.stringify(minswapV1Tx, null, 2));
            } else if (minswapV2Tx) {
              console.log(JSON.stringify(minswapV2Tx, null, 2));
            }

            // update @mapPool when a new pool is created
            if (minswapV2Tx?.type === MinswapV2Syncer.TxType.CREATE_POOL) {
              const { lpAsset, assetA, assetB } = minswapV2Tx;
              mapPool[lpAsset] = { assetA, assetB };
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
