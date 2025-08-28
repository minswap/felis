import { RustModule } from "@repo/ledger-utils";
import { beforeAll, describe, expect, it, test } from "vitest";
import { Address, NetworkEnvironment, RewardAddress } from "../src";

let networkEnv: NetworkEnvironment;

beforeAll(async () => {
  await RustModule.load();
  networkEnv = NetworkEnvironment.TESTNET_PREPROD;
});

describe("Address", () => {
  it("can do round-trip Plutus data conversion", () => {
    const baseAddressBech32 =
      "addr_test1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqrgsqqpt5sz0szqxxx4sywkvc4";
    const enterpriseAddressBech32 = "addr_test1vqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr0caag9958l3lg83y3l7";
    const pointerAddressBech32 =
      "addr_test1gqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2as0cct6y4p73e63zfp9xl8qrq7qdqm2";

    const baseAddress = Address.fromBech32(baseAddressBech32);
    expect(Address.fromPlutusJson(baseAddress.toPlutusJson(), networkEnv).toString()).toEqual(baseAddressBech32);
    expect(Address.fromPlutusDataHex(baseAddress.toPlutusDataHex(), networkEnv).toString()).toEqual(baseAddressBech32);

    const enterpriseAddress = Address.fromBech32(enterpriseAddressBech32);
    expect(Address.fromPlutusJson(enterpriseAddress.toPlutusJson(), networkEnv).toString()).toEqual(
      enterpriseAddressBech32,
    );
    expect(Address.fromPlutusDataHex(enterpriseAddress.toPlutusDataHex(), networkEnv).toString()).toEqual(
      enterpriseAddressBech32,
    );

    const pointerAddress = Address.fromBech32(pointerAddressBech32);
    expect(Address.fromPlutusJson(pointerAddress.toPlutusJson(), networkEnv).toString()).toEqual(pointerAddressBech32);
    expect(Address.fromPlutusDataHex(pointerAddress.toPlutusDataHex(), networkEnv).toString()).toEqual(
      pointerAddressBech32,
    );
  });

  it("parse address from bech 32", () => {
    const baseAddrMainnet =
      "addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmn8k8ttq8f3gag0h89aepvx3xf69g0l9pf80tqv7cve0l33sdn8p3d";
    const baseAddrTestnet =
      "addr_test1qqy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmn8k8ttq8f3gag0h89aepvx3xf69g0l9pf80tqv7cve0l33sw96paj";
    const enterpriseAddrMainnet = "addr1vyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmnqs6l44z";
    const enterpriseAddrTestnet = "addr_test1vqy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmnqtjtf68";
    const stakeAddrMainnet = "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz";
    const stakeAddrTestnet = "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl";
    const pointerAddrMainnet = "addr1gyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmnyph3wczvf2dqflgt";
    const pointerAddrTestnet = "addr_test1gqy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmnqpqgps5mee0p";

    expect(Address.fromBech32(baseAddrMainnet).bech32 === baseAddrMainnet);
    expect(Address.fromBech32(baseAddrTestnet).bech32 === baseAddrTestnet);
    expect(Address.fromBech32(enterpriseAddrMainnet).bech32 === enterpriseAddrMainnet);
    expect(Address.fromBech32(enterpriseAddrTestnet).bech32 === enterpriseAddrTestnet);
    expect(Address.fromBech32(stakeAddrMainnet).bech32 === stakeAddrMainnet);
    expect(Address.fromBech32(stakeAddrTestnet).bech32 === stakeAddrTestnet);
    expect(Address.fromBech32(pointerAddrMainnet).bech32 === pointerAddrMainnet);
    expect(Address.fromBech32(pointerAddrTestnet).bech32 === pointerAddrTestnet);

    // Legacy Address
    const legacyAddrs = [
      "Ae2tdPwUPEZ6MEMHsfoiwtAygYmsyixB3icdHw6Ex87WVarLNP4SKqkgBU9",
      "2cWKMJemoBaipzQe9BArYdo2iPUfJQdZAjm4iCzDA1AfNxJSTgm9FZQTmFCYhKkeYrede",
      "DdzFFzCqrhtBzWpZB533kKmquDpWmHDQmBUAPqXdbKQTc9gycHGx68CfUPCkpMhE9YFfVNAuFFQgKk2T9YgN3aP2rbRrUFwYx9j9twyF",
      "37btjrVyb4KGM5rFFreGtZAs4PFB2Drb37uXRHebh8rCeVWFkW8De8XAbYqvfQrAqVthfJp9Qy2YzbzNhWSiUGY3D7yJkRkChyMveKCWT8qUTNEu6e",
    ];
    for (const addr of legacyAddrs) {
      expect(Address.fromBech32(addr).bech32 === addr);
    }
  });

  test("toPubKeyHash", () => {
    expect(
      Address.fromBech32(
        "addr1qxs76zpnfyq5w0xrpjwrkkghch0ew024j83hx0dg00f9xjrx828mrjy00s2sd8awhvummze55m8hq4fqghdzqlcaqwlshwkm0m",
      ).toPubKeyHash()?.keyHash.hex,
    ).toEqual("a1ed08334901473cc30c9c3b5917c5df973d5591e3733da87bd25348");

    expect(
      Address.fromBech32("addr1vyht4ja0zcn45qvyx477qlyp6j5ftu5ng0prt9608dxp6lgpnh5ft").toPubKeyHash()?.keyHash.hex,
    ).toEqual("2ebacbaf16275a0184357de07c81d4a895f29343c235974f3b4c1d7d");

    expect(
      Address.fromBech32("stake1ux7k5ztvhwj7ykv5v7vwjjzq8ckjk0v74z9p9m5w0t55f9clf62eq").toPubKeyHash()?.keyHash.hex,
    ).toEqual("bd6a096cbba5e259946798e948403e2d2b3d9ea88a12ee8e7ae94497");

    expect(
      Address.fromBech32(
        "addr1z8snz7c4974vzdpxu65ruphl3zjdvtxw8strf2c2tmqnxz2j2c79gy9l76sdg0xwhd7r0c0kna0tycz4y5s6mlenh8pq0xmsha",
      ).toPubKeyHash()?.keyHash.hex,
    ).toBeUndefined();
  });

  test("toScriptHash", () => {
    expect(
      Address.fromBech32(
        "addr1z8snz7c4974vzdpxu65ruphl3zjdvtxw8strf2c2tmqnxz2j2c79gy9l76sdg0xwhd7r0c0kna0tycz4y5s6mlenh8pq0xmsha",
      ).toScriptHash()?.hex,
    ).toEqual("e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309");

    expect(
      Address.fromBech32("addr1wxn9efv2f6w82hagxqtn62ju4m293tqvw0uhmdl64ch8uwc0h43gt").toScriptHash()?.hex,
    ).toEqual("a65ca58a4e9c755fa830173d2a5caed458ac0c73f97db7faae2e7e3b");

    expect(
      Address.fromBech32(
        "addr1qxs76zpnfyq5w0xrpjwrkkghch0ew024j83hx0dg00f9xjrx828mrjy00s2sd8awhvummze55m8hq4fqghdzqlcaqwlshwkm0m",
      ).toScriptHash()?.hex,
    ).toBeUndefined();
  });
});

