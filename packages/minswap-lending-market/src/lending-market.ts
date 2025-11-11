import invariant from "@minswap/tiny-invariant";
import { type Address, Asset, NetworkEnvironment, PrivateKey, Utxo } from "@repo/ledger-core";
import { Result } from "@repo/ledger-utils";
import { DEXOrderTransaction } from "@repo/minswap-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@repo/minswap-dex-v2";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@repo/tx-builder";
import { LiqwidProvider } from "./liqwid-provider";

export namespace LendingMarket {
  export type MarketId = "MIN";
  export const mapMINToken = {
    [NetworkEnvironment.MAINNET]: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6.4d494e",
    [NetworkEnvironment.TESTNET_PREPROD]: "16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed72.4d494e",
    [NetworkEnvironment.TESTNET_PREVIEW]: "919d4c2c9455016289341b1a14dedf697687af31751170d56a31466e.744d494e",
  };
  export const mapApiEndpoint = {
    [NetworkEnvironment.MAINNET]: "todo",
    [NetworkEnvironment.TESTNET_PREPROD]: "todo",
    [NetworkEnvironment.TESTNET_PREVIEW]: "https://api.dev-3.minswap.org",
  };

  export type SignAndSubmitParams = {
    privateKey: string;
    networkEnv: NetworkEnvironment;
    txHex: string | Result<string, Error>;
    dry?: boolean;
  };
  export const signAndSubmit = async (params: SignAndSubmitParams): Promise<string> => {
    const { txHex, privateKey, networkEnv, dry } = params;
    let rawTx: string;
    if (typeof txHex === "string") {
      rawTx = txHex;
    } else {
      if (txHex.type === "err") {
        throw new Error(`Something error: ${txHex.error.message}`);
      } else {
        rawTx = txHex.value;
      }
    }
    if (dry) {
      // skip submitting transaction when dry run
      return rawTx;
    }
    const witnessSet = LiqwidProvider.signLiqwidTx(rawTx, PrivateKey.fromHex(privateKey));
    const submitResult = await LiqwidProvider.submitTransaction({
      transaction: rawTx,
      signature: witnessSet,
      networkEnv,
    });
    if (submitResult.type === "err") {
      throw new Error(`Failed to submit transaction: ${submitResult.error.message}`);
    }
    return submitResult.value;
  };

  export type PriceInAdaResponse = {
    price: string;
    assetA: string;
    assetB: string;
    lpAsset: string;
    datumReserves: [string, string];
    valueReserves: [string, string];
    totalLiquidity: string;
    tradingFee: {
      feeANumerator: string;
      feeBNumerator: string;
    };
    feeSharingNumerator?: string;
  };

  // 1 lovelace = ? MIN
  export const fetchAdaMinPrice = async (networkEnv: NetworkEnvironment): Promise<PriceInAdaResponse> => {
    const apiEndpoint = LendingMarket.mapApiEndpoint[networkEnv];
    const path = `${apiEndpoint}/wallet/price-in-ada?asset=${LendingMarket.mapMINToken[networkEnv]}`;
    const response = await fetch(path);
    const data = (await response.json()) as PriceInAdaResponse;
    return data;
  };

  export namespace OpeningLongPosition {
    export const OPERATION_FEE_ADA = 12_000_000n; // 12 ADA
    export type NitroWallet = {
      address: Address;
      privateKey: string;
      utxos: string[];
      submitTx: (txHex: string) => Promise<string>;
    };
    export type Step1CreateOrderParams = {
      nitroWallet: NitroWallet;
      priceInAdaResponse: PriceInAdaResponse;
      networkEnv: NetworkEnvironment;
      amountIn: bigint;
    };
    export const step1CreateOrder = async (params: Step1CreateOrderParams): Promise<string> => {
      const { nitroWallet, priceInAdaResponse, amountIn, networkEnv } = params;
      const txb = DEXOrderTransaction.createBulkOrdersTx({
        networkEnv,
        sender: nitroWallet.address,
        orderOptions: [
          {
            lpAsset: Asset.fromString(priceInAdaResponse.lpAsset),
            version: DexVersion.DEX_V2,
            type: OrderV2StepType.SWAP_EXACT_IN,
            assetIn: Asset.fromString(priceInAdaResponse.assetA),
            amountIn: amountIn,
            minimumAmountOut: 1n,
            direction: OrderV2Direction.A_TO_B,
            killOnFailed: false,
            isLimitOrder: false,
          },
        ],
      });
      const txComplete = await txb.completeUnsafe({
        changeAddress: nitroWallet.address,
        walletUtxos: nitroWallet.utxos.map(Utxo.fromHex),
        coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
        provider: new EmulatorProvider(networkEnv),
      });
      const signedTx = txComplete.signWithPrivateKey(PrivateKey.fromHex(nitroWallet.privateKey)).complete();

      const txHash = await nitroWallet.submitTx(signedTx);
      return txHash;
    };

