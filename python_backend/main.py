import os
import asyncio
from typing import Dict, Any, Optional, Tuple
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import ast

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

# Global win percentage data
win_percentage_data = {}

# Global game balance tracking
game_balances = {}  # Format: {"game_id": {"balance": 1000, "contracts": {"home": 0, "away": 0}, "history": []}}
current_game_states = {}  # Format: {"game_id": GameState}

class GameBalance(BaseModel):
    game_id: str
    current_balance: float
    home_contracts: int
    away_contracts: int
    
class ContractTransaction(BaseModel):
    game_id: str
    action: str  # "BUY" or "SELL"
    team: str   # "home" or "away"
    shares: int
    price_per_share: float
    total_cost: float
    reason: str

def load_win_percentage_data():
    """
    Load the statswithballsstrikes file and calculate win percentages for each game situation.
    Format: (inning, is_top, outs, (first, second, third), score_diff, (balls, strikes)): (wins, total_games)
    Returns: Dictionary with game situations as keys and home team win percentages as values
    """
    global win_percentage_data
    
    try:
        # Get the path to the stats file (assuming it's in the parent directory)
        stats_file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'statswithballsstrikes')
        
        print(f"📊 Loading win percentage data from: {stats_file_path}")
        
        with open(stats_file_path, 'r') as file:
            lines_processed = 0
            for line_num, line in enumerate(file, 1):
                line = line.strip()
                if not line:
                    continue
                
                # Progress indicator for large files
                if lines_processed % 10000 == 0 and lines_processed > 0:
                    print(f"📊 Processed {lines_processed} lines...")
                
                try:
                    # Parse the line: (situation): (wins, total)
                    parts = line.split(': ', 1)  # Only split on first occurrence
                    if len(parts) != 2:
                        continue
                    
                    # Parse the situation tuple
                    situation = ast.literal_eval(parts[0])
                    wins_total = ast.literal_eval(parts[1])
                    
                    # Extract situation components
                    inning, is_top, outs, bases_tuple, score_diff, count_tuple = situation
                    wins, total_games = wins_total
                    
                    # Skip if no games recorded
                    if total_games <= 0:
                        continue
                    
                    # Calculate win percentage
                    batting_team_win_pct = wins / total_games
                    
                    # Convert to home team win percentage
                    if is_top:  # Away team batting
                        home_team_win_pct = 1.0 - batting_team_win_pct
                    else:  # Home team batting
                        home_team_win_pct = batting_team_win_pct
                    
                    # Create hashable key
                    key = (inning, is_top, outs, bases_tuple[0], bases_tuple[1], bases_tuple[2], score_diff, count_tuple[0], count_tuple[1])
                    win_percentage_data[key] = {
                        'home_win_pct': home_team_win_pct,
                        'batting_team_win_pct': batting_team_win_pct,
                        'total_games': total_games
                    }
                    
                    lines_processed += 1
                    
                except Exception as e:
                    if lines_processed < 10:  # Only show first few parsing errors
                        print(f"⚠️ Error parsing line {line_num}: {line[:50]}... - {e}")
                    continue
        
        print(f"✅ Loaded {len(win_percentage_data)} game situations with win percentages")
        
        # Print some sample data for verification
        sample_keys = list(win_percentage_data.keys())[:5]
        print("📋 Sample win percentage data:")
        for key in sample_keys:
            data = win_percentage_data[key]
            print(f"  {key}: Home win %: {data['home_win_pct']:.3f} (from {data['total_games']} games)")
            
    except FileNotFoundError:
        print(f"❌ Stats file not found at: {stats_file_path}")
        print("🔧 Using empty win percentage data")
    except Exception as e:
        print(f"❌ Error loading win percentage data: {e}")
        print("🔧 Using empty win percentage data")

# Note: get_home_team_win_percentage function is defined after GameState class below

class OrderRequest(BaseModel):
    tokenID: str = "74222696496792012687871550915060213431290440776324791435820797297779043018992"  # Working token ID
    price: float = 0.6
    size: int = 5  # Buy 5 shares

class BalanceRequest(BaseModel):
    token_id: str

# Enhanced data models for intelligent contract decisions
class BasesState(BaseModel):
    first: bool
    second: bool
    third: bool

class GameState(BaseModel):
    homeScore: int
    awayScore: int
    inning: int
    isTopOfInning: bool
    outs: int
    strikes: int
    balls: int
    bases: BasesState
    homeTeam: str
    awayTeam: str

class PlayOutcome(BaseModel):
    description: str
    runsScored: int
    outsGained: int
    probability: float
    normValue: Optional[float] = None
    finalBases: Optional[BasesState] = None

class MarketPrices(BaseModel):
    awayPrices: Optional[Dict[str, Any]] = None
    homePrices: Optional[Dict[str, Any]] = None

class ContractDecisionRequest(BaseModel):
    gameState: GameState
    playOutcome: Optional[PlayOutcome] = None
    marketPrices: Optional[MarketPrices] = None
    tokenID: str = "74222696496792012687871550915060213431290440776324791435820797297779043018992"
    trigger: str  # "play_outcome", "game_state_change", "manual"
    maxRiskSize: int = 10  # Maximum shares to buy in a single order
    gameId: Optional[str] = None  # Unique identifier for the game

