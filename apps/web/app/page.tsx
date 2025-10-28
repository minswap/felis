"use client";

import Image, { type ImageProps } from "next/image";
import { Button } from "@repo/ui/button";
import styles from "./page.module.css";
import { RustModule, } from "@repo/ledger-utils";
import { Bytes } from "@repo/ledger-core";
import { EternlConnector } from "./components/eternl-connector";
import { NitroWalletConnector } from "./components/nitro-wallet-connector";
import { useWallet } from "./lib/use-wallet";
import { useNitroWallet } from "./lib/use-nitro-wallet";
import invariant from "@minswap/tiny-invariant";

type Props = Omit<ImageProps, "src"> & {
  srcLight: string;
  srcDark: string;
};

const ThemeImage = (props: Props) => {
  const { srcLight, srcDark, ...rest } = props;

  return (
    <>
      <Image {...rest} src={srcLight} className="imgLight" />
      <Image {...rest} src={srcDark} className="imgDark" />
    </>
  );
};

export default function Home() {
  const wallet = useWallet();
  const nitroWallet = useNitroWallet();

  const handleLoadRustModule = async () => {
    invariant(wallet.api);
    invariant(wallet.walletInfo);
    const data = await wallet.api.signData(wallet.walletInfo.address.bech32, Bytes.fromString("Tony in the air").hex);
    console.log(data);
  };

  return (
    <div className={styles.page}>
      <EternlConnector wallet={wallet} />
      <main className={styles.main}>
      <NitroWalletConnector wallet={nitroWallet} />
      <button
          className={styles.secondary}
          onClick={handleLoadRustModule}
        >
          Load RustModule
        </button>
      </main>
    </div>
  );
}