describe("RewardAddress", () => {
  test("constructor should type check", () => {
    expect(() =>
      RewardAddress.fromBech32(
        "addr1qxs76zpnfyq5w0xrpjwrkkghch0ew024j83hx0dg00f9xjrx828mrjy00s2sd8awhvummze55m8hq4fqghdzqlcaqwlshwkm0m",
      ),
    ).toThrowError();

    expect(() =>
      RewardAddress.fromBech32("stake1ux7k5ztvhwj7ykv5v7vwjjzq8ckjk0v74z9p9m5w0t55f9clf62eq"),
    ).not.toThrowError();
  });

  test("compare function must work correctly", () => {
    const rewardAddr: RewardAddress[] = [
      "stake_test1uztg6yppa0t30rslkrneva5c9qju40rhndjnuy356kxw83s6n95nu",
      "stake_test1uzkdwx64sjkt6xxtzye00y3k2m9wn5zultsguadaf4ggmssadyunp",
      "stake_test1urcnqgzt2x8hpsvej4zfudehahknm8lux894pmqwg5qshgcrn346q",
      "stake_test1uquj460qdrj4az6uy7kvtzct4w8226xq4t30dlzfhc360tgegny4m",
      "stake_test1upnakjguet3zc7qzrw54p3nc3j8c7pd5v4w8x5evdzseygs94dlxq",
      "stake_test1upxue2rk4tp0e3tp7l0nmfmj6ar7y9yvngzu0vn7fxs9ags2apttt",
      "stake_test1uzd5n43zv7alhw5gfwpeemu8uevg0c7xwhfzsakvvm2dwvqe08pn0",
      "stake_test1uz4vcaa8m5228wt725a993fjhux7a6vrx3gqxrg40z6eyksdet0kw",
      "stake_test1uzn083tm8erradk0lwzzkegewdtwj6mukk2ep2r03g9j87g0020y2",
      "stake_test1urkaxwavpp37j083cvafwymnpmqm5wl6hre4ev99pcyt3tcvq0gns",
    ]
      .map(RewardAddress.fromBech32)
      .sort((a, b) => a.compare(b));

    const expectedResult = [
      "stake_test1uquj460qdrj4az6uy7kvtzct4w8226xq4t30dlzfhc360tgegny4m",
      "stake_test1upxue2rk4tp0e3tp7l0nmfmj6ar7y9yvngzu0vn7fxs9ags2apttt",
      "stake_test1upnakjguet3zc7qzrw54p3nc3j8c7pd5v4w8x5evdzseygs94dlxq",
      "stake_test1uztg6yppa0t30rslkrneva5c9qju40rhndjnuy356kxw83s6n95nu",
      "stake_test1uzd5n43zv7alhw5gfwpeemu8uevg0c7xwhfzsakvvm2dwvqe08pn0",
      "stake_test1uzn083tm8erradk0lwzzkegewdtwj6mukk2ep2r03g9j87g0020y2",
      "stake_test1uz4vcaa8m5228wt725a993fjhux7a6vrx3gqxrg40z6eyksdet0kw",
      "stake_test1uzkdwx64sjkt6xxtzye00y3k2m9wn5zultsguadaf4ggmssadyunp",
      "stake_test1urkaxwavpp37j083cvafwymnpmqm5wl6hre4ev99pcyt3tcvq0gns",
      "stake_test1urcnqgzt2x8hpsvej4zfudehahknm8lux894pmqwg5qshgcrn346q",
    ];

    for (let i = 0; i < rewardAddr.length; i++) {
      expect(expectedResult[i]).toEqual(rewardAddr[i].bech32);
    }
  });
});