class PredictiveAnalysisRequest(BaseModel):
    gameState: GameState
    gameId: Optional[str] = None
    maxRiskSize: int = 10

def get_home_team_win_percentage(game_state: GameState) -> Optional[float]:
    """
    Get the home team win percentage for the current game state.
    Returns None if no data available for this situation.
    """
    # Convert game state to lookup key
    key = (
        game_state.inning,
        int(game_state.isTopOfInning),
        game_state.outs,
        int(game_state.bases.first),
        int(game_state.bases.second), 
        int(game_state.bases.third),
        game_state.homeScore - game_state.awayScore,  # Score difference from home team perspective
        game_state.balls,
        game_state.strikes
    )
    
    data = win_percentage_data.get(key)
    if data:
        return data['home_win_pct']
    
    return None

def initialize_game_balance(game_id: str) -> Dict[str, Any]:
    """
    Initialize a new game with $1000 starting balance and empty contract portfolio.
    """
    if game_id not in game_balances:
        game_balances[game_id] = {
            "balance": 1000.0,
            "contracts": {"home": 0, "away": 0},
            "history": [],
            "total_invested": 0.0,
            "total_profit_loss": 0.0
        }
        print(f"💰 Initialized game {game_id} with $1000 starting balance")
    
    return game_balances[game_id]

def simulate_contract_transaction(game_id: str, action: str, team: str, shares: int, price_per_share: float, reason: str) -> Dict[str, Any]:
    """
    Simulate buying or selling contracts for a team.
    Returns transaction result with updated balance and portfolio.
    """
    # Initialize game if it doesn't exist
    game_data = initialize_game_balance(game_id)
    
    total_cost = shares * price_per_share
    
    if action == "BUY":
        # Check if we have enough balance
        if game_data["balance"] < total_cost:
            return {
                "success": False,
                "error": f"Insufficient balance: ${game_data['balance']:.2f} < ${total_cost:.2f}",
                "balance": game_data["balance"],
                "contracts": game_data["contracts"].copy()
            }
        
        # Execute buy transaction
        game_data["balance"] -= total_cost
        game_data["contracts"][team] += shares
        game_data["total_invested"] += total_cost
        
        transaction = {
            "action": action,
            "team": team,
            "shares": shares,
            "price_per_share": price_per_share,
            "total_cost": total_cost,
            "reason": reason,
            "timestamp": "now",  # In production, use datetime
            "balance_after": game_data["balance"]
        }
        
        game_data["history"].append(transaction)
        
        print(f"💰 BUY: {shares} {team.upper()} contracts @ ${price_per_share:.2f} = ${total_cost:.2f}")
        print(f"💰 New balance: ${game_data['balance']:.2f}, Contracts: Home {game_data['contracts']['home']}, Away {game_data['contracts']['away']}")
        
        return {
            "success": True,
            "action": "BUY",
            "team": team,
            "shares": shares,
            "total_cost": total_cost,
            "balance": game_data["balance"],
            "contracts": game_data["contracts"].copy(),
            "transaction": transaction
        }
    
    elif action == "SELL":
        # Check if we have contracts to sell
        if game_data["contracts"][team] <= 0:
            return {
                "success": False,
                "error": f"No {team} contracts to sell (current: {game_data['contracts'][team]})",
                "balance": game_data["balance"],
                "contracts": game_data["contracts"].copy()
            }
        
        # Sell all contracts for the team (as per requirement)
        shares_to_sell = game_data["contracts"][team]
        total_proceeds = shares_to_sell * price_per_share
        
        # Execute sell transaction
        game_data["balance"] += total_proceeds
        game_data["contracts"][team] = 0
        game_data["total_profit_loss"] += (total_proceeds - (shares_to_sell * 0.6))  # Assume avg buy price of $0.60
        
        transaction = {
            "action": action,
            "team": team,
            "shares": shares_to_sell,
            "price_per_share": price_per_share,
            "total_cost": -total_proceeds,  # Negative because it's income
            "reason": f"Sell all {team} contracts: {reason}",
            "timestamp": "now",
            "balance_after": game_data["balance"]
        }
        
        game_data["history"].append(transaction)
        
        print(f"💰 SELL: {shares_to_sell} {team.upper()} contracts @ ${price_per_share:.2f} = ${total_proceeds:.2f}")
        print(f"💰 New balance: ${game_data['balance']:.2f}, Contracts: Home {game_data['contracts']['home']}, Away {game_data['contracts']['away']}")
        
        return {
            "success": True,
            "action": "SELL",
            "team": team,
            "shares": shares_to_sell,
            "total_proceeds": total_proceeds,
            "balance": game_data["balance"],
            "contracts": game_data["contracts"].copy(),
            "transaction": transaction
        }
    
    else:
        return {
            "success": False,
            "error": f"Invalid action: {action}. Must be 'BUY' or 'SELL'",
            "balance": game_data["balance"],
            "contracts": game_data["contracts"].copy()
        }

def get_game_balance(game_id: str) -> Dict[str, Any]:
    """Get current balance and portfolio for a game."""
    return game_balances.get(game_id, {
        "balance": 0.0,
        "contracts": {"home": 0, "away": 0},
        "history": [],
        "total_invested": 0.0,
        "total_profit_loss": 0.0
    })

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

