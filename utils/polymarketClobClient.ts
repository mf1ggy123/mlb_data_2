// Polymarket CLOB Client - Following Official Documentation
// https://docs.polymarket.com/developers/CLOB/clients

import { ApiKeyCreds, ClobClient, OrderType, Side } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

export interface CreateOrderParams {
  tokenID: string;
  price: number;
  size: number;
  side: Side;
}

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  error?: string;
  details?: any;
}

export class PolymarketClobManager {
  private client: ClobClient | null = null;
  private wallet: Wallet;
  private host: string;
  private chainId: number;
  private initialized: boolean = false;

  constructor() {
    // Initialize with environment variables
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    this.host = process.env.POLYMARKET_API_HOST || 'https://clob.polymarket.com';
    this.chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137');

    if (!privateKey) {
      throw new Error('POLYMARKET_PRIVATE_KEY environment variable is required');
    }

    // Create wallet using ethers Wallet
    this.wallet = new Wallet(privateKey);
    
    console.log(`🔐 Polymarket CLOB Manager initialized for: ${this.wallet.address}`);
  }

  // Initialize the CLOB client following official documentation
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log(`🔄 Initializing CLOB client...`);

      // Step 1: Create or derive API credentials
      const tempClient = new ClobClient(this.host, this.chainId, this.wallet);
      console.log(`📡 Creating API credentials...`);
      
      const creds = await tempClient.createOrDeriveApiKey();
      console.log(`✅ API credentials created`);

      // Step 2: Initialize the full client
      // Using signature type 1 for private key authentication
      const signatureType = 1;
      const funder = this.wallet.address; // Use wallet address as funder
      
      this.client = new ClobClient(
        this.host,
        this.chainId,
        this.wallet,
        creds,
        signatureType,
        funder
      );

      this.initialized = true;
      console.log(`✅ CLOB client initialized successfully`);
      
    } catch (error) {
      console.error('❌ Failed to initialize CLOB client:', error);
      throw error;
    }
  }

  // Ensure client is initialized before use
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Create and post order using FOK (Fill-or-Kill) method
  async createOrder(params: CreateOrderParams): Promise<OrderResponse> {
    try {
      await this.ensureInitialized();
      
      if (!this.client) {
        throw new Error('CLOB client not initialized');
      }

      console.log(`📋 Creating ${params.side} order:`, {
        tokenID: params.tokenID,
        price: params.price,
        size: params.size,
        side: params.side
      });

      // Try simpler order creation without market options first
      console.log(`🔧 Attempting simplified order creation...`);
      
      const orderResponse = await this.client.createOrder({
        tokenID: params.tokenID,
        price: params.price,
        side: params.side,
        size: params.size,
        feeRateBps: 0,
        nonce: Date.now(),
        expiration: Math.floor(Date.now() / 1000) + 86400 // 24 hours from now
      });

      console.log(`✅ Order created successfully:`, orderResponse);

      return {
        success: true,
        orderId: String(orderResponse.orderID || orderResponse.id || ''),
        details: orderResponse
      };

    } catch (error) {
      console.error('❌ Order creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown order creation error',
        details: error
      };
    }
  }

  // Create buy order for home team
  async createHomeTeamBuyOrder(tokenID: string, price: number): Promise<OrderResponse> {
    console.log(`🏠 Creating FOK buy order for home team token: ${tokenID} at price: ${price}`);
    console.log(`🔍 Client initialized status: ${this.initialized}`);
    console.log(`🔍 Client instance exists: ${!!this.client}`);
    
    return this.createOrder({
      tokenID,
      price,
      size: 1, // 1 share as requested
      side: Side.BUY
    });
  }

  // Create buy order for away team
  async createAwayTeamBuyOrder(tokenID: string, price: number): Promise<OrderResponse> {
    console.log(`✈️ Creating FOK buy order for away team token: ${tokenID} at price: ${price}`);
    
    return this.createOrder({
      tokenID,
      price,
      size: 1, // 1 share as requested
      side: Side.BUY
    });
  }

  // Get current orders
  async getOrders(): Promise<any[]> {
    try {
      await this.ensureInitialized();
      
      if (!this.client) {
        throw new Error('CLOB client not initialized');
      }

      console.log(`📋 Fetching current orders...`);
      // TODO: Fix this method - need to check CLOB client documentation
      console.log(`📊 Retrieved 0 orders (method disabled temporarily)`);
      return [];
      
    } catch (error) {
      console.error('❌ Error fetching orders:', error);
      return [];
    }
  }

  // Get order book
  async getOrderBook(tokenID: string): Promise<any> {
    try {
      await this.ensureInitialized();
      
      if (!this.client) {
        throw new Error('CLOB client not initialized');
      }

      console.log(`📖 Fetching order book for token: ${tokenID}`);
      const orderBook = await this.client.getOrderBook(tokenID);
      console.log(`📊 Order book retrieved`);
      return orderBook;
      
    } catch (error) {
      console.error('❌ Error fetching order book:', error);
      return null;
    }
  }

  // Get wallet address
  getAddress(): string {
    return this.wallet.address;
  }

  // Check if client is initialized
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const clobManager = new PolymarketClobManager();

// Helper function to create home team FOK buy order
export const createHomeTeamFOKOrder = async (
  tokenID: string,
  price: number
): Promise<OrderResponse> => {
  console.log(`🏠 Helper: Creating FOK buy order for home team: ${tokenID} at ${price}`);
  console.log(`🔍 clobManager instance exists: ${!!clobManager}`);
  
  try {
    const result = await clobManager.createHomeTeamBuyOrder(tokenID, price);
    console.log(`🎯 Helper result:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Helper error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Helper function error'
    };
  }
};

// Helper function to create away team FOK buy order
export const createAwayTeamFOKOrder = async (
  tokenID: string,
  price: number
): Promise<OrderResponse> => {
  console.log(`✈️ Creating FOK buy order for away team: ${tokenID} at ${price}`);
  return clobManager.createAwayTeamBuyOrder(tokenID, price);
};

// Helper function to get current orders
export const getCurrentOrders = async (): Promise<any[]> => {
  return clobManager.getOrders();
};

// Helper function to get order book
export const getOrderBook = async (tokenID: string): Promise<any> => {
  return clobManager.getOrderBook(tokenID);
};