import { RustModule } from "@repo/ledger-utils";
import * as fc from "fast-check";
import { beforeAll, describe, it } from "vitest";
import { Asset } from "../src";
import { arbAsset } from "./arb-things";

beforeAll(async () => {
  await RustModule.load();
});

describe("property-based testing", () => {
  it("can do round-trip string conversion", () => {
    fc.assert(fc.property(arbAsset, (asset) => asset.equals(Asset.fromString(asset.toString()))));
  });
});
