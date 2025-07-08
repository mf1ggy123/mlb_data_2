require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

async function testPolymarketAPI() {
  try {
    console.log('Testing Polymarket API access...');
    
    // Test basic market data (no auth required) - using Gamma API for active markets only
    const response = await axios.get('https://gamma-api.polymarket.com/markets?active=true&archived=false&closed=false&limit=10');
    
    console.log('✅ Successfully connected to Polymarket API');
    console.log('Response structure:', typeof response.data);
    console.log('Full response:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
    
    // Handle different response structures
    let markets = response.data;
    if (response.data.data) {
      markets = response.data.data;
    }
    
    if (Array.isArray(markets)) {
      console.log(`📊 Found ${markets.length} markets`);
      
      // Display first few markets
      const firstMarkets = markets.slice(0, 3);
      firstMarkets.forEach((market, index) => {
        console.log(`\n${index + 1}. ${market.question || market.title || 'Unknown market'}`);
        console.log(`   ID: ${market.condition_id || market.id || 'N/A'}`);
        console.log(`   Active: ${market.active || 'N/A'}`);
        console.log(`   Closed: ${market.closed || 'N/A'}`);
        console.log(`   End Date: ${market.end_date || 'N/A'}`);
        console.log(`   Volume: $${market.volume || 'N/A'}`);
      });
    } else {
      console.log('📊 Response is not an array, showing structure:');
      console.log(Object.keys(markets));
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Error accessing Polymarket API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Run the test
testPolymarketAPI()
  .then(() => {
    console.log('\n🎉 API test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 API test failed:', error.message);
    process.exit(1);
  });