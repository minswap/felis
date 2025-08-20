import { NetworkEnvironment, PrivateKey } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { beforeAll, describe, expect, it } from "vitest";
import { Bip32, baseAddressWalletFromSeed } from "../src";

const w01 =
  "enemy mad connect wrong trade ski dad shove gallery wish grain palace random split rare bridge upper wild repair include correct upon impulse eyebrow";
const networkEnv: NetworkEnvironment = NetworkEnvironment.TESTNET_PREPROD;

beforeAll(async () => {
  await RustModule.load();
});

describe("bip32", () => {
  it("extractPrivateKey", () => {
    const CSL = RustModule.get;
    const bip32PrivateKeyHex = Bip32.extractBip32PrivateKey(w01);
    const bip32PrivateKey = CSL.Bip32PrivateKey.from_hex(bip32PrivateKeyHex);
    // d0c7f9af54c8909b29e736e72d6964d2bda62e717ae65cb28dbf215a5aa9d641efc72799e030d0b51ed292eb4849ae54a3b46abe6ca104f16da00fbe4acf7250147b309606da9c09ee82873224f7e3111defd6baf506faca33067db15b875546
    const deriveOffset = 321;
    const publicKey = Bip32.extractPublicKey(w01);
    const rawPublicKey = publicKey.to_hex();
    const addresses = Bip32.deriveAddress({
      bip32PublicKeyHex: rawPublicKey,
      deriveOffsets: [deriveOffset],
      networkEnv,
    });
    const from = addresses[0].toPubKeyHash()?.keyHash.hex;

    const prk1 = Bip32.extractPrivateKey({ bip32PrivateKey, deriveOffset });
    const to1 = prk1.toPublic().toPublicKeyHash().keyHash.hex;

    const prk2 = Bip32.extractPrivateKey({ seed: w01, deriveOffset });
    const to2 = prk2.toPublic().toPublicKeyHash().keyHash.hex;

    expect(from).toEqual(to1);
    expect(from).toEqual(to2);
  });

  it("SKEY | toHex | fromHex | round-trip", () => {
    const wallet = baseAddressWalletFromSeed(w01, networkEnv);
    const pubKeyHash = wallet.address.toPubKeyHash()?.keyHash.hex;
    const skey = wallet.paymentKey.toHex();
    // skey: d8405840d0db1cea4fd6ca83a3210b6f3b04c7995639873716e0cc6d18d5562e61a9d641ac689fee3ee848fb08e0b65362cba470a3a9e2820ef4966c6f24007c60467b0c
    const prk = PrivateKey.fromHex(skey);
    const toPubKeyHash = prk.toPublic().toPublicKeyHash().keyHash.hex;
    expect(pubKeyHash).toEqual(toPubKeyHash);
  });

  it("deriveAddress", () => {
    const publicKey = Bip32.extractPublicKey(w01);
    const rawPublicKey = publicKey.to_hex();
    const addresses = Bip32.deriveAddress({
      bip32PublicKeyHex: rawPublicKey,
      deriveOffsets: [0],
      networkEnv: NetworkEnvironment.TESTNET_PREPROD,
    });
    expect(addresses[0].bech32).toEqual("addr_test1vzjd7yhl8d8aezz0spg4zghgtn7rx7zun7fkekrtk2zvw9gy90m59");
  });

  it("derive 10k offsets", () => {
    const publicKey = Bip32.extractPublicKey(w01);
    const rawPublicKey = publicKey.to_hex();
    const addresses = Bip32.deriveAddress({
      bip32PublicKeyHex: rawPublicKey,
      deriveOffsets: Array.from({ length: 10000 }, (_, i) => i),
      networkEnv: NetworkEnvironment.MAINNET,
    });
    expect(addresses.length).toEqual(10000);
  });
});