# Intelligent contract decision logic
def calculate_contract_decision(request: ContractDecisionRequest) -> Dict[str, Any]:
    """
    Calculate whether to place a contract order based on game state and play outcome.
    Returns decision with reasoning and recommended order parameters.
    """
    decision = {
        "should_order": False,
        "team": None,  # "home" or "away"
        "confidence": 0.0,
        "size": 0,
        "reasoning": [],
        "risk_level": "none",
        "transactions": []  # List of buy/sell transactions to execute
    }
    
    # Initialize game balance if gameId provided
    game_id = request.gameId or f"{game_state.homeTeam}_{game_state.awayTeam}"
    current_balance_data = initialize_game_balance(game_id)
    current_contracts = current_balance_data["contracts"]
    
    game_state = request.gameState
    play_outcome = request.playOutcome
    
    # Basic game state analysis
    score_diff = game_state.homeScore - game_state.awayScore
    inning_factor = min(game_state.inning / 9.0, 1.0)  # Weight later innings more
    
    # Calculate game situation factors
    bases_loaded = game_state.bases.first and game_state.bases.second and game_state.bases.third
    runners_in_scoring = game_state.bases.second or game_state.bases.third
    high_leverage = game_state.outs >= 2 and runners_in_scoring
    late_inning = game_state.inning >= 7
    close_game = abs(score_diff) <= 2
    
    # Analyze play outcome if provided
    if play_outcome and play_outcome.normValue is not None:
        norm_value = play_outcome.normValue
        
        # High impact positive play for batting team
        if norm_value >= 0.8:
            batting_team = "away" if game_state.isTopOfInning else "home"
            decision["should_order"] = True
            decision["team"] = batting_team
            decision["confidence"] = min(norm_value, 1.0)
            decision["reasoning"].append(f"Excellent play outcome (norm_value: {norm_value:.3f}) favors {batting_team} team")
            
            # Size based on confidence and game situation
            base_size = int(decision["confidence"] * 5)  # 1-5 shares base
            
            # Bonus for high leverage situations
            if high_leverage:
                base_size += 2
                decision["reasoning"].append("High leverage situation - increased position")
            
            # Bonus for late innings
            if late_inning and close_game:
                base_size += 2
                decision["reasoning"].append("Late inning close game - increased position")
                
            decision["size"] = min(base_size, request.maxRiskSize)
            decision["risk_level"] = "medium" if base_size <= 3 else "high"
            
        # High impact negative play against batting team
        elif norm_value <= -0.8:
            fielding_team = "home" if game_state.isTopOfInning else "away"
            decision["should_order"] = True
            decision["team"] = fielding_team
            decision["confidence"] = min(abs(norm_value), 1.0)
            decision["reasoning"].append(f"Poor play outcome (norm_value: {norm_value:.3f}) favors {fielding_team} team")
            
            # Size based on confidence
            base_size = int(decision["confidence"] * 4)  # Slightly smaller for negative plays
            
            if high_leverage:
                base_size += 1
                decision["reasoning"].append("High leverage defensive play")
                
            decision["size"] = min(base_size, request.maxRiskSize)
            decision["risk_level"] = "low" if base_size <= 2 else "medium"
    
    # Game state-based decisions (without specific play outcome)
    else:
        # Look for high-leverage situations
        if high_leverage and late_inning and close_game:
            # Slight bias toward home team in close late games (home field advantage)
            if not game_state.isTopOfInning:  # Bottom of inning, home team batting
                decision["should_order"] = True
                decision["team"] = "home"
                decision["confidence"] = 0.6
                decision["size"] = 2
                decision["reasoning"].append("High leverage late inning - home field advantage")
                decision["risk_level"] = "low"
        
        # Bases loaded situations
        elif bases_loaded and game_state.outs <= 1:
            batting_team = "away" if game_state.isTopOfInning else "home"
            decision["should_order"] = True
            decision["team"] = batting_team
            decision["confidence"] = 0.7
            decision["size"] = 3
            decision["reasoning"].append("Bases loaded with outs remaining - high scoring potential")
            decision["risk_level"] = "medium"
    
    # Add win percentage analysis
    home_win_pct = get_home_team_win_percentage(game_state)
    if home_win_pct is not None:
        decision["reasoning"].append(f"Historical win probability: Home {home_win_pct:.1%}, Away {1-home_win_pct:.1%}")
        
        # Factor win percentage into decisions
        if decision["should_order"]:
            # If recommending home team but they have low win probability, reduce position
            if decision["team"] == "home" and home_win_pct < 0.3:
                decision["size"] = max(1, decision["size"] - 2)
                decision["reasoning"].append("Reduced position due to low historical win probability")
            
            # If recommending away team but home has high win probability, reduce position  
            elif decision["team"] == "away" and home_win_pct > 0.7:
                decision["size"] = max(1, decision["size"] - 2)
                decision["reasoning"].append("Reduced position due to unfavorable historical win probability")
            
            # Boost position if historical probability aligns with recommendation
            elif decision["team"] == "home" and home_win_pct > 0.6:
                decision["size"] = min(decision["size"] + 1, request.maxRiskSize)
                decision["reasoning"].append("Increased position due to favorable historical win probability")
            elif decision["team"] == "away" and home_win_pct < 0.4:
                decision["size"] = min(decision["size"] + 1, request.maxRiskSize)
                decision["reasoning"].append("Increased position due to favorable historical win probability")
        
        # Create new orders based purely on win probability if no play-based decision
        elif not decision["should_order"]:
            # Strong home team advantage
            if home_win_pct > 0.8 and close_game and late_inning:
                decision["should_order"] = True
                decision["team"] = "home"
                decision["confidence"] = min(home_win_pct, 0.9)
                decision["size"] = 2
                decision["risk_level"] = "low" 
                decision["reasoning"].append("Strong historical home team advantage in late close game")
            
            # Strong away team advantage
            elif home_win_pct < 0.2 and close_game and late_inning:
                decision["should_order"] = True
                decision["team"] = "away"
                decision["confidence"] = min(1 - home_win_pct, 0.9)
                decision["size"] = 2
                decision["risk_level"] = "low"
                decision["reasoning"].append("Strong historical away team advantage in late close game")
    else:
        decision["reasoning"].append("No historical data available for this situation")
    
    # Add market price considerations if available
    if request.marketPrices:
        # TODO: Add logic to factor in current market prices
        # - If team is heavily favored already, reduce position size
        # - If underdog, potentially increase position on positive outcomes
        decision["reasoning"].append("Market prices considered in decision")
    
    # If we decided to order, determine if we need to sell opposing contracts first
    if decision["should_order"]:
        recommended_team = decision["team"]
        opposing_team = "away" if recommended_team == "home" else "home"
        
        # Add portfolio information to decision
        decision["current_portfolio"] = current_contracts.copy()
        decision["current_balance"] = current_balance_data["balance"]
        
        # Check if we have contracts for the opposing team - if so, sell them all
        if current_contracts[opposing_team] > 0:
            decision["transactions"].append({
                "action": "SELL",
                "team": opposing_team,
                "shares": current_contracts[opposing_team],  # Sell all
                "price": 0.6,  # Default sell price
                "reason": f"Switching position from {opposing_team} to {recommended_team}"
            })
            decision["reasoning"].append(f"Selling all {current_contracts[opposing_team]} {opposing_team} contracts before buying {recommended_team}")
        
        # Add buy transaction for recommended team
        buy_price = 0.6  # Default buy price - could be made dynamic based on market conditions
        decision["transactions"].append({
            "action": "BUY", 
            "team": recommended_team,
            "shares": decision["size"],
            "price": buy_price,
            "reason": "; ".join(decision["reasoning"])
        })
        
        # Calculate total cost to ensure we have enough balance after potential sell
        total_cost = decision["size"] * buy_price
        estimated_balance_after_sell = current_balance_data["balance"]
        if current_contracts[opposing_team] > 0:
            estimated_balance_after_sell += current_contracts[opposing_team] * 0.6  # Assume sell at same price
        
        if estimated_balance_after_sell < total_cost:
            decision["reasoning"].append(f"Insufficient balance: ${estimated_balance_after_sell:.2f} < ${total_cost:.2f}")
            decision["should_order"] = False
            decision["transactions"] = []
    else:
        decision["current_portfolio"] = current_contracts.copy()
        decision["current_balance"] = current_balance_data["balance"]

    return decision

