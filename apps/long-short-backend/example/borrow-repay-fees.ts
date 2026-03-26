/**
 * Analyze Liqwid borrow + repay fee structure using Cardanoscan API.
 *
 * Usage:
 *   CARDANOSCAN_API_KEY=xxx npx tsx apps/long-short-backend/example/borrow-repay-fees.ts
 */

import { Address } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { CardanoscanProvider, type CardanoscanTransaction, type CardanoscanTxIO } from "../src/provider/cardanoscan";

const PREVIEW_URL = CardanoscanProvider.PREVIEW_URL;
const API_KEY = process.env.CARDANOSCAN_API_KEY;
if (!API_KEY) {
  throw new Error("CARDANOSCAN_API_KEY env var is required");
}

const USER_ADDRESS_BECH32 = "addr_test1qr03hndgkqdw4jclnvps6ud43xvuhms7rurjq87yfgzc575pm6dyr7fz24xwkh6k0ldufe2rqhgkwcppx5fzjrx5j2rs2rt9qc";

const BORROW_TX = "31180947abc2d91bbc6352f2eeadbef331737b0052b392dfb641392730412c0c";
const REPAY_TX = "767ed7bd9a4aeaafa349d2f72ef18b35917afae2a6a29fd92dac1ca48f2fc30b";

async function fetchTxByHash(hash: string): Promise<CardanoscanTransaction> {
  const url = `${PREVIEW_URL}/transaction?hash=${hash}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", apiKey: API_KEY! },
  });
  if (!response.ok) {
    throw new Error(`Cardanoscan API error ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as CardanoscanTransaction;
}

function ada(lovelace: bigint | number | string): string {
  return `${(Number(lovelace) / 1_000_000).toFixed(6)} ADA`;
}

/** Sum lovelace across user-owned inputs/outputs only */
function userAda(ios: CardanoscanTxIO[], userHex: string): bigint {
  return ios
    .filter((io) => io.address === userHex)
    .reduce((acc, io) => acc + BigInt(io.value), 0n);
}

/** Sum lovelace across all inputs/outputs */
function totalAda(ios: CardanoscanTxIO[]): bigint {
  return ios.reduce((acc, io) => acc + BigInt(io.value), 0n);
}

/** Find net token changes for user-owned UTXOs */
function userTokenNet(
  inputs: CardanoscanTransaction["inputs"],
  outputs: CardanoscanTxIO[],
  userHex: string,
): Map<string, bigint> {
  const net = new Map<string, bigint>();
  for (const inp of inputs) {
    if (inp.address === userHex && inp.tokens) {
      for (const t of inp.tokens) {
        net.set(t.assetId, (net.get(t.assetId) ?? 0n) - BigInt(t.value));
      }
    }
  }
  for (const out of outputs) {
    if (out.address === userHex && out.tokens) {
      for (const t of out.tokens) {
        net.set(t.assetId, (net.get(t.assetId) ?? 0n) + BigInt(t.value));
      }
    }
  }
  for (const [k, v] of net) {
    if (v === 0n) net.delete(k);
  }
  return net;
}

