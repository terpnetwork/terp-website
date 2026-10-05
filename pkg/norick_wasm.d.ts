/* tslint:disable */
/* eslint-disable */

/**
 * Encode circuit instance bytes for the forbidden word.
 */
export function encode_instances(forbidden: string): Uint8Array;

/**
 * Build the JSON ExecuteMsg::Proove for the zk-wasmvm-test contract.
 */
export function encode_proof_msg(cid: bigint, forbidden: string, proof_b64: string): string;

/**
 * Generate a halo2 proof that `secret_word` does not contain `forbidden`.
 *
 * Returns base64-encoded proof bytes.
 */
export function generate_proof(secret_word: string, forbidden: string): string;

/**
 * Convert a string to its field element hex (debugging).
 */
export function str_to_field_hex(s: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly encode_instances: (a: number, b: number) => [number, number];
    readonly encode_proof_msg: (a: bigint, b: number, c: number, d: number, e: number) => [number, number];
    readonly generate_proof: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly str_to_field_hex: (a: number, b: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
