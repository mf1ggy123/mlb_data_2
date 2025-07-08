// Polymarket API integration utilities
// Documentation: https://docs.polymarket.com/

// API endpoints - using our proxy to avoid CORS issues
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const CLOB_API_BASE = 'https://clob.polymarket.com';
const DATA_API_BASE = 'https://data-api.polymarket.com';
const LOCAL_API_BASE = '/api/polymarket'; // Our Next.js API route

// Types for Polymarket API responses
export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  category: string;
  outcomes: string[];
  volume: number;
  liquidity: number;
  endDate: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  clobTokenIds?: string[] | string; // Can be array or JSON string with AWAY_TOKEN_ID and HOME_TOKEN_ID
  parsedClobTokenIds?: string[]; // Parsed version from server
  awayTokenId?: string; // Extracted AWAY_TOKEN_ID (first element)
  homeTokenId?: string; // Extracted HOME_TOKEN_ID (second element)
}

export interface MarketOutcome {
  id: string;
  marketId: string;
  outcome: string;
  price: number;
  probability: number;
  volume: number;
}

export interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string;
  markets: PolymarketMarket[];
}

// Utility functions for API calls
class PolymarketApi {
  private async fetchFromApi(endpoint: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(endpoint);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    console.log(`🌐 Making API request to: ${url.toString()}`);

    try {
      // Use exact format from your working example
      const options = { method: 'GET' };
      
      const response = await fetch(url.toString(), options);

      console.log(`📡 Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`📦 Response data type:`, typeof data, Array.isArray(data) ? `array with ${data.length} items` : 'object');
      
      return data;
    } catch (error) {
      console.error('🚨 Polymarket API error:', error);
      throw error;
    }
  }

  // Get all markets from Gamma API
  async getMarkets(params?: {
    category?: string;
    limit?: number;
    offset?: number;
    active?: boolean;
  }): Promise<PolymarketMarket[]> {
    const endpoint = `${GAMMA_API_BASE}/markets`;
    const queryParams: Record<string, string> = {};

    if (params?.category) queryParams.category = params.category;
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    if (params?.active !== undefined) queryParams.active = params.active.toString();

    console.log(`📡 Fetching markets from: ${endpoint}`, queryParams);
    const response = await this.fetchFromApi(endpoint, queryParams);
    console.log(`📊 Markets response:`, {
      isArray: Array.isArray(response),
      hasData: !!response?.data,
      length: response?.length || response?.data?.length || 0
    });
    
    return response.data || response;
  }

  // Test API connectivity using our local proxy
  async testAPIConnection(): Promise<boolean> {
    try {
      console.log(`🧪 Testing local API proxy connection...`);
      
      // Test with a simple slug to see if our proxy works
      const testSlug = 'mlb-col-bos-2025-07-07';
      const response = await fetch(`${LOCAL_API_BASE}?slug=${testSlug}`, { method: 'GET' });
      
      console.log(`📡 Local API test response: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Local API proxy working, response type:`, typeof data);
        return true;
      } else {
        console.error(`❌ Local API proxy failed: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ API connection test failed:`, error);
      return false;
    }
  }

  // Get baseball-specific markets
  async getBaseballMarkets(): Promise<PolymarketMarket[]> {
    try {
      // Try multiple category filters that might contain baseball markets
      const categories = ['Sports', 'Baseball', 'MLB', 'sports'];
      let allMarkets: PolymarketMarket[] = [];

      for (const category of categories) {
        try {
          const markets = await this.getMarkets({ category, active: true });
          // Filter for baseball-related questions
          const baseballMarkets = markets.filter(market => 
            market.question.toLowerCase().includes('baseball') ||
            market.question.toLowerCase().includes('mlb') ||
            market.question.toLowerCase().includes('world series') ||
            market.description?.toLowerCase().includes('baseball')
          );
          allMarkets = [...allMarkets, ...baseballMarkets];
        } catch (error) {
          console.warn(`Failed to fetch markets for category ${category}:`, error);
        }
      }

      // Remove duplicates based on market ID
      const uniqueMarkets = allMarkets.filter((market, index, self) => 
        index === self.findIndex(m => m.id === market.id)
      );

      return uniqueMarkets;
    } catch (error) {
      console.error('Failed to fetch baseball markets:', error);
      return [];
    }
  }

  // Get specific market by ID or slug
  async getMarket(marketId: string): Promise<PolymarketMarket | null> {
    try {
      const endpoint = `${GAMMA_API_BASE}/markets/${marketId}`;
      const response = await this.fetchFromApi(endpoint);
      return response.data || response;
    } catch (error) {
      console.error(`Failed to fetch market ${marketId}:`, error);
      return null;
    }
  }

  // Get market by slug using our local API proxy (avoids CORS issues)
  async getMarketBySlug(slug: string): Promise<PolymarketMarket | null> {
    try {
      console.log(`🔄 Using local API proxy for slug: ${slug}`);
      
      // Use our local API route to avoid CORS issues
      const endpoint = `${LOCAL_API_BASE}?slug=${slug}`;
      
      const response = await fetch(endpoint, { method: 'GET' });
      
      console.log(`📡 Local API response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Local API error:`, errorData);
        throw new Error(`Local API failed: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`📦 Local API data:`, {
        isArray: Array.isArray(data),
        length: Array.isArray(data) ? data.length : 'not array',
        hasData: !!data
      });
      
      // The API should return an array of markets matching the slug
      if (data && Array.isArray(data) && data.length > 0) {
        const market = data[0];
        console.log(`✅ Found market in array:`, market);
        
        // Extract and save clobTokenIds
        let tokenIds = null;
        
        // Check if we have parsed token IDs from server
        if (market.parsedClobTokenIds && Array.isArray(market.parsedClobTokenIds)) {
          tokenIds = market.parsedClobTokenIds;
        } else if (market.clobTokenIds) {
          // Handle if clobTokenIds is a JSON string
          if (typeof market.clobTokenIds === 'string') {
            try {
              tokenIds = JSON.parse(market.clobTokenIds);
              console.log(`🔄 Client-side parsed clobTokenIds:`, tokenIds);
            } catch (error) {
              console.error(`❌ Failed to parse clobTokenIds string:`, error);
            }
          } else if (Array.isArray(market.clobTokenIds)) {
            tokenIds = market.clobTokenIds;
          }
        }
        
        if (tokenIds && Array.isArray(tokenIds) && tokenIds.length >= 2) {
          console.log(`🎯 Extracted token IDs:`, tokenIds);
          console.log(`📍 AWAY_TOKEN_ID: ${tokenIds[0]}`);
          console.log(`🏠 HOME_TOKEN_ID: ${tokenIds[1]}`);
          
          // Save to market object for later use
          market.awayTokenId = tokenIds[0];
          market.homeTokenId = tokenIds[1];
        } else {
          console.warn(`⚠️ No valid clobTokenIds found in market:`, market.id);
        }
        
        return market;
      }
      
      // If response has a data property with the array
      if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
        const market = data.data[0];
        console.log(`✅ Found market in data property:`, market);
        
        // Extract and save clobTokenIds
        let tokenIds = null;
        
        // Check if we have parsed token IDs from server
        if (market.parsedClobTokenIds && Array.isArray(market.parsedClobTokenIds)) {
          tokenIds = market.parsedClobTokenIds;
        } else if (market.clobTokenIds) {
          // Handle if clobTokenIds is a JSON string
          if (typeof market.clobTokenIds === 'string') {
            try {
              tokenIds = JSON.parse(market.clobTokenIds);
              console.log(`🔄 Client-side parsed clobTokenIds:`, tokenIds);
            } catch (error) {
              console.error(`❌ Failed to parse clobTokenIds string:`, error);
            }
          } else if (Array.isArray(market.clobTokenIds)) {
            tokenIds = market.clobTokenIds;
          }
        }
        
        if (tokenIds && Array.isArray(tokenIds) && tokenIds.length >= 2) {
          console.log(`🎯 Extracted token IDs:`, tokenIds);
          console.log(`📍 AWAY_TOKEN_ID: ${tokenIds[0]}`);
          console.log(`🏠 HOME_TOKEN_ID: ${tokenIds[1]}`);
          
          // Save to market object for later use
          market.awayTokenId = tokenIds[0];
          market.homeTokenId = tokenIds[1];
        } else {
          console.warn(`⚠️ No valid clobTokenIds found in market:`, market.id);
        }
        
        return market;
      }
      
      console.log(`❌ No market found for slug: ${slug}`);
      return null;
    } catch (error) {
      console.error(`❌ Failed to fetch market with slug ${slug}:`, error);
      return null;
    }
  }

  // Get events (groups of related markets)
  async getEvents(params?: {
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<PolymarketEvent[]> {
    const endpoint = `${GAMMA_API_BASE}/events`;
    const queryParams: Record<string, string> = {};

    if (params?.category) queryParams.category = params.category;
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();

    const response = await this.fetchFromApi(endpoint, queryParams);
    return response.data || response;
  }

  // Get baseball events
  async getBaseballEvents(): Promise<PolymarketEvent[]> {
    try {
      const allEvents = await this.getEvents({ category: 'Sports' });
      // Filter for baseball-related events
      const baseballEvents = allEvents.filter(event => 
        event.title.toLowerCase().includes('baseball') ||
        event.title.toLowerCase().includes('mlb') ||
        event.description?.toLowerCase().includes('baseball')
      );
      return baseballEvents;
    } catch (error) {
      console.error('Failed to fetch baseball events:', error);
      return [];
    }
  }

  // Get market prices from CLOB API (deprecated - use getTokenPrice)
  async getMarketPrices(marketId: string): Promise<MarketOutcome[]> {
    try {
      const endpoint = `${CLOB_API_BASE}/markets/${marketId}/prices`;
      const response = await this.fetchFromApi(endpoint);
      return response.data || response;
    } catch (error) {
      console.error(`Failed to fetch prices for market ${marketId}:`, error);
      return [];
    }
  }

  // Get price for specific token ID and side using local proxy
  async getTokenPrice(tokenId: string, side: 'buy' | 'sell'): Promise<{ price: string } | null> {
    try {
      console.log(`💰 Fetching ${side} price for token: ${tokenId}`);
      
      // Use our local API route to avoid CORS issues
      const endpoint = `/api/polymarket/price?token_id=${tokenId}&side=${side}`;
      
      const response = await fetch(endpoint, { method: 'GET' });
      
      console.log(`📡 Local price API response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Local price API error:`, errorData);
        throw new Error(`Local price API failed: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`📈 Price response for ${tokenId} (${side}):`, data);
      
      return data;
    } catch (error) {
      console.error(`Failed to fetch ${side} price for token ${tokenId}:`, error);
      return null;
    }
  }

  // Get both buy and sell prices for a token
  async getTokenPrices(tokenId: string): Promise<{ buyPrice: string | null, sellPrice: string | null }> {
    try {
      const [buyResponse, sellResponse] = await Promise.all([
        this.getTokenPrice(tokenId, 'buy'),
        this.getTokenPrice(tokenId, 'sell')
      ]);

      return {
        buyPrice: buyResponse?.price || null,
        sellPrice: sellResponse?.price || null
      };
    } catch (error) {
      console.error(`Failed to fetch prices for token ${tokenId}:`, error);
      return { buyPrice: null, sellPrice: null };
    }
  }

  // Search markets by query
  async searchMarkets(query: string): Promise<PolymarketMarket[]> {
    try {
      const allMarkets = await this.getMarkets({ active: true });
      const filteredMarkets = allMarkets.filter(market => 
        market.question.toLowerCase().includes(query.toLowerCase()) ||
        market.description?.toLowerCase().includes(query.toLowerCase())
      );
      return filteredMarkets;
    } catch (error) {
      console.error(`Failed to search markets for query "${query}":`, error);
      return [];
    }
  }

  // Get specific team matchup market
  async getTeamMatchupMarket(team1: string, team2: string, date?: string): Promise<PolymarketMarket | null> {
    try {
      // Try multiple search patterns
      const searchQueries = [
        `${team1} ${team2}`,
        `${team2} ${team1}`,
        `${team1} vs ${team2}`,
        `${team2} vs ${team1}`,
        `${team1.toLowerCase()} ${team2.toLowerCase()}`,
        `${team2.toLowerCase()} ${team1.toLowerCase()}`
      ];

      // If date is provided, add date-specific searches
      if (date) {
        searchQueries.push(
          `${team1} ${team2} ${date}`,
          `${team2} ${team1} ${date}`
        );
      }

      for (const query of searchQueries) {
        const markets = await this.searchMarkets(query);
        if (markets.length > 0) {
          // Return the first matching market
          return markets[0];
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to find market for ${team1} vs ${team2}:`, error);
      return null;
    }
  }

  // Get market by potential market code/slug
  async getMarketByCode(marketCode: string): Promise<PolymarketMarket | null> {
    try {
      // First try to get the market directly by ID/code
      const directMarket = await this.getMarket(marketCode);
      if (directMarket) {
        return directMarket;
      }

      // If that fails, try searching for the code as a query
      const markets = await this.searchMarkets(marketCode);
      if (markets.length > 0) {
        return markets[0];
      }

      // Try variations of the market code
      const codeVariations = [
        marketCode,
        marketCode.replace(/-/g, ' '),
        marketCode.replace(/-/g, '_'),
        marketCode.toUpperCase(),
        marketCode.toLowerCase()
      ];

      for (const variation of codeVariations) {
        const markets = await this.searchMarkets(variation);
        if (markets.length > 0) {
          return markets[0];
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to find market with code ${marketCode}:`, error);
      return null;
    }
  }

  // Generate MLB market slug and fetch market with validation
  async getMLBGameMarket(awayTeam: string, homeTeam: string, date: string): Promise<PolymarketMarket> {
    // Validate team codes first
    this.validateTeamCode(awayTeam);
    this.validateTeamCode(homeTeam);
    
    // Validate date format (basic check for YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new Error(`Invalid date format: "${date}". Expected format: YYYY-MM-DD`);
    }
    
    // Generate the slug: mlb-{away}-{home}-{YYYY-MM-DD}
    const slug = `mlb-${awayTeam.toLowerCase()}-${homeTeam.toLowerCase()}-${date}`;
    console.log(`🔍 Searching for MLB market with slug: ${slug}`);
    
    try {
      // Try to get the market by slug using Gamma Markets API
      console.log(`📡 Calling Gamma Markets API...`);
      const market = await this.getMarketBySlug(slug);
      if (market) {
        console.log(`✅ Found market:`, {
          id: market.id,
          question: market.question,
          slug: slug
        });
        return market;
      }

      console.log(`❌ No market found with slug method, trying direct ID lookup...`);
      
      // If slug method doesn't work, try direct market ID
      const marketById = await this.getMarket(slug);
      if (marketById) {
        console.log(`✅ Found market by direct ID lookup`);
        return marketById;
      }

      // If no market found, throw error
      const teams = this.getMLBTeams();
      const awayTeamName = teams[awayTeam.toLowerCase()];
      const homeTeamName = teams[homeTeam.toLowerCase()];
      
      console.log(`❌ No market found for ${awayTeamName} @ ${homeTeamName} on ${date}`);
      
      throw new Error(
        `No market found for ${awayTeamName} @ ${homeTeamName} on ${date}. ` +
        `Attempted slug: ${slug}. ` +
        `This could mean: (1) The market doesn't exist, (2) The game is on a different date, or (3) The teams are in reverse order.`
      );
    } catch (error) {
      // Re-throw validation errors and market not found errors
      if (error instanceof Error && (
        error.message.includes('Invalid MLB team code') ||
        error.message.includes('Invalid date format') ||
        error.message.includes('No market found')
      )) {
        throw error;
      }
      
      // For API errors, provide more context
      if (error instanceof Error && error.message.includes('405')) {
        throw new Error(
          `API Error (405 - Method Not Allowed): The Polymarket API request failed. ` +
          `This might be due to incorrect API usage or API restrictions. ` +
          `Attempted slug: ${slug}`
        );
      }
      
      // For other errors, wrap them with context
      throw new Error(
        `Failed to fetch MLB game market for ${awayTeam.toUpperCase()} @ ${homeTeam.toUpperCase()} on ${date}: ${error}`
      );
    }
  }

  // Parse team abbreviations and find market (deprecated - use getMLBGameMarket)
  async findGameMarket(team1Abbr: string, team2Abbr: string, date: string): Promise<PolymarketMarket | null> {
    try {
      // Use the new MLB-specific method
      return await this.getMLBGameMarket(team1Abbr, team2Abbr, date);
    } catch (error) {
      console.error(`Failed to find game market for ${team1Abbr} vs ${team2Abbr} on ${date}:`, error);
      return null;
    }
  }

  // Get valid MLB team codes and names mapping
  private getMLBTeams(): Record<string, string> {
    return {
      'ari': 'Arizona Diamondbacks',
      'atl': 'Atlanta Braves',
      'bal': 'Baltimore Orioles',
      'bos': 'Boston Red Sox',
      'chc': 'Chicago Cubs',
      'cws': 'Chicago White Sox',
      'cin': 'Cincinnati Reds',
      'cle': 'Cleveland Guardians',
      'col': 'Colorado Rockies',
      'det': 'Detroit Tigers',
      'hou': 'Houston Astros',
      'kc': 'Kansas City Royals',
      'laa': 'Los Angeles Angels',
      'lad': 'Los Angeles Dodgers',
      'mia': 'Miami Marlins',
      'mil': 'Milwaukee Brewers',
      'min': 'Minnesota Twins',
      'nym': 'New York Mets',
      'nyy': 'New York Yankees',
      'oak': 'Oakland Athletics',
      'phi': 'Philadelphia Phillies',
      'pit': 'Pittsburgh Pirates',
      'sd': 'San Diego Padres',
      'sea': 'Seattle Mariners',
      'sf': 'San Francisco Giants',
      'stl': 'St. Louis Cardinals',
      'tb': 'Tampa Bay Rays',
      'tex': 'Texas Rangers',
      'tor': 'Toronto Blue Jays',
      'was': 'Washington Nationals'
    };
  }

  // Validate MLB team code
  private validateTeamCode(teamCode: string): void {
    const validTeams = this.getMLBTeams();
    const normalizedCode = teamCode.toLowerCase();
    
    if (!validTeams[normalizedCode]) {
      const validCodes = Object.keys(validTeams).join(', ').toUpperCase();
      throw new Error(
        `Invalid MLB team code: "${teamCode.toUpperCase()}". Valid codes are: ${validCodes}`
      );
    }
  }

  // Get team full names mapping (deprecated - use getMLBTeams)
  private getTeamFullNames(): Record<string, string> {
    return this.getMLBTeams();
  }
}

// Export singleton instance
export const polymarketApi = new PolymarketApi();

// Helper functions for common operations
export const getBaseballMarketData = async () => {
  try {
    const markets = await polymarketApi.getBaseballMarkets();
    const events = await polymarketApi.getBaseballEvents();
    
    return {
      markets,
      events,
      totalMarkets: markets.length,
      totalEvents: events.length
    };
  } catch (error) {
    console.error('Failed to get baseball market data:', error);
    return {
      markets: [],
      events: [],
      totalMarkets: 0,
      totalEvents: 0
    };
  }
};

// Find specific MLB game market by team abbreviations (Universal function)
export const getMLBGameMarket = async (
  awayTeam: string, 
  homeTeam: string, 
  date: string = '2025-07-07'
): Promise<PolymarketMarket> => {
  return await polymarketApi.getMLBGameMarket(awayTeam, homeTeam, date);
};

// Get all valid MLB team codes
export const getValidMLBTeamCodes = (): string[] => {
  const teams = {
    'ari': 'Arizona Diamondbacks',
    'atl': 'Atlanta Braves',
    'bal': 'Baltimore Orioles',
    'bos': 'Boston Red Sox',
    'chc': 'Chicago Cubs',
    'cws': 'Chicago White Sox',
    'cin': 'Cincinnati Reds',
    'cle': 'Cleveland Guardians',
    'col': 'Colorado Rockies',
    'det': 'Detroit Tigers',
    'hou': 'Houston Astros',
    'kc': 'Kansas City Royals',
    'laa': 'Los Angeles Angels',
    'lad': 'Los Angeles Dodgers',
    'mia': 'Miami Marlins',
    'mil': 'Milwaukee Brewers',
    'min': 'Minnesota Twins',
    'nym': 'New York Mets',
    'nyy': 'New York Yankees',
    'oak': 'Oakland Athletics',
    'phi': 'Philadelphia Phillies',
    'pit': 'Pittsburgh Pirates',
    'sd': 'San Diego Padres',
    'sea': 'Seattle Mariners',
    'sf': 'San Francisco Giants',
    'stl': 'St. Louis Cardinals',
    'tb': 'Tampa Bay Rays',
    'tex': 'Texas Rangers',
    'tor': 'Toronto Blue Jays',
    'was': 'Washington Nationals'
  };
  return Object.keys(teams);
};

// Get MLB team name by code
export const getMLBTeamName = (teamCode: string): string => {
  const teams: Record<string, string> = {
    'ari': 'Arizona Diamondbacks',
    'atl': 'Atlanta Braves',
    'bal': 'Baltimore Orioles',
    'bos': 'Boston Red Sox',
    'chc': 'Chicago Cubs',
    'cws': 'Chicago White Sox',
    'cin': 'Cincinnati Reds',
    'cle': 'Cleveland Guardians',
    'col': 'Colorado Rockies',
    'det': 'Detroit Tigers',
    'hou': 'Houston Astros',
    'kc': 'Kansas City Royals',
    'laa': 'Los Angeles Angels',
    'lad': 'Los Angeles Dodgers',
    'mia': 'Miami Marlins',
    'mil': 'Milwaukee Brewers',
    'min': 'Minnesota Twins',
    'nym': 'New York Mets',
    'nyy': 'New York Yankees',
    'oak': 'Oakland Athletics',
    'phi': 'Philadelphia Phillies',
    'pit': 'Pittsburgh Pirates',
    'sd': 'San Diego Padres',
    'sea': 'Seattle Mariners',
    'sf': 'San Francisco Giants',
    'stl': 'St. Louis Cardinals',
    'tb': 'Tampa Bay Rays',
    'tex': 'Texas Rangers',
    'tor': 'Toronto Blue Jays',
    'was': 'Washington Nationals'
  };
  
  const normalizedCode = teamCode.toLowerCase();
  const teamName = teams[normalizedCode];
  
  if (!teamName) {
    const validCodes = Object.keys(teams).join(', ').toUpperCase();
    throw new Error(
      `Invalid MLB team code: "${teamCode.toUpperCase()}". Valid codes are: ${validCodes}`
    );
  }
  
  return teamName;
};

// Get all MLB teams as array of objects
export const getAllMLBTeams = (): Array<{code: string, name: string}> => {
  const validCodes = getValidMLBTeamCodes();
  return validCodes.map(code => ({
    code: code.toUpperCase(),
    name: getMLBTeamName(code)
  }));
};

// Validate if team code is valid
export const isValidMLBTeamCode = (teamCode: string): boolean => {
  const validCodes = getValidMLBTeamCodes();
  return validCodes.includes(teamCode.toLowerCase());
};

// Test API connectivity
export const testPolymarketAPI = async (): Promise<boolean> => {
  return await polymarketApi.testAPIConnection();
};

// Extract token IDs from market
export const getTokenIdsFromMarket = (market: PolymarketMarket): { awayTokenId: string | null, homeTokenId: string | null } => {
  return {
    awayTokenId: market.awayTokenId || null,
    homeTokenId: market.homeTokenId || null
  };
};

// Get prices for both away and home tokens
export const getMarketTokenPrices = async (market: PolymarketMarket): Promise<{
  awayPrices: { buyPrice: string | null, sellPrice: string | null } | null,
  homePrices: { buyPrice: string | null, sellPrice: string | null } | null
}> => {
  const { awayTokenId, homeTokenId } = getTokenIdsFromMarket(market);
  
  if (!awayTokenId || !homeTokenId) {
    console.warn('⚠️ Missing token IDs for price fetching');
    return { awayPrices: null, homePrices: null };
  }

  try {
    console.log(`💰 Fetching prices for Away: ${awayTokenId} and Home: ${homeTokenId}`);
    
    const [awayPrices, homePrices] = await Promise.all([
      polymarketApi.getTokenPrices(awayTokenId),
      polymarketApi.getTokenPrices(homeTokenId)
    ]);

    console.log(`📊 Away Team Prices:`, awayPrices);
    console.log(`📊 Home Team Prices:`, homePrices);

    return { awayPrices, homePrices };
  } catch (error) {
    console.error('❌ Failed to fetch market token prices:', error);
    return { awayPrices: null, homePrices: null };
  }
};

// Get single price for away or home token
export const getTokenPrice = async (tokenId: string, side: 'buy' | 'sell'): Promise<string | null> => {
  try {
    const response = await polymarketApi.getTokenPrice(tokenId, side);
    return response?.price || null;
  } catch (error) {
    console.error(`Failed to get ${side} price for token ${tokenId}:`, error);
    return null;
  }
};

// Direct test function using your exact format
export const testDirectAPICall = async (slug: string = 'mlb-col-bos-2025-07-07') => {
  console.log(`🧪 Testing direct API call with slug: ${slug}`);
  
  const options = { method: 'GET' };
  const url = `https://gamma-api.polymarket.com/markets?slug=${slug}`;
  
  console.log(`🌐 URL: ${url}`);
  
  try {
    const response = await fetch(url, options);
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`❌ Request failed: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`✅ Success! Response:`, data);
    return data;
  } catch (error) {
    console.error(`🚨 Error:`, error);
    return null;
  }
};

// Format market data for display
export const formatMarketForDisplay = (market: PolymarketMarket) => {
  return {
    id: market.id,
    title: market.question,
    description: market.description || '',
    category: market.category,
    outcomes: market.outcomes || [],
    volume: market.volume || 0,
    liquidity: market.liquidity || 0,
    endDate: market.endDate ? new Date(market.endDate).toLocaleDateString() : 'No end date',
    isActive: !market.resolved,
    createdAt: market.createdAt ? new Date(market.createdAt).toLocaleDateString() : ''
  };
};