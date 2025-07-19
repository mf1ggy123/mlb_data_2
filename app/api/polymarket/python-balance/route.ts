import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  console.log(`\n=== PYTHON BALANCE CHECK START ===`);
  
  try {
    const body = await request.json();
    const { token_id, action = 'check' } = body; // action can be 'check' or 'update'
    
    if (!token_id) {
      throw new Error('token_id is required');
    }
    
    console.log(`🐍 Calling Python backend for balance ${action}...`);
    console.log(`📍 Token ID: ${token_id}`);
    
    const endpoint = action === 'update' ? '/update_allowance' : '/balance';
    
    // Call Python backend
    const response = await fetch(`${PYTHON_BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token_id
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Python backend error: ${response.status} - ${errorData}`);
    }
    
    const result = await response.json();
    console.log(`✅ Python backend response:`, result);
    
    return NextResponse.json({
      success: true,
      message: `Balance ${action} completed via Python backend`,
      result
    });
    
  } catch (error) {
    console.error(`❌ Python balance operation failed:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Python balance operation failed'
      },
      { status: 500 }
    );
  } finally {
    console.log(`=== PYTHON BALANCE CHECK END ===\n`);
  }
}