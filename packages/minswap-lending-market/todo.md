The next feature is Minswap Lending Market - Isolated Margin Long $MIN Token
1. User can use Nitro Wallet Balance (ADA) to buy $MIN token in Margin mode (maximum x2)
2. fetch $MIN price in LendingMarket.fetchAdaMinPrice to determine how many $MIN user can buy with Nitro Wallet Balance ADA
3. the UI should be like Binance,
[Isolated Margin] [2.00x] [Auto] (it's Cross, Isolated margin, for now, Isolated only; 2.00x is leverage trading; Auto is Auto Borrow/Repay, default is Auto)
[BUY] [SELL] (it's long/short, for now, BUY only)
i [Market] (it's order type, for now, Market only)
[Market Price]
[
  [Amount]: MIN (which means how many MIN you want to buy)
  [Total]: ADA (which means how many ADA you want used to buy MIN)
]
[Slider] Using margin to help user auto input amount or total
[Avbl]: amount ADA (available amount of ADA)
[Max]: amount maximum ADA for leverage trading
[Borrow]: The corresponding amount is automatically borrowed when placing an order.
[Repay]: The corresponding amount is automatically repaid after the transaction. Fees and the actual transaction processing may alter the final amount.
[Liq.Price]: The estimate price to liquidate your position.

Section bellow (show current state of opening position)
[Position]
  [PNL(ADA)]
  [MIN Position] ~= ADA Amount
  [ADA Debt]
  [ADA Position]
  [Liq.price]
  [Close Position] (concluding, sell all MIN to ADA)
[Position]
should show current steps of long position firstly.

The Mechanism behind the sense of Long $MIN should be:
1. User choose amount/ total (MIN / ADA) to purchase.
2. Create Order to Minswap Dex V2 to buy ADA=>MIN (placeholder)
3. After Nitro Wallet received MIN (bought at step 2), Supply MIN to Liqwid Platform to get qMIN Token (placeholder)
4. Borrow ADA from Liqwid (placeholder)
5. Use ADA borrowed to buy more MIN to adapt margin amount (if need)

The Mechanism to Close Position:
1. Sell all MIN
2. Repay all borrowed ADA
3. Withdraw all qMIN tokens to MIN
4. Sell all MIN to ADA
