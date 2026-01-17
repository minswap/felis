import { DexVersion, OrderV2StepType, StableswapStepType, StepType } from "./order-step";

export const BATCHER_FEE_DEX_V1: Record<StepType, bigint> = {
  [StepType.SWAP_EXACT_IN]: 900_000n,
  [StepType.SWAP_EXACT_OUT]: 900_000n,
  [StepType.DEPOSIT]: 1_000_000n,
  [StepType.WITHDRAW]: 1_000_000n,
  [StepType.ONE_SIDE_DEPOSIT]: 1_050_000n,
};

export const BATCHER_FEE_STABLESWAP: Record<StableswapStepType, bigint> = {
  [StableswapStepType.EXCHANGE]: 600_000n,
  [StableswapStepType.DEPOSIT]: 600_000n,
  [StableswapStepType.WITHDRAW]: 600_000n,
  [StableswapStepType.WITHDRAW_IMBALANCE]: 600_000n,
  [StableswapStepType.WITHDRAW_ONE_COIN]: 600_000n,
};

export const BATCHER_FEE_DEX_V2: Record<OrderV2StepType, bigint> = {
  [OrderV2StepType.SWAP_EXACT_IN]: 700_000n,
  [OrderV2StepType.STOP_LOSS]: 700_000n,
  [OrderV2StepType.OCO]: 700_000n,
  [OrderV2StepType.SWAP_EXACT_OUT]: 700_000n,
  [OrderV2StepType.DEPOSIT]: 750_000n,
  [OrderV2StepType.WITHDRAW]: 700_000n,
  [OrderV2StepType.ZAP_OUT]: 700_000n,
  [OrderV2StepType.PARTIAL_SWAP]: 720_000n,
  [OrderV2StepType.WITHDRAW_IMBALANCE]: 750_000n,
  [OrderV2StepType.SWAP_MULTI_ROUTING]: 900_000n,
  [OrderV2StepType.DONATION]: 700_000n,
};

export const BATCHER_FEE = {
  [DexVersion.DEX_V1]: BATCHER_FEE_DEX_V1,
  [DexVersion.STABLESWAP]: BATCHER_FEE_STABLESWAP,
  [DexVersion.DEX_V2]: BATCHER_FEE_DEX_V2,
};
