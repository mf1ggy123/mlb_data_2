#!/usr/bin/env python3

from main import *
import json

def test_expected_value():
    # Load data  
    print("📊 Loading data...")
    load_win_percentage_data()
    load_play_transition_data()
    
    # Test scenario: 0 outs, no one on base (as mentioned in the user's example)
    test_game_state = {
        'bases': {'first': False, 'second': False, 'third': False},
        'outs': 0,
        'inning': 1,
        'isTopOfInning': True,
        'homeTeam': 'BOS',
        'awayTeam': 'NYY'
    }
    
    print(f"\n{'='*70}")
    print(f"🎯 TESTING EXPECTED VALUE CALCULATION")
    print(f"Game State: 0 outs, no one on base")
    print(f"{'='*70}")
    
    # Test all quality levels
    qualities = ['very-bad', 'bad', 'neutral', 'good', 'very-good']
    
    for quality in qualities:
        print(f"\n📊 EXPECTED VALUE ANALYSIS for '{quality.upper()}' quality:")
        
        expected_value_data = calculate_expected_value_for_quality(quality, test_game_state)
        
        if 'error' in expected_value_data:
            print(f"❌ Error: {expected_value_data['error']}")
            continue
        
        print(f"💯 Expected Value: {expected_value_data['expected_value']:+.4f} runs")
        print(f"📈 Total Outcomes: {expected_value_data['total_outcomes']}")
        print(f"🎲 Total Probability: {expected_value_data['total_probability']:.4f}")
        
        # Show summary statistics
        summary = expected_value_data['summary']
        print(f"⚾ Avg Runs Scored: {summary['avg_runs_scored']:.3f}")
        print(f"🚫 Avg Outs Gained: {summary['avg_outs_gained']:.3f}")
        
        # Show top contributing outcomes
        print(f"\n🔝 Top Contributing Outcomes:")
        for i, outcome in enumerate(expected_value_data['outcome_details'][:3], 1):
            print(f"  {i}. {outcome['description']}")
            print(f"     Weight: {outcome['weight']:.1%} | Run Value: {outcome['run_value']:+.3f} | Contribution: {outcome['weighted_contribution']:+.4f}")
            print(f"     Runs: {outcome['runs_scored']} | Outs: {outcome['outs_gained']} | Norm: {outcome['norm_value']:+.3f}")

if __name__ == "__main__":
    test_expected_value()