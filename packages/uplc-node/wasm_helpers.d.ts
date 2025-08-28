/* tslint:disable */
/* eslint-disable */
export function apply_params_to_plutus_script(params: Uint8Array, plutus_script: Uint8Array): Uint8Array;
export function get_ex_units(tx: Uint8Array, utxos_inputs: Uint8Array[], utxos_outputs: Uint8Array[], cost_mdls: Uint8Array, cpu_budget: bigint, mem_budget: bigint, slot_config_zero_time: bigint, slot_config_zero_slot: bigint, slot_config_slot_length: number): Uint8Array[];
export function encrypt(data: string): Uint8Array;
export function decrypt(data: Uint8Array): string;
