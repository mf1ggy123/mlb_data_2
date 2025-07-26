// Debug script to test frontend threshold calculation
// This mimics the frontend logic to see what values we get

const testGameState = {
  bases: { first: false, second: true, third: false },
  outs: 2
};

// Mock data - these would come from the CSV in the real frontend
const mockOutcomes = [
  { normValue: -1.000, outsGained: 1, runsScored: 0, description: "Out 1" },
  { normValue: -1.000, outsGained: 1, runsScored: 0, description: "Out 2" },
  { normValue: -1.000, outsGained: 1, runsScored: 0, description: "Out 3" },
  { normValue: -0.573, outsGained: 0, runsScored: 0, description: "Single 1" },
  { normValue: -0.518, outsGained: 0, runsScored: 0, description: "Single 2" },
  { normValue: -0.444, outsGained: 0, runsScored: 0, description: "Single 3" },
];

console.log("=== Frontend Threshold Calculation Debug ===");
console.log("Game State:", testGameState);
console.log("Mock Outcomes:", mockOutcomes);

// Find the highest norm_value where outs occur but no runs score
const outcomesWithOutsButNoRuns = mockOutcomes.filter(o => 
  o.outsGained > 0 && o.runsScored === 0
);

const maxOutNoRunValue = outcomesWithOutsButNoRuns.length > 0 
  ? Math.max(...outcomesWithOutsButNoRuns.map(o => o.normValue || 0))
  : -1;

console.log("maxOutNoRunValue:", maxOutNoRunValue);

// Find the highest norm_value where exactly one out occurs and no runs score
const outcomesWithOneOutNoRuns = mockOutcomes.filter(o => 
  o.outsGained === 1 && o.runsScored === 0
);

let maxOneOutNoRunValue = outcomesWithOneOutNoRuns.length > 0 
  ? Math.max(...outcomesWithOneOutNoRuns.map(o => o.normValue || 0))
  : -1;

console.log("maxOneOutNoRunValue (before 2-out adjustment):", maxOneOutNoRunValue);

const minOneOutNoRunValue = outcomesWithOneOutNoRuns.length > 0 
  ? Math.min(...outcomesWithOneOutNoRuns.map(o => o.normValue || 0))
  : -1;

console.log("minOneOutNoRunValue:", minOneOutNoRunValue);

// Find the highest norm_value where a double play occurs
const outcomesWithDoublePlay = mockOutcomes.filter(o => 
  o.outsGained >= 2 && o.runsScored === 0
);

const maxDoublePlayValue = outcomesWithDoublePlay.length > 0 
  ? Math.max(...outcomesWithDoublePlay.map(o => o.normValue || 0))
  : null;

console.log("maxDoublePlayValue:", maxDoublePlayValue);

// Determine bad min based on double play possibility
let badMinValue = maxDoublePlayValue !== null 
  ? maxDoublePlayValue + 0.001
  : minOneOutNoRunValue;

console.log("badMinValue (before 2-out adjustment):", badMinValue);

// Special case: when there are 2 outs, give bad range the same range as very-bad options
if (testGameState.outs === 2) {
  // Bad range should be exactly the same as very-bad: maxOutNoRun to maxOutNoRun
  // This gives bad the same options as very-bad
  badMinValue = maxOutNoRunValue;
  maxOneOutNoRunValue = maxOutNoRunValue;
  console.log("2-OUT ADJUSTMENT APPLIED!");
}

console.log("=== FINAL VALUES ===");
console.log("badMinValue (final):", badMinValue);
console.log("maxOneOutNoRunValue (final):", maxOneOutNoRunValue);
console.log("Bad range would be:", `${badMinValue.toFixed(2)} to ${maxOneOutNoRunValue.toFixed(2)}`);
console.log("Very-bad range would be:", `-1.00 to ${maxOutNoRunValue.toFixed(2)}`);