import { baseAddressWalletFromSeed } from "@minswap/felis-cip";
import { NetworkEnvironment } from "@minswap/felis-ledger-core";
import { signData, verifySignData } from "../src/utils/signature";
import { RustModule } from "@minswap/felis-ledger-utils";
import invariant from "@minswap/tiny-invariant";
import { HashUtils } from "../src/utils";

const main = async () => {
  await RustModule.load();
  const seed =
    "melt enemy surface feed kiss helmet suffer demise toilet insane human refuse park insect lawsuit custom inch spirit throw radio alarm creek chat symptom";
  const wallet = baseAddressWalletFromSeed(
    seed,
    NetworkEnvironment.TESTNET_PREVIEW,
  );

  const data = {
    market: "ADA-MIN",
    side: "LONG",
    amount: "500000000",
  };
  const message = Buffer.from(JSON.stringify(data)).toString("hex");
  const hashMessage = HashUtils.sha256(message);
  console.log("json data", JSON.stringify(data));
  console.log(message);
  // Sign the message
  const { signature, key } = signData(
    wallet.paymentKey,
    wallet.address.bech32,
    hashMessage,
  );

  const result = {
    data,
    user_address: wallet.address.bech32,
    witness: {
      key,
      signature,
    }
  };
  console.log(JSON.stringify(result, null, 4));

  const authenticated = verifySignData({
    message: hashMessage,
    address: wallet.address.bech32,
    key,
    signature,
  });
  invariant(authenticated, "Signature verification failed");
};

main();