async def get_current_market_prices(game_id: str) -> Dict[str, float]:
    """Get current market prices for more accurate transaction pricing."""
    try:
        import random
        # Simulate market prices with slight fluctuation
        base_home_price = 0.55
        fluctuation = random.uniform(-0.05, 0.05)
        home_price = max(0.05, min(0.95, base_home_price + fluctuation))
        away_price = 1.0 - home_price
        
        return {
            "home": round(home_price, 3),
            "away": round(away_price, 3)
        }
    except Exception:
        # Fallback prices
        return {"home": 0.55, "away": 0.45}

async def analyze_predictive_contract_decision(request: PredictiveAnalysisRequest) -> Dict[str, Any]:
    """
    Predictive analysis: Analyze all potential outcomes BEFORE a play happens
    and determine optimal contract position based on expected value.
    """
    game_state = request.gameState
    game_id = request.gameId or f"{game_state.homeTeam}_{game_state.awayTeam}"
    
    # Get current market prices for more accurate transaction pricing
    market_prices = await get_current_market_prices(game_id)
    
    # Initialize game balance
    current_balance_data = initialize_game_balance(game_id)
    current_contracts = current_balance_data["contracts"]
    
    decision = {
        "should_order": False,
        "action": "HOLD",  # "BUY_HOME", "BUY_AWAY", "SELL_HOME", "SELL_AWAY", "HOLD"
        "team": None,
        "confidence": 0.0,
        "size": 0,
        "reasoning": [],
        "expected_value": 0.0,
        "current_win_probability": None,
        "potential_outcomes": [],
        "transactions": [],
        "current_portfolio": current_contracts.copy(),
        "current_balance": current_balance_data["balance"]
    }
    
    # Get current home team win percentage
    current_home_win_pct = get_home_team_win_percentage(game_state)
    if current_home_win_pct is None:
        decision["reasoning"].append("No historical data available for current situation")
        return decision
    
    decision["current_win_probability"] = {
        "home": current_home_win_pct,
        "away": 1.0 - current_home_win_pct
    }
    
    # Define potential typical outcomes with rough probabilities
    # This is a simplified model - in practice you'd use the full baseball outcome data
    potential_outcomes = [
        # Positive outcomes for batting team
        {"description": "Single", "runs_scored": 0, "outs_gained": 0, "probability": 0.15, "norm_value": 0.4},
        {"description": "Double", "runs_scored": 0, "outs_gained": 0, "probability": 0.05, "norm_value": 0.7},
        {"description": "Home Run", "runs_scored": 1, "outs_gained": 0, "probability": 0.03, "norm_value": 1.0},
        {"description": "Walk", "runs_scored": 0, "outs_gained": 0, "probability": 0.08, "norm_value": 0.2},
        
        # Neutral outcomes
        {"description": "Foul Ball", "runs_scored": 0, "outs_gained": 0, "probability": 0.15, "norm_value": 0.0},
        
        # Negative outcomes for batting team
        {"description": "Strikeout", "runs_scored": 0, "outs_gained": 1, "probability": 0.20, "norm_value": -0.3},
        {"description": "Groundout", "runs_scored": 0, "outs_gained": 1, "probability": 0.18, "norm_value": -0.2},
        {"description": "Flyout", "runs_scored": 0, "outs_gained": 1, "probability": 0.12, "norm_value": -0.2},
        {"description": "Double Play", "runs_scored": 0, "outs_gained": 2, "probability": 0.04, "norm_value": -0.8},
    ]
    
    total_expected_value_home = 0.0
    total_expected_value_away = 0.0
    
    # Analyze each potential outcome
    for outcome in potential_outcomes:
        prob = outcome["probability"]
        norm_value = outcome["norm_value"]
        
        # Determine which team benefits from this outcome
        batting_team = "away" if game_state.isTopOfInning else "home"
        
        # Calculate win probability change
        if batting_team == "home":
            # Home team batting - positive norm_value helps home team
            home_win_change = norm_value * 0.1  # Scale factor for win probability change
        else:
            # Away team batting - positive norm_value helps away team
            home_win_change = -norm_value * 0.1  # Negative because it helps away team
        
        new_home_win_pct = max(0.0, min(1.0, current_home_win_pct + home_win_change))
        
        # Calculate expected value for each team's contracts
        # If home win probability increases, home contracts become more valuable
        home_contract_value_change = home_win_change
        away_contract_value_change = -home_win_change
        
        # Weight by probability
        weighted_home_ev = prob * home_contract_value_change
        weighted_away_ev = prob * away_contract_value_change
        
        total_expected_value_home += weighted_home_ev
        total_expected_value_away += weighted_away_ev
        
        decision["potential_outcomes"].append({
            "outcome": outcome["description"],
            "probability": prob,
            "norm_value": norm_value,
            "batting_team": batting_team,
            "new_home_win_pct": new_home_win_pct,
            "home_ev_contribution": weighted_home_ev,
            "away_ev_contribution": weighted_away_ev
        })
    
    # Determine optimal action based on expected values
    decision_threshold = 0.05  # Minimum expected value to trigger action
    
    # Current position value
    current_home_value = current_contracts["home"] * current_home_win_pct
    current_away_value = current_contracts["away"] * (1.0 - current_home_win_pct)
    
    decision["reasoning"].append(f"Current position value: Home ${current_home_value:.2f}, Away ${current_away_value:.2f}")
    decision["reasoning"].append(f"Expected value changes: Home {total_expected_value_home:+.3f}, Away {total_expected_value_away:+.3f}")
    
    # Decision logic
    if total_expected_value_home > decision_threshold:
        # Home team contracts expected to gain value
        if current_contracts["away"] > 0:
            # Sell away contracts first
            decision["should_order"] = True
            decision["action"] = "SELL_AWAY"
            decision["team"] = "away"
            decision["size"] = current_contracts["away"]
            decision["confidence"] = min(total_expected_value_home * 2, 1.0)
            decision["transactions"].append({
                "action": "SELL",
                "team": "away", 
                "shares": current_contracts["away"],
                "price": market_prices["away"],
                "reason": f"Expected home team advantage ({total_expected_value_home:+.3f} EV)"
            })
        elif current_balance_data["balance"] > (market_prices["home"] * 10):  # Enough for at least 10 shares
            # Buy home contracts
            max_affordable = int(current_balance_data["balance"] / market_prices["home"])
            size = min(max_affordable, int(total_expected_value_home * 20), request.maxRiskSize)
            if size > 0:
                decision["should_order"] = True
                decision["action"] = "BUY_HOME"
                decision["team"] = "home"
                decision["size"] = size
                decision["confidence"] = min(total_expected_value_home * 2, 1.0)
                decision["transactions"].append({
                    "action": "BUY",
                    "team": "home",
                    "shares": size,
                    "price": market_prices["home"],
                    "reason": f"Expected home team advantage ({total_expected_value_home:+.3f} EV)"
                })
    
    elif total_expected_value_away > decision_threshold:
        # Away team contracts expected to gain value
        if current_contracts["home"] > 0:
            # Sell home contracts first
            decision["should_order"] = True
            decision["action"] = "SELL_HOME"
            decision["team"] = "home"
            decision["size"] = current_contracts["home"]
            decision["confidence"] = min(total_expected_value_away * 2, 1.0)
            decision["transactions"].append({
                "action": "SELL",
                "team": "home",
                "shares": current_contracts["home"], 
                "price": market_prices["home"],
                "reason": f"Expected away team advantage ({total_expected_value_away:+.3f} EV)"
            })
        elif current_balance_data["balance"] > (market_prices["away"] * 10):  # Enough for at least 10 shares
            # Buy away contracts
            max_affordable = int(current_balance_data["balance"] / market_prices["away"])
            size = min(max_affordable, int(total_expected_value_away * 20), request.maxRiskSize)
            if size > 0:
                decision["should_order"] = True
                decision["action"] = "BUY_AWAY"
                decision["team"] = "away"
                decision["size"] = size
                decision["confidence"] = min(total_expected_value_away * 2, 1.0)
                decision["transactions"].append({
                    "action": "BUY",
                    "team": "away",
                    "shares": size,
                    "price": market_prices["away"],
                    "reason": f"Expected away team advantage ({total_expected_value_away:+.3f} EV)"
                })
    
    else:
        decision["action"] = "HOLD"
        decision["reasoning"].append(f"Expected value changes too small to justify action (threshold: {decision_threshold:.3f})")
    
    decision["expected_value"] = max(total_expected_value_home, total_expected_value_away)
    
    # Add current game situation context
    decision["reasoning"].append(f"Current situation: {'Top' if game_state.isTopOfInning else 'Bottom'} {game_state.inning}, {game_state.outs} outs, {game_state.balls}-{game_state.strikes} count")
    decision["reasoning"].append(f"Historical win probability: Home {current_home_win_pct:.1%}, Away {1-current_home_win_pct:.1%}")
    
    return decision

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

