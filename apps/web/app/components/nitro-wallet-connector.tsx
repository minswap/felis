"use client";

import type { WalletInfo } from "../lib/wallet-utils";
import styles from "./nitro-wallet-connector.module.css";

interface NitroWalletConnectorProps {
  wallet: {
    walletInfo: WalletInfo | null;
    loading: boolean;
    error: string | null;
    connect: () => Promise<void>;
    disconnect: () => void;
  };
}

export const NitroWalletConnector = ({
  wallet,
}: NitroWalletConnectorProps) => {
  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatBalance = (balance: bigint): string => {
    return (Number(balance) / 1_000_000).toFixed(2);
  };

  if (wallet.walletInfo) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2>Nitro Wallet Connected</h2>
          <div className={styles.walletInfo}>
            <div className={styles.balanceDisplay}>
              {wallet.walletInfo.balance !== undefined && (
                <div className={styles.field}>
                  <label>Balance:</label>
                  <p className={styles.value}>
                    {formatBalance(wallet.walletInfo.balance)} ADA
                  </p>
                </div>
              )}
            </div>
            <div className={styles.field}>
              <label>Address:</label>
              <button
                className={styles.addressButton}
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    wallet.walletInfo!.address.bech32,
                  );
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
          </div>
          <button
            className={styles.buttonDisconnect}
            onClick={wallet.disconnect}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2>Nitro Wallet</h2>
        {wallet.error && <div className={styles.error}>{wallet.error}</div>}
        <button
          className={styles.button}
          onClick={wallet.connect}
          disabled={wallet.loading}
        >
          {wallet.loading ? "Connecting..." : "Connect Nitro Wallet"}
        </button>
      </div>
    </div>
  );
};
