import fs from "node:fs";
import { RustModule } from "@repo/ledger-utils";
import { MinswapStableswapSyncer, MinswapV1Syncer, MinswapV2Syncer, SplashSyncer, SundaeSwapV1Syncer, SundaeSwapV3Syncer, Transaction, WingridersV1Syncer, WingridersV2Syncer } from "@repo/syncer";
import socketIO from "socket.io-client";
import { NetworkEnvironment } from "../../../packages/ledger-core/dist/network-id";
import { Bytes } from "@repo/ledger-core";

const main = async () => {
  await RustModule.load();
  const minswapV2MapPool: MinswapV2Syncer.MapPool = JSON.parse(fs.readFileSync("data/minswap-dex-v2-map-pool.json", "utf-8"));
  const sundaeswapV1MapPool: SundaeSwapV1Syncer.MapPool = JSON.parse(fs.readFileSync("data/sundaeswap-v1-map-pool.json", "utf-8"));
  const sundaeswapV3MapPool: SundaeSwapV3Syncer.MapPool = JSON.parse(fs.readFileSync("data/sundaeswap-v3-map-pool.json", "utf-8"));

  const socketCardano = socketIO("https://socket.cardanoscan.io/private", {
    auth: {
      apiKey: process.env["CARDANOSCAN_KEY"], // Replace with your actual API key
    },
    transports: ["websocket"],
  });

  socketCardano.on("connect", () => {
    console.log("CONNECTED");
    socketCardano.emit("subscribe", {
      topic: "MEMPOOL_RAW",
    });
  });

  socketCardano.on("MEMPOOL_RAW", (event) => {
    const ECSL = RustModule.getE;
    const eTx = ECSL.Transaction.from_bytes(new Bytes(event).bytes);
    const wrapTx = Transaction.fromECSL(eTx);

    const minswapV2Tx = MinswapV2Syncer.parseTx({
      tx: wrapTx,
      networkEnv: NetworkEnvironment.MAINNET,
      mapPool: minswapV2MapPool,
    });

    const minswapV1Tx = MinswapV1Syncer.parseTx({
      tx: wrapTx,
      networkEnv: NetworkEnvironment.MAINNET,
    });

    const sundaeswapV1Tx = SundaeSwapV1Syncer.parseTx({
      tx: wrapTx,
      networkEnv: NetworkEnvironment.MAINNET,
      mapPool: sundaeswapV1MapPool,
    });

    const sundaeswapV3Tx = SundaeSwapV3Syncer.parseTx({
      tx: wrapTx,
      networkEnv: NetworkEnvironment.MAINNET,
      mapPool: sundaeswapV3MapPool,
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

    const minswapStableswapTx = MinswapStableswapSyncer.parseTx({
      tx: wrapTx,
      networkEnv: NetworkEnvironment.MAINNET,
    });

    if (minswapV1Tx) {
      console.log(JSON.stringify(minswapV1Tx, null, 2));
    } else if (minswapV2Tx) {
      console.log(JSON.stringify(minswapV2Tx, null, 2));
    } else if (sundaeswapV1Tx) {
      console.log(JSON.stringify(sundaeswapV1Tx, null, 2));
    } else if (sundaeswapV3Tx) {
      console.log(JSON.stringify(sundaeswapV3Tx, null, 2));
    } else if (wingridersV1Tx) {
      console.log(JSON.stringify(wingridersV1Tx, null, 2));
    } else if (wingridersV2Tx) {
      console.log(JSON.stringify(wingridersV2Tx, null, 2));
    } else if (splashTx) {
      console.log(JSON.stringify(splashTx, null, 2));
    } else if (minswapStableswapTx) {
      console.log(JSON.stringify(minswapStableswapTx, null, 2));
    }
  });

  socketCardano.on("disconnect", () => {
    console.log("DISCONNECTED");
  });

  socketCardano.on("connect_error", (error) => {
    console.log("ERROR");
    console.log(error);
  });
};

main();
