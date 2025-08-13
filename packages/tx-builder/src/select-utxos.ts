import { ADA, Address, Asset, NetworkEnvironment, TxOut, Utxo, Value } from "@repo/ledger-core";
import { Result } from "@repo/ledger-utils";
import { MAX_TOKEN_BUNDLE_SIZE } from "./constants";
import { SelectUtxosError } from "./tx-builder-error";
import { SplitChangeOutError, SplitChangeOutResult } from "./types";

/**
 * Select utxos to cover @requiredValue from @availableUtxos
 *
 * @param requiredValue value required to be covered by inputs
 * @param availableUtxos filtered list of utxos to be chosen to cover for required value
 * @returns selected UTxOs to fullfill @requiredValue
 */
export function selectUtxos(
  requiredValue: Value,
  availableUtxos: Utxo[],
  shouldSplitChange: boolean,
  changeAddress: Address,
  networkEnv: NetworkEnvironment,
): Result<Utxo[], SelectUtxosError> {
  if (requiredValue.size() === 0) {
    return Result.ok([]);
  }
  const adaOnlyInputs = availableUtxos
    .filter((utxo) => utxo.output.value.isAdaOnly())
    .sort((a, b) => Utxo.sortDesc(a, b, ADA, networkEnv));
  const otherInputs = availableUtxos.filter((utxo) => utxo.output.value.hasNativeTokens());

  const selectedUtxos: Utxo[] = [];

  // Firstly, we will select UTxOs containing other tokens to satisfy others token in @requiredValue
  const requireAssets = requiredValue.assets();
  const nonADAAssets = requireAssets.filter((value) => !value.equals(ADA));
  // select inputs for non-ADA assets
  for (const requiredAsset of nonADAAssets) {
    // get required quantity
    const requiredQty = requiredValue.get(requiredAsset);
    // filter remaining UTxOs which are not selected and sort it by descending value
    const remainingOtherInputs = otherInputs
      .filter((utxo) => {
        const notExistOnSelectedUtxos = !Utxo.contains(selectedUtxos, utxo);
        const isContainAsset = utxo.output.value.get(requiredAsset) > 0n;
        return notExistOnSelectedUtxos && isContainAsset;
      })
      .sort((a, b) => Utxo.sortDesc(a, b, requiredAsset, networkEnv));

    // select UTxOs which are needed to cover @requiredAsset in @requiredValue
    const result = selectUtxosForToken(requiredAsset, requiredQty, selectedUtxos, remainingOtherInputs);
    if (result.type === "err") {
      return result;
    }
    selectedUtxos.push(...result.value);
  }

  // Secondly, we find all remaining UTxOs to cover ADA asset, and put only ADA UTxOs in higher priority with other UTxOs
  const remainingOtherInputs = otherInputs
    .filter((utxo) => {
      if (Utxo.contains(selectedUtxos, utxo)) {
        return false;
      }
      // if not splitting, there could be a chance to extract more ADA from this utxo by merging with other utxos
      if (!shouldSplitChange) {
        return true;
      }
      // if splitting, we can only extract ADA from this utxo if
      // 1. it has < MAX_TOKEN_BUNDLE_SIZE tokens, even if there's 0 extractable ADA, we can still extract ADA from this utxo if it's merged with other utxos
      // 2. it has >= MAX_TOKEN_BUNDLE_SIZE tokens, then it needs to have some spare ADA **after** it has been splitted
      if (utxo.output.value.assets().length < MAX_TOKEN_BUNDLE_SIZE) {
        return true;
      }
      return getSpareADAAfterSplit(utxo, changeAddress, networkEnv) > 0;
    })
    .sort((a, b) => Utxo.sortDesc(a, b, ADA, networkEnv, true));
  const remainingInputs = [...adaOnlyInputs, ...remainingOtherInputs];

  const requiredAda = requiredValue.get(ADA);
  // select UTxOs which are needed to cover ADA in @requiredValue
  const result = selectUtxosForToken(ADA, requiredAda, selectedUtxos, remainingInputs);
  if (result.type === "err") {
    return result;
  }
  selectedUtxos.push(...result.value);
  return Result.ok(selectedUtxos);
}

export function selectCollateralUtxos(
  requiredCollateralAmount: bigint,
  availableUtxos: Utxo[],
  networkEnv: NetworkEnvironment,
): Result<Utxo[], SelectUtxosError> {
  const sortedUtxos = availableUtxos.sort((a, b) => Utxo.sortDesc(a, b, ADA, networkEnv, true));
  return selectUtxosForToken(ADA, requiredCollateralAmount, [], sortedUtxos);
}

