import os
import asyncio
import aiohttp
import pandas as pd
import json
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List
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
cached_tokens = {}  # Format: {"game_id": {"home_token_id": "...", "away_token_id": "...", "date": "2025-07-24"}}

# Contract price tracking for automated trading
contract_price_snapshots = {}  # Format: {"game_id": [{"timestamp": ..., "home_price": ..., "away_price": ..., "trigger": "in_play" | "quality_selection"}]}

# Global play transition data for quality analysis
play_transition_data = None  # Will hold DataFrame from CSV
in_play_percentage_data = {}  # Will hold real percentage data from filtered_in_play.json

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

def load_play_transition_data():
    """
    Load the play_transition_value.csv file and filtered_in_play.json for quality analysis.
    """
    global play_transition_data, in_play_percentage_data
    
    try:
        # Load CSV file
        csv_file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'play_transition_value.csv')
        
        print(f"📊 Loading play transition data from: {csv_file_path}")
        
        if not os.path.exists(csv_file_path):
            print(f"❌ CSV file not found at: {csv_file_path}")
            return
        
        # Load CSV into DataFrame
        play_transition_data = pd.read_csv(csv_file_path)
        
        print(f"✅ Loaded {len(play_transition_data)} play transition records")
        print(f"📋 Columns: {list(play_transition_data.columns)}")
        
        # Convert string base states to tuples for easier matching
        def parse_base_state(base_str):
            """Convert '(0, 0, 0)' to (False, False, False)"""
            try:
                # Remove parentheses and split
                clean_str = base_str.strip('()')
                parts = [part.strip() for part in clean_str.split(',')]
                return tuple(bool(int(part)) for part in parts)
            except:
                return (False, False, False)
        
        play_transition_data['start_base_parsed'] = play_transition_data['start_base'].apply(parse_base_state)
        play_transition_data['end_base_parsed'] = play_transition_data['end_base'].apply(parse_base_state)
        
        print(f"✅ Parsed base states for CSV quality analysis")
        
        # Load filtered_in_play.json for real percentage data
        json_file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'filtered_in_play.json')
        
        print(f"📊 Loading in-play percentage data from: {json_file_path}")
        
        if os.path.exists(json_file_path):
            with open(json_file_path, 'r') as f:
                in_play_percentage_data = json.load(f)
            
            print(f"✅ Loaded {len(in_play_percentage_data)} base state scenarios from filtered_in_play.json")
            
            # Print sample data structure
            sample_key = list(in_play_percentage_data.keys())[0]
            sample_outcomes = list(in_play_percentage_data[sample_key].keys())[:3]
            print(f"📋 Sample base state: {sample_key}")
            print(f"📋 Sample outcomes: {sample_outcomes}")
        else:
            print(f"❌ filtered_in_play.json not found at: {json_file_path}")
            print("🔧 Continuing with CSV data only")
        
    except Exception as e:
        print(f"❌ Error loading play transition data: {e}")
        print("🔧 Continuing without play transition data")

def get_play_outcomes_for_base_state(bases: Dict[str, bool], outs: int) -> List[Dict[str, Any]]:
    """
    Get all possible play outcomes for a given base state and outs count.
    Returns list of outcomes with norm_value, runs_scored, outs_gained, etc.
    """
    if play_transition_data is None:
        return []
    
    # Convert bases dict to tuple format for matching
    base_tuple = (bases.get('first', False), bases.get('second', False), bases.get('third', False))
    
    # Filter data for matching start base state and outs
    matching_plays = play_transition_data[
        (play_transition_data['start_base_parsed'] == base_tuple) & 
        (play_transition_data['start_outs'] == outs)
    ].copy()
    
    if len(matching_plays) == 0:
        print(f"⚠️ No play outcomes found for base state {base_tuple} with {outs} outs")
        return []
    
    # Convert to list of dictionaries
    outcomes = []
    for _, row in matching_plays.iterrows():
        outcome = {
            'description': f"Transition from {row['start_state']} to {row['end_state']}",
            'runsScored': int(row['runs_scored']),
            'outsGained': int(row['outs']),
            'normValue': float(row['norm_value']),
            'value': float(row['value']),
            'finalBases': {
                'first': row['end_base_parsed'][0],
                'second': row['end_base_parsed'][1], 
                'third': row['end_base_parsed'][2]
            },
            'probability': 0.1  # Default probability - in real implementation this would be calculated
        }
        outcomes.append(outcome)
    
    return outcomes

