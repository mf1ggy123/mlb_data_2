const fs = require('fs');
const path = require('path');

// Read and parse the CSV file
function parseCSV() {
  const csvPath = path.join(__dirname, '../play_transition_value.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  
  const data = {};
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line, handling quoted values
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    if (values.length >= 12) {
      const startBase = values[0].replace(/"/g, '');
      const endBase = values[1].replace(/"/g, '');
      const runsScored = parseInt(values[2]);
      const outs = parseInt(values[3]);
      const startOuts = parseInt(values[4]);
      const normValue = parseFloat(values[11]);
      
      const key = `${startBase}_${endBase}_${runsScored}_${outs}_${startOuts}`;
      data[key] = normValue;
    }
  }
  
  return data;
}

// Generate TypeScript file
function generateTSFile() {
  const data = parseCSV();
  
  let tsContent = `// Auto-generated transition values from CSV
export const TRANSITION_VALUES: Record<string, number> = {
`;
  
  for (const [key, value] of Object.entries(data)) {
    tsContent += `  "${key}": ${value},\n`;
  }
  
  tsContent += `};

export function getTransitionValue(
  startBases: { first: boolean; second: boolean; third: boolean },
  endBases: { first: boolean; second: boolean; third: boolean },
  runsScored: number,
  outsGained: number,
  currentOuts: number = 0
): number | null {
  const startBaseStr = \`(\${startBases.first ? 1 : 0}, \${startBases.second ? 1 : 0}, \${startBases.third ? 1 : 0})\`;
  const endBaseStr = \`(\${endBases.first ? 1 : 0}, \${endBases.second ? 1 : 0}, \${endBases.third ? 1 : 0})\`;
  const key = \`\${startBaseStr}_\${endBaseStr}_\${runsScored}_\${outsGained}_\${currentOuts}\`;
  
  return TRANSITION_VALUES[key] || null;
}
`;
  
  const outputPath = path.join(__dirname, '../utils/transitionValues.ts');
  fs.writeFileSync(outputPath, tsContent);
  console.log(`Generated ${Object.keys(data).length} transition values to ${outputPath}`);
}

generateTSFile();