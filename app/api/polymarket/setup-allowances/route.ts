import { NextRequest, NextResponse } from 'next/server';
import { setupAllowances, checkBalances } from '@/utils/polymarketClobClient';

// API route to set up allowances for trading
export async function POST(request: NextRequest) {
  console.log(`\n=== POLYMARKET ALLOWANCES SETUP START ===`);
  
  try {
    console.log(`🔧 Setting up allowances for EOA wallet...`);
    
    // First check current balances
    console.log(`💰 Checking balances before setup...`);
    const balancesBefore = await checkBalances();
    console.log(`📊 Balances before setup:`, balancesBefore);
    
    // Set up allowances
    console.log(`🔧 Setting up allowances...`);
    await setupAllowances();
    
    // Check balances again after setup
    console.log(`💰 Checking balances after setup...`);
    const balancesAfter = await checkBalances();
    console.log(`📊 Balances after setup:`, balancesAfter);
    
    console.log(`✅ Allowances setup completed successfully`);
    
    return NextResponse.json({
      success: true,
      message: 'Allowances set up successfully',
      balancesBefore,
      balancesAfter
    });
    
  } catch (error) {
    console.error(`❌ Allowances setup failed:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Allowances setup failed'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== POLYMARKET ALLOWANCES SETUP END ===\n`);
  }
}

// API route to check balances only
export async function GET(request: NextRequest) {
  console.log(`\n=== POLYMARKET BALANCE CHECK START ===`);
  
  try {
    console.log(`💰 Checking wallet balances...`);
    
    const balances = await checkBalances();
    console.log(`📊 Current balances:`, balances);
    
    return NextResponse.json({
      success: true,
      balances
    });
    
  } catch (error) {
    console.error(`❌ Balance check failed:`, error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Balance check failed'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== POLYMARKET BALANCE CHECK END ===\n`);
  }
}