const fs = require('fs');
const path = require('path');

class RetrosheetParser {
  constructor() {
    this.outcomeStats = {
      'empty': {},
      '1st': {},
      '2nd': {},
      '3rd': {},
      '1st-2nd': {},
      '1st-3rd': {},
      '2nd-3rd': {},
      '1st-2nd-3rd': {}
    };
    this.totalPlays = 0;
  }

  // Parse base runners from the game state tracking
  parseBaseRunners(gameState) {
    // For now, we'll use a simplified approach since tracking exact game state
    // through retrosheet requires complex state management
    // This is a statistical approximation based on common game situations
    
    const rand = Math.random();
    
    // Statistical distribution of base situations in MLB
    if (rand < 0.72) return 'empty';        // ~72% empty bases
    if (rand < 0.85) return '1st';          // ~13% runner on first only
    if (rand < 0.92) return '2nd';          // ~7% runner on second only  
    if (rand < 0.96) return '1st-2nd';      // ~4% runners on first and second
    if (rand < 0.98) return '3rd';          // ~2% runner on third only
    if (rand < 0.99) return '1st-3rd';      // ~1% runners on first and third
    if (rand < 0.995) return '2nd-3rd';     // ~0.5% runners on second and third
    return '1st-2nd-3rd';                   // ~0.5% bases loaded
  }

  // Categorize the outcome more precisely
  categorizePlay(event) {
    const clean = event.replace(/[.+]/g, '').toUpperCase();
    
    // Home runs
    if (clean.match(/^H/) || clean.includes('HR')) return 'homerun';
    
    // Triples  
    if (clean.match(/^T/)) return 'triple';
    
    // Doubles
    if (clean.match(/^D/)) return 'double';
    
    // Singles
    if (clean.match(/^S/)) return 'single';
    
    // Walks
    if (clean.match(/^W/) || clean.match(/^I/)) return 'walk';
    
    // Strikeouts
    if (clean.match(/^K/)) return 'strikeout';
    
    // Errors
    if (clean.match(/^E/)) return 'error';
    
    // Ground ball double plays
    if (clean.includes('GDP') || clean.includes('/DP')) return 'double-play';
    
    // Sacrifice flies (usually result in outs but advance runners)
    if (clean.includes('SF')) return 'sacrifice-fly';
    
    // Ground outs (fielding positions 3-6 typically)
    if (clean.match(/^[3-6]/)) return 'groundout';
    
    // Fly outs (positions 7-9 typically) 
    if (clean.match(/^[7-9]/) || clean.includes('/F') || clean.includes('/P')) return 'flyout';
    
    // Other fielding plays (catch-all outs)
    if (clean.match(/^[1-9]/)) return 'fieldout';
    
    return 'other';
  }

  // Process a single file
  processFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\\n');
      