    export type Step2SupplyMINParams = {
      nitroWallet: Omit<NitroWallet, "submitTx">;
      minAmount: bigint; // Amount of MIN tokens to supply (in lovelace units)
      networkEnv: NetworkEnvironment;
      dry?: boolean;
    };
    export const step2SupplyMIN = async (params: Step2SupplyMINParams): Promise<string> => {
      const { nitroWallet, minAmount, networkEnv, dry } = params;
      const buildTx = await LiqwidProvider.getSupplyTransaction({
        marketId: "MIN",
        amount: Number(minAmount),
        address: nitroWallet.address.bech32,
        utxos: nitroWallet.utxos,
        networkEnv,
      });
      return signAndSubmit({
        txHex: buildTx,
        privateKey: nitroWallet.privateKey,
        networkEnv,
        dry,
      });
    };

    export type BorrowAdaParams = {
      networkEnv: NetworkEnvironment;
      nitroWallet: Omit<NitroWallet, "submitTx">;
      borrowMarketId: LiqwidProvider.BorrowMarket;
      currentDebt: number;
      collaterals: LiqwidProvider.LoanCalculationInput["collaterals"];
      buildTxCollaterals: LiqwidProvider.BorrowCollateral[];
      dry?: boolean;
    };
    export const borrowAda = async (params: BorrowAdaParams): Promise<{ borrowAmount: bigint; txHash: string }> => {
      const { nitroWallet, networkEnv, borrowMarketId, currentDebt, collaterals, buildTxCollaterals } = params;
      const loanResult = await LiqwidProvider.loanCalculation({
        networkEnv,
        input: {
          market: borrowMarketId,
          debt: currentDebt,
          collaterals,
        },
      });
      if (loanResult.type === "err") {
        throw new Error(`Failed to get loan calculation: ${loanResult.error.message}`);
      }
      // buffer 5%
      const maxBorrowAmount = Math.floor((loanResult.value.maxBorrow * 1e6 * 95) / 100);
      const borrowBuildTx = await LiqwidProvider.getBorrowTransaction({
        marketId: borrowMarketId,
        amount: maxBorrowAmount,
        address: nitroWallet.address.bech32,
        utxos: nitroWallet.utxos,
        collaterals: buildTxCollaterals,
        networkEnv,
      });
      const txHash = await signAndSubmit({
        txHex: borrowBuildTx,
        privateKey: nitroWallet.privateKey,
        networkEnv,
        dry: params.dry,
      });
      return {
        borrowAmount: BigInt(maxBorrowAmount),
        txHash,
      };
    };

    export const calculateWithdrawAllAmount = async (params: {
      networkEnv: NetworkEnvironment;
      address: Address;
      marketId: LiqwidProvider.MarketId;
      qTokenAmount: number;
    }): Promise<number> => {
      const { networkEnv, address, marketId, qTokenAmount } = params;
      const tokenPriceResult = await LiqwidProvider.getMarketPriceInCurrency({
        networkEnv,
        marketId,
      });
      if (tokenPriceResult.type === "err") {
        throw new Error(`Failed to get market price: ${tokenPriceResult.error.message}`);
      }
      const tokenPrice = tokenPriceResult.value;
      const pubKeyHash = address.toPubKeyHash()?.keyHash.hex;
      invariant(pubKeyHash, "Only support PubKeyHash addresses");
      const apyResult = await LiqwidProvider.getNetApy({
        input: {
          paymentKeys: [pubKeyHash],
          supplies: [{ marketId, amount: qTokenAmount }],
        },
        networkEnv,
      });
      if (apyResult.type === "err") {
        throw new Error(`Failed to get net APY: ${apyResult.error.message}`);
      }
      const totalSupply = apyResult.value.totalSupply;
      const withdrawAllAmount = totalSupply / tokenPrice;
      return Math.floor(withdrawAllAmount);
    };

