import {
  ADA,
  Address,
  Asset,
  Bytes,
  DatumSource,
  NetworkEnvironment,
  PlutusData,
  TxIn,
  TxOut,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import { Maybe, RustModule } from "@minswap/felis-ledger-utils";
import { SundaeSwapV1, SundaeSwapV1Warehouse } from "@minswap/felis-sundaeswap-v1";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import { beforeAll, describe, expect, it } from "vitest";
import * as B from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("sundaeswap-v1", () => {
  // Fixture mirrors mainnet CreatePool tx in
  // packages/sundaeswap-v1/src/debug3.json (RBERRY/SBERRY, ident "00").
  // We run on TESTNET_PREPROD because the warehouse loads preprod-scripts.json
  // for that network; the script hashes happen to be identical across the
  // bundled JSONs, but pinning the network keeps the address derivation
  // self-consistent.
  it("buildCreatePool — mints pool NFT + LP, splits factory, pays change", async () => {
    const networkEnv = NetworkEnvironment.TESTNET_PREPROD;
    const warehouse = SundaeSwapV1Warehouse.getInstance(networkEnv);

    // Pair from debug3.json (sorted: RBERRY < SBERRY by token name).
    const assetA = Asset.fromString("7de52b397c138e44fb6e61aaaeb26219a8059b1749b7c3bd87bd9488.524245525259");
    const assetB = Asset.fromString("7de52b397c138e44fb6e61aaaeb26219a8059b1749b7c3bd87bd9488.534245525259");
    const amountA = 10_000_000_000n;
    const amountB = 15_000_000_000n;

    // Factory datum copied from debug3.json's input factory datum.
    const factoryDatum: SundaeSwapV1.FactoryDatum = {
      nextPoolIdent: Bytes.fromHex("00"),
      proposal: { constructor: 0, fields: [] },
      scooperIdent: Bytes.fromHex("00"),
      scoopers: [
        Bytes.fromHex("9d1cbb54faf284f5d262f591b1f9201a1858de155157dad49f3881c4"),
        Bytes.fromHex("694bc6017f9d74a5d9b3ef377b42b9fe4967a04fb1844959057f35bb"),
      ],
    };
    const factoryDatumCborHex = SundaeSwapV1.FactoryDatum.toCborHex(factoryDatum);

    const owner = Address.fromBech32(
      "addr_test1qz427uy6zgxycqxmvetz2vejxx0ccagrfwwjyjjejdmgqkn8t7n238qksqw6w3sntsy9xarjh895hwlwcly92zf6gj8sq9u6hw",
    );

    const factoryInput: Utxo = {
      input: TxIn.fromString("ac037cbfeb9535b5b5289f24ba9881a29487630827472dbeff14761ed7ca726c#0"),
      output: new TxOut(
        warehouse.factoryAddress,
        new Value().add(ADA, 2_000_000n).add(warehouse.factoryAuthenAsset, 1n),
        // V1 carries datum-by-hash; OUTLINE_DATUM bundles hash + body so the
        // builder can both verify the input and embed the body in witnesses.
        DatumSource.newOutlineDatum(Bytes.fromHex(factoryDatumCborHex)),
      ),
    };

    const walletUtxos: Utxo[] = [
      {
        input: TxIn.fromString("87cf9490fc911098a885b85bd9085bb7265ef410d7ccf87ea71c2c779600dec1#1"),
        output: new TxOut(
          owner,
          new Value().add(ADA, 50_000_000n).add(assetA, 1_000_000_000_000n).add(assetB, 1_000_000_000_000n),
        ),
      },
    ];

    const txBuilder = B.SundaeSwapV1.buildCreatePool({
      networkEnv,
      owner,
      factoryInput,
      factoryDatum,
      assetA,
      amountA,
      assetB,
      amountB,
    });

    const result = await txBuilder.complete({
      walletUtxos,
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      provider: new EmulatorProvider(networkEnv),
      changeAddress: owner,
    });
    expect(result.type).equal("ok");

    // Sanity checks on the draft after task expansion.
    const draft = txBuilder.getTxDraft();

    // Mints: 1 pool NFT + lpSupply LP, both under poolMintScriptHash.
    const lpSupply = SundaeSwapV1.isqrt(amountA * amountB);
    expect(lpSupply).toEqual(12_247_448_713n);
    const ident = factoryDatum.nextPoolIdent;
    const poolNft = warehouse.poolNftAsset(ident);
    const lpAsset = warehouse.lpAsset(ident);
    expect(draft.body.mint.get(poolNft)).toEqual(1n);
    expect(draft.body.mint.get(lpAsset)).toEqual(lpSupply);
    expect(poolNft.tokenName.hex).toEqual("702000"); // "p \x00"
    expect(lpAsset.tokenName.hex).toEqual("6c702000"); // "lp \x00"

    // The continuing factory output carries the bumped ident.
    const factoryOut = draft.body.outputs.find((o) => o.address.bech32 === warehouse.factoryAddress.bech32);
    expect(factoryOut).toBeDefined();
    expect(factoryOut?.value.get(warehouse.factoryAuthenAsset)).toEqual(1n);

    // The new pool output carries the pool NFT and both reserves.
    const poolOut = draft.body.outputs.find((o) => o.address.bech32 === warehouse.poolAddress.bech32);
    expect(poolOut).toBeDefined();
    expect(poolOut?.value.get(poolNft)).toEqual(1n);
    expect(poolOut?.value.get(assetA)).toEqual(amountA);
    expect(poolOut?.value.get(assetB)).toEqual(amountB);

    // Both factory.spend and pool.mint scripts were attached inline.
    expect(draft.plutusScripts[warehouse.factorySpendScriptHash.hex]).toBeDefined();
    expect(draft.plutusScripts[warehouse.poolMintScriptHash.hex]).toBeDefined();
  });

  // Fixture mirrors mainnet scoop tx
  // e1615e56f980b2ff86fdaf6d554bdbb347cd3b249250334b3d189c3b9ac6ec2a:
  // pool ident "03" (ADA / LQ), one swap order, scooper holds the active
  // license NFT, license-escrow output records the scoop. We don't run the
  // emulator here because the on-chain order validator's checks against the
  // license escrow require constants we don't yet hard-code; instead we assert
  // the draft has the right shape (inputs, redeemers, outputs).
  it("buildScoopTx — pool spend + 1 order spend + license escrow", () => {
    const networkEnv = NetworkEnvironment.TESTNET_PREPROD;
    const warehouse = SundaeSwapV1Warehouse.getInstance(networkEnv);

    const ident = Bytes.fromHex("03");
    const LQ = Asset.fromString("da8c30857834c6ae7203935b89278c532b3995245295456f993e1d24.4c51");

    const poolDatum: SundaeSwapV1.PoolDatum = {
      assetA: ADA,
      assetB: LQ,
      ident,
      liquidity: 41_423_744_972n,
      tradingFee: [3, 1000],
    };
    const poolDatumCborHex = SundaeSwapV1.PoolDatum.toCborHex(poolDatum);

    const poolInput: Utxo = {
      input: TxIn.fromString("cd2ba4372dd5b322da92cfeace6b5bbf4ac57cb27a0f4a2b1b173b363ba15fa6#0"),
      output: new TxOut(
        warehouse.poolAddress,
        new Value().add(ADA, 42_000_000_000n).add(warehouse.poolNftAsset(ident), 1n).add(LQ, 56_000_000_000n),
        DatumSource.newOutlineDatum(Bytes.fromHex(poolDatumCborHex)),
      ),
    };

    // Order: a user wants to swap LQ → ADA. Using the same beneficiary as the
    // mainnet tx for shape parity.
    const beneficiary = Address.fromBech32(
      "addr1qxlwpgwaqyeyygtc085w7pl09rfzmtvw7upz698jx5csn5j26m6ldzampksupgucjgt5p0ws3lqy733vmp4g887a8j9symft3f",
    );
    const orderDatum: SundaeSwapV1.OrderDatum = {
      poolIdent: ident,
      orderAddresses: {
        destination: { address: beneficiary, datum: null },
        alternate: null,
      },
      scooperFee: 2_500_000n,
      swapDirection: {
        direction: SundaeSwapV1.SwapDirection.B_TO_A,
        amount: 419_224_000n,
        minReceivable: 558_048_006n,
      },
    };
    const orderDatumHex = SundaeSwapV1.OrderDatum.toDataHex(orderDatum);
    const orderInput: Utxo = {
      input: TxIn.fromString("3f2ffa5c8d1cf54845f72bcdbebf0039e98887b275c851694e8173f83775d182#4"),
      output: new TxOut(
        warehouse.orderAddress,
        new Value().add(ADA, 5_000_000n).add(LQ, 419_224_000n),
        DatumSource.newOutlineDatum(Bytes.fromHex(orderDatumHex)),
      ),
    };

    const scooper = Address.fromBech32("addr1v9j3pglvpfhjw0334nyzl8e0lvyfgy65ngzpf84r0mudxwccapsss");
    const licensePolicy = Bytes.fromHex("e8a447d4e19016ca2aa74d20b4c4de87adb1f21dfb5493bf2d7281a6");
    const licenseSuffix = Bytes.fromHex("7b0b");
    const license = new Asset(licensePolicy, Bytes.fromHex("73636f6f706572207b0b"));
    const scooperLicenseInput: Utxo = {
      input: TxIn.fromString("b92ae9d305217f99eefa41639cb6a5353c33cfe51719b9b02523f14693f60a22#1"),
      output: new TxOut(scooper, new Value().add(ADA, 100_000_000n).add(license, 1n)),
    };

    const newPoolValue = poolInput.output.value
      .clone()
      .add(LQ, 419_224_000n) // order brings in LQ
      .subtract(ADA, 558_048_006n); // pool releases ADA to beneficiary

    const txBuilder = B.SundaeSwapV1.buildScoopTx({
      networkEnv,
      scooper,
      scooperLicenseInput,
      license,
      licenseSuffix,
      pool: { input: poolInput, datum: poolDatum, newValue: newPoolValue, newDatum: poolDatum },
      order: {
        input: orderInput,
        datum: orderDatum,
        compensation: new Value().add(ADA, 2_000_000n + 558_048_006n),
      },
      licenseEscrow: new Value().add(ADA, 2_000_000n),
      validFromMs: 1_739_999_000_000n,
      validToMs: 1_739_999_000_000n + 30n * 60_000n,
    });

    const draft = txBuilder.getTxDraft();

    // Inputs: license-pubkey + pool + order.
    const inputTxIns = draft.body.inputs.map((u) => `${u.input.txId.hex}#${u.input.index}`);
    expect(inputTxIns).toContain("cd2ba4372dd5b322da92cfeace6b5bbf4ac57cb27a0f4a2b1b173b363ba15fa6#0");
    expect(inputTxIns).toContain("3f2ffa5c8d1cf54845f72bcdbebf0039e98887b275c851694e8173f83775d182#4");
    expect(inputTxIns).toContain("b92ae9d305217f99eefa41639cb6a5353c33cfe51719b9b02523f14693f60a22#1");

    // Both pool.spend and order.spend scripts were attached inline.
    expect(draft.plutusScripts[warehouse.poolSpendScriptHash.hex]).toBeDefined();
    expect(draft.plutusScripts[warehouse.orderSpendScriptHash.hex]).toBeDefined();

    // Pool redeemer is `Constr 0 [scooperPkh, licenseSuffix]` — the pool-spend
    // script authenticates the scooper.
    const poolRedeemer = draft.witness.redeemers.find(
      (r) => r.ref === `${poolInput.input.txId.hex}#${poolInput.input.index}`,
    );
    expect(poolRedeemer).toBeDefined();
    const expectedScooperPkh = scooper.toPaymentCredential();
    invariantOrThrow(Maybe.isJust(expectedScooperPkh), "scooper must have payment credential");
    expect(PlutusData.toDataHex(poolRedeemer?.redeemerData)).toEqual(
      PlutusData.toDataHex(SundaeSwapV1.PoolRedeemer.scoop(expectedScooperPkh.payload, licenseSuffix)),
    );

    // Order redeemer is bare `Constr 0 []` — order delegates scooper auth to pool.
    const orderRedeemer = draft.witness.redeemers.find(
      (r) => r.ref === `${orderInput.input.txId.hex}#${orderInput.input.index}`,
    );
    expect(orderRedeemer).toBeDefined();
    expect(PlutusData.toDataHex(orderRedeemer?.redeemerData)).toEqual(
      PlutusData.toDataHex(SundaeSwapV1.OrderRedeemer.scoop()),
    );

    // Outputs: poolOut, escrowOut (warehouse.licenseEscrowAddress), beneficiaryOut, licenseReturnOut (scooper).
    // (Scooper change is added by coin selection at .complete() time.)
    expect(draft.body.outputs.length).toBeGreaterThanOrEqual(4);
    const addresses = draft.body.outputs.map((o) => o.address.bech32);
    expect(addresses).toContain(warehouse.poolAddress.bech32);
    expect(addresses).toContain(warehouse.licenseEscrowAddress.bech32);
    expect(addresses).toContain(beneficiary.bech32);
    expect(addresses).toContain(scooper.bech32); // license return

    // License return is the scooper output that carries the license token.
    const licenseReturnOut = draft.body.outputs.find(
      (o) => o.address.bech32 === scooper.bech32 && o.value.has(license),
    );
    expect(licenseReturnOut?.value.get(license)).toEqual(1n);
    expect(licenseReturnOut?.value.get(ADA)).toEqual(2_000_000n);

    // Scooper is required to sign.
    const scooperPkhHex = expectedScooperPkh.payload.hex;
    expect(draft.body.requireSigners.some((k) => k.keyHash.hex === scooperPkhHex)).toBe(true);
  });
});

function invariantOrThrow(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