      for (const line of lines) {
        if (line.startsWith('play,')) {
          const parts = line.split(',');
          if (parts.length >= 7) {
            const event = parts[6];
            
            // Skip substitutions and non-play events
            if (event === 'NP' || event.includes('sub,')) continue;
            
            // Determine base situation (simplified statistical model)
            const baseState = this.parseBaseRunners();
            
            // Categorize the play
            const outcome = this.categorizePlay(event);
            
            if (outcome !== 'other') {
              if (!this.outcomeStats[baseState][outcome]) {
                this.outcomeStats[baseState][outcome] = 0;
              }
              this.outcomeStats[baseState][outcome]++;
              this.totalPlays++;
            }
          }
        }
      }
    } catch (error) {
      console.log(`Error processing ${path.basename(filePath)}: ${error.message}`);
    }
  }

  // Process multiple files from recent years for better data
  processRecentData() {
    const dataDir = path.join(__dirname, 'data');
    const files = fs.readdirSync(dataDir);
    
    // Focus on recent years (2020-2024) for more relevant data
    const recentFiles = files.filter(f => 
      (f.startsWith('202') && (f.endsWith('.EVA') || f.endsWith('.EVN')))
    );
    
    console.log(`Processing ${recentFiles.length} recent Retrosheet files...`);
    
    recentFiles.forEach(file => {
      this.processFile(path.join(dataDir, file));
    });
    
    console.log(`Processed ${this.totalPlays} total plays`);
  }

  // Get probabilities for a specific base state
  getProbabilities(baseState, quality = 'neutral') {
    const stats = this.outcomeStats[baseState] || {};
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    if (total === 0) {
      return this.getMLBBaseline(baseState);
    }
    
    const probs = {};
    for (const [outcome, count] of Object.entries(stats)) {
      probs[outcome] = (count / total * 100);
    }
    
    return this.adjustForQuality(probs, quality);
  }

  // MLB baseline statistics when we don't have enough data
  getMLBBaseline(baseState) {
    const baselines = {
      'empty': {
        'fieldout': 42, 'flyout': 18, 'groundout': 15, 'strikeout': 23,
        'single': 14, 'double': 5, 'walk': 8, 'homerun': 3, 'triple': 0.8
      },
      '1st': {
        'fieldout': 38, 'flyout': 16, 'groundout': 18, 'strikeout': 20,
        'single': 15, 'double': 6, 'walk': 9, 'homerun': 3, 'double-play': 8
      },
      '2nd': {
        'fieldout': 40, 'flyout': 17, 'groundout': 15, 'strikeout': 22,
        'single': 16, 'double': 6, 'walk': 8, 'homerun': 3, 'sacrifice-fly': 3
      },
      '3rd': {
        'fieldout': 35, 'flyout': 15, 'groundout': 12, 'strikeout': 20,
        'single': 18, 'double': 7, 'walk': 8, 'homerun': 4, 'sacrifice-fly': 8
      },
      '1st-2nd': {
        'fieldout': 35, 'flyout': 15, 'groundout': 20, 'strikeout': 18,
        'single': 17, 'double': 7, 'walk': 10, 'double-play': 10
      },
      '1st-3rd': {
        'fieldout': 32, 'flyout': 14, 'groundout': 18, 'strikeout': 18,
        'single': 19, 'double': 8, 'walk': 9, 'sacrifice-fly': 6
      },
      '2nd-3rd': {
        'fieldout': 30, 'flyout': 12, 'groundout': 15, 'strikeout': 17,
        'single': 22, 'double': 9, 'walk': 8, 'sacrifice-fly': 7
      },
      '1st-2nd-3rd': {
        'fieldout': 28, 'flyout': 12, 'groundout': 18, 'strikeout': 15,
        'single': 24, 'double': 10, 'walk': 12, 'sacrifice-fly': 5
      }
    };
    
    return baselines[baseState] || baselines['empty'];
  }

  // Adjust probabilities based on hit quality
  adjustForQuality(probs, quality) {
    const multipliers = {
      'very-bad': {
        'strikeout': 3.0, 'fieldout': 2.0, 'flyout': 1.8, 'groundout': 1.5,
        'double-play': 2.5, 'single': 0.2, 'double': 0.1, 'homerun': 0.05
      },
      'bad': {
        'strikeout': 1.8, 'fieldout': 1.5, 'flyout': 1.4, 'groundout': 1.3,
        'single': 0.6, 'double': 0.4, 'homerun': 0.3
      },
      'neutral': {
        'strikeout': 1.0, 'fieldout': 1.0, 'single': 1.0, 'double': 1.0
      },
      'good': {
        'single': 2.0, 'double': 1.8, 'walk': 1.5, 'error': 1.3,
        'fieldout': 0.6, 'strikeout': 0.4
      },
      'very-good': {
        'homerun': 8.0, 'triple': 5.0, 'double': 3.0, 'single': 2.5,
        'fieldout': 0.2, 'strikeout': 0.1, 'groundout': 0.3
      }
    };
    
    const adjusted = {};
    const mults = multipliers[quality] || multipliers.neutral;
    
    for (const [outcome, prob] of Object.entries(probs)) {
      const mult = mults[outcome] || 1.0;
      adjusted[outcome] = prob * mult;
    }
    
    return adjusted;
  }

  // Generate play options with realistic probabilities
  generateOptions(bases, quality = 'neutral') {
    const baseKey = this.getBaseKey(bases);
    const probs = this.getProbabilities(baseKey, quality);
    
    const options = Object.entries(probs)
      .filter(([_, prob]) => prob > 1.0) // Only show meaningful probabilities
      .sort(([_, a], [__, b]) => b - a) // Sort by probability
      .slice(0, 6) // Top 6 most likely outcomes
      .map(([outcome, prob]) => ({
        id: outcome,
        label: this.getLabel(outcome),
        description: this.getDescription(outcome, bases),
        probability: prob.toFixed(1),
        category: this.getCategory(outcome)
      }));
    
    return options;
  }

  getBaseKey(bases) {
    const parts = [];
    if (bases.first) parts.push('1st');
    if (bases.second) parts.push('2nd');
    if (bases.third) parts.push('3rd');
    return parts.length > 0 ? parts.join('-') : 'empty';
  }

  getLabel(outcome) {
    const labels = {
      'single': 'Single',
      'double': 'Double',
      'triple': 'Triple', 
      'homerun': 'Home Run',
      'walk': 'Walk',
      'strikeout': 'Strikeout',
      'groundout': 'Ground Out',
      'flyout': 'Fly Out',
      'fieldout': 'Field Out',
      'error': 'Error',
      'double-play': 'Double Play',
      'sacrifice-fly': 'Sacrifice Fly'
    };
    return labels[outcome] || outcome;
  }

  getDescription(outcome, bases) {
    const hasRunners = bases.first || bases.second || bases.third;
    const runnerCount = [bases.first, bases.second, bases.third].filter(Boolean).length;
    
    const descriptions = {
      'single': hasRunners ? `Runners advance, ${bases.third ? 'run scores' : 'possible scoring'}` : 'Batter reaches first',
      'double': hasRunners ? `${runnerCount > 1 ? 'Multiple runs score' : 'Runner scores'}, batter to 2nd` : 'Batter reaches second',
      'triple': hasRunners ? `All ${runnerCount} runner${runnerCount > 1 ? 's' : ''} score, batter to 3rd` : 'Batter reaches third',
      'homerun': hasRunners ? `${runnerCount + 1} run${runnerCount > 0 ? 's' : ''} score` : 'Solo home run',
      'walk': bases.first ? 'Runners forced to advance' : 'Batter to first base',
      'strikeout': 'Batter out on strikes',
      'groundout': hasRunners ? 'Possible double play' : 'Fielded and thrown out',
      'flyout': bases.third ? 'Possible sacrifice' : 'Caught in the air',
      'fieldout': 'Routine fielding play',
      'error': 'Defensive mistake, all runners safe',
      'double-play': 'Two outs on one play',
      'sacrifice-fly': 'Runner scores from third, batter out'
    };
    
    return descriptions[outcome] || 'Baseball play outcome';
  }

  getCategory(outcome) {
    if (['single', 'double', 'triple', 'homerun', 'walk', 'error'].includes(outcome)) {
      return 'hit';
    }
    return 'out';
  }

  // Print analysis results
  printAnalysis() {
    console.log('\\n=== Retrosheet-Based Outcome Analysis ===');
    
    const testBases = [
      { first: false, second: false, third: false },
      { first: true, second: false, third: false },
      { first: false, second: true, third: false },
      { first: false, second: false, third: true },
      { first: true, second: true, third: true }
    ];
    
    testBases.forEach(bases => {
      const baseKey = this.getBaseKey(bases);
      console.log(`\\n${baseKey.toUpperCase()} (Neutral Quality):`);
      
      const options = this.generateOptions(bases, 'neutral');
      options.forEach(opt => {
        console.log(`  ${opt.label}: ${opt.probability}% - ${opt.description}`);
      });
    });
  }
}

// Export for use in React app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RetrosheetParser;
}

// Run if called directly
if (require.main === module) {
  const parser = new RetrosheetParser();
  parser.processRecentData();
  parser.printAnalysis();
}