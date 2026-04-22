/**
 * MPP (Machine Payments Protocol) Client for Mobula API
 * Handles subscriptions, API key management, and data fetching
 */

export interface MppConfig {
  baseUrl?: string;
  apiKey?: string;
  agentId?: string;
}

export interface MppSubscription {
  user_id: string;
  api_keys: string[];
  plan: string;
  last_payment: string | null;
  payment_frequency: string;
  left_days: number;
  credits_left: number;
  plan_active: boolean;
}

export interface MppCredentials {
  api_key: string;
  user_id: string;
}

export interface MppTopUpResult {
  credits_added: number;
  new_credits_limit: number;
}

export class MppClient {
  private mppBaseUrl: string;
  private apiBaseUrl: string;
  private apiKey?: string;
  private agentId?: string;

  constructor(config: MppConfig = {}) {
    this.mppBaseUrl = 'https://mpp.mobula.io';
    this.apiBaseUrl = config.baseUrl || 'https://mpp.mobula.io';
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
  }

  /**
   * Subscribe to an MPP plan
   * @param plan - startup, growth, or enterprise
   * @param paymentFrequency - monthly or yearly
   * @param upgrade - whether this is an upgrade
   */
  async subscribe(
    plan: 'startup' | 'growth' | 'enterprise',
    paymentFrequency: 'monthly' | 'yearly',
    upgrade = false
  ): Promise<MppCredentials> {
    const params = new URLSearchParams({
      plan,
      payment_frequency: paymentFrequency,
      upgrade: upgrade.toString(),
    });

    const response = await fetch(
      `${this.mppBaseUrl}/agent/mpp/subscribe?${params}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Subscribe failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    this.apiKey = data.api_key;
    this.agentId = data.user_id;
    return data;
  }

  /**
   * Get current subscription status
   */
  async getSubscription(): Promise<MppSubscription> {
    const response = await fetch(`${this.mppBaseUrl}/agent/mpp/subscription`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Get subscription failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Top up credits
   * @param agentId - Agent ID to top up
   * @param amountUsd - Amount in USD (min $10, max $10,000)
   */
  async topUp(agentId: string, amountUsd: number): Promise<MppTopUpResult> {
    const params = new URLSearchParams({
      agent_id: agentId,
      amount_usd: amountUsd.toString(),
    });

    const response = await fetch(`${this.mppBaseUrl}/agent/mpp/top-up?${params}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Top-up failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Create a new API key
   */
  async createApiKey(): Promise<MppCredentials> {
    const response = await fetch(`${this.mppBaseUrl}/agent/mpp/api-keys/create`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Create API key failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(apiKey: string): Promise<{ deleted: boolean }> {
    const params = new URLSearchParams({ api_key: apiKey });

    const response = await fetch(
      `${this.mppBaseUrl}/agent/mpp/api-keys/revoke?${params}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Revoke API key failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Fetch token price
   */
  async getTokenPrice(asset: string): Promise<any> {
    const params = new URLSearchParams({ asset });
    return this.fetchApi(`/api/2/token/price?${params}`);
  }

  /**
   * Fetch wallet positions
   */
  async getWalletPositions(wallet: string): Promise<any> {
    const params = new URLSearchParams({ wallet });
    return this.fetchApi(`/api/2/wallet/positions?${params}`);
  }

  /**
   * Fetch token details
   */
  async getTokenDetails(asset: string): Promise<any> {
    const params = new URLSearchParams({ asset });
    return this.fetchApi(`/api/2/token/details?${params}`);
  }

  /**
   * Fetch wallet activity
   */
  async getWalletActivity(wallet: string): Promise<any> {
    const params = new URLSearchParams({ wallet });
    return this.fetchApi(`/api/2/wallet/activity?${params}`);
  }

  /**
   * Fetch market lighthouse (trending tokens)
   */
  async getMarketLighthouse(): Promise<any> {
    return this.fetchApi('/api/2/market/lighthouse');
  }

  /**
   * Get swap quote
   */
  async getSwapQuote(params: {
    chain: string;
    fromToken: string;
    toToken: string;
    amount: string;
    slippage?: string;
  }): Promise<any> {
    const searchParams = new URLSearchParams(params as any);
    return this.fetchApi(`/api/2/swap/quoting?${searchParams}`);
  }

  /**
   * Execute swap
   */
  async executeSwap(body: any): Promise<any> {
    return this.fetchApi('/api/2/swap/send', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Get perp quote
   */
  async getPerpQuote(params: any): Promise<any> {
    const searchParams = new URLSearchParams(params);
    return this.fetchApi(`/api/2/perp/quote?${searchParams}`);
  }

  /**
   * Execute perp trade
   */
  async executePerpTrade(body: any): Promise<any> {
    return this.fetchApi('/api/2/perp/execute', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Generic API fetch with 402 payment handling
   */
  private async fetchApi(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.apiBaseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    // Handle 402 Payment Required (MPP flow)
    if (response.status === 402) {
      const paymentInfo = response.headers.get('x-payment-info');
      throw new Error(
        `Payment required. Details: ${paymentInfo || 'Check MPP balance'}`
      );
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Get request headers
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {};
    if (this.apiKey) {
      headers['Authorization'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Set agent ID
   */
  setAgentId(agentId: string): void {
    this.agentId = agentId;
  }

  /**
   * Get current API key
   */
  getApiKey(): string | undefined {
    return this.apiKey;
  }

  /**
   * Get current agent ID
   */
  getAgentId(): string | undefined {
    return this.agentId;
  }
}
