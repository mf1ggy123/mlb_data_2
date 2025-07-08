import { NextRequest, NextResponse } from 'next/server';
import { clobManager } from '@/utils/polymarketClobClient';

// Test endpoint to check CLOB client status
export async function GET(request: NextRequest) {
  console.log(`\n=== CLOB CLIENT TEST START ===`);
  
  try {
    console.log(`🧪 Testing CLOB client initialization...`);
    
    // Check if manager exists
    console.log(`🔍 clobManager exists: ${!!clobManager}`);
    console.log(`🔍 clobManager address: ${clobManager.getAddress()}`);
    console.log(`🔍 clobManager initialized: ${clobManager.isInitialized()}`);
    
    // Try to initialize if not already done
    if (!clobManager.isInitialized()) {
      console.log(`🔄 Attempting to initialize CLOB client...`);
      await clobManager.initialize();
      console.log(`✅ CLOB client initialization completed`);
    } else {
      console.log(`✅ CLOB client already initialized`);
    }
    
    return NextResponse.json({
      success: true,
      status: {
        managerExists: !!clobManager,
        walletAddress: clobManager.getAddress(),
        initialized: clobManager.isInitialized()
      }
    });
    
  } catch (error) {
    console.error(`❌ CLOB client test error:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'CLOB client test error'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== CLOB CLIENT TEST END ===\n`);
  }
}