/**
 * Select Utxos for specific @asset to cover @requiredQty
 * @param asset
 * @param requiredQty
 * @param selectedUtxos Utxos which are selected before
 * @param consideringUtxos Utxos which are considered to select
 * @returns selected Utxos to fullfill @requiredQty
 */
export function selectUtxosForToken(
  asset: Asset,
  requiredQty: bigint,
  selectedUtxos: Utxo[],
  consideringUtxos: Utxo[],
): Result<Utxo[], SelectUtxosError> {
  const selectingUtxos: Utxo[] = [];
  const selectedValue = Utxo.sumValue(selectedUtxos);
  if (requiredQty > selectedValue.get(asset)) {
    for (const tokenInputUtxo of consideringUtxos) {
      // push token utxo to chosen inputs
      selectingUtxos.push(tokenInputUtxo);
      // Push all assets quantity to chosen value
      selectedValue.addAll(tokenInputUtxo.output.value);
      // check token quantity satisfied
      if (requiredQty <= selectedValue.get(asset)) {
        break;
      }
    }
    if (requiredQty > selectedValue.get(asset)) {
      return Result.err(
        new SelectUtxosError(asset.toString(), BigInt(requiredQty - selectedValue.get(asset)).toString()),
      );
    }
  }
  return Result.ok(selectingUtxos);
}


/**
 * Split Change Out if it is big enough (e.g. >20 assets). This should help prevent 2 types of errors:
 *
 * 1. `Value over 5000..` - Value size is max 5k bytes, so with the split value size would be <5k bytes.
 * 2. `Transaction size over 16384..` - When wallet has smaller utxos, this issue will occur less often.
 *
 * @param changeOut Change out to be split into smaller outs with max no of tokens specified in @maxBundleSize
 * @param maxTokenBundleSize max no of tokens contained in each bundle
 * @returns minAdaAddiitional: amount ADA need to add more for satisfied minimumADA
 */
export function splitChangeOut(
  changeOut: TxOut,
  networkEnvironment: NetworkEnvironment,
  maxTokenBundleSize = MAX_TOKEN_BUNDLE_SIZE,
): Result<SplitChangeOutResult, SplitChangeOutError> {
  const nativeTokens: TxOut[] = [];
  const coins: TxOut[] = [];
  const assets = changeOut.value.flatten().filter(([asset]) => !asset.equals(ADA));
  while (assets.length) {
    const value = Value.unflatten(assets.splice(0, maxTokenBundleSize));
    const output = new TxOut(changeOut.address, value);
    output.addMinimumADAIfRequired(networkEnvironment);
    nativeTokens.push(output);
  }
  const remainingCoins = changeOut.value.get(ADA) - TxOut.sumValue(nativeTokens).get(ADA);
  if (remainingCoins < 0n) {
    return Result.err(new SplitChangeOutError(-remainingCoins));
  }
  if (remainingCoins >= TxOut.getMinimumAdaForAdaOnlyOut(networkEnvironment)) {
    coins.push(new TxOut(changeOut.address, new Value().add(ADA, remainingCoins)));
  } else {
    if (nativeTokens.length === 0) {
      return Result.err(new SplitChangeOutError(TxOut.getMinimumAdaForAdaOnlyOut(networkEnvironment) - remainingCoins));
    }
    // push remaining ada to last token bundle out since remaining ada cannot form an independent out
    nativeTokens[nativeTokens.length - 1].value.add(ADA, remainingCoins);
  }
  return Result.ok({
    coins,
    nativeTokens,
  });
}

function getSpareADAAfterSplit(utxo: Utxo, changeAddress: Address, networkEnv: NetworkEnvironment): bigint {
  const out = new TxOut(changeAddress, utxo.output.value);
  const splitChangeOutResult = splitChangeOut(out, networkEnv);
  if (splitChangeOutResult.type === "err") {
    return -splitChangeOutResult.error.additionalAdaRequired;
  }
  const changeOuts = [...splitChangeOutResult.value.coins, ...splitChangeOutResult.value.nativeTokens];
  const spareAda = changeOuts.reduce((acc, changeOut) => {
    return acc + changeOut.getExtractableADA(networkEnv);
  }, 0n);
  return spareAda;
}