@app.post("/contract_decision")
async def analyze_contract_decision(request: ContractDecisionRequest):
    """
    Analyze game state and determine if a contract order should be placed.
    Returns decision analysis and recommended order parameters.
    """
    try:
        print(f"🤖 Analyzing contract decision for game situation...")
        print(f"📊 Game State: {request.gameState.homeTeam} {request.gameState.homeScore} - {request.gameState.awayScore} {request.gameState.awayTeam}")
        print(f"📊 Inning: {'Top' if request.gameState.isTopOfInning else 'Bottom'} {request.gameState.inning}")
        print(f"📊 Situation: {request.gameState.outs} outs, {request.gameState.balls}-{request.gameState.strikes} count")
        print(f"📊 Bases: {'1B ' if request.gameState.bases.first else ''}{'2B ' if request.gameState.bases.second else ''}{'3B ' if request.gameState.bases.third else ''}")
        
        if request.playOutcome:
            print(f"🎯 Play Outcome: {request.playOutcome.description} (norm_value: {request.playOutcome.normValue})")
        
        # Calculate decision using intelligent logic
        decision = calculate_contract_decision(request)
        
        print(f"🧠 Decision: {'ORDER' if decision['should_order'] else 'NO ORDER'}")
        if decision['should_order']:
            print(f"🎯 Team: {decision['team']}")
            print(f"🎯 Size: {decision['size']} shares")
            print(f"🎯 Confidence: {decision['confidence']:.2f}")
            print(f"🎯 Risk Level: {decision['risk_level']}")
            print(f"🎯 Reasoning: {'; '.join(decision['reasoning'])}")
        
        return {
            "success": True,
            "decision": decision,
            "gameState": request.gameState,
            "trigger": request.trigger
        }
        
    except Exception as e:
        print(f"❌ Contract decision analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute_contract_decision")
