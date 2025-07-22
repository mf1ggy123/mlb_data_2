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
    tokenID: str = "74222696496792012687871550915060213431290440776324791435820797297779043018992"  # Working token ID
    price: float = 0.6
    size: int = 5  # Buy 5 shares

class BalanceRequest(BaseModel):
    token_id: str

def get_clob_client():
    """Initialize and return CLOB client with API credentials following official pattern"""
    global clob_client
    
    if clob_client is None:
        private_key = os.getenv("POLYMARKET_PRIVATE_KEY")
        host = os.getenv("POLYMARKET_API_HOST", "https://clob.polymarket.com")
        chain_id = int(os.getenv("POLYMARKET_CHAIN_ID", "137"))
        funder_address = os.getenv("POLYMARKET_FUNDER_ADDRESS", "0x38e2e8F5a9bD2E72CcdbeBc6b33e39FB5b1c972F")
        
        if not private_key:
            raise ValueError("POLYMARKET_PRIVATE_KEY not found in environment")
        
        print(f"🔐 Initializing CLOB client...")
        print(f"📍 Host: {host}")
        print(f"📍 Chain ID: {chain_id}")
        print(f"📍 Private key configured: {private_key[:10]}...")
        
        try:
            # Initialize client that trades directly from an EOA (following official example)
            print(f"🔧 Creating CLOB client for EOA trading...")
            clob_client = ClobClient(host, key=private_key, chain_id=chain_id, signature_type=2, funder="0xb013edc43a9cd9fe94b893551e4733d8cdbee053")
            
            # Set API credentials (following official pattern)
            print(f"🔑 Setting API credentials...")
            api_creds = clob_client.create_or_derive_api_creds()
            clob_client.set_api_creds(api_creds)
            print(f"✅ API credentials set successfully")
            
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

@app.get("/orders")
async def get_orders():
    """Get all orders for the wallet"""
    try:
        client = get_clob_client()
        
        print(f"📋 Getting orders for wallet...")
        orders = client.get_orders()
        print(f"📊 Found {len(orders)} orders: {orders}")
        
        return {
            "success": True,
            "orders": orders,
            "count": len(orders)
        }
        
    except Exception as e:
        print(f"❌ Failed to get orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/proxy_address")
async def get_proxy_address():
    """Get the Polymarket proxy address for funding"""
    try:
        client = get_clob_client()
        
        print(f"🏦 Getting proxy wallet address...")
        # Try to get proxy address - this might be a method on the client
        proxy_address = getattr(client, 'get_proxy_address', lambda: "Method not available")()
        print(f"📍 Proxy address: {proxy_address}")
        
        return {
            "success": True,
            "proxy_address": proxy_address,
            "message": "Send USDC to this address to fund your Polymarket account"
        }
        
    except Exception as e:
        print(f"❌ Failed to get proxy address: {e}")
        return {
            "success": False,
            "error": str(e),
            "wallet_address": "0x38e2e8F5a9bD2E72CcdbeBc6b33e39FB5b1c972F",
            "message": "You may need to deposit USDC to a Polymarket proxy address, not your wallet directly"
        }

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
        
        # First, check current balances and allowances
        print(f"🔍 Checking current balances before order creation...")
        
        try:
            # Check USDC balance
            usdc_params = BalanceAllowanceParams(asset_type=AssetType.COLLATERAL)
            usdc_balance = client.get_balance_allowance(params=usdc_params)
            print(f"💰 USDC balance: {usdc_balance}")
            
            # Check conditional token balance
            token_params = BalanceAllowanceParams(
                asset_type=AssetType.CONDITIONAL,
                token_id=request.tokenID
            )
            token_balance = client.get_balance_allowance(params=token_params)
            print(f"🎯 Token balance: {token_balance}")
            
        except Exception as balance_error:
            print(f"⚠️ Balance check failed: {balance_error}")
        
        # Update allowances for both USDC and conditional token
        print(f"🔧 Updating allowances before order creation...")
        
        try:
            # Update USDC allowances
            print(f"💰 Updating USDC allowances...")
            client.update_balance_allowance(params=usdc_params)
            print(f"✅ USDC allowances updated successfully")
            
            # Update conditional token allowances
            print(f"🎯 Updating conditional token allowances...")
            client.update_balance_allowance(params=token_params)
            print(f"✅ Conditional token allowances updated successfully")
            
            # Check balances again after update
            print(f"🔍 Checking balances after allowance update...")
            usdc_balance_after = client.get_balance_allowance(params=usdc_params)
            token_balance_after = client.get_balance_allowance(params=token_params)
            print(f"💰 USDC balance after update: {usdc_balance_after}")
            print(f"🎯 Token balance after update: {token_balance_after}")
            
        except Exception as allowance_error:
            print(f"⚠️ Allowance update failed: {allowance_error}")
            # Don't continue if allowances failed - this might be the issue
            raise HTTPException(status_code=500, detail=f"Allowance update failed: {allowance_error}")
        
        # Create and sign the order (following official pattern)
        order_args = OrderArgs(
            price=request.price,
            size=request.size,
            side=BUY,
            token_id=request.tokenID
        )
        
        print(f"🔧 Creating and signing order with args: {order_args}")
        signed_order = client.create_order(order_args)
        print(f"✅ Order signed: {signed_order}")
        
        # Post the order as GTC (Good-Till-Cancelled) - following official pattern
        print(f"📤 Posting GTC order...")
        order_response = client.post_order(signed_order, OrderType.FAK)
        print(f"✅ Order posted: {order_response}")
        
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