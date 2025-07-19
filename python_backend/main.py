import os
import asyncio
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from py_clob_client.client import ClobClient
from py_clob_client.constants import POLYGON
from py_clob_client.order_builder.constants import BUY, SELL
from py_clob_client.clob_types import (
    BalanceAllowanceParams, 
    AssetType,
    OrderArgs,
    OrderType,
    ApiCreds
)

# Load environment variables
load_dotenv()

app = FastAPI(title="Baseball Polymarket API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global CLOB client
clob_client = None

class OrderRequest(BaseModel):
    tokenID: str = "114183019933082513843876282428124080806413441694571280704200740076696508405866"  # Default token ID
    price: float = 0.5
    size: int = 1

class BalanceRequest(BaseModel):
    token_id: str

def get_clob_client():
    """Initialize and return CLOB client with API credentials"""
    global clob_client
    
    if clob_client is None:
        private_key = os.getenv("POLYMARKET_PRIVATE_KEY")
        host = os.getenv("POLYMARKET_API_HOST", "https://clob.polymarket.com")
        chain_id = int(os.getenv("POLYMARKET_CHAIN_ID", "137"))
        
        if not private_key:
            raise ValueError("POLYMARKET_PRIVATE_KEY not found in environment")
        
        print(f"🔐 Initializing CLOB client...")
        print(f"📍 Host: {host}")
        print(f"📍 Chain ID: {chain_id}")
        print(f"📍 Private key configured: {private_key[:10]}...")
        
        try:
            # Step 1: Create initial client to derive API key
            print(f"🔧 Creating temporary client for API key derivation...")
            temp_client = ClobClient(host, key=private_key, chain_id=chain_id)
            
            # Step 2: Derive API credentials (returns ApiCreds object directly)
            print(f"🔑 Deriving API credentials...")
            creds = temp_client.derive_api_key()
            print(f"✅ API credentials derived: {creds}")
            print(f"📍 API Key: {creds.api_key}")
            print(f"📍 API Secret: {creds.api_secret[:10]}...")
            print(f"📍 API Passphrase: {creds.api_passphrase[:10]}...")
            
            # Step 4: Create final client with credentials
            print(f"🔧 Creating authenticated CLOB client...")
            clob_client = ClobClient(host, key=private_key, chain_id=chain_id, creds=creds)
            
            print(f"✅ CLOB client initialized successfully with API credentials")
            return clob_client
            
        except Exception as e:
            print(f"❌ Failed to initialize CLOB client: {e}")
            raise e
    
    return clob_client

@app.get("/")
async def root():
    return {"message": "Baseball Polymarket Python API", "status": "running"}

@app.get("/health")
async def health():
    try:
        client = get_clob_client()
        return {"status": "healthy", "clob_connected": client is not None}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/balance")
async def check_balance(request: BalanceRequest):
    """Check balance and allowances for a specific token"""
    try:
        client = get_clob_client()
        
        print(f"💰 Checking balance for token: {request.token_id}")
        
        # Check balance for conditional token
        balance_params = BalanceAllowanceParams(
            asset_type=AssetType.CONDITIONAL,
            token_id=request.token_id
        )
        
        balance_result = client.get_balance_allowance(params=balance_params)
        print(f"📊 Balance result: {balance_result}")
        
        return {
            "success": True,
            "token_id": request.token_id,
            "balance": balance_result
        }
        
    except Exception as e:
        print(f"❌ Balance check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/update_allowance")
async def update_allowance(request: BalanceRequest):
    """Update allowances for USDC and specific conditional token"""
    try:
        client = get_clob_client()
        
        print(f"🔧 Updating allowances for token: {request.token_id}")
        
        # Step 1: Update USDC (collateral) allowances
        print(f"💰 Updating USDC allowances...")
        usdc_params = BalanceAllowanceParams(asset_type=AssetType.COLLATERAL)
        client.update_balance_allowance(params=usdc_params)
        print(f"✅ USDC allowances updated successfully")
        
        # Step 2: Update allowances for conditional token
        print(f"🎯 Updating conditional token allowances...")
        token_params = BalanceAllowanceParams(
            asset_type=AssetType.CONDITIONAL,
            token_id=request.token_id
        )
        client.update_balance_allowance(params=token_params)
        print(f"✅ Conditional token allowances updated successfully for token: {request.token_id}")
        
        # Check balances after update
        usdc_balance = client.get_balance_allowance(params=usdc_params)
        token_balance = client.get_balance_allowance(params=token_params)
        
        print(f"📊 Updated USDC balance: {usdc_balance}")
        print(f"📊 Updated token balance: {token_balance}")
        
        return {
            "success": True,
            "token_id": request.token_id,
            "message": "USDC and conditional token allowances updated successfully",
            "usdc_balance": usdc_balance,
            "token_balance": token_balance
        }
        
    except Exception as e:
        print(f"❌ Allowance update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create_order")
async def create_order(request: OrderRequest):
    """Create a buy order for the specified token"""
    try:
        client = get_clob_client()
        
        print(f"📋 Creating order for token: {request.tokenID}")
        print(f"📋 Price: {request.price}, Size: {request.size}")
        
        # First, update allowances for both USDC and conditional token
        print(f"🔧 Updating allowances before order creation...")
        
        try:
            # Update USDC allowances
            print(f"💰 Updating USDC allowances...")
            usdc_params = BalanceAllowanceParams(asset_type=AssetType.COLLATERAL)
            client.update_balance_allowance(params=usdc_params)
            print(f"✅ USDC allowances updated successfully")
            
            # Update conditional token allowances
            print(f"🎯 Updating conditional token allowances...")
            token_params = BalanceAllowanceParams(
                asset_type=AssetType.CONDITIONAL,
                token_id=request.tokenID
            )
            client.update_balance_allowance(params=token_params)
            print(f"✅ Conditional token allowances updated successfully")
            
        except Exception as allowance_error:
            print(f"⚠️ Allowance update failed (continuing anyway): {allowance_error}")
        
        # Create the order
        order_args = OrderArgs(
            token_id=request.tokenID,
            price=request.price,
            size=request.size,
            side=BUY,
            order_type=OrderType.FOK  # Fill-or-Kill
        )
        
        print(f"🔧 Creating order with args: {order_args}")
        order_response = client.create_order(order_args)
        print(f"✅ Order created: {order_response}")
        
        return {
            "success": True,
            "order": order_response,
            "token_id": request.tokenID,
            "price": request.price,
            "size": request.size
        }
        
    except Exception as e:
        print(f"❌ Order creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)