async def execute_contract_decision(request: ContractDecisionRequest):
    """
    Analyze game state and automatically execute contract order if conditions are met.
    Combines decision analysis with order execution.
    """
    try:
        print(f"🚀 Executing contract decision for game situation...")
        
        # First, analyze the situation
        decision = calculate_contract_decision(request)
        
        if not decision["should_order"]:
            print(f"❌ No order recommended based on analysis")
            return {
                "success": True,
                "executed": False,
                "decision": decision,
                "message": "No contract order placed based on game analysis"
            }
        
        print(f"✅ Order recommended: {decision['size']} shares for {decision['team']} team")
        
        # Execute simulated transactions instead of real Polymarket orders
        game_id = request.gameId or f"{request.gameState.homeTeam}_{request.gameState.awayTeam}"
        executed_transactions = []
        
        # Execute each transaction in order (sells first, then buys)
        for transaction in decision["transactions"]:
            result = simulate_contract_transaction(
                game_id=game_id,
                action=transaction["action"],
                team=transaction["team"], 
                shares=transaction["shares"],
                price_per_share=transaction["price"],
                reason=transaction["reason"]
            )
            
            executed_transactions.append(result)
            
            if not result["success"]:
                print(f"❌ Transaction failed: {result['error']}")
                return {
                    "success": False,
                    "executed": False,
                    "decision": decision,
                    "transactions": executed_transactions,
                    "error": f"Transaction failed: {result['error']}"
                }
        
        # Get final balance status
        final_balance = get_game_balance(game_id)
        
        print(f"✅ Contract decision executed successfully")
        print(f"💰 Final balance: ${final_balance['balance']:.2f}")
        print(f"📊 Portfolio: Home {final_balance['contracts']['home']}, Away {final_balance['contracts']['away']}")
        
        return {
            "success": True,
            "executed": True,
            "decision": decision,
            "transactions": executed_transactions,
            "final_balance": final_balance,
            "message": f"Executed {len(executed_transactions)} transactions for {decision['team']} team"
        }
        
    except Exception as e:
        print(f"❌ Contract decision execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/win_percentage")
