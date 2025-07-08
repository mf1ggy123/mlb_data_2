const fs = require('fs');
const path = require('path');

// Parse Retrosheet event files to analyze play outcomes by base configuration
class RetrosheetAnalyzer {
  constructor() {
    this.outcomesByBaseState = {};
    this.totalPlays = 0;
  }

  // Parse base configuration from game state
  parseBaseState(runners) {
    // Retrosheet uses 0=empty, 1=1st, 2=2nd, 3=3rd for base state
    const bases = {
      first: false,
      second: false, 
      third: false
    };
    
    if (runners && runners.includes('1')) bases.first = true;
    if (runners && runners.includes('2')) bases.second = true;
    if (runners && runners.includes('3')) bases.third = true;
    
    return bases;
  }

  // Create a key for base configuration
  getBaseStateKey(bases) {
    const key = [];
    if (bases.first) key.push('1st');
    if (bases.second) key.push('2nd');
    if (bases.third) key.push('3rd');
    return key.length > 0 ? key.join('-') : 'empty';
  }

  // Parse play outcome and categorize it
  categorizeOutcome(playEvent) {
    const event = playEvent.toUpperCase();
    
    // Singles
    if (event.match(/^S[0-9]/)) {
      return 'single';
    }
    
    // Doubles  
    if (event.match(/^D[0-9]/)) {
      return 'double';
    }
    
    // Triples
    if (event.match(/^T[0-9]/)) {
      return 'triple';
    }
    
    // Home runs
    if (event.match(/^H[0-9R]?/) || event.match(/^HR/)) {
      return 'homerun';
    }
    
    // Walks
    if (event.match(/^W/) || event.match(/^IW/)) {
      return 'walk';
    }
    
    // Strikeouts
    if (event.match(/^K/)) {
      return 'strikeout';
    }
    
    // Ground outs
    if (event.match(/^[1-6][0-9]?/) && event.includes('/G')) {
      return 'groundout';
    }
    
    // Fly outs
    if (event.match(/^[1-9][0-9]?/) && (event.includes('/F') || event.includes('/P') || event.includes('/L'))) {
      return 'flyout';
    }
    
    // Errors
    if (event.match(/^E[0-9]/)) {
      return 'error';
    }
    
    // Double plays
    if (event.match(/GDP/) || event.includes('/DP')) {
      return 'double-play';
    }
    
    // Basic outs (catch-all for fielding)
    if (event.match(/^[1-9][0-9]?$/)) {
      return 'out';
    }
    
    return 'other';
  }

  // Process a single game file
  processGameFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\\n');
    
    let currentBaseState = 'empty';
    