function printSection(title: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}`);
}

async function main() {
  await RustModule.load();

  const userAddressHex = Address.fromBech32(USER_ADDRESS_BECH32).toHex();
  console.log(`User address (hex): ${userAddressHex}`);
  console.log("Fetching borrow & repay txs from Cardanoscan Preview...\n");

  const [borrowTx, repayTx] = await Promise.all([
    fetchTxByHash(BORROW_TX),
    fetchTxByHash(REPAY_TX),
  ]);

  // ── BORROW TX ──────────────────────────────────────────────────────────
  printSection("BORROW TX — Borrow 2000 ADA from Liqwid");

  const borrowUserInputAda = userAda(borrowTx.inputs, userAddressHex);
  const borrowUserOutputAda = userAda(borrowTx.outputs, userAddressHex);
  const borrowUserAdaNet = borrowUserOutputAda - borrowUserInputAda;
  const borrowFee = BigInt(borrowTx.fees);

  console.log(`  Hash:              ${borrowTx.hash}`);
  console.log(`  Timestamp:         ${borrowTx.timestamp}`);
  console.log(`  Tx fee:            ${ada(borrowFee)}`);
  console.log(`  User ADA in:       ${ada(borrowUserInputAda)}`);
  console.log(`  User ADA out:      ${ada(borrowUserOutputAda)}`);
  console.log(`  User ADA net:      ${borrowUserAdaNet >= 0n ? "+" : ""}${ada(borrowUserAdaNet)}`);

  const borrowTokenNet = userTokenNet(borrowTx.inputs, borrowTx.outputs, userAddressHex);
  if (borrowTokenNet.size > 0) {
    console.log(`  User token changes:`);
    for (const [asset, amount] of borrowTokenNet) {
      console.log(`    ${asset}: ${amount > 0n ? "+" : ""}${amount}`);
    }
  }

  const protocolInputAda = totalAda(borrowTx.inputs) - borrowUserInputAda;
  const protocolOutputAda = totalAda(borrowTx.outputs) - borrowUserOutputAda;
  const protocolAdaNet = protocolOutputAda - protocolInputAda;
  console.log(`  Protocol ADA net:  ${protocolAdaNet >= 0n ? "+" : ""}${ada(protocolAdaNet)}`);

  const borrowedAmount = 2_000_000_000n; // 2000 ADA
  const originationFee = borrowedAmount - borrowUserAdaNet - borrowFee;
  if (originationFee > 0n) {
    console.log(`\n  >> Loan origination fee: ~${ada(originationFee)} (deducted from borrowed amount)`);
    console.log(`     Fee rate: ~${((Number(originationFee) / Number(borrowedAmount)) * 100).toFixed(4)}%`);
  }

  // ── REPAY TX ───────────────────────────────────────────────────────────
  printSection("REPAY TX — Full repay & close loan");

  const repayUserInputAda = userAda(repayTx.inputs, userAddressHex);
  const repayUserOutputAda = userAda(repayTx.outputs, userAddressHex);
  const repayUserAdaNet = repayUserOutputAda - repayUserInputAda;
  const repayFee = BigInt(repayTx.fees);

  console.log(`  Hash:              ${repayTx.hash}`);
  console.log(`  Timestamp:         ${repayTx.timestamp}`);
  console.log(`  Tx fee:            ${ada(repayFee)}`);
  console.log(`  User ADA in:       ${ada(repayUserInputAda)}`);
  console.log(`  User ADA out:      ${ada(repayUserOutputAda)}`);
  console.log(`  User ADA net:      ${repayUserAdaNet >= 0n ? "+" : ""}${ada(repayUserAdaNet)}`);

  const repayTokenNet = userTokenNet(repayTx.inputs, repayTx.outputs, userAddressHex);
  if (repayTokenNet.size > 0) {
    console.log(`  User token changes:`);
    for (const [asset, amount] of repayTokenNet) {
      console.log(`    ${asset}: ${amount > 0n ? "+" : ""}${amount}`);
    }
  }

  const repayProtocolInputAda = totalAda(repayTx.inputs) - repayUserInputAda;
  const repayProtocolOutputAda = totalAda(repayTx.outputs) - repayUserOutputAda;
  const repayProtocolAdaNet = repayProtocolOutputAda - repayProtocolInputAda;
  console.log(`  Protocol ADA net:  ${repayProtocolAdaNet >= 0n ? "+" : ""}${ada(repayProtocolAdaNet)}`);

  // ── TOTAL COST SUMMARY ─────────────────────────────────────────────────
  printSection("TOTAL COST SUMMARY (borrow → repay roundtrip)");

  const totalTxFees = borrowFee + repayFee;
  const totalUserAdaNet = borrowUserAdaNet + repayUserAdaNet;

  console.log(`  Borrowed:              ${ada(borrowedAmount)}`);
  console.log(`  Borrow tx fee:         ${ada(borrowFee)}`);
  console.log(`  Repay tx fee:          ${ada(repayFee)}`);
  console.log(`  Total tx fees:         ${ada(totalTxFees)}`);
  console.log(`  User ADA net (borrow): ${borrowUserAdaNet >= 0n ? "+" : ""}${ada(borrowUserAdaNet)}`);
  console.log(`  User ADA net (repay):  ${repayUserAdaNet >= 0n ? "+" : ""}${ada(repayUserAdaNet)}`);
  console.log(`  User ADA net (total):  ${totalUserAdaNet >= 0n ? "+" : ""}${ada(totalUserAdaNet)}`);
  console.log(`\n  >> Total cost of borrow-repay: ${ada(-totalUserAdaNet)} (includes fees + interest + origination)`);

  const borrowTime = new Date(borrowTx.timestamp);
  const repayTime = new Date(repayTx.timestamp);
  const durationMs = repayTime.getTime() - borrowTime.getTime();
  const durationMin = (durationMs / 60_000).toFixed(1);
  console.log(`  Loan duration:         ${durationMin} minutes (${borrowTx.timestamp} → ${repayTx.timestamp})`);
  console.log();
}

main().catch(console.error);
