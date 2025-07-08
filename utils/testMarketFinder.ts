// Test utility for finding specific Polymarket baseball markets
import { 
  polymarketApi, 
  getMLBGameMarket, 
  getValidMLBTeamCodes,
  getMLBTeamName,
  isValidMLBTeamCode,
  formatMarketForDisplay 
} from './polymarketApi';

// Test function to find the Colorado Rockies @ Boston Red Sox market
export const testFindRockiesRedSoxMarket = async () => {
  console.log('🔍 Testing Colorado Rockies @ Boston Red Sox market...');
  console.log('Using universal function with error handling');
  
  try {
    // Use the universal function - will throw error if team codes invalid or market not found
    const market = await getMLBGameMarket('col', 'bos', '2025-07-07');
    console.log('✅ Found market:', market.id, '-', market.question);
    logMarketDetails(market);
    return market;
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    return null;
  }
};

// Test function to demonstrate validation errors
export const testValidationErrors = async () => {
  console.log('🧪 Testing validation errors...\n');
  
  // Test 1: Invalid away team code
  console.log('=== Test 1: Invalid Away Team Code ===');
  try {
    await getMLBGameMarket('abc', 'bos', '2025-07-07');
  } catch (error) {
    console.log('✅ Caught expected error:', error instanceof Error ? error.message : error);
  }
  
  // Test 2: Invalid home team code
  console.log('\n=== Test 2: Invalid Home Team Code ===');
  try {
    await getMLBGameMarket('col', 'xyz', '2025-07-07');
  } catch (error) {
    console.log('✅ Caught expected error:', error instanceof Error ? error.message : error);
  }
  
  // Test 3: Invalid date format
  console.log('\n=== Test 3: Invalid Date Format ===');
  try {
    await getMLBGameMarket('col', 'bos', '07-07-2025');
  } catch (error) {
    console.log('✅ Caught expected error:', error instanceof Error ? error.message : error);
  }
  
  // Test 4: Market not found (future date unlikely to have market)
  console.log('\n=== Test 4: Market Not Found ===');
  try {
    await getMLBGameMarket('col', 'bos', '2030-12-31');
  } catch (error) {
    console.log('✅ Caught expected error:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n✅ Validation tests completed!');
};

// Test function to find any team matchup using correct slug format
export const testFindAnyTeamMatchup = async (awayTeam: string, homeTeam: string, date: string = '2025-07-07') => {
  console.log(`🔍 Searching for ${awayTeam} @ ${homeTeam} market on ${date}...`);
  console.log(`Slug: mlb-${awayTeam.toLowerCase()}-${homeTeam.toLowerCase()}-${date}`);
  
  try {
    const market = await getMLBGameMarket(awayTeam, homeTeam, date);
    if (market) {
      console.log('✅ Found market:', market.id, '-', market.question);
      const formatted = formatMarketForDisplay(market);
      console.log('📊 Market details:', formatted);
      return market;
    } else {
      console.log(`❌ No market found for ${awayTeam} @ ${homeTeam} on ${date}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error searching for market:', error);
    return null;
  }
};

// Test function to search all baseball markets
export const testSearchAllBaseballMarkets = async () => {
  console.log('🔍 Searching for all baseball markets...');
  
  try {
    const markets = await polymarketApi.getBaseballMarkets();
    console.log(`✅ Found ${markets.length} baseball markets`);
    
    if (markets.length > 0) {
      console.log('📋 Sample markets:');
      markets.slice(0, 5).forEach((market, index) => {
        console.log(`${index + 1}. ${market.id} - ${market.question}`);
      });
    }
    
    return markets;
  } catch (error) {
    console.error('❌ Error searching for baseball markets:', error);
    return [];
  }
};

// Helper function to log market details
export const logMarketDetails = (market: any) => {
  console.log('📊 Market Details:');
  console.log('ID:', market.id);
  console.log('Question:', market.question);
  console.log('Description:', market.description || 'No description');
  console.log('Category:', market.category);
  console.log('Outcomes:', market.outcomes);
  console.log('Volume:', market.volume);
  console.log('Liquidity:', market.liquidity);
  console.log('End Date:', market.endDate);
  console.log('Resolved:', market.resolved);
};

// Test valid team codes function
export const testTeamCodeFunctions = () => {
  console.log('🧪 Testing team code functions...\n');
  
  // Test valid codes
  console.log('=== Valid Team Codes ===');
  const validCodes = getValidMLBTeamCodes();
  console.log(`Total valid codes: ${validCodes.length}`);
  console.log('Sample codes:', validCodes.slice(0, 10).join(', ').toUpperCase());
  
  // Test team name lookup
  console.log('\n=== Team Name Lookup ===');
  try {
    console.log('COL =>', getMLBTeamName('col'));
    console.log('BOS =>', getMLBTeamName('bos'));
    console.log('NYY =>', getMLBTeamName('nyy'));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
  
  // Test validation
  console.log('\n=== Team Code Validation ===');
  console.log('col is valid:', isValidMLBTeamCode('col'));
  console.log('COL is valid:', isValidMLBTeamCode('COL'));
  console.log('abc is valid:', isValidMLBTeamCode('abc'));
  
  // Test invalid team name
  console.log('\n=== Invalid Team Code ===');
  try {
    getMLBTeamName('abc');
  } catch (error) {
    console.log('✅ Caught expected error:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n✅ Team code function tests completed!');
};

// Main test runner
export const runMarketTests = async () => {
  console.log('🚀 Starting Polymarket API tests...\n');
  
  // Test 1: Team code functions
  console.log('=== TEST 1: Team Code Functions ===');
  testTeamCodeFunctions();
  console.log('\n');
  
  // Test 2: Validation errors
  console.log('=== TEST 2: Validation Errors ===');
  await testValidationErrors();
  console.log('\n');
  
  // Test 3: Find specific Rockies @ Red Sox market
  console.log('=== TEST 3: Colorado Rockies @ Boston Red Sox ===');
  await testFindRockiesRedSoxMarket();
  console.log('\n');
  
  // Test 4: Find any team matchup
  console.log('=== TEST 4: Generic Team Matchup ===');
  await testFindAnyTeamMatchup('nyy', 'lad', '2025-07-07');
  console.log('\n');
  
  console.log('✅ All tests completed!');
};