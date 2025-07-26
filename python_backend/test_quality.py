#!/usr/bin/env python3

from main import *
import json

def test_quality_analysis():
    # Load data  
    print("📊 Loading data...")
    load_win_percentage_data()
    load_play_transition_data()
    
    # Test with empty bases, 0 outs
    test_game_state = {
        'bases': {'first': False, 'second': False, 'third': False},
        'outs': 0
    }
    
    print('🎯 Testing quality analysis with empty bases, 0 outs...')
    
    # Test quality thresholds calculation
    quality_ranges = calculate_quality_thresholds(test_game_state)
    if quality_ranges:
        print('✅ Quality thresholds calculated:')
        for quality, range_str in quality_ranges.items():
            if quality != 'thresholds':
                print(f'  {quality}: {range_str}')
        
        # Print specific thresholds
        thresholds = quality_ranges['thresholds']
        print(f'\n📊 Key thresholds:')
        print(f'  goodMin: {thresholds["goodMin"]:.3f}')
        print(f'  goodMax: {thresholds["goodMax"]:.3f}')
    else:
        print('❌ No quality ranges calculated')
        return
    
    # Test getting play options for 'good' quality
    good_options = get_play_options_by_quality('good', test_game_state)
    print(f'\n✅ Found {len(good_options)} good quality options:')
    for i, option in enumerate(good_options[:5]):
        print(f'  {i+1}. norm: {option["normValue"]:.3f}, runs: {option["runsScored"]}, outs: {option["outsGained"]}')
        if option['finalBases']['first']:
            print(f'      -> Batter reaches first base!')
    
    # Test with bases loaded (first, second, third)
    test_game_state_loaded = {
        'bases': {'first': True, 'second': True, 'third': True},
        'outs': 0
    }
    
    print(f'\n🎯 Testing with bases loaded, 0 outs...')
    
    # Test quality thresholds for bases loaded
    loaded_quality_ranges = calculate_quality_thresholds(test_game_state_loaded)
    if loaded_quality_ranges:
        print('✅ Quality thresholds for bases loaded:')
        for quality, range_str in loaded_quality_ranges.items():
            if quality != 'thresholds':
                print(f'  {quality}: {range_str}')
        
        thresholds = loaded_quality_ranges['thresholds']
        print(f'\n📊 Key thresholds for bases loaded:')
        print(f'  neutralMin: {thresholds["minOneOutNoRun"]:.3f}')
        print(f'  neutralMax: {thresholds["maxNoOutsNoRuns"]:.3f}')
    
    # Test all quality ranges with bases loaded to identify overlaps
    print(f'\n🔍 Testing all quality ranges for overlaps...')
    qualities = ['very-bad', 'bad', 'neutral', 'good', 'very-good']
    
    for quality in qualities:
        options = get_play_options_by_quality(quality, test_game_state_loaded)
        if options:
            min_norm = min(o["normValue"] for o in options)
            max_norm = max(o["normValue"] for o in options)
            print(f'  {quality}: {len(options)} options, range {min_norm:.3f} to {max_norm:.3f}')
        else:
            print(f'  {quality}: {len(options)} options')
    
    # Also test all available outcomes for bases loaded
    all_outcomes = get_play_outcomes_for_base_state(test_game_state_loaded['bases'], test_game_state_loaded['outs'])
    print(f'\n📊 Total outcomes available for bases loaded: {len(all_outcomes)}')
    print(f'📊 Norm value range: {min(o["normValue"] for o in all_outcomes):.3f} to {max(o["normValue"] for o in all_outcomes):.3f}')
    
    # Show all outcomes sorted by norm_value to understand the distribution
    sorted_outcomes = sorted(all_outcomes, key=lambda x: x["normValue"])
    print(f'📊 All outcomes sorted by norm_value:')
    for i, option in enumerate(sorted_outcomes):
        print(f'  {i+1:2d}. norm: {option["normValue"]:6.3f}, runs: {option["runsScored"]}, outs: {option["outsGained"]}')
    
    # Debug: Let's see what good candidates are being identified
    print(f'\n🔍 Debug: Good candidates analysis...')
    
    good_candidates = []
    for o in all_outcomes:
        # Include outcomes with runs scored and at most one out
        if o['runsScored'] >= 1 and o['outsGained'] <= 1:
            good_candidates.append(o)
            print(f'  ✅ Good candidate: norm {o["normValue"]:.3f}, runs: {o["runsScored"]}, outs: {o["outsGained"]} (runs>=1, outs<=1)')
        # Include ALL outcomes where no outs occur and could be singles
        elif o['outsGained'] == 0:
            # Check for single patterns: batter reaches first base
            if o['finalBases']['first']:
                good_candidates.append(o)
                print(f'  ✅ Good candidate: norm {o["normValue"]:.3f}, no outs, batter reaches first')
            # Also include outcomes where no runs scored and no outs (conservative hits)
            elif o['runsScored'] == 0:
                good_candidates.append(o)
                print(f'  ✅ Good candidate: norm {o["normValue"]:.3f}, no runs, no outs (conservative)')
    
    print(f'\\nGood candidates found: {len(good_candidates)}')
    if good_candidates:
        good_min = min([o['normValue'] for o in good_candidates])
        good_max = max([o['normValue'] for o in good_candidates])
        print(f'Good min should be: {good_min:.3f}, good max should be: {good_max:.3f}')
        print(f'Current system shows good range: 0.196 to 0.958')
        print(f'❌ Gap detected! Missing outcomes from {good_min:.3f} to 0.196')

if __name__ == "__main__":
    test_quality_analysis()