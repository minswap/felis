"use client";

import { Alert, Badge, Card, Tabs } from "antd";
import { useAtomValue } from "jotai";
import { longPositionAtom, nitroWalletAtom } from "../atoms/walletAtom";
import { PositionTab } from "./margin-trading-position-tab";
import { TradeTab } from "./margin-trading-trade-tab";

export const MarginTrading = () => {
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const positions = useAtomValue(longPositionAtom);
  const hasActivePositions = (positions ?? []).length > 0;

  return (
    <Card
      extra={<Badge count={(positions ?? []).length} style={{ backgroundColor: "#ff4d4f" }} />}
      style={{ marginTop: 16 }}
      title="Isolated Margin Long $MIN"
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
                  children: <TradeTab />,
                },
              ]),
          {
            key: "position",
            label: `Position${hasActivePositions ? ` (${(positions ?? []).length})` : ""}`,
            children: <PositionTab />,
          },
        ]}
      />
    </Card>
  );
};
