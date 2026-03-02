import { DexVersion, OrderV2StepType, StableswapStepType, StepType } from "./order-step";

export const BATCHER_FEE_DEX_V1: Record<StepType, bigint> = {
  [StepType.SWAP_EXACT_IN]: 2_000_000n,
  [StepType.SWAP_EXACT_OUT]: 2_000_000n,
  [StepType.DEPOSIT]: 2_000_000n,
  [StepType.WITHDRAW]: 2_000_000n,
  [StepType.ONE_SIDE_DEPOSIT]: 2_000_000n,
};

export const BATCHER_FEE_STABLESWAP: Record<StableswapStepType, bigint> = {
  [StableswapStepType.EXCHANGE]: 2_000_000n,
  [StableswapStepType.DEPOSIT]: 2_000_000n,
  [StableswapStepType.WITHDRAW]: 2_000_000n,
  [StableswapStepType.WITHDRAW_IMBALANCE]: 2_000_000n,
  [StableswapStepType.WITHDRAW_ONE_COIN]: 2_000_000n,
};

export const BATCHER_FEE_DEX_V2: Record<OrderV2StepType, bigint> = {
  [OrderV2StepType.SWAP_EXACT_IN]: 2_000_000n,
  [OrderV2StepType.STOP_LOSS]: 2_000_000n,
  [OrderV2StepType.OCO]: 2_000_000n,
  [OrderV2StepType.SWAP_EXACT_OUT]: 2_000_000n,
  [OrderV2StepType.DEPOSIT]: 2_000_000n,
  [OrderV2StepType.WITHDRAW]: 2_000_000n,
  [OrderV2StepType.ZAP_OUT]: 2_000_000n,
  [OrderV2StepType.PARTIAL_SWAP]: 2_000_000n,
  [OrderV2StepType.WITHDRAW_IMBALANCE]: 2_000_000n,
  [OrderV2StepType.SWAP_MULTI_ROUTING]: 2_000_000n,
  [OrderV2StepType.DONATION]: 2_000_000n,
};

export const BATCHER_FEE = {
  [DexVersion.DEX_V1]: BATCHER_FEE_DEX_V1,
  [DexVersion.STABLESWAP]: BATCHER_FEE_STABLESWAP,
  [DexVersion.DEX_V2]: BATCHER_FEE_DEX_V2,
};
