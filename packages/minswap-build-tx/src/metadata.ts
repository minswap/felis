export enum DeprecatedMetadataMessage {
  SWAP_EXACT_IN_LIMIT_ORDER = "Minswap: Swap Exact In Limit Order",
  STABLESWAP_LIMIT_ORDER = "Minswap: Stableswap Limit Order",
  // This message is no longer in use, however we have some transactions on testnet using this metadata.
  // It must only be used for parsing, not for attaching metadata in transaction
  OLD_CONVERT_MINT = "Minswap: Harvest conversion MINt",
}

export enum MetadataMessage {
  // DEX order
  DEX_INIT_DEX_V2 = "Minswap: Setup AMM V2",
  DEX_CREATE_POOL = "Minswap: Create Pool",
  DEX_DEPOSIT_ORDER = "Minswap: Deposit Order",
  DEX_WITHDRAW_ORDER = "Minswap: Withdraw Order",
  DEX_MARKET_ORDER = "Minswap: Market Order",
  DEX_LIMIT_ORDER = "Minswap: Limit Order",
  DEX_ZAP_IN_ORDER = "Minswap: Zap In Order",
  DEX_ZAP_OUT_ORDER = "Minswap: Zap Out Order",
  DEX_STOP_ORDER = "Minswap: Stop Order",
  DEX_OCO_ORDER = "Minswap: OCO Order",
  DEX_ROUTING_ORDER = "Minswap: Routing Order",
  DEX_PARTIAL_SWAP_ORDER = "Minswap: Partial Fill Order",
  DEX_DONATION_ORDER = "Minswap: Donation Order",
  DEX_MIXED_ORDERS = "Minswap: Mixed Orders",
  DEX_CANCEL_ORDER = "Minswap: Cancel Order",

  // DEX pool
  DEX_BATCH = "Minswap: Order Executed",
  DEX_UPDATE_POOL_FEE = "Minswap: Update liquidity pool fee",
  DEX_UPDATE_POOL_DYNAMIC_FEE = "Minswap: Update liquidity pool dynamic fee",
  DEX_UPDATE_POOL_STAKE_CREDENTIAL = "Minswap: Update liquidity pool stake credential",
  DEX_WITHDRAW_POOL_FEE_SHARING = "Minswap: Withdraw fee sharing",
  DEX_LIQUIDITY_MIGRATION = "Minswap: Liquidity Migration",
  STABLESWAP_WITHDRAW_ADMIN_FEE = "Minswap: StableSwap Withdraw Admin Fee",

  // Yield Farming V1
  STAKE_LIQUIDITY = "Minswap: Stake liquidity",
  WITHDRAW_LIQUIDITY = "Minswap: Withdraw liquidity",
  HARVEST = "Minswap: Harvest reward",

  // MINt Conversion
  MINT_STAKE_LIQUIDITY = "Minswap: MINt Stake liquidity",
  MINT_UNSTAKE_LIQUIDITY = "Minswap: MINt Un-stake liquidity",
  CONVERT_MINT = "Minswap: Convert MINt to MIN",

  // Vesting
  WITHDRAW_VESTING = "Minswap: Withdraw Vesting",
  CREATE_VESTING = "Minswap: Create Vestings",

  // Launch Bowl
  LBE_DEPOSIT = "Minswap: LBE Deposit ADA",
  LB_REDEEM_BY_PURR_ASSET = "Minswap: Launch Bowl Redemption",

  // LBE V2
  LBE_V2_INIT = "Minswap: LBE V2 Init Protocol",
  LBE_V2_DEPOSIT = "Minswap: LBE V2 Deposit",
  LBE_V2_WITHDRAW_ALL = "Minswap: LBE V2 Withdraw",
  LBE_V2_UPDATE_ORDER = "Minswap: LBE V2 Update Order",
  LBE_V2_ADD_SELLERS = "Minswap: LBE V2 Add Sellers",
  LBE_V2_BATCHER_CANCEL_EVENT = "Minswap: LBE V2 Cancel Event By Batcher",
  LBE_V2_COLLECT_SELLERS = "Minswap: LBE V2 Collect Sellers",
  LBE_V2_COLLECT_MANAGER = "Minswap: LBE V2 Collect Manager",
  LBE_V2_COLLECT_ORDERS = "Minswap: LBE V2 Collect Orders",
  LBE_V2_CREATE_AMM_POOL = "Minswap: LBE V2 Create AMM Pool",
  LBE_V2_REDEEM_LP = "Minswap: LBE V2 Redeem LP",
  LBE_V2_REFUND_ORDERS = "Minswap: LBE V2 Refund Orders",
  LBE_V2_CREATE_EVENT = "Minswap: LBE V2 Create Event",
  LBE_V2_UPDATE_EVENT = "Minswap: LBE V2 Update Event",
  LBE_V2_CANCEL_EVENT = "Minswap: LBE V2 Cancel Event",
  LBE_V2_CLOSE_EVENT = "Minswap: LBE V2 Close Event",