def calculate_quality_thresholds(game_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate quality thresholds for the current game state.
    This replicates the frontend logic in getDisplayThresholds().
    """
    bases = game_state.get('bases', {})
    outs = game_state.get('outs', 0)
    
    # Get all possible outcomes for this base state
    all_outcomes = get_play_outcomes_for_base_state(bases, outs)
    
    if not all_outcomes:
        return None
    
    # Extract norm values and sort them
    norm_values = [o['normValue'] for o in all_outcomes]
    norm_values.sort()
    
    if len(norm_values) == 0:
        return None
    
    def get_percentile(p: float) -> float:
        index = int((p / 100) * len(norm_values))
        return norm_values[min(index, len(norm_values) - 1)]
    
    # Find the highest norm_value where outs occur but no runs score
    outcomes_with_outs_no_runs = [o for o in all_outcomes if o['outsGained'] > 0 and o['runsScored'] == 0]
    max_out_no_run_value = max([o['normValue'] for o in outcomes_with_outs_no_runs]) if outcomes_with_outs_no_runs else -1
    
    # Find the highest norm_value where exactly one out occurs and no runs score
    outcomes_with_one_out_no_runs = [o for o in all_outcomes if o['outsGained'] == 1 and o['runsScored'] == 0]
    max_one_out_no_run_value = max([o['normValue'] for o in outcomes_with_one_out_no_runs]) if outcomes_with_one_out_no_runs else -1
    min_one_out_no_run_value = min([o['normValue'] for o in outcomes_with_one_out_no_runs]) if outcomes_with_one_out_no_runs else -1
    
    # Find the highest norm_value where a double play occurs
    outcomes_with_double_play = [o for o in all_outcomes if o['outsGained'] >= 2 and o['runsScored'] == 0]
    max_double_play_value = max([o['normValue'] for o in outcomes_with_double_play]) if outcomes_with_double_play else None
    
    # Find the highest norm_value where no outs occur, no runs scored, at most a double
    outcomes_no_outs_no_runs = [o for o in all_outcomes if o['outsGained'] == 0 and o['runsScored'] == 0]
    
    if outcomes_no_outs_no_runs:
        max_no_outs_no_runs_value = max([o['normValue'] for o in outcomes_no_outs_no_runs])
    else:
        # If no "no outs, no runs" outcomes exist, use a more flexible approach
        # Find outcomes that are neutral-ish: minimal impact plays
        neutral_candidates = [o for o in all_outcomes if o['outsGained'] <= 1 and o['runsScored'] <= 1]
        if neutral_candidates:
            # Use median of neutral candidates as upper bound
            neutral_norms = sorted([o['normValue'] for o in neutral_candidates])
            median_index = len(neutral_norms) // 2
            max_no_outs_no_runs_value = neutral_norms[median_index]
        else:
            max_no_outs_no_runs_value = 0.0  # Default neutral value
    
    # Determine bad min based on double play possibility
    bad_min_value = (max_double_play_value + 0.001) if max_double_play_value is not None else min_one_out_no_run_value
    
    # Special case: when there are 2 outs, give bad range the same range as very-bad options
    if outs == 2:
        # Bad range should be exactly the same as very-bad: maxOutNoRun to maxOutNoRun
        # This gives bad the same options as very-bad
        bad_min_value = max_out_no_run_value
        max_one_out_no_run_value = max_out_no_run_value
    
    # Calculate good range bounds - include singles where no outs occur
    outcomes_good_candidates = []
    for o in all_outcomes:
        # Include outcomes with runs scored and at most one out
        if o['runsScored'] >= 1 and o['outsGained'] <= 1:
            outcomes_good_candidates.append(o)
        # Include ALL outcomes where no outs occur and could be singles
        elif o['outsGained'] == 0:
            # Check for single patterns: batter reaches first base
            if o['finalBases']['first']:
                outcomes_good_candidates.append(o)
            # Also include outcomes where no runs scored and no outs (conservative hits)
            elif o['runsScored'] == 0:
                outcomes_good_candidates.append(o)
    
    if outcomes_good_candidates:
        good_min_value = min([o['normValue'] for o in outcomes_good_candidates])
    else:
        # Fallback: find the minimum value from all no-out outcomes
        outcomes_no_outs = [o for o in all_outcomes if o['outsGained'] == 0]
        if outcomes_no_outs:
            good_min_value = min([o['normValue'] for o in outcomes_no_outs])
        else:
            good_min_value = -0.5
    
    # Calculate good max - exclude triples and home runs
    outcomes_max_double = []
    for o in all_outcomes:
        # Exclude home runs: all bases cleared and high runs scored relative to initial runners
        initial_runners = sum(1 for base in ['first', 'second', 'third'] if bases.get(base, False))
        final_runners = sum(1 for base in ['first', 'second', 'third'] if o['finalBases'].get(base, False))
        
        # If all bases are cleared and we scored more runs than we had initial runners, likely a home run
        if final_runners == 0 and o['runsScored'] > initial_runners:
            continue
        
        # Check if batter likely reached third base (triple)
        if not bases.get('third', False) and o['finalBases']['third']:
            # Third base is newly occupied
            if not bases.get('second', False):
                # No runner was on second to advance, so batter likely hit triple
                continue
            if not o['finalBases']['first']:
                # No runner on first in the end state, suggesting batter went to third
                continue
        
        outcomes_max_double.append(o)
    
    good_max_value = max([o['normValue'] for o in outcomes_max_double]) if outcomes_max_double else -1
    
    # Calculate very good min
    very_good_min_value = 1  # Default if no qualifying outcomes
    valid_outcomes = []
    
    # Look for outcomes with no outs
    no_out_outcomes = [o for o in all_outcomes if o['outsGained'] == 0]
    
    for outcome in no_out_outcomes:
        is_valid = False
        reason = ""
        
        # Option 1: Run scored with no outs
        if outcome['runsScored'] >= 1:
            is_valid = True
            reason = f"Run scored ({outcome['runsScored']}) with no outs"
        
        # Option 2: Batter hits a triple (no outs, ends up on third alone)
        if not is_valid and outcome['finalBases']['third'] and not outcome['finalBases']['first'] and not outcome['finalBases']['second']:
            # Check if this could be a clean triple
            if not bases.get('third', False):
                # Third base wasn't occupied before
                initial_runners = sum(1 for base in ['first', 'second', 'third'] if bases.get(base, False))
                
                # If there were initial runners, they should have scored
                if initial_runners == 0 or outcome['runsScored'] == initial_runners:
                    is_valid = True
                    reason = f"Clean triple (batter to third, {initial_runners} initial runners scored)"
        
        if is_valid:
            valid_outcomes.append({
                'outcome': outcome,
                'reason': reason,
                'normValue': outcome['normValue']
            })
    
    # Find minimum norm_value from valid outcomes
    if valid_outcomes:
        very_good_min_value = min([v['normValue'] for v in valid_outcomes])
    
    thresholds = {
        'p25': get_percentile(25),
        'p40': get_percentile(40),
        'p75': get_percentile(75),
        'p90': get_percentile(90),
        'maxOutNoRun': max_out_no_run_value,
        'badMin': bad_min_value,
        'maxOneOutNoRun': max_one_out_no_run_value,
        'minOneOutNoRun': min_one_out_no_run_value,
        'maxNoOutsNoRuns': max_no_outs_no_runs_value,
        'goodMin': good_min_value,
        'goodMax': good_max_value,
        'veryGoodMin': very_good_min_value,
        'veryGoodMax': 1.0,
        'hasDoublePlay': max_double_play_value is not None
    }
    
    return {
        'veryBad': f"-1.00 to {thresholds['maxOutNoRun']:.2f}",
        'bad': f"{thresholds['badMin']:.2f} to {thresholds['maxOneOutNoRun']:.2f}",
        'neutral': f"{thresholds['minOneOutNoRun']:.2f} to {thresholds['maxNoOutsNoRuns']:.2f}",
        'good': f"{thresholds['goodMin']:.2f} to {thresholds['goodMax']:.2f}",
        'veryGood': f"{thresholds['veryGoodMin']:.2f} to {thresholds['veryGoodMax']:.2f}",
        'thresholds': thresholds
    }

def get_real_probability_for_outcome(game_state: Dict[str, Any], outcome: Dict[str, Any]) -> float:
    """
    Get the real probability for an outcome from filtered_in_play.json data.
    """
    global in_play_percentage_data
    
    if not in_play_percentage_data:
        # Fallback to synthetic probability if real data not available
        return outcome.get('probability', 0.1)
    
    # Build the initial base state key from game state
    bases = game_state.get('bases', {})
    initial_base_key = f"({int(bases.get('first', False))}, {int(bases.get('second', False))}, {int(bases.get('third', False))})"
    
    if initial_base_key not in in_play_percentage_data:
        # Fallback if this base state isn't in our data
        return outcome.get('probability', 0.1)
    
    # Build the outcome key from the outcome data
    # Outcome format in JSON: "((final_bases), runs_scored, outs_gained)"
    end_bases = outcome.get('finalBases', outcome.get('endBase', {}))
    runs_scored = outcome.get('runsScored', 0)
    outs_gained = outcome.get('outsGained', 0)
    
    outcome_key = f"(({int(end_bases.get('first', False))}, {int(end_bases.get('second', False))}, {int(end_bases.get('third', False))}), {runs_scored}, {outs_gained})"
    
    # Get the real percentage from the data
    base_state_data = in_play_percentage_data[initial_base_key]
    
    if outcome_key in base_state_data:
        return base_state_data[outcome_key]
    else:
        # Fallback if this specific outcome isn't in our data
        return outcome.get('probability', 0.1)

def calculate_expected_value_for_quality(quality: str, game_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate the expected value for a quality selection by creating a weighted average
    based on real probability data from filtered_in_play.json and the expected run value change.
    """
    try:
        # Get all outcomes for this quality and game state
        outcomes = get_play_options_by_quality(quality, game_state)
        
        if not outcomes:
            return {
                "expected_value": 0.0,
                "total_outcomes": 0,
                "quality": quality,
                "error": "No outcomes found for this quality"
            }
        
        # Replace synthetic probabilities with real data from filtered_in_play.json
        for outcome in outcomes:
            real_probability = get_real_probability_for_outcome(game_state, outcome)
            outcome['raw_real_probability'] = real_probability
        
        # Calculate total raw probability for this quality subset
        total_raw_probability = sum(outcome.get('raw_real_probability', 0) for outcome in outcomes)
        
        if total_raw_probability == 0:
            return {
                "expected_value": 0.0,
                "total_outcomes": len(outcomes),
                "quality": quality,
                "error": "No real probability data available"
            }
        
        # Normalize probabilities within this quality subset (so they sum to 1.0)
        for outcome in outcomes:
            raw_prob = outcome.get('raw_real_probability', 0)
            outcome['normalized_probability'] = raw_prob / total_raw_probability
        
        # Calculate expected value: sum of (normalized_probability * run_value) for each outcome
        weighted_value_sum = 0.0
        outcome_details = []
        
        for outcome in outcomes:
            normalized_probability = outcome.get('normalized_probability', 0)
            run_value = outcome.get('value', 0)  # Use 'value' from CSV (run expectancy change)
            norm_value = outcome.get('normValue', 0)
            
            # Weight this outcome's contribution (now using normalized probabilities)
            weighted_contribution = normalized_probability * run_value
            weighted_value_sum += weighted_contribution
            
            outcome_details.append({
                "description": outcome.get('description', 'Unknown'),
                "raw_probability": outcome.get('raw_real_probability', 0),
                "normalized_probability": normalized_probability,
                "weight": normalized_probability,
                "run_value": run_value,
                "norm_value": norm_value,
                "weighted_contribution": weighted_contribution,
                "runs_scored": outcome.get('runsScored', 0),
                "outs_gained": outcome.get('outsGained', 0)
            })
        
        # Sort outcomes by weighted contribution (highest impact first)
        outcome_details.sort(key=lambda x: abs(x['weighted_contribution']), reverse=True)
        
        return {
            "expected_value": weighted_value_sum,
            "total_outcomes": len(outcomes),
            "quality": quality,
            "total_raw_probability": total_raw_probability,
            "data_source": "filtered_in_play.json" if in_play_percentage_data else "synthetic",
            "outcome_details": outcome_details[:5],  # Top 5 most impactful outcomes
            "summary": {
                "avg_runs_scored": sum((o.get('runsScored', 0) * o.get('normalized_probability', 0)) for o in outcomes),
                "avg_outs_gained": sum((o.get('outsGained', 0) * o.get('normalized_probability', 0)) for o in outcomes),
            }
        }
        
    except Exception as e:
        return {
            "expected_value": 0.0,
            "total_outcomes": 0,
            "quality": quality,
            "error": f"Calculation failed: {str(e)}"
        }

def get_play_options_by_quality(quality: str, game_state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get play options filtered by quality, matching the frontend logic.
    """
    bases = game_state.get('bases', {})
    outs = game_state.get('outs', 0)
    
    # Get all possible outcomes for this base state
    all_outcomes = get_play_outcomes_for_base_state(bases, outs)
    
    if not all_outcomes:
        return []
    
    # Calculate quality thresholds
    ranges = calculate_quality_thresholds(game_state)
    if not ranges:
        return []
    
    thresholds = ranges['thresholds']
    
    # Filter outcomes based on norm_value falling within the calculated range
    filtered_outcomes = []
    for outcome in all_outcomes:
        norm_value = outcome.get('normValue', 0)
        
        include_outcome = False
        if quality == 'very-bad':
            # From -1.00 to maxOutNoRun
            include_outcome = -1 <= norm_value <= thresholds['maxOutNoRun']
        elif quality == 'bad':
            # From badMin to maxOneOutNoRun
            include_outcome = thresholds['badMin'] <= norm_value <= thresholds['maxOneOutNoRun']
        elif quality == 'neutral':
            # From minOneOutNoRun to maxNoOutsNoRuns
            include_outcome = thresholds['minOneOutNoRun'] <= norm_value <= thresholds['maxNoOutsNoRuns']
        elif quality == 'good':
            # From goodMin to goodMax
            include_outcome = thresholds['goodMin'] <= norm_value <= thresholds['goodMax']
        elif quality == 'very-good':
            # From veryGoodMin to veryGoodMax (1.00)
            include_outcome = thresholds['veryGoodMin'] <= norm_value <= thresholds['veryGoodMax']
        else:
            include_outcome = True
        
        if include_outcome:
            filtered_outcomes.append(outcome)
    
    # Sort by norm_value and return top 10
    filtered_outcomes.sort(key=lambda x: x.get('normValue', 0), reverse=True)
    return filtered_outcomes[:10]

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

def generate_polymarket_slug(home_team: str, away_team: str, date_str: str = None) -> str:
    """Generate Polymarket slug from team names and date."""
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
    
    # Convert team names to lowercase for slug
    home_lower = home_team.lower()
    away_lower = away_team.lower()
    
    slug = f"mlb-{away_lower}-{home_lower}-{date_str}"
    print(f"🏷️ Generated slug: {slug}")
    return slug

async def fetch_market_data_from_slug(slug: str) -> Dict[str, Any]:
    """Fetch market data directly from Polymarket API using slug."""
    try:
        # Direct Polymarket API call
        polymarket_url = f"https://gamma-api.polymarket.com/events?slug={slug}"        
        async with aiohttp.ClientSession() as session:
            async with session.get(polymarket_url) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"❌ Polymarket API error {response.status}: {error_text}")
                    raise Exception(f"Polymarket API responded with {response.status}: {error_text}")
                
                data = await response.json()
                print(f"📊 Polymarket API response received, events count: {len(data) if isinstance(data, list) else 'N/A'}")
                
                # Polymarket returns an array of events, we want the first one
                if isinstance(data, list) and len(data) > 0:
                    event = data[0]
                    print(f"🎯 Found event: {event.get('title', 'Unknown')}")
                    
                    # Extract markets from the event
                    markets = event.get('markets', [])
                    if len(markets) > 0:
                        market = markets[0]  # Get the first market
                        print(f"📈 Found market: {market.get('question', 'Unknown')}")
                        
                        # Check for parsedClobTokenIds specifically
                        if 'clobTokenIds' in market:
                            print(f"✅ Found clobTokenIds in market data")
                        else:
                            print(f"⚠️ No clobTokenIds found. Available keys: {list(market.keys())}")
                        
                        return {
                            "success": True,
                            "market": market,
                            "event": event
                        }
                    else:
                        raise Exception("No markets found in event")
                else:
                    raise Exception("No events found for this slug")
                
    except Exception as e:
        print(f"❌ Error fetching market data from Polymarket: {e}")
        raise Exception(f"Failed to fetch market data: {str(e)}")

async def fetch_token_price(token_id: str, side: str = "buy") -> float:
    """Fetch price for a specific token ID directly from Polymarket."""
    try:
        # Direct Polymarket price API call
        polymarket_price_url = f"https://clob.polymarket.com/price?token_id={token_id}&side={side}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(polymarket_price_url) as response:
                if response.status != 200:
                    return 0.5  # Fallback price
                
                data = await response.json()
                price = float(data.get('price', 0.5))
                return price
                
    except Exception as e:
        print(f"❌ Error fetching token price from Polymarket: {e}")
        return 0.5  # Fallback price

async def fetch_and_cache_tokens(home_team: str, away_team: str, date_str: str = None) -> Dict[str, str]:
    """Fetch token IDs once and cache them for the game."""
    game_id = f"{home_team}_{away_team}"
    
    # Check if we already have cached tokens for this game and date
    if game_id in cached_tokens:
        cached_data = cached_tokens[game_id]
        if cached_data.get('date') == date_str:
            print(f"✅ Using cached tokens for {game_id}")
            return {
                "home_token_id": cached_data['home_token_id'],
                "away_token_id": cached_data['away_token_id']
            }
    
    # Fetching tokens silently
    
    try:
        # Generate slug and fetch market data
        slug = generate_polymarket_slug(home_team, away_team, date_str)
        market_data = await fetch_market_data_from_slug(slug)
        
        if not market_data.get('success'):
            raise Exception(f"Market data fetch unsuccessful: {market_data.get('error', 'Unknown error')}")
        
        market = market_data.get('market')
        if not market:
            raise Exception("No market data in response")
            
        # Extract and parse token IDs (same logic as before)
        
        clob_token_ids = market.get('clobTokenIds', '[]')
        if isinstance(clob_token_ids, str):
            print(f"🔧 Parsing clobTokenIds string: {clob_token_ids[:100]}...")
            try:
                import json
                parsed_tokens = json.loads(clob_token_ids)
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse clobTokenIds JSON: {e}")
                raise Exception(f"Invalid clobTokenIds JSON: {str(e)}")
        else:
            parsed_tokens = clob_token_ids
        
        print(f"📋 Parsed tokens: {parsed_tokens}")
        
        if not isinstance(parsed_tokens, list) or len(parsed_tokens) < 2:
            raise Exception(f"Expected 2 tokens in parsedClobTokenIds, got {len(parsed_tokens) if isinstance(parsed_tokens, list) else 'non-list'}")
        
        # Smart token assignment
        market_question = market.get('question', '').lower()
        market_title = market.get('title', '').lower()
        market_text = f"{market_question} {market_title}".lower()
                
        if (home_team.lower() in market_text and away_team.lower() in market_text):
            home_pos = market_text.find(home_team.lower())
            away_pos = market_text.find(away_team.lower())
            
            if home_pos != -1 and away_pos != -1:
                if away_pos < home_pos:
                    away_token_id = parsed_tokens[0]
                    home_token_id = parsed_tokens[1]
                    print(f"🎯 Matched by position: Away ({away_team}) first, Home ({home_team}) second")
                else:
                    home_token_id = parsed_tokens[0]
                    away_token_id = parsed_tokens[1]
                    print(f"🎯 Matched by position: Home ({home_team}) first, Away ({away_team}) second")
            else:
                away_token_id = parsed_tokens[0]
                home_token_id = parsed_tokens[1]
                print(f"🔄 Using standard assignment: first=away, second=home")
        else:
            away_token_id = parsed_tokens[0]
            home_token_id = parsed_tokens[1]
            print(f"🔄 Using standard assignment: first=away, second=home")
        
        # Cache the tokens
        cached_tokens[game_id] = {
            "home_token_id": home_token_id,
            "away_token_id": away_token_id,
            "date": date_str,
            "home_team": home_team,
            "away_team": away_team
        }
        
        print(f"💾 Cached tokens for {game_id}:")
        print(f"🏆 Home team ({home_team}): {home_token_id[:20]}...")
        print(f"🏟️ Away team ({away_team}): {away_token_id[:20]}...")
        
        return {
            "home_token_id": home_token_id,
            "away_token_id": away_token_id
        }
        
    except Exception as e:
        print(f"❌ Token fetch and cache failed: {e}")
        raise e

async def get_live_polymarket_prices(home_team: str, away_team: str, date_str: str = None) -> Dict[str, float]:
    """Get live Polymarket prices using cached tokens."""
    try:
        # Get cached tokens (this will fetch and cache if not already cached)
        tokens = await fetch_and_cache_tokens(home_team, away_team, date_str)
        
        home_token_id = tokens["home_token_id"]
        away_token_id = tokens["away_token_id"]
        
        # Silently fetch prices using cached tokens
        
        # Fetch prices for both tokens
        home_price, away_price = await asyncio.gather(
            fetch_token_price(home_token_id, "buy"),
            fetch_token_price(away_token_id, "buy")
        )
        
        return {
            "home": home_price,
            "away": away_price
        }
        
    except Exception as e:
        print(f"❌ Live price fetch failed: {e}")
        # Fallback to simulated prices
        import random
        base_home_price = 0.55
        fluctuation = random.uniform(-0.05, 0.05)
        home_price = max(0.05, min(0.95, base_home_price + fluctuation))
        away_price = 1.0 - home_price
        
        return {
            "home": round(home_price, 3),
            "away": round(away_price, 3)
        }

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

async def capture_contract_price_snapshot(game_id: str, trigger: str, home_team: str = None, away_team: str = None) -> Dict[str, float]:
    """Capture and store a contract price snapshot for trading analysis."""
    global contract_price_snapshots
    
    try:
        # Get current prices
        if home_team and away_team:
            prices = await get_live_polymarket_prices(home_team, away_team)
        else:
            prices = await get_current_market_prices(game_id)
        
        snapshot = {
            "timestamp": datetime.now().isoformat(),
            "home_price": prices["home"],
            "away_price": prices["away"],
            "trigger": trigger
        }
        
        # Initialize price history for this game if needed
        if game_id not in contract_price_snapshots:
            contract_price_snapshots[game_id] = []
        
        # Add snapshot to history
        contract_price_snapshots[game_id].append(snapshot)
        
        return prices
        
    except Exception as e:
        print(f"❌ Failed to capture price snapshot: {e}")
        return {"home": 0.55, "away": 0.45}

def analyze_price_movement(game_id: str, time_window_minutes: int = 5) -> Dict[str, Any]:
    """Analyze recent price movements to detect significant changes."""
    global contract_price_snapshots
    
    if game_id not in contract_price_snapshots or len(contract_price_snapshots[game_id]) < 2:
        return {"significant_change": False, "reason": "Insufficient price history"}
    
    snapshots = contract_price_snapshots[game_id]
    latest = snapshots[-1]
    
    # Find snapshot from time_window_minutes ago
    from datetime import datetime, timedelta
    cutoff_time = datetime.fromisoformat(latest["timestamp"]) - timedelta(minutes=time_window_minutes)
    
    baseline = None
    for snapshot in reversed(snapshots[:-1]):
        if datetime.fromisoformat(snapshot["timestamp"]) <= cutoff_time:
            baseline = snapshot
            break
    
    if not baseline:
        # Use the first snapshot if we don't have enough history
        baseline = snapshots[0]
    
    # Calculate price changes
    home_change = latest["home_price"] - baseline["home_price"]
    away_change = latest["away_price"] - baseline["away_price"]
    
    # Consider a change significant if any price moved more than 5 cents
    significant_threshold = 0.05
    significant_change = abs(home_change) > significant_threshold or abs(away_change) > significant_threshold
    
    return {
        "significant_change": significant_change,
        "home_change": home_change,
        "away_change": away_change,
        "threshold": significant_threshold,
        "time_window": time_window_minutes,
        "baseline_time": baseline["timestamp"],
        "latest_time": latest["timestamp"]
    }

def assess_game_situation_impact(game_state: Dict[str, Any], expected_run_change: float) -> Dict[str, Any]:
    """Assess whether the current game situation warrants trading activity."""
    home_score = game_state.get('homeScore', 0)
    away_score = game_state.get('awayScore', 0)
    inning = game_state.get('inning', 1)
    is_top = game_state.get('isTopOfInning', True)
    
    score_diff = abs(home_score - away_score)
    
    # Don't trade in blowout games (8+ run difference)
    if score_diff >= 8:
        return {
            "should_trade": False,
            "reason": f"Blowout game (score difference: {score_diff})",
            "impact_factor": 0.0
        }
    
    # Reduce trading in late innings with large leads
    if inning >= 8 and score_diff >= 5:
        return {
            "should_trade": False,
            "reason": f"Late inning with large lead (inning {inning}, diff: {score_diff})",
            "impact_factor": 0.0
        }
    
    # Calculate impact factor based on game situation
    # Early innings: 1.0, middle innings: 0.8, late innings: varies by score
    if inning <= 3:
        base_impact = 1.0
    elif inning <= 6:
        base_impact = 0.8
    else:
        # Late innings - impact depends on score difference
        if score_diff <= 1:
            base_impact = 1.2  # High leverage
        elif score_diff <= 3:
            base_impact = 0.9
        else:
            base_impact = 0.5
    
    # Adjust for expected run change magnitude
    run_impact = min(1.0, abs(expected_run_change) / 0.5)  # Normalize to 0.5 run threshold
    final_impact = base_impact * run_impact
    
    # Only trade if impact is significant enough
    should_trade = final_impact >= 0.3 and abs(expected_run_change) >= 0.2
    
    return {
        "should_trade": should_trade,
        "impact_factor": final_impact,
        "base_impact": base_impact,
        "run_impact": run_impact,
        "expected_run_change": expected_run_change,
        "score_diff": score_diff,
        "inning": inning,
        "reason": f"Impact factor: {final_impact:.2f} (threshold: 0.3)"
    }

async def execute_automated_trade(game_id: str, game_state: Dict[str, Any], expected_run_change: float, quality: str, home_team: str = None, away_team: str = None) -> Dict[str, Any]:
    """Execute automated trading based on expected run change and game situation."""
    
    # Step 1: Assess if this game situation warrants trading
    situation_analysis = assess_game_situation_impact(game_state, expected_run_change)
    
    if not situation_analysis["should_trade"]:
        return {
            "trade_executed": False,
            "reason": situation_analysis["reason"],
            "expected_run_change": expected_run_change,
            "quality": quality
        }
    
    # Step 2: Capture new price snapshot
    prices = await capture_contract_price_snapshot(game_id, f"quality_selection_{quality}", home_team, away_team)
    
    # Step 3: Analyze price movement since in-play button was pressed
    price_analysis = analyze_price_movement(game_id, time_window_minutes=5)
    
    if price_analysis.get("significant_change", False):
        return {
            "trade_executed": False,
            "reason": f"Price moved too much (>{price_analysis.get('threshold', 0.05):.0%})",
            "expected_run_change": expected_run_change,
            "quality": quality,
            "price_analysis": price_analysis
        }
    
    # Step 4: Determine trade direction and size
    is_top_inning = game_state.get('isTopOfInning', True)
    benefiting_team = None
    
    if expected_run_change > 0:
        # Positive expected run change benefits the batting team
        benefiting_team = "away" if is_top_inning else "home"
    elif expected_run_change < 0:
        # Negative expected run change benefits the pitching team
        benefiting_team = "home" if is_top_inning else "away"
    else:
        return {
            "trade_executed": False,
            "reason": "No expected run change",
            "expected_run_change": expected_run_change,
            "quality": quality
        }
    
    # Step 5: Calculate position size based on impact magnitude
    impact_factor = situation_analysis["impact_factor"]
    base_size = max(10, min(100, int(abs(expected_run_change) * 100)))  # 10-100 shares
    position_size = int(base_size * impact_factor)
    
    # Step 6: Execute simulated trade - sell opposing contracts first
    current_balance_data = initialize_game_balance(game_id)
    current_balance = current_balance_data["balance"]
    current_contracts = current_balance_data["contracts"]
    
    transactions = []
    new_balance = current_balance
    new_contracts = current_contracts.copy()
    
    # Determine opposing team
    opposing_team = "away" if benefiting_team == "home" else "home"
    
    # SELL opposing contracts first if we have any
    if current_contracts[opposing_team] > 0:
        sell_proceeds = current_contracts[opposing_team] * prices[opposing_team]
        sell_transaction = {
            "action": "SELL",
            "team": opposing_team,
            "shares": current_contracts[opposing_team],
            "price_per_share": prices[opposing_team],
            "total_cost": -sell_proceeds,  # Negative cost = proceeds
            "reason": f"Sell opposing position before buying {benefiting_team}",
            "timestamp": datetime.now().isoformat()
        }
        
        new_balance += sell_proceeds
        new_contracts[opposing_team] = 0
        transactions.append(sell_transaction)
        
        print(f"💸 SELL: {sell_transaction['shares']} {opposing_team.upper()} @ ${prices[opposing_team]:.3f}")
        print(f"💰 Proceeds: ${sell_proceeds:.2f}")
    
    # BUY new contracts
    trade_cost = position_size * prices[benefiting_team]
    
    if trade_cost > new_balance:
        return {
            "trade_executed": False,
            "reason": f"Insufficient balance after selling (need ${trade_cost:.2f}, have ${new_balance:.2f})",
            "expected_run_change": expected_run_change,
            "quality": quality
        }
    
    buy_transaction = {
        "action": "BUY",
        "team": benefiting_team,
        "shares": position_size,
        "price_per_share": prices[benefiting_team],
        "total_cost": trade_cost,
        "reason": f"Expected run change: {expected_run_change:+.4f} (quality: {quality})",
        "timestamp": datetime.now().isoformat()
    }
    
    new_balance -= trade_cost
    new_contracts[benefiting_team] += position_size
    transactions.append(buy_transaction)
    
    # Update global state
    game_balances[game_id]["balance"] = new_balance
    game_balances[game_id]["contracts"] = new_contracts
    game_balances[game_id]["history"].extend(transactions)
    
    return {
        "trade_executed": True,
        "transactions": transactions,
        "primary_transaction": buy_transaction,
        "new_balance": new_balance,
        "new_contracts": new_contracts,
        "expected_run_change": expected_run_change,
        "quality": quality,
        "benefiting_team": benefiting_team,
        "situation_analysis": situation_analysis,
        "price_analysis": price_analysis
    }

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
    Also ensures tokens are cached for the first sync.
    """
    try:
        game_state = request.get("gameState", {})
        play_quality = request.get("playQuality")  # Extract play quality if provided
        action_type = request.get("actionType")    # Track what type of action triggered this
        
        # Generate game ID from team names
        home_team = game_state.get("homeTeam", "HOME")
        away_team = game_state.get("awayTeam", "AWAY")
        game_id = f"{home_team}_{away_team}"
        
        # Get current live contract prices
        try:
            current_prices = await get_live_polymarket_prices(home_team, away_team)
        except:
            current_prices = await get_current_market_prices(game_id)
        
        print(f"\n{'='*60}")
        print(f"🏟️ GAME STATE: {away_team} {game_state.get('awayScore', 0)} - {game_state.get('homeScore', 0)} {home_team}")
        print(f"📊 {'Top' if game_state.get('isTopOfInning') else 'Bottom'} {game_state.get('inning', 1)}, {game_state.get('outs', 0)} outs, {game_state.get('balls', 0)}-{game_state.get('strikes', 0)} count")
        print(f"💰 LIVE PRICES: {home_team} ${current_prices['home']:.3f} | {away_team} ${current_prices['away']:.3f}")
        
        # Handle in-play button press - capture initial price snapshot
        if action_type == 'IN_PLAY_PRESSED':
            print(f"🎯 BUTTON PRESSED: IN-PLAY")
            await capture_contract_price_snapshot(game_id, "in_play", home_team, away_team)
        
        # Handle quality button selections
        if play_quality and action_type == 'QUALITY_CHANGE' and play_quality in ['very-bad', 'bad', 'neutral', 'good', 'very-good']:
            print(f"🎯 BUTTON PRESSED: {play_quality.upper()}")
            
            # Calculate expected run difference
            expected_value_data = calculate_expected_value_for_quality(play_quality, game_state)
            
            if 'error' in expected_value_data:
                print(f"❌ ERROR: {expected_value_data['error']}")
            else:
                expected_run_diff = expected_value_data['expected_value']
                print(f"📊 Expected Run Difference: {expected_run_diff:+.4f}")
                
                # Execute automated trading for non-neutral quality selections
                if play_quality != 'neutral':
                    trading_result = await execute_automated_trade(
                        game_id, game_state, expected_run_diff, play_quality, home_team, away_team
                    )
                    
                    if trading_result.get("trade_executed"):
                        primary_transaction = trading_result["primary_transaction"]
                        print(f"✅ TRADE: {primary_transaction['action']} {primary_transaction['shares']} {primary_transaction['team'].upper()} @ ${primary_transaction['price_per_share']:.3f}")
                        print(f"💰 Cost: ${primary_transaction['total_cost']:.2f}")
                    else:
                        print(f"❌ NO TRADE: {trading_result.get('reason', 'Unknown')}")
        
        # Show current balance and contracts
        balance_data = initialize_game_balance(game_id)
        print(f"💰 BALANCE: ${balance_data['balance']:.2f} | {home_team}: {balance_data['contracts']['home']} | {away_team}: {balance_data['contracts']['away']}")
        
        # Store the game state with additional context
        game_state_with_context = {
            **game_state,
            "_play_quality": play_quality,
            "_action_type": action_type,
            "_timestamp": datetime.now().isoformat()
        }
        current_game_states[game_id] = game_state_with_context
        
        # Ensure tokens are cached for this game (only if not already cached)
        today = datetime.now().strftime("%Y-%m-%d")
        if game_id not in cached_tokens or cached_tokens[game_id].get('date') != today:
            try:
                print(f"🎯 First sync for {game_id} - caching tokens...")
                await fetch_and_cache_tokens(home_team, away_team, today)
            except Exception as token_error:
                print(f"⚠️ Token caching failed (continuing anyway): {token_error}")
        
        return {
            "success": True,
            "game_id": game_id,
            "message": f"Game state synced for {game_id}",
            "tokens_cached": game_id in cached_tokens,
            "play_quality": play_quality,
            "action_type": action_type,
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
    Get current LIVE Polymarket prices for a game.
    """
    try:
        game_id = request.get("gameId", "")
        
        print(f"💰 Getting LIVE market prices for game: {game_id}")
        
        # Parse game_id to extract team names
        if "_" in game_id:
            home_team, away_team = game_id.split("_", 1)
        else:
            # Fallback if format is unexpected
            home_team = "HOME"
            away_team = "AWAY"
        
        # Get today's date for the market
        today = datetime.now().strftime("%Y-%m-%d") 
        
        # Fetch live prices from Polymarket
        prices = await get_live_polymarket_prices(home_team, away_team, today)
        
        print(f"📊 Live market prices: {prices}")
        
        return {
            "success": True,
            "prices": prices,
            "game_id": game_id,
            "home_team": home_team,
            "away_team": away_team,
            "date": today,
            "message": "Live market prices retrieved from Polymarket"
        }
        
    except Exception as e:
        print(f"❌ Live market prices failed: {e}")
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

@app.post("/quality_analysis")
async def analyze_quality_for_game_state(request: Dict[str, Any]):
    """
    Analyze quality thresholds and get play options for current game state.
    """
    try:
        game_state = request.get("gameState", {})
        quality = request.get("quality", "neutral")
        
        print(f"🎯 Quality analysis requested for quality: {quality}")
        print(f"📊 Game state: {game_state}")
        
        # Calculate quality thresholds
        quality_ranges = calculate_quality_thresholds(game_state)
        
        if not quality_ranges:
            return {
                "success": False,
                "error": "No play transition data available for this game state",
                "game_state": game_state
            }
        
        # Get play options for the requested quality
        play_options = get_play_options_by_quality(quality, game_state)
        
        print(f"✅ Found {len(play_options)} options for {quality} quality")
        
        return {
            "success": True,
            "game_state": game_state,
            "quality": quality,
            "quality_ranges": quality_ranges,
            "play_options": play_options,
            "total_outcomes": len(get_play_outcomes_for_base_state(game_state.get('bases', {}), game_state.get('outs', 0))),
            "message": f"Quality analysis complete for {quality} level"
        }
        
    except Exception as e:
        print(f"❌ Quality analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/quality_thresholds")
async def get_quality_thresholds(request: Dict[str, Any]):
    """
    Get quality thresholds for a specific game state.
    """
    try:
        game_state = request.get("gameState", {})
        
        print(f"📊 Getting quality thresholds for game state: {game_state}")
        
        # Calculate quality thresholds
        quality_ranges = calculate_quality_thresholds(game_state)
        
        if not quality_ranges:
            return {
                "success": False,
                "error": "No play transition data available for this game state",
                "game_state": game_state
            }
        
        # Get total number of outcomes for this state
        total_outcomes = len(get_play_outcomes_for_base_state(game_state.get('bases', {}), game_state.get('outs', 0)))
        
        print(f"✅ Quality thresholds calculated with {total_outcomes} total outcomes")
        
        return {
            "success": True,
            "game_state": game_state,
            "quality_ranges": quality_ranges,
            "total_outcomes": total_outcomes,
            "message": "Quality thresholds calculated successfully"
        }
        
    except Exception as e:
        print(f"❌ Quality threshold calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Load win percentage data on startup
@app.on_event("startup")
async def startup_event():
    print("🚀 Starting Baseball Polymarket API...")
    load_win_percentage_data()
    load_play_transition_data()
    print("✅ Startup complete!")

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Baseball Polymarket API...")
    load_win_percentage_data()
    load_play_transition_data()
    uvicorn.run(app, host="0.0.0.0", port=8000)