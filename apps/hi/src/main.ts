import { RustModule } from '@repo/ledger-utils';  

const main = async () => {
  await RustModule.load();
  const ECSL = RustModule.getE;
  const x = ECSL.BigNum.from_str("243");
  console.log(x.to_str());
};

main();
