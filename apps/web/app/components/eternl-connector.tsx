"use client";

import { connectToEternlWallet, type WalletInfo } from "../lib/wallet-utils";
import styles from "./eternl-connector.module.css";

interface EternlConnectorProps {
  wallet: {
    walletInfo: WalletInfo | null;
    loading: boolean;
    error: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
  };
}

export const EternlConnector = ({ wallet }: EternlConnectorProps) => {
  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatBalance = (balance: bigint): string => {
    return (Number(balance) / 1_000_000).toFixed(2);
  };

  if (wallet.walletInfo) {
    return (
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.walletInfo}>
            <div className={styles.balanceDisplay}>
              {wallet.walletInfo.balance !== undefined && (
                <span className={styles.balance}>
                  {formatBalance(wallet.walletInfo.balance)} ADA
                </span>
              )}
            </div>
            <div className={styles.addressContainer}>
              <button
              className={styles.addressButton}
              onClick={async () => {
                await navigator.clipboard.writeText(wallet.walletInfo!.address.bech32);
                // Show success notification - you can replace this with a toast library
                const button = document.activeElement as HTMLButtonElement;
                const originalText = button.textContent;
                button.textContent = "Copied!";
                setTimeout(() => {
                button.textContent = originalText;
                }, 400);
              }}
              title={`Click to copy: ${wallet.walletInfo!.address.bech32}`}
              >
              {shortenAddress(wallet.walletInfo.address.bech32)}
              </button>
            </div>
            <button onClick={wallet.disconnect}>
              Disconnect
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.walletSection}>
          {wallet.error && <span className={styles.errorText}>{wallet.error}</span>}
          <button
            className={styles.connectButton}
            onClick={wallet.connect}
            disabled={wallet.loading}
          >
            {wallet.loading ? "Connecting..." : "Connect Eternl Wallet"}
          </button>
        </div>
      </div>
    </header>
  );
};
