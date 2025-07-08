// Polymarket CLOB Order Creation Utilities
// Documentation: https://docs.polymarket.com/developers/CLOB/orders

import { createPolymarketAuth } from './polymarketAuth';

// Types for order creation following Polymarket CLOB API
export interface OrderObject {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number; // 0 for BUY, 1 for SELL
  signatureType: number; // 0 for EOA, 1 for POLY_PROXY, 2 for POLY_GNOSIS_SAFE
  signature: string;
}

export interface OrderRequest {
  order: OrderObject;
  owner: string;
  orderType: 'FOK' | 'GTC' | 'GTD';
}

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  error?: string;
  details?: any;
}

export interface CreateOrderParams {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
}

// Order creation class
export class PolymarketOrderManager {
  private auth: ReturnType<typeof createPolymarketAuth>;

  constructor() {
    this.auth = createPolymarketAuth();
  }

  // Create a market order following Polymarket CLOB API format
  async createOrder(params: CreateOrderParams): Promise<OrderResponse> {
    try {
      console.log(`📋 Creating ${params.side} order for token ${params.tokenId}:`, {
        price: params.price,
        size: params.size,
        side: params.side
      });

      const walletAddress = this.auth.getAddress();
      const currentNonce = Date.now().toString();
      const salt = Math.floor(Math.random() * 1000000).toString();
      const expiration = Math.floor((Date.now() + 86400000) / 1000).toString(); // 24 hours from now
      
      // Convert price and size to proper amounts
      // For buy orders: makerAmount = size * price, takerAmount = size
      // For sell orders: makerAmount = size, takerAmount = size * price
      const makerAmount = params.side === 'BUY' 
        ? (params.size * params.price * 1000000).toString() // Convert to proper decimals
        : (params.size * 1000000).toString();
      const takerAmount = params.side === 'BUY' 
        ? (params.size * 1000000).toString()
        : (params.size * params.price * 1000000).toString();

      // Create the order object
      const orderObject: OrderObject = {
        salt,
        maker: walletAddress,
        signer: walletAddress,
        taker: '0x0000000000000000000000000000000000000000', // Zero address for open orders
        tokenId: params.tokenId,
        makerAmount,
        takerAmount,
        expiration,
        nonce: currentNonce,
        feeRateBps: '0', // 0 basis points fee
        side: params.side === 'BUY' ? 0 : 1, // 0 for BUY, 1 for SELL
        signatureType: 0, // EOA signature
        signature: '0x' // Will be filled after signing
      };

      // Create the message to sign (simplified for now)
      const messageToSign = `${orderObject.salt}${orderObject.maker}${orderObject.signer}${orderObject.taker}${orderObject.tokenId}${orderObject.makerAmount}${orderObject.takerAmount}${orderObject.expiration}${orderObject.nonce}${orderObject.feeRateBps}${orderObject.side}${orderObject.signatureType}`;
      
      console.log(`🔐 Signing order message...`);
      const signature = await this.auth.getWallet().signMessage(messageToSign);
      orderObject.signature = signature;

      // Create the request payload
      const orderRequest: OrderRequest = {
        order: orderObject,
        owner: walletAddress,
        orderType: 'GTC' // Good-Till-Cancelled
      };

      console.log(`📤 Order request:`, orderRequest);

      // Make authenticated request to create order
      const response = await this.auth.authenticatedFetch('/order', {
        method: 'POST',
        body: JSON.stringify(orderRequest)
      });

      console.log(`📡 Order creation response: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Order created successfully:`, data);
        
        return {
          success: true,
          orderId: data.orderId || data.id,
          details: data
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Order creation failed:`, errorData);
        
        return {
          success: false,
          error: `Order creation failed: ${response.status} - ${errorData.error || response.statusText}`,
          details: errorData
        };
      }
    } catch (error) {
      console.error('❌ Order creation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown order creation error'
      };
    }
  }

  // Create a buy order for 1 share
  async createBuyOrder(tokenId: string, price: number): Promise<OrderResponse> {
    return this.createOrder({
      tokenId,
      price,
      size: 1, // 1 share
      side: 'BUY'
    });
  }

  // Create a sell order for 1 share
  async createSellOrder(tokenId: string, price: number): Promise<OrderResponse> {
    return this.createOrder({
      tokenId,
      price,
      size: 1, // 1 share
      side: 'SELL'
    });
  }

  // Get current orders
  async getOrders(): Promise<any[]> {
    try {
      console.log(`📋 Fetching current orders...`);
      
      const response = await this.auth.authenticatedFetch('/orders', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`📊 Current orders:`, data);
        return data.orders || data || [];
      } else {
        console.error(`❌ Failed to fetch orders: ${response.status}`);
        return [];
      }
    } catch (error) {
      console.error('❌ Error fetching orders:', error);
      return [];
    }
  }

  // Cancel an order
  async cancelOrder(orderId: string): Promise<OrderResponse> {
    try {
      console.log(`❌ Cancelling order: ${orderId}`);
      
      const response = await this.auth.authenticatedFetch(`/order/${orderId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Order cancelled successfully:`, data);
        
        return {
          success: true,
          orderId,
          details: data
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Order cancellation failed:`, errorData);
        
        return {
          success: false,
          error: `Order cancellation failed: ${response.status} - ${errorData.error || response.statusText}`,
          details: errorData
        };
      }
    } catch (error) {
      console.error('❌ Order cancellation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown order cancellation error'
      };
    }
  }

  // Get order book for a token
  async getOrderBook(tokenId: string): Promise<any> {
    try {
      console.log(`📖 Fetching order book for token: ${tokenId}`);
      
      const response = await this.auth.authenticatedFetch(`/book?token_id=${tokenId}`, {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`📊 Order book:`, data);
        return data;
      } else {
        console.error(`❌ Failed to fetch order book: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Error fetching order book:', error);
      return null;
    }
  }

  // Get user's balance
  async getBalance(): Promise<any> {
    try {
      console.log(`💰 Fetching user balance...`);
      
      const response = await this.auth.authenticatedFetch('/balance', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`💰 User balance:`, data);
        return data;
      } else {
        console.error(`❌ Failed to fetch balance: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Error fetching balance:', error);
      return null;
    }
  }
}

// Export singleton instance
export const orderManager = new PolymarketOrderManager();

// Helper function to create a buy order for home team
export const createHomeTeamBuyOrder = async (
  homeTokenId: string,
  price: number
): Promise<OrderResponse> => {
  console.log(`🏠 Creating buy order for home team token: ${homeTokenId} at price: ${price}`);
  return orderManager.createBuyOrder(homeTokenId, price);
};

// Helper function to create a buy order for away team
export const createAwayTeamBuyOrder = async (
  awayTokenId: string,
  price: number
): Promise<OrderResponse> => {
  console.log(`✈️ Creating buy order for away team token: ${awayTokenId} at price: ${price}`);
  return orderManager.createBuyOrder(awayTokenId, price);
};

// Helper function to get current best price for buying
export const getBestBuyPrice = async (tokenId: string): Promise<number | null> => {
  try {
    const orderBook = await orderManager.getOrderBook(tokenId);
    if (orderBook && orderBook.asks && orderBook.asks.length > 0) {
      // Get the best ask price (lowest price someone is willing to sell at)
      const bestAsk = orderBook.asks[0];
      return parseFloat(bestAsk.price);
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting best buy price:', error);
    return null;
  }
};

// Helper function to format price for display
export const formatPrice = (price: number): string => {
  return (price * 100).toFixed(2) + '¢';
};

// Helper function to calculate order cost
export const calculateOrderCost = (price: number, size: number): number => {
  return price * size;
};