    export type WithdrawAllSupplyParams = {
      nitroWallet: Omit<NitroWallet, "submitTx">;
      networkEnv: NetworkEnvironment;
      marketId: "MIN";
      supplyQTokenAmount: number;
      dry?: boolean;
    };
    export const withdrawAllSupply = async (params: WithdrawAllSupplyParams): Promise<string> => {
      const { nitroWallet, marketId, networkEnv, supplyQTokenAmount } = params;
      let withdrawAllAmount = await calculateWithdrawAllAmount({
        networkEnv,
        address: nitroWallet.address,
        marketId,
        qTokenAmount: supplyQTokenAmount,
      });
      withdrawAllAmount = Math.floor(withdrawAllAmount);
      const withdrawResult = await LiqwidProvider.getWithdrawTransaction({
        marketId: marketId,
        amount: withdrawAllAmount,
        address: nitroWallet.address.bech32,
        utxos: nitroWallet.utxos,
        networkEnv,
      });
      return signAndSubmit({
        txHex: withdrawResult,
        privateKey: nitroWallet.privateKey,
        networkEnv,
        dry: params.dry,
      });
    };

    export type RepayAllDebtParams = {
      nitroWallet: Omit<NitroWallet, "submitTx">;
      networkEnv: NetworkEnvironment;
      dry?: boolean;
    };
    export const repayAllDebt = async (params: RepayAllDebtParams): Promise<string> => {
      const { nitroWallet, networkEnv, dry } = params;
      const pubKeyHash = nitroWallet.address.toPubKeyHash()?.keyHash.hex;
      invariant(pubKeyHash, "Only support PubKeyHash addresses");
      const loans = await LiqwidProvider.getLoansBorrow({
        input: {
          paymentKeys: [pubKeyHash],
        },
        networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      });
      const loan = Result.unwrap(loans)[0];
      const loanCollateral = loan.collaterals[0];
      const collaterals: LiqwidProvider.RepayCollateral[] = [
        {
          id: "Ada.186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0",
          amount: Math.floor((loanCollateral.amount * 1e6) / loanCollateral.market.exchangeRate),
        },
      ];
      const input: LiqwidProvider.GetRepayTransactionInput = {
        txId: loan.id,
        amount: 0,
        address: nitroWallet.address.bech32,
        utxos: nitroWallet.utxos,
        collaterals,
        networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      };
      const repayBuildTx = await LiqwidProvider.getRepayTransaction(input);
      return signAndSubmit({
        txHex: repayBuildTx,
        privateKey: nitroWallet.privateKey,
        networkEnv,
        dry,
      });
    };

    export const sellLongAsset = async (params: Step1CreateOrderParams) => {
      const { nitroWallet, priceInAdaResponse, amountIn, networkEnv } = params;
      const txb = DEXOrderTransaction.createBulkOrdersTx({
        networkEnv,
        sender: nitroWallet.address,
        orderOptions: [
          {
            lpAsset: Asset.fromString(priceInAdaResponse.lpAsset),
            version: DexVersion.DEX_V2,
            type: OrderV2StepType.SWAP_EXACT_IN,
            assetIn: Asset.fromString(priceInAdaResponse.assetB),
            amountIn: amountIn,
            minimumAmountOut: 1n,
            direction: OrderV2Direction.B_TO_A,
            killOnFailed: false,
            isLimitOrder: false,
          },
        ],
      });
      const txComplete = await txb.completeUnsafe({
        changeAddress: nitroWallet.address,
        walletUtxos: nitroWallet.utxos.map(Utxo.fromHex),
        coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
        provider: new EmulatorProvider(networkEnv),
      });
      const signedTx = txComplete.signWithPrivateKey(PrivateKey.fromHex(nitroWallet.privateKey)).complete();

      const txHash = await nitroWallet.submitTx(signedTx);
      return txHash;
    };
  }
}
