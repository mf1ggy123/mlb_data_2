import { NextRequest, NextResponse } from 'next/server';
import { clobManager } from '@/utils/polymarketClobClient';

// API route to check balance and setup allowances
export async function GET(request: NextRequest) {
  console.log(`\n=== BALANCE CHECK START ===`);
  
  try {
    console.log(`💰 Checking wallet balance and allowances...`);
    
    // Initialize the CLOB client
    await clobManager.initialize();
    console.log(`✅ CLOB client initialized successfully`);
    
    // Get the wallet address
    const walletAddress = clobManager.getAddress();
    console.log(`📍 Wallet address: ${walletAddress}`);
    
    // Try to get balance information
    const balances = await clobManager.checkBalances();
    console.log(`📊 Balances:`, balances);
    
    return NextResponse.json({
      success: true,
      walletAddress,
      balances,
      message: 'Balance check completed successfully'
    });
    
  } catch (error) {
    console.error(`❌ Balance check failed:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Balance check failed',
        walletAddress: clobManager.getAddress()
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== BALANCE CHECK END ===\n`);
  }
}

// API route to setup allowances
export async function POST(request: NextRequest) {
  console.log(`\n=== ALLOWANCE SETUP START ===`);
  
  try {
    console.log(`🔧 Setting up allowances...`);
    
    // Initialize the CLOB client
    await clobManager.initialize();
    console.log(`✅ CLOB client initialized successfully`);
    
    // Setup allowances
    await clobManager.setupAllowances();
    console.log(`✅ Allowances setup completed`);
    
    // Check balances after setup
    const balances = await clobManager.checkBalances();
    console.log(`📊 Balances after setup:`, balances);
    
    return NextResponse.json({
      success: true,
      message: 'Allowances setup completed successfully',
      balances
    });
    
  } catch (error) {
    console.error(`❌ Allowance setup failed:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Allowance setup failed'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== ALLOWANCE SETUP END ===\n`);
  }
}