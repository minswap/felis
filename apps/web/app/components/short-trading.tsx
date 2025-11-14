"use client";

import { Alert, Badge, Card, Tabs } from "antd";
import { useAtomValue } from "jotai";
import { nitroWalletAtom, shortPositionAtom } from "../atoms/walletAtom";
import { ShortPositionTab } from "./short-trading-position-tab";
import { ShortTradeTab } from "./short-trading-trade-tab";

export const ShortMarginTrading = () => {
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const positions = useAtomValue(shortPositionAtom);
  const hasActivePositions = (positions ?? []).length > 0;

  return (
    <Card
      extra={<Badge count={(positions ?? []).length} style={{ backgroundColor: "#ff4d4f" }} />}
      style={{ marginTop: 16 }}
      title="Isolated Margin Short $MIN"
    >
      {!nitroWallet && (
        <Alert message="Please connect Nitro Wallet to trade" showIcon style={{ marginBottom: 16 }} type="warning" />
      )}
      <Tabs
        items={[
          ...(hasActivePositions
            ? []
            : [
                {
                  key: "trade",
                  label: "Trade",
                  children: <ShortTradeTab />,
                },
              ]),
          {
            key: "position",
            label: `Position${hasActivePositions ? ` (${(positions ?? []).length})` : ""}`,
            children: <ShortPositionTab />,
          },
        ]}
      />
    </Card>
  );
};
