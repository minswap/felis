import { RustModule } from '@repo/ledger-utils';
import * as Core from "@repo/ledger-core";

const main = async () => {
  await RustModule.load();
  const ECSL = RustModule.getE;
  const x = ECSL.BigNum.from_str("243");
  console.log(x.to_str());

  const v = new Core.Value();
};

main();