  // Common actions
  SET_COLLATERAL = "Minswap: Set Collateral",

  // DAO
  DAO_CREATE_PROPOSAL = "Minswap: Create proposal",
  DAO_DEACTIVATE_PROPOSAL = "Minswap: Deactivate proposal",
  DAO_VOTE_ON_PORPOSAL = "Minswap: Vote on proposal",
  DAO_CREATE_LP_FEE_PROPOSAL = "Minswap: Create LP Fee Proposal",
  DAO_LP_FEE_VOTING = "Minswap: Vote on LP Fee Proposal",
  DAO_PUBLISH_LP_FEE_PROPOSAL_RESULT = "Minswap: Publish LP Fee Proposal result",
  DAO_POOL_FEE_UPDATE = "Minswap: Request of Pool Fee Manager",
  DAO_CREATE_TEMP_CHECK = "Minswap: Create Temp Check",
  DAO_CREATE_MIP_PROPOSAL = "Minswap: Create MIP Proposal",
  DAO_DEACTIVATE_TEMP_CHECK = "Minswap: Deactivate Temp Check",
  DAO_DEACTIVATE_MIP_PROPOSAL = "Minswap: Deactivate MIP Proposal",
  DAO_POST_ACTION_ON_MIP_PROPOSAL = "Minswap: Post Action on MIP Proposal",

  // Yield Farming V2
  STAKE_LIQUIDITY_V2 = "Minswap: V2 Stake liquidity",
  WITHDRAW_LIQUIDITY_V2 = "Minswap: V2 Withdraw liquidity",
  HARVEST_V2 = "Minswap: V2 Harvest reward",
  EMERGENCY_WITHDRAW_V2 = "Minswap: V2 Emergency withdraw liquidity",
  FARM_MIGRATION = "Minswap: Farm Migration",
  FARM_BATCH = "Minswap: MasterChef",

  // MIN Bar
  MIN_BAR_TIERED_STAKE = "Minswap: Stake MIN to Tiered Contract",
  MIN_BAR_TIERED_UNSTAKE = "Minswap: Unstake MIN from Tiered Contract",
  MIN_BAR_REWARD_DISTRIBUTION = "Minswap: Distribute MIN staking rewards",
  MIN_BAR_LIQUID_STAKE = "Minswap: Stake MIN to Liquid Contract",
  MIN_BAR_LIQUID_UNSTAKE = "Minswap: Unstake MIN to Liquid Contract",
  MIN_BAR_LIQUID_HARVEST = "Minswap: Claim Liquid Contract rewards",
  MIN_BAR_LIQUID_DEPOSIT = "Minswap: Deposit additional MIN to Liquid Contract",
  MIN_BAR_LIQUID_WITHDRAW = "Minswap: Partially withdraw MIN from Liquid Contract",

  // IDO
  IDO_CREATE_EVENT = "Minswap: Create IDO Event",
  IDO_DEPOSIT_ORDER = "Minswap: Deposit IDO Order",
  IDO_WITHDRAW_ORDER = "Minswap: Withdraw IDO Order",
  IDO_MATCH_EVENT = "Minswap: Match IDO Event",
  IDO_REFUND = "Minswap: IDO Refund",
  IDO_CONCLUDE_EVENT = "Minswap: IDO Conclude Event",
  IDO_CANCEL_EVENT = "Minswap: IDO Cancel Event",
  IDO_POST_SALE = "Minswap: IDO Post Sale",

  // CURVE
  CURVE_INIT = "Minswap: Setup Curve",
  CURVE_CREATE_POOL = "Minswap: Create Curve Pool",
  CURVE_BUY_ORDER = "Minswap: Buy Curve Order",
  CURVE_SELL_ORDER = "Minswap: Sell Curve Order",
  CURVE_CANCEL_ORDER = "Minswap: Cancel Curve Order",
  CURVE_BATCH_ORDERS = "Minswap: Batching Curve Orders",
  CURVE_CREATE_AMM_POOL = "Minswap: Create Curve AMM Pool",
  CURVE_REDEEM_ORDERS = "Minswap: Redeem Curve Orders",

  // LP Locker
  LP_LOCKER_CREATE = "Minswap: Lp Locker Create",
  LP_LOCKER_WITHDRAW_FEE = "Minswap: Lp Locker Withdraw Fee",
  LP_LOCKER_UPDATE_OWNER = "Minswap: Lp Locker Update Owner",

  // Aggregator
  AGGREGATOR_CREATE_PARTNER = "Minswap: Aggregator Create Partner",
  AGGREGATOR_CREATE_ORDER = "Minswap: Aggregator Market Order",
  AGGREGATOR_CANCEL_ORDER = "Minswap: Aggregator Cancel Order",
  AGGREGATOR_PAYOUT_PARTNER = "Minswap: Aggregator Payout Partner",
}
