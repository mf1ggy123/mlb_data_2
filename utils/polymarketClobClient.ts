// Polymarket CLOB Client - Following Official Documentation
// https://docs.polymarket.com/developers/CLOB/clients

import { ApiKeyCreds, ClobClient, OrderType, Side, BalanceAllowanceParams, AssetType } from "@polymarket/clob-client";
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
    this.host = 'https://clob.polymarket.com';
    this.chainId = 137;

    if (!privateKey) {
      throw new Error('POLYMARKET_PRIVATE_KEY environment variable is required');
    }

    // Create wallet using ethers Wallet
    this.wallet = new Wallet(privateKey);
    
    console.log(`🔐 Polymarket CLOB Manager initialized`);
    console.log(this.wallet)
    console.log(`📍 Wallet address: ${this.wallet.address}`);
    console.log(`📍 Private key configured: ${privateKey.substring(0, 10)}...`);
    console.log(`📍 Chain ID: ${this.chainId}`);
    console.log(`📍 Host: ${this.host}`);
  }

  // Initialize the CLOB client following official documentation EXACTLY
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log(`🔄 Initializing CLOB client following official pattern...`);

      // Follow Polymarket's exact pattern - use the wallet address that matches the private key
      const funder = this.wallet.address; // Use the address derived from the private key
      console.log(`📡 Creating or deriving API key...`);
      console.log(`📍 Funder address: ${funder}`);
      console.log(`📍 Signer address: ${this.wallet.address}`);
      
      // Create CLOB client first without credentials, then derive API key
      console.log(`🔧 Creating initial CLOB client...`);
      const tempClient = new ClobClient(this.host, this.chainId, this.wallet);
      
      console.log(`🔑 Deriving API key for wallet: ${this.wallet.address}`);
      const creds = await tempClient.createOrDeriveApiKey();
      console.log(`✅ API credentials created:`, creds);

      // Use signature type 1 (Magic/Email Login equivalent for private key)
      // USe 2 for metamask wallets
      const signatureType = 2;
      
      this.client = new ClobClient(
        this.host, 
        this.chainId, 
        this.wallet, 
        creds,  // use the awaited credentials
        signatureType, 
        this.wallet.address  // use wallet address as funder
      );
      
      this.initialized = true;
      console.log(`✅ CLOB client initialized successfully (official pattern)`);
      
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

      // Check current balance and allowances for this specific token
      try {
        console.log(`💰 Checking current balance and allowances for token: ${params.tokenID}...`);
        const balanceAllowanceParams = {
          asset_type: AssetType.CONDITIONAL,
          token_id: params.tokenID
        };
        console.log(`🔍 Balance allowance params:`, balanceAllowanceParams);
        const balanceAllowance = await this.client.getBalanceAllowance(balanceAllowanceParams);
        console.log(`📊 Current balance and allowance:`, balanceAllowance);
      } catch (balanceError) {
        console.log(`⚠️ Could not get balance/allowance:`, balanceError);
      }

      // Try to update balance and allowances before creating order
      try {
        console.log(`🔧 Updating balance and allowances for token: ${params.tokenID}...`);
        const balanceAllowanceParams = {
          asset_type: AssetType.CONDITIONAL,
          token_id: params.tokenID
        };
        await this.client.updateBalanceAllowance(balanceAllowanceParams);
        console.log(`✅ Balance and allowances updated successfully for token: ${params.tokenID}`);
        
        // Check again after update
        try {
          const updatedBalanceAllowance = await this.client.getBalanceAllowance(balanceAllowanceParams);
          console.log(`📊 Updated balance and allowance:`, updatedBalanceAllowance);
        } catch (checkError) {
          console.log(`⚠️ Could not check updated balance:`, checkError);
        }
      } catch (allowanceError) {
        console.log(`⚠️ Failed to update balance/allowances:`, allowanceError);
        // Continue anyway - maybe allowances are already set
      }

      console.log(`📋 Creating ${params.side} order:`, {
        tokenID: params.tokenID,
        price: params.price,
        size: params.size,
        side: params.side
      });

      // Use Polymarket's official createAndPostOrder pattern
      console.log(`🔧 Creating order using official createAndPostOrder pattern...`);
      
      const orderResponse = await this.client.createAndPostOrder(
        {
          tokenID: params.tokenID,
          price: params.price,
          side: params.side,
          size: params.size,
          feeRateBps: 0,
        },
        { 
          tickSize: "0.01", // Use Polymarket's example tickSize
          negRisk: false 
        },
        OrderType.GTC // Use GTC like in their example
      );

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
    console.log(`🔍 Client instance exists: ${this.client}`);
    
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

  // Set up allowances for trading (required for EOA wallets)
  async setupAllowances(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      if (!this.client) {
        throw new Error('CLOB client not initialized');
      }

      console.log(`🔧 Setting up allowances for wallet: ${this.wallet.address}`);
      
      // Update balance and allowances for USDC and conditional tokens
      // This is required for EOA wallets to trade
      await this.client.updateBalanceAllowance({
        asset_type: AssetType.COLLATERAL
      });
      
      console.log(`✅ Allowances set successfully`);
      
    } catch (error) {
      console.error('❌ Error setting allowances:', error);
      throw error;
    }
  }

  // Check balances and allowances
  async checkBalances(): Promise<any> {
    try {
      await this.ensureInitialized();
      
      if (!this.client) {
        throw new Error('CLOB client not initialized');
      }

      console.log(`💰 Checking balances for wallet: ${this.wallet.address}`);
      
      // Get balance and allowance information
      const balances = await this.client.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL
      });
      console.log(`📊 Current balances and allowances:`, balances);
      
      return balances;
      
    } catch (error) {
      console.error('❌ Error checking balances:', error);
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

// Helper function to setup allowances
export const setupAllowances = async (): Promise<void> => {
  console.log(`🔧 Setting up allowances for trading...`);
  return clobManager.setupAllowances();
};

// Helper function to check balances
export const checkBalances = async (): Promise<any> => {
  console.log(`💰 Checking wallet balances...`);
  return clobManager.checkBalances();
};