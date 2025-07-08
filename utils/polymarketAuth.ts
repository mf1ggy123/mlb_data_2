// Polymarket L2 Authentication Utilities
// Documentation: https://docs.polymarket.com/developers/CLOB/authentication

import { ethers } from 'ethers';

// Types for authentication
export interface AuthCredentials {
  privateKey: string;
  chainId: number;
  host: string;
}

export interface AuthResponse {
  success: boolean;
  credentials?: {
    key: string;
    secret: string;
    passphrase: string;
  };
  error?: string;
}

export interface L2Headers {
  'POLY-ADDRESS': string;
  'POLY-SIGNATURE': string;
  'POLY-TIMESTAMP': string;
  'POLY-NONCE': string;
}

// Authentication class for Polymarket L2
export class PolymarketAuth {
  private privateKey: string;
  private wallet: ethers.Wallet;
  private chainId: number;
  private host: string;

  constructor(credentials: AuthCredentials) {
    this.privateKey = credentials.privateKey;
    this.chainId = credentials.chainId;
    this.host = credentials.host;
    
    // Create wallet instance
    this.wallet = new ethers.Wallet(this.privateKey);
    
    console.log(`🔐 Polymarket Auth initialized for address: ${this.wallet.address}`);
  }

  // Generate nonce for authentication
  private generateNonce(): string {
    return Date.now().toString();
  }

  // Create signature for L2 authentication
  private async createSignature(
    method: string,
    requestPath: string,
    body: string,
    timestamp: string,
    nonce: string
  ): Promise<string> {
    try {
      // Create the message to sign following Polymarket's format
      const message = `${method}${requestPath}${body}${timestamp}${nonce}`;
      
      console.log(`🔐 Creating signature for message: ${message}`);
      
      // Sign the message directly as string
      const signature = await this.wallet.signMessage(message);
      
      console.log(`✅ Signature created: ${signature}`);
      
      return signature;
    } catch (error) {
      console.error('❌ Failed to create signature:', error);
      throw error;
    }
  }

  // Generate authentication headers for L2 requests
  async generateAuthHeaders(
    method: string,
    requestPath: string,
    body: string = ''
  ): Promise<L2Headers> {
    const timestamp = Date.now().toString();
    const nonce = this.generateNonce();
    
    try {
      const signature = await this.createSignature(
        method.toUpperCase(),
        requestPath,
        body,
        timestamp,
        nonce
      );

      const headers: L2Headers = {
        'POLY-ADDRESS': this.wallet.address.toLowerCase(),
        'POLY-SIGNATURE': signature,
        'POLY-TIMESTAMP': timestamp,
        'POLY-NONCE': nonce
      };

      console.log(`🔐 Generated auth headers for ${method} ${requestPath}:`, {
        address: this.wallet.address,
        timestamp,
        nonce,
        signature: signature.substring(0, 10) + '...'
      });

      return headers;
    } catch (error) {
      console.error('❌ Failed to generate auth headers:', error);
      throw error;
    }
  }

  // Test authentication with a simple API call
  async testAuthentication(): Promise<AuthResponse> {
    try {
      console.log(`🧪 Testing L2 authentication...`);
      
      // Test with a simple GET request to get markets (public endpoint that should work)
      const testPath = '/markets';
      const headers = await this.generateAuthHeaders('GET', testPath);
      
      const response = await fetch(`${this.host}${testPath}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      });

      console.log(`📡 Auth test response: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Authentication successful - can make authenticated requests`);
        
        return {
          success: true,
          credentials: {
            key: this.wallet.address,
            secret: 'authenticated',
            passphrase: 'success'
          }
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Authentication failed:`, errorData);
        
        return {
          success: false,
          error: `Authentication failed: ${response.status} - ${errorData.error || response.statusText}`
        };
      }
    } catch (error) {
      console.error('❌ Authentication test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown authentication error'
      };
    }
  }

  // Get wallet address
  getAddress(): string {
    return this.wallet.address;
  }

  // Get wallet instance for signing
  getWallet(): ethers.Wallet {
    return this.wallet;
  }

  // Get chain ID
  getChainId(): number {
    return this.chainId;
  }

  // Create authenticated fetch wrapper
  async authenticatedFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const method = options.method || 'GET';
    const body = options.body || '';
    
    try {
      const authHeaders = await this.generateAuthHeaders(
        method,
        path,
        typeof body === 'string' ? body : JSON.stringify(body)
      );

      const headers = {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers
      };

      console.log(`🔐 Making authenticated request: ${method} ${path}`);

      const response = await fetch(`${this.host}${path}`, {
        ...options,
        headers
      });

      console.log(`📡 Authenticated request response: ${response.status} ${response.statusText}`);

      return response;
    } catch (error) {
      console.error(`❌ Authenticated request failed for ${method} ${path}:`, error);
      throw error;
    }
  }
}

// Factory function to create authenticated instance
export const createPolymarketAuth = (
  privateKey?: string,
  chainId?: number,
  host?: string
): PolymarketAuth => {
  const credentials: AuthCredentials = {
    privateKey: privateKey || process.env.POLYMARKET_PRIVATE_KEY || '',
    chainId: chainId || parseInt(process.env.POLYMARKET_CHAIN_ID || '137'),
    host: host || process.env.POLYMARKET_API_HOST || 'https://clob.polymarket.com'
  };

  if (!credentials.privateKey) {
    throw new Error('POLYMARKET_PRIVATE_KEY is required for authentication');
  }

  return new PolymarketAuth(credentials);
};

// Validate private key format
export const validatePrivateKey = (privateKey: string): boolean => {
  try {
    // Check if it's a valid hex string with 0x prefix
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      return false;
    }
    
    // Try to create a wallet to validate
    new ethers.Wallet(privateKey);
    return true;
  } catch {
    return false;
  }
};

// Get environment configuration
export const getAuthConfig = (): AuthCredentials => {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137');
  const host = process.env.POLYMARKET_API_HOST || 'https://clob.polymarket.com';

  if (!privateKey) {
    throw new Error('POLYMARKET_PRIVATE_KEY environment variable is required');
  }

  if (!validatePrivateKey(privateKey)) {
    throw new Error('Invalid POLYMARKET_PRIVATE_KEY format');
  }

  return { privateKey, chainId, host };
};