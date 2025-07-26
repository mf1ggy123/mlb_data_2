#!/usr/bin/env python3

from main import *
import json

def test_all_game_states():
    # Load data  
    print("📊 Loading data...")
    load_win_percentage_data()
    load_play_transition_data()
    
    # Test multiple game states
    test_states = [
        {
            'name': 'Empty bases, 0 outs',
            'state': {'bases': {'first': False, 'second': False, 'third': False}, 'outs': 0}
        },
        {
            'name': 'Empty bases, 1 out',
            'state': {'bases': {'first': False, 'second': False, 'third': False}, 'outs': 1}
        },
        {
            'name': 'Empty bases, 2 outs',
            'state': {'bases': {'first': False, 'second': False, 'third': False}, 'outs': 2}
        },
        {
            'name': 'Runner on first, 0 outs',
            'state': {'bases': {'first': True, 'second': False, 'third': False}, 'outs': 0}
        },
        {
            'name': 'Runner on first, 2 outs',
            'state': {'bases': {'first': True, 'second': False, 'third': False}, 'outs': 2}
        },
        {
            'name': 'Runner on second, 0 outs',
            'state': {'bases': {'first': False, 'second': True, 'third': False}, 'outs': 0}
        },
        {
            'name': 'Runner on second, 2 outs',
            'state': {'bases': {'first': False, 'second': True, 'third': False}, 'outs': 2}
        },
        {
            'name': 'Runner on third, 2 outs',
            'state': {'bases': {'first': False, 'second': False, 'third': True}, 'outs': 2}
        },
        {
            'name': 'Runners on 2nd and 3rd, 2 outs',
            'state': {'bases': {'first': False, 'second': True, 'third': True}, 'outs': 2}
        },
        {
            'name': 'Bases loaded, 0 outs',
            'state': {'bases': {'first': True, 'second': True, 'third': True}, 'outs': 0}
        },
        {
            'name': 'Bases loaded, 2 outs',
            'state': {'bases': {'first': True, 'second': True, 'third': True}, 'outs': 2}
        }
    ]
    
    for test in test_states:
        print(f"\n{'='*80}")
        print(f"🎯 {test['name']}")
        print(f"{'='*80}")
        
        game_state = test['state']
        
        # Get all outcomes for this state
        all_outcomes = get_play_outcomes_for_base_state(game_state['bases'], game_state['outs'])
        
        if not all_outcomes:
            print("❌ No outcomes available for this state")
            continue
            
        print(f"\n📈 Total outcomes available: {len(all_outcomes)}")
        
        # Show all outcomes sorted by norm_value
        print(f"\n📋 ALL OUTCOMES (sorted by norm_value):")
        sorted_outcomes = sorted(all_outcomes, key=lambda x: x['normValue'])
        for i, outcome in enumerate(sorted_outcomes):
            print(f"  {i+1:2d}. norm: {outcome['normValue']:7.3f} | "
                  f"runs: {outcome['runsScored']} | "
                  f"outs: {outcome['outsGained']} | "
                  f"{outcome['description']}")
        
        # Calculate quality thresholds
        quality_ranges = calculate_quality_thresholds(game_state)
        if quality_ranges:
            print(f"\n📊 Quality Ranges:")
            for quality in ['veryBad', 'bad', 'neutral', 'good', 'veryGood']:
                print(f"  {quality:10}: {quality_ranges[quality]}")
                
            # Debug threshold values
            thresholds = quality_ranges['thresholds']
            print(f"\n🔍 THRESHOLD VALUES:")
            print(f"  maxOutNoRun: {thresholds['maxOutNoRun']:.3f}")
            print(f"  badMin: {thresholds['badMin']:.3f}")
            print(f"  maxOneOutNoRun: {thresholds['maxOneOutNoRun']:.3f}")
            print(f"  minOneOutNoRun: {thresholds['minOneOutNoRun']:.3f}")
            print(f"  maxNoOutsNoRuns: {thresholds['maxNoOutsNoRuns']:.3f}")
            print(f"  goodMin: {thresholds['goodMin']:.3f}")
            print(f"  goodMax: {thresholds['goodMax']:.3f}")
            
            # Show which outcomes fall into each quality category
            print(f"\n🔹 QUALITY BREAKDOWN:")
            qualities = ['very-bad', 'bad', 'neutral', 'good', 'very-good']
            
            for quality in qualities:
                options = get_play_options_by_quality(quality, game_state)
                print(f"\n  {quality.upper()} ({len(options)} options):")
                
                if not options:
                    print("    (no options)")
                    continue
                    
                # Sort by norm_value
                sorted_options = sorted(options, key=lambda x: x['normValue'])
                
                for option in sorted_options:
                    print(f"    norm: {option['normValue']:7.3f} | "
                          f"runs: {option['runsScored']} | "
                          f"outs: {option['outsGained']} | "
                          f"{option['description']}")
        else:
            print("❌ No quality ranges calculated")
        
        # Raw threshold calculations for debugging
        print(f"\n🔧 RAW THRESHOLD CALCULATIONS:")
        
        # Find the highest norm_value where outs occur but no runs score
        outcomesWithOutsButNoRuns = [o for o in all_outcomes if o['outsGained'] > 0 and o['runsScored'] == 0]
        maxOutNoRunValue = max([o['normValue'] for o in outcomesWithOutsButNoRuns]) if outcomesWithOutsButNoRuns else -1
        print(f"  outcomesWithOutsButNoRuns: {len(outcomesWithOutsButNoRuns)} outcomes")
        print(f"  maxOutNoRunValue: {maxOutNoRunValue:.3f}")
        
        # Find the highest norm_value where exactly one out occurs and no runs score
        outcomesWithOneOutNoRuns = [o for o in all_outcomes if o['outsGained'] == 1 and o['runsScored'] == 0]
        maxOneOutNoRunValue = max([o['normValue'] for o in outcomesWithOneOutNoRuns]) if outcomesWithOneOutNoRuns else -1
        minOneOutNoRunValue = min([o['normValue'] for o in outcomesWithOneOutNoRuns]) if outcomesWithOneOutNoRuns else -1
        print(f"  outcomesWithOneOutNoRuns: {len(outcomesWithOneOutNoRuns)} outcomes")
        print(f"  maxOneOutNoRunValue (original): {maxOneOutNoRunValue:.3f}")
        print(f"  minOneOutNoRunValue: {minOneOutNoRunValue:.3f}")
        
        # Find double play outcomes
        outcomesWithDoublePlay = [o for o in all_outcomes if o['outsGained'] >= 2 and o['runsScored'] == 0]
        maxDoublePlayValue = max([o['normValue'] for o in outcomesWithDoublePlay]) if outcomesWithDoublePlay else None
        print(f"  outcomesWithDoublePlay: {len(outcomesWithDoublePlay)} outcomes")
        print(f"  maxDoublePlayValue: {maxDoublePlayValue}")
        
        # Check 2-out logic
        if game_state['outs'] == 2:
            print(f"  🚨 2-OUT SCENARIO DETECTED!")
            print(f"  Before adjustment - badMin would be: {minOneOutNoRunValue:.3f}")
            print(f"  After adjustment - badMin set to: {maxOutNoRunValue:.3f}")
            print(f"  After adjustment - maxOneOutNoRun set to: {maxOutNoRunValue:.3f}")

if __name__ == "__main__":
    test_all_game_states()