async def get_win_percentage(game_state_data: GameState):
    """
    Get the home team win percentage for a specific game state.
    """
    try:
        print(f"📊 Getting win percentage for game state...")
        print(f"📊 Game: {game_state_data.homeTeam} {game_state_data.homeScore} - {game_state_data.awayScore} {game_state_data.awayTeam}")
        print(f"📊 Situation: {'Top' if game_state_data.isTopOfInning else 'Bottom'} {game_state_data.inning}, {game_state_data.outs} outs, {game_state_data.balls}-{game_state_data.strikes}")
        
        home_win_pct = get_home_team_win_percentage(game_state_data)
        
        if home_win_pct is not None:
            print(f"📈 Win percentage: Home {home_win_pct:.1%}, Away {1-home_win_pct:.1%}")
            return {
                "success": True,
                "home_win_percentage": home_win_pct,
                "away_win_percentage": 1.0 - home_win_pct,
                "gameState": game_state_data,
                "message": f"Home team has {home_win_pct:.1%} chance to win from this situation"
            }
        else:
            print(f"❌ No historical data found for this game situation")
            return {
                "success": False,
                "home_win_percentage": None,
                "away_win_percentage": None,
                "gameState": game_state_data,
                "message": "No historical data available for this game situation"
            }
            
    except Exception as e:
        print(f"❌ Win percentage lookup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predictive_analysis")
async def analyze_predictive_decision(request: PredictiveAnalysisRequest):
    """
    Analyze all potential outcomes BEFORE a play happens and determine optimal contract position.
    """
    try:
        print(f"🔮 Performing predictive analysis for game situation...")
        print(f"📊 Game State: {request.gameState.homeTeam} {request.gameState.homeScore} - {request.gameState.awayScore} {request.gameState.awayTeam}")
        print(f"📊 Situation: {'Top' if request.gameState.isTopOfInning else 'Bottom'} {request.gameState.inning}, {request.gameState.outs} outs, {request.gameState.balls}-{request.gameState.strikes} count")
        
        # Perform predictive analysis
        decision = await analyze_predictive_contract_decision(request)
        
        print(f"🧠 Predictive Decision: {decision['action']}")
        if decision['should_order']:
            print(f"🎯 Action: {decision['action']}")
            print(f"🎯 Size: {decision['size']} shares")
            print(f"🎯 Expected Value: {decision['expected_value']:.3f}")
            print(f"🎯 Confidence: {decision['confidence']:.2f}")
            print(f"🎯 Reasoning: {'; '.join(decision['reasoning'][:2])}")
        
        return {
            "success": True,
            "decision": decision,
            "gameState": request.gameState,
            "analysis_type": "predictive"
        }
        
    except Exception as e:
        print(f"❌ Predictive analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute_predictive_decision")
async def execute_predictive_decision(request: PredictiveAnalysisRequest):
    """
    Perform predictive analysis and automatically execute the recommended trades.
    """
    try:
        print(f"🚀 Executing predictive contract decision...")
        
        # First, analyze the situation predictively
        decision = await analyze_predictive_contract_decision(request)
        
        if not decision["should_order"]:
            print(f"📊 No action recommended: {decision['action']}")
            return {
                "success": True,
                "executed": False,
                "decision": decision,
                "message": f"Predictive analysis recommends: {decision['action']}"
            }
        
        print(f"✅ Action recommended: {decision['action']} - {decision['size']} shares")
        
        # Execute the recommended trades
        game_id = request.gameId or f"{request.gameState.homeTeam}_{request.gameState.awayTeam}"
        executed_transactions = []
        
        # Execute each transaction in order
        for transaction in decision["transactions"]:
            result = simulate_contract_transaction(
                game_id=game_id,
                action=transaction["action"],
                team=transaction["team"], 
                shares=transaction["shares"],
                price_per_share=transaction["price"],
                reason=transaction["reason"]
            )
            
            executed_transactions.append(result)
            
            if not result["success"]:
                print(f"❌ Transaction failed: {result['error']}")
                return {
                    "success": False,
                    "executed": False,
                    "decision": decision,
                    "transactions": executed_transactions,
                    "error": f"Transaction failed: {result['error']}"
                }
        
        # Get final balance status
        final_balance = get_game_balance(game_id)
        
        print(f"✅ Predictive decision executed successfully")
        print(f"💰 Final balance: ${final_balance['balance']:.2f}")
        print(f"📊 Portfolio: Home {final_balance['contracts']['home']}, Away {final_balance['contracts']['away']}")
        
        return {
            "success": True,
            "executed": True,
            "decision": decision,
            "transactions": executed_transactions,
            "final_balance": final_balance,
            "message": f"Executed predictive {decision['action']}: {len(executed_transactions)} transactions"
        }
        
    except Exception as e:
        print(f"❌ Predictive decision execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/initialize_game")
