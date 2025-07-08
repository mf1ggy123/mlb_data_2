import { NextRequest, NextResponse } from 'next/server';
import { createPolymarketAuth, getAuthConfig } from '@/utils/polymarketAuth';

// API route to handle Polymarket L2 authentication
export async function POST(request: NextRequest) {
  try {
    console.log(`🔐 Server-side: Starting Polymarket L2 authentication...`);
    
    // Get authentication configuration from environment
    const authConfig = getAuthConfig();
    
    // Create authentication instance
    const auth = createPolymarketAuth(
      authConfig.privateKey,
      authConfig.chainId,
      authConfig.host
    );

    console.log(`🔐 Authenticating with wallet address: ${auth.getAddress()}`);
    
    // Test the authentication
    const authResult = await auth.testAuthentication();
    
    if (authResult.success) {
      console.log(`✅ L2 authentication successful`);
      
      return NextResponse.json({
        success: true,
        message: 'Authentication successful',
        walletAddress: auth.getAddress(),
        chainId: auth.getChainId()
      });
    } else {
      console.error(`❌ L2 authentication failed:`, authResult.error);
      
      return NextResponse.json(
        { 
          success: false,
          error: authResult.error || 'Authentication failed'
        },
        { status: 401 }
      );
    }
    
  } catch (error) {
    console.error(`❌ Server-side authentication error:`, error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Authentication service error'
      },
      { status: 500 }
    );
  }
}

// Test authentication endpoint
export async function GET(request: NextRequest) {
  try {
    console.log(`🧪 Testing Polymarket L2 authentication setup...`);
    
    // Check environment variables
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const chainId = process.env.POLYMARKET_CHAIN_ID;
    const host = process.env.POLYMARKET_API_HOST;
    
    if (!privateKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'POLYMARKET_PRIVATE_KEY not configured'
        },
        { status: 500 }
      );
    }
    
    // Create auth instance and get basic info
    const auth = createPolymarketAuth();
    
    return NextResponse.json({
      success: true,
      message: 'Authentication configuration valid',
      config: {
        walletAddress: auth.getAddress(),
        chainId: auth.getChainId(),
        host: host || 'https://clob.polymarket.com',
        privateKeyConfigured: !!privateKey
      }
    });
    
  } catch (error) {
    console.error(`❌ Authentication configuration test failed:`, error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Configuration error'
      },
      { status: 500 }
    );
  }
}