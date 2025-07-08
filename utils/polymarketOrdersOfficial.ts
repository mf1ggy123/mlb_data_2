// Polymarket Order Creation using Official CLOB Client
// Using official Polymarket TypeScript libraries

import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';

// Types for order creation
export interface CreateOrderParams {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
}

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  error?: string;
  details?: any;
}

// Official Polymarket Order Manager using CLOB Client
export class PolymarketOfficialOrderManager {
  private client: ClobClient;
  private wallet: ethers.Wallet;

  constructor() {
    // Initialize with environment variables
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const host = process.env.POLYMARKET_API_HOST || 'https://clob.polymarket.com';
    const chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137');

    if (!privateKey) {
      throw new Error('POLYMARKET_PRIVATE_KEY environment variable is required');
    }

    // Create wallet
    this.wallet = new ethers.Wallet(privateKey);

    // Initialize CLOB client with basic setup
    this.client = new ClobClient(host, chainId, this.wallet);
    
    console.log(`🔐 Polymarket Official Client initialized for: ${this.wallet.address}`);
  }

  // Create order using official client
  async createOrder(params: CreateOrderParams): Promise<OrderResponse> {
    try {
      console.log(`📋 Creating ${params.side} order using official client:`, {
        tokenId: params.tokenId,
        price: params.price,
        size: params.size,
        side: params.side
      });

      // Create order using official client
      const order = await this.client.createOrder({
        tokenID: params.tokenId,
        price: params.price,
        size: params.size,
        side: params.side,
        feeRateBps: 0, // 0 basis points fee
        nonce: Date.now(),
        expiration: Math.floor((Date.now() + 86400000) / 1000), // 24 hours from now
        taker: '0x0000000000000000000000000000000000000000', // Open order
        maker: this.wallet.address,
        chainId: parseInt(process.env.POLYMARKET_CHAIN_ID || '137')
      });

      console.log(`📋 Order created:`, order);

      // Post the order to the orderbook
      const response = await this.client.postOrder(order);

      console.log(`📡 Order posted successfully:`, response);

      return {
        success: true,
        orderId: response.orderID || response.id,
        details: response
      };

    } catch (error) {
      console.error('❌ Order creation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown order creation error',
        details: error
      };
    }
  }

  // Create buy order for 1 share
  async createBuyOrder(tokenId: string, price: number): Promise<OrderResponse> {
    return this.createOrder({
      tokenId,
      price,
      size: 1,
      side: 'BUY'
    });
  }

  // Create sell order for 1 share  
  async createSellOrder(tokenId: string, price: number): Promise<OrderResponse> {
    return this.createOrder({
      tokenId,
      price,
      size: 1,
      side: 'SELL'
    });
  }

  // Get current orders
  async getOrders(): Promise<any[]> {
    try {
      console.log(`📋 Fetching orders using official client...`);
      const orders = await this.client.getOrders();
      console.log(`📊 Retrieved ${orders.length} orders`);
      return orders;
    } catch (error) {
      console.error('❌ Error fetching orders:', error);
      return [];
    }
  }

  // Cancel order
  async cancelOrder(orderId: string): Promise<OrderResponse> {
    try {
      console.log(`❌ Cancelling order: ${orderId}`);
      const response = await this.client.cancelOrder(orderId);
      
      return {
        success: true,
        orderId,
        details: response
      };
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown cancellation error'
      };
    }
  }

  // Get order book
  async getOrderBook(tokenId: string): Promise<any> {
    try {
      console.log(`📖 Fetching order book for token: ${tokenId}`);
      const orderBook = await this.client.getOrderBook(tokenId);
      console.log(`📊 Order book retrieved:`, orderBook);
      return orderBook;
    } catch (error) {
      console.error('❌ Error fetching order book:', error);
      return null;
    }
  }

  // Get user balance
  async getBalance(): Promise<any> {
    try {
      console.log(`💰 Fetching balance...`);
      const balance = await this.client.getBalance();
      console.log(`💰 Balance:`, balance);
      return balance;
    } catch (error) {
      console.error('❌ Error fetching balance:', error);
      return null;
    }
  }

  // Get wallet address
  getAddress(): string {
    return this.wallet.address;
  }
}

// Export singleton instance
export const officialOrderManager = new PolymarketOfficialOrderManager();

// Helper function to create home team buy order
export const createHomeTeamBuyOrderOfficial = async (
  homeTokenId: string,
  price: number
): Promise<OrderResponse> => {
  console.log(`🏠 Creating official buy order for home team token: ${homeTokenId} at price: ${price}`);
  return officialOrderManager.createBuyOrder(homeTokenId, price);
};

// Helper function to create away team buy order  
export const createAwayTeamBuyOrderOfficial = async (
  awayTokenId: string,
  price: number
): Promise<OrderResponse> => {
  console.log(`✈️ Creating official buy order for away team token: ${awayTokenId} at price: ${price}`);
  return officialOrderManager.createBuyOrder(awayTokenId, price);
};

// Helper function to get current orders
export const getCurrentOrdersOfficial = async (): Promise<any[]> => {
  return officialOrderManager.getOrders();
};

// Helper function to get order book
export const getOrderBookOfficial = async (tokenId: string): Promise<any> => {
  return officialOrderManager.getOrderBook(tokenId);
};

// Helper function to get balance
export const getBalanceOfficial = async (): Promise<any> => {
  return officialOrderManager.getBalance();
};