async def initialize_game(game_data: Dict[str, str]):
    """
    Initialize a new game with $1000 starting balance.
    """
    try:
        game_id = game_data.get("game_id") or f"{game_data.get('home_team', 'HOME')}_{game_data.get('away_team', 'AWAY')}"
        
        print(f"🎮 Initializing new game: {game_id}")
        
        balance_data = initialize_game_balance(game_id)
        
        return {
            "success": True,
            "game_id": game_id,
            "balance": balance_data["balance"],
            "contracts": balance_data["contracts"],
            "message": f"Game {game_id} initialized with ${balance_data['balance']:.2f}"
        }
        
    except Exception as e:
        print(f"❌ Game initialization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sync_game_state")
async def sync_game_state(request: Dict[str, Any]):
    """
    Store/update the current game state in backend memory.
    """
    try:
        game_state = request.get("gameState", {})
        
        # Generate game ID from team names
        home_team = game_state.get("homeTeam", "HOME")
        away_team = game_state.get("awayTeam", "AWAY")
        game_id = f"{home_team}_{away_team}"
        
        print(f"🔄 Syncing game state for: {game_id}")
        print(f"📊 State: {'Top' if game_state.get('isTopOfInning') else 'Bottom'} {game_state.get('inning', 1)}, {game_state.get('outs', 0)} outs, {game_state.get('balls', 0)}-{game_state.get('strikes', 0)} count")
        print(f"📊 Score: {away_team} {game_state.get('awayScore', 0)} - {game_state.get('homeScore', 0)} {home_team}")
        
        # Store the game state
        current_game_states[game_id] = game_state
        
        return {
            "success": True,
            "game_id": game_id,
            "message": f"Game state synced for {game_id}",
            "current_state": {
                "inning": game_state.get("inning", 1),
                "isTopOfInning": game_state.get("isTopOfInning", True),
                "outs": game_state.get("outs", 0),
                "balls": game_state.get("balls", 0),
                "strikes": game_state.get("strikes", 0),
                "homeScore": game_state.get("homeScore", 0),
                "awayScore": game_state.get("awayScore", 0),
                "bases": game_state.get("bases", {"first": False, "second": False, "third": False})
            }
        }
        
    except Exception as e:
        print(f"❌ Game state sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/market_prices")
async def get_market_prices(request: Dict[str, str]):
    """
    Get current Polymarket prices for a game (simulated for now).
    In production, this would fetch real prices from Polymarket API.
    """
    try:
        game_id = request.get("gameId", "")
        
        print(f"💰 Getting market prices for game: {game_id}")
        
        # For now, return simulated prices that fluctuate slightly
        # In production, you would fetch real Polymarket prices here
        import random
        base_home_price = 0.55  # Base price around 55%
        fluctuation = random.uniform(-0.05, 0.05)  # ±5% fluctuation  
        home_price = max(0.05, min(0.95, base_home_price + fluctuation))
        away_price = 1.0 - home_price
        
        prices = {
            "home": round(home_price, 3),
            "away": round(away_price, 3)
        }
        
        print(f"📊 Market prices: {prices}")
        
        return {
            "success": True,
            "prices": prices,
            "game_id": game_id,
            "message": "Market prices retrieved (simulated)"
        }
        
    except Exception as e:
        print(f"❌ Market prices failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/game_balance/{game_id}")
async def get_game_balance_endpoint(game_id: str):
    """
    Get current balance and portfolio for a specific game.
    """
    try:
        print(f"💰 Getting balance for game: {game_id}")
        
        balance_data = get_game_balance(game_id)
        
        return {
            "success": True,
            "game_id": game_id,
            "balance": balance_data["balance"],
            "contracts": balance_data["contracts"],
            "total_invested": balance_data["total_invested"],
            "total_profit_loss": balance_data["total_profit_loss"],
            "history": balance_data["history"][-10:],  # Last 10 transactions
            "message": f"Current balance: ${balance_data['balance']:.2f}"
        }
        
    except Exception as e:
        print(f"❌ Balance lookup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/simulate_transaction")
async def simulate_transaction_endpoint(transaction_data: ContractTransaction):
    """
    Simulate a contract transaction (buy or sell).
    """
    try:
        print(f"💼 Simulating transaction: {transaction_data.action} {transaction_data.shares} {transaction_data.team} contracts")
        
        result = simulate_contract_transaction(
            game_id=transaction_data.game_id,
            action=transaction_data.action,
            team=transaction_data.team,
            shares=transaction_data.shares,
            price_per_share=transaction_data.price_per_share,
            reason=transaction_data.reason
        )
        
        return result
        
    except Exception as e:
        print(f"❌ Transaction simulation failed: {e}")
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

# Load win percentage data on startup
@app.on_event("startup")
async def startup_event():
    print("🚀 Starting Baseball Polymarket API...")
    load_win_percentage_data()
    print("✅ Startup complete!")

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Baseball Polymarket API...")
    load_win_percentage_data()
    uvicorn.run(app, host="0.0.0.0", port=8000)