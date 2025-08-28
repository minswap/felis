export type Lib = typeof import("@minswap/cardano-serialization-lib-nodejs");
export type ELib = typeof import("@emurgo/cardano-serialization-lib-nodejs");
export type ULib = typeof import("@repo/uplc-node");

class Module {
  private _wasm: Lib | null = null;
  private _eWasm: ELib | null = null;
  private _uWasm: ULib | null = null;

  get get(): Lib {
    if (this._wasm === null) {
      throw new Error("RustModule has not been loaded");
    }
    return this._wasm;
  }

  get getE(): ELib {
    if (this._eWasm === null) {
      throw new Error("RustModule Emurgo has not been loaded");
    }
    return this._eWasm;
  }

  get getU(): ULib {
    if (this._uWasm === null) {
      throw new Error("UplcModule has not been loaded");
    }
    return this._uWasm;
  }

  async load(): Promise<void> {
    if (this._wasm !== null) {
      return;
    }

    if (typeof window !== "undefined") {
      const [_wasm, _eWasm, _uWasm] = await Promise.all([
        import("@minswap/cardano-serialization-lib-browser"),
        import("@emurgo/cardano-serialization-lib-browser"),
        import("@repo/uplc-web"),
      ]);
      this._wasm = _wasm;
      this._eWasm = _eWasm;
      this._uWasm = _uWasm;
    } else {
      const [_wasm, _eWasm, _uWasm] = await Promise.all([
        import("@minswap/cardano-serialization-lib-nodejs"),
        import("@emurgo/cardano-serialization-lib-nodejs"),
        import("@repo/uplc-node"),
      ]);
      this._wasm = _wasm;
      this._eWasm = _eWasm;
      this._uWasm = _uWasm;
    }
  }
}

export const RustModule: Module = new Module();
