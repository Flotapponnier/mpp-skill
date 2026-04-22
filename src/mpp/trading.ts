/**
 * Trading utilities for MPP - Swaps and Perps
 */

import { MppClient } from "./mpp-client";

export interface SwapParams {
  chain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  fromAddress: string;
  slippage?: string;
  receiver?: string;
}

export interface PerpParams {
  action: "open" | "close";
  side: "long" | "short";
  asset: string;
  collateral: string;
  leverage: number;
  size: string;
  wallet: string;
}

export class MppTrading {
  constructor(private client: MppClient) {}

  /**
   * Get swap quote and display it
   */
  async getSwapQuote(params: Omit<SwapParams, "fromAddress">): Promise<any> {
    const quote = await this.client.getSwapQuote({
      chain: params.chain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      slippage: params.slippage || "0.5",
    });

    return quote;
  }

  /**
   * Execute a swap
   */
  async executeSwap(params: SwapParams): Promise<any> {
    const quote = await this.getSwapQuote(params);

    const swapBody = {
      chain: params.chain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      fromAddress: params.fromAddress,
      receiver: params.receiver || params.fromAddress,
      slippage: params.slippage || "0.5",
    };

    const result = await this.client.executeSwap(swapBody);
    return result;
  }

  /**
   * Get perp quote
   */
  async getPerpQuote(params: Omit<PerpParams, "wallet">): Promise<any> {
    const quoteParams: any = {
      action: params.action,
      side: params.side,
      asset: params.asset,
      collateral: params.collateral,
      leverage: params.leverage.toString(),
      size: params.size,
    };

    const quote = await this.client.getPerpQuote(quoteParams);
    return quote;
  }

  /**
   * Execute perp trade
   */
  async executePerpTrade(params: PerpParams): Promise<any> {
    const quote = await this.getPerpQuote(params);

    const perpBody = {
      action: params.action,
      side: params.side,
      asset: params.asset,
      collateral: params.collateral,
      leverage: params.leverage,
      size: params.size,
      wallet: params.wallet,
    };

    const result = await this.client.executePerpTrade(perpBody);
    return result;
  }

  /**
   * Format swap quote for display
   */
  formatSwapQuote(quote: any): string {
    return `
🔄 Swap Quote

From: ${quote.fromToken} (${quote.fromAmount})
To: ${quote.toToken} (${quote.toAmount})
Rate: 1 ${quote.fromToken} = ${quote.rate} ${quote.toToken}

Price Impact: ${quote.priceImpact}%
Slippage: ${quote.slippage}%
Gas: ${quote.gasEstimate}

Route: ${quote.route?.join(" → ") || "Direct"}
    `.trim();
  }

  /**
   * Format perp quote for display
   */
  formatPerpQuote(quote: any): string {
    return `
📊 Perp Quote

${quote.side.toUpperCase()} ${quote.asset}
Action: ${quote.action}
Leverage: ${quote.leverage}x

Entry Price: $${quote.entryPrice}
Liquidation Price: $${quote.liquidationPrice}
Position Size: ${quote.size}
Collateral: ${quote.collateral}

Fees: $${quote.fees}
    `.trim();
  }
}
