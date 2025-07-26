#!/usr/bin/env python3

from main import *
import json

def test_2nd_3rd_2_outs():
    # Load data  
    print("📊 Loading data...")
    load_win_percentage_data()
    load_play_transition_data()
    
    # Test runner on 2nd and 3rd, 2 outs
    test_states = [
        {
            'name': 'Runner on 2nd and 3rd, 2 outs',
            'state': {'bases': {'first': False, 'second': True, 'third': True}, 'outs': 2}
        }
    ]
    
    for test in test_states:
        print(f"\n{'='*60}")
        print(f"🎯 {test['name']}")
        print(f"{'='*60}")
        
        game_state = test['state']
        
        # Calculate quality thresholds
        quality_ranges = calculate_quality_thresholds(game_state)
        if not quality_ranges:
            print("❌ No quality ranges available for this state")
            continue
            
        # Show threshold ranges
        print(f"\n📊 Quality Ranges:")
        for quality in ['veryBad', 'bad', 'neutral', 'good', 'veryGood']:
            print(f"  {quality:10}: {quality_ranges[quality]}")
            
        # Debug threshold values
        thresholds = quality_ranges['thresholds']
        print(f"\n🔍 DEBUG Thresholds:")
        print(f"  maxOutNoRun: {thresholds['maxOutNoRun']:.3f}")
        print(f"  badMin: {thresholds['badMin']:.3f}")
        print(f"  maxOneOutNoRun: {thresholds['maxOneOutNoRun']:.3f}")
        print(f"  minOneOutNoRun: {thresholds['minOneOutNoRun']:.3f}")
        print(f"  maxNoOutsNoRuns: {thresholds['maxNoOutsNoRuns']:.3f}")
        print(f"  goodMin: {thresholds['goodMin']:.3f}")
        print(f"  goodMax: {thresholds['goodMax']:.3f}")
        
        # Show actual options for each quality
        qualities = ['very-bad', 'bad', 'neutral', 'good', 'very-good']
        
        for quality in qualities:
            options = get_play_options_by_quality(quality, game_state)
            print(f"\n🔹 {quality.upper()} ({len(options)} options):")
            
            if not options:
                print("    (no options)")
                continue
                
            # Sort by norm_value for better display
            sorted_options = sorted(options, key=lambda x: x['normValue'])
            
            for i, option in enumerate(sorted_options[:5]):  # Show top 5
                print(f"    {i+1}. norm: {option['normValue']:6.3f} | "
                      f"runs: {option['runsScored']} | "
                      f"outs: {option['outsGained']} | "
                      f"{option['description']}")
            
            if len(options) > 5:
                print(f"    ... and {len(options) - 5} more options")
        
        # Show total outcomes available
        all_outcomes = get_play_outcomes_for_base_state(game_state['bases'], game_state['outs'])
        print(f"\n📈 Total outcomes available: {len(all_outcomes)}")
        if all_outcomes:
            min_norm = min(o['normValue'] for o in all_outcomes)
            max_norm = max(o['normValue'] for o in all_outcomes)
            print(f"📈 Norm value range: {min_norm:.3f} to {max_norm:.3f}")

if __name__ == "__main__":
    test_2nd_3rd_2_outs()