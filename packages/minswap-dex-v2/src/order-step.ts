export enum DexVersion {
  DEX_V1 = "DEX_V1",
  DEX_V2 = "DEX_V2",
  STABLESWAP = "STABLESWAP",
}

export enum StepType {
  SWAP_EXACT_IN = 0,
  SWAP_EXACT_OUT = 1,
  DEPOSIT = 2,
  WITHDRAW = 3,
  ONE_SIDE_DEPOSIT = 4,
}

export enum OrderV2StepType {
  SWAP_EXACT_IN = 0,
  STOP_LOSS = 1,
  OCO = 2,
  SWAP_EXACT_OUT = 3,
  DEPOSIT = 4,
  WITHDRAW = 5,
  ZAP_OUT = 6,
  PARTIAL_SWAP = 7,
  WITHDRAW_IMBALANCE = 8,
  SWAP_MULTI_ROUTING = 9,
  DONATION = 10,
}

export enum StableswapStepType {
  EXCHANGE = 0,
  DEPOSIT = 1,
  WITHDRAW = 2,
  WITHDRAW_IMBALANCE = 3,
  WITHDRAW_ONE_COIN = 4,
}