    for (const line of lines) {
      if (line.startsWith('play,')) {
        const parts = line.split(',');
        if (parts.length >= 7) {
          const inning = parts[1];
          const batting = parts[2]; // 0=top, 1=bottom
          const batter = parts[3];
          const count = parts[4];
          const pitches = parts[5];
          const event = parts[6];
          
          // Parse base runners from event description
          // This is simplified - full parsing would need more complex logic
          const bases = this.parseBaseStateFromEvent(event);
          const baseKey = this.getBaseStateKey(bases);
          
          const outcome = this.categorizeOutcome(event);
          
          if (!this.outcomesByBaseState[baseKey]) {
            this.outcomesByBaseState[baseKey] = {};
          }
          
          if (!this.outcomesByBaseState[baseKey][outcome]) {
            this.outcomesByBaseState[baseKey][outcome] = 0;
          }
          
          this.outcomesByBaseState[baseKey][outcome]++;
          this.totalPlays++;
        }
      }
    }
  }

  // Simplified base state parsing from event
  parseBaseStateFromEvent(event) {
    // This is a simplified approach - actual parsing would be more complex
    // For now, we'll estimate based on common patterns
    return {
      first: Math.random() > 0.7, // Rough estimates for demo
      second: Math.random() > 0.85,
      third: Math.random() > 0.9
    };
  }

  // Process all game files in data directory
  processAllFiles() {
    const dataDir = path.join(__dirname, 'data');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.EVA') || f.endsWith('.EVN'));
    
    console.log(`Processing ${files.length} Retrosheet files...`);
    
    // Process a sample of files for speed (you can process all for full accuracy)
    const sampleFiles = files.slice(0, 50);
    
    for (const file of sampleFiles) {
      try {
        this.processGameFile(path.join(dataDir, file));
      } catch (error) {
        console.log(`Error processing ${file}: ${error.message}`);
      }
    }
    
    console.log(`Processed ${this.totalPlays} total plays`);
  }

  // Get outcome probabilities for a specific base configuration
  getOutcomeProbabilities(bases) {
    const baseKey = this.getBaseStateKey(bases);
    const outcomes = this.outcomesByBaseState[baseKey];
    
    if (!outcomes) {
      return this.getDefaultProbabilities();
    }
    
    const total = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
    const probabilities = {};
    
    for (const [outcome, count] of Object.entries(outcomes)) {
      probabilities[outcome] = (count / total * 100).toFixed(1);
    }
    
    return probabilities;
  }

  // Default probabilities if no data available
  getDefaultProbabilities() {
    return {
      'out': '65.0',
      'single': '15.0', 
      'double': '8.0',
      'walk': '7.0',
      'strikeout': '3.0',
      'triple': '1.5',
      'homerun': '0.5'
    };
  }

  // Generate realistic play options with probabilities
  generateRealisticOutcomes(bases, quality = 'neutral') {
    const probabilities = this.getOutcomeProbabilities(bases);
    
    // Adjust probabilities based on quality
    const qualityMultipliers = {
      'very-bad': { out: 2.0, strikeout: 3.0, single: 0.1, double: 0.1 },
      'bad': { out: 1.5, strikeout: 1.5, single: 0.5, double: 0.3 },
      'neutral': { out: 1.0, single: 1.0, double: 1.0, triple: 1.0 },
      'good': { single: 2.0, double: 1.5, walk: 1.5, out: 0.7 },
      'very-good': { homerun: 5.0, triple: 3.0, double: 2.0, out: 0.3 }
    };
    
    const multipliers = qualityMultipliers[quality] || qualityMultipliers.neutral;
    
    const adjustedOutcomes = [];
    for (const [outcome, prob] of Object.entries(probabilities)) {
      const multiplier = multipliers[outcome] || 1.0;
      const adjustedProb = parseFloat(prob) * multiplier;
      
      if (adjustedProb > 2.0) { // Only include outcomes with reasonable probability
        adjustedOutcomes.push({
          outcome,
          probability: adjustedProb.toFixed(1),
          label: this.getOutcomeLabel(outcome),
          description: this.getOutcomeDescription(outcome, bases)
        });
      }
    }
    
    // Sort by probability (highest first)
    return adjustedOutcomes.sort((a, b) => parseFloat(b.probability) - parseFloat(a.probability));
  }

  getOutcomeLabel(outcome) {
    const labels = {
      'single': 'Single',
      'double': 'Double', 
      'triple': 'Triple',
      'homerun': 'Home Run',
      'walk': 'Walk',
      'strikeout': 'Strikeout',
      'groundout': 'Ground Out',
      'flyout': 'Fly Out',
      'out': 'Out',
      'error': 'Error',
      'double-play': 'Double Play'
    };
    return labels[outcome] || outcome;
  }

  getOutcomeDescription(outcome, bases) {
    const baseRunners = this.getBaseStateKey(bases);
    const hasRunners = baseRunners !== 'empty';
    
    const descriptions = {
      'single': hasRunners ? 'Runners advance, possible scoring' : 'Batter reaches first',
      'double': hasRunners ? 'Multiple runners likely score' : 'Batter reaches second', 
      'triple': hasRunners ? 'Most/all runners score' : 'Batter reaches third',
      'homerun': hasRunners ? 'All runners score + batter' : 'Solo home run',
      'walk': hasRunners ? 'Force advance situation' : 'Batter to first',
      'strikeout': 'Batter out on strikes',
      'groundout': 'Fielded and thrown out',
      'flyout': 'Caught in the air',
      'out': 'Batter retired',
      'error': 'Defensive mistake, all safe',
      'double-play': 'Two outs on one play'
    };
    
    return descriptions[outcome] || 'Baseball play';
  }

  // Print analysis summary
  printSummary() {
    console.log('\\n=== Retrosheet Analysis Summary ===');
    for (const [baseState, outcomes] of Object.entries(this.outcomesByBaseState)) {
      console.log(`\\n${baseState.toUpperCase()} bases:`);
      const total = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
      
      const sorted = Object.entries(outcomes)
        .map(([outcome, count]) => ({
          outcome,
          count,
          percentage: (count / total * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count);
      
      for (const item of sorted) {
        console.log(`  ${item.outcome}: ${item.count} (${item.percentage}%)`);
      }
    }
  }
}

// Export for use in the main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RetrosheetAnalyzer;
}

// Run analysis if called directly
if (require.main === module) {
  const analyzer = new RetrosheetAnalyzer();
  analyzer.processAllFiles();
  analyzer.printSummary();
  
  // Test with different base configurations
  console.log('\\n=== Sample Outcomes by Base Configuration ===');
  
  const testConfigs = [
    { first: false, second: false, third: false },
    { first: true, second: false, third: false },
    { first: false, second: true, third: false },
    { first: true, second: true, third: true }
  ];
  
  for (const bases of testConfigs) {
    const baseKey = analyzer.getBaseStateKey(bases);
    console.log(`\\n${baseKey.toUpperCase()}:`);
    const outcomes = analyzer.generateRealisticOutcomes(bases, 'neutral');
    for (const outcome of outcomes.slice(0, 5)) {
      console.log(`  ${outcome.label}: ${outcome.probability}% - ${outcome.description}`);
    }
  }
}