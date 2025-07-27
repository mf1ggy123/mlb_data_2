'use client';

import React, { useState, useEffect } from 'react';
import { 
  getMLBGameMarket, 
  getValidMLBTeamCodes, 
  getMLBTeamName, 
  isValidMLBTeamCode,
  getMarketTokenPrices,
  PolymarketMarket 
} from '@/utils/polymarketApi';
import { initializeGame } from '@/utils/contractDecisionService';
import { checkSaveExists, loadGameState, LoadStateResponse } from '@/utils/saveLoadService';

interface TeamSelectionProps {
  onMarketFound: (market: PolymarketMarket, awayTeam: string, homeTeam: string, date: string, username?: string, loadedGameState?: any) => void;
}

export default function TeamSelection({ onMarketFound }: TeamSelectionProps) {
  const [awayTeam, setAwayTeam] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Today's date
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveExists, setSaveExists] = useState<boolean>(false);
  const [checkingSave, setCheckingSave] = useState<boolean>(false);
  const [loadingSave, setLoadingSave] = useState<boolean>(false);
  const validTeamCodes = getValidMLBTeamCodes();
  
  // List of verified users
  const verifiedUsers = ['Michael'];

  // Check for existing save when teams and username change
  useEffect(() => {
    const checkForExistingSave = async () => {
      if (userName.trim() && awayTeam && homeTeam && isValidMLBTeamCode(awayTeam) && isValidMLBTeamCode(homeTeam)) {
        setCheckingSave(true);
        try {
          console.log('🔍 Checking for save with params:', {
            username: userName.trim(),
            homeTeam: homeTeam.toUpperCase(),
            awayTeam: awayTeam.toUpperCase(),
            date: date
          });
          const saveCheck = await checkSaveExists(userName.trim(), homeTeam.toUpperCase(), awayTeam.toUpperCase(), date);
          console.log('🔍 Save check result:', saveCheck);
          setSaveExists(saveCheck?.exists || false);
        } catch (error) {
          console.error('Error checking save:', error);
          setSaveExists(false);
        } finally {
          setCheckingSave(false);
        }
      } else {
        setSaveExists(false);
      }
    };

    checkForExistingSave();
  }, [userName, awayTeam, homeTeam, date]);

  const handleLoadSave = async () => {
    if (!userName.trim() || !awayTeam || !homeTeam) return;
    
    console.log('🔄 Starting load process with params:', {
      username: userName.trim(),
      homeTeam: homeTeam.toUpperCase(),
      awayTeam: awayTeam.toUpperCase(),
      date: date
    });
    
    setLoadingSave(true);
    try {
      const loadResult = await loadGameState({
        username: userName.trim(),
        homeTeam: homeTeam.toUpperCase(),
        awayTeam: awayTeam.toUpperCase(),
        date: date
      });

      console.log('📂 Load result received:', loadResult);

      if (loadResult.success && loadResult.gameState) {
        console.log('✅ Load successful, getting market...');
        
        // Get the market (still needed for the frontend)
        const market = await getMLBGameMarket(awayTeam, homeTeam, date);
        console.log('📈 Market retrieved:', market);
        
        // Pass the loaded game state to the parent
        console.log('🎮 Calling onMarketFound with loaded data...');
        onMarketFound(market, awayTeam.toUpperCase(), homeTeam.toUpperCase(), date, userName.trim(), loadResult);
      } else {
        console.error('❌ Load failed:', loadResult);
        setError(loadResult.message || 'Failed to load save state');
      }
    } catch (error) {
      console.error('❌ Error loading save:', error);
      setError('Failed to load saved game');
    } finally {
      setLoadingSave(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNameError(null);
    setLoading(true);

    // Verify user name first
    if (!userName.trim()) {
      setNameError('Please enter your name');
      setLoading(false);
      return;
    }

    if (!verifiedUsers.includes(userName.trim())) {
      setNameError(`Access denied. "${userName}" is not authorized to use this system.`);
      setLoading(false);
      return;
    }

    try {
      console.log(`🚀 Attempting to find market for ${awayTeam.toUpperCase()} @ ${homeTeam.toUpperCase()} on ${date}`);
      
      // This will throw errors if team codes are invalid or market not found
      const market = await getMLBGameMarket(awayTeam, homeTeam, date);
      
      console.log(`✅ Market found successfully!`, market);
      
      // Fetch and display prices for both teams
      console.log(`💰 Fetching prices for both teams...`);
      const prices = await getMarketTokenPrices(market);
      
      if (prices.awayPrices && prices.homePrices) {
        console.log(`📊 AWAY TEAM (${awayTeam.toUpperCase()}) PRICES:`);
        console.log(`  Buy Price: ${prices.awayPrices.buyPrice || 'N/A'}`);
        console.log(`  Sell Price: ${prices.awayPrices.sellPrice || 'N/A'}`);
        
        console.log(`📊 HOME TEAM (${homeTeam.toUpperCase()}) PRICES:`);
        console.log(`  Buy Price: ${prices.homePrices.buyPrice || 'N/A'}`);
        console.log(`  Sell Price: ${prices.homePrices.sellPrice || 'N/A'}`);
      } else {
        console.warn(`⚠️ Unable to fetch prices for market`);
      }
      
      console.log(`✅ Market found and prices fetched successfully!`);
      console.log(`👤 Authorized user: ${userName}`);
      
      // Initialize game with $1000 starting balance
      console.log(`💰 Initializing game balance...`);
      const gameId = `${awayTeam}_${homeTeam}_${date}`;
      const gameInitResult = await initializeGame(homeTeam, awayTeam, gameId);
      
      if (gameInitResult.success) {
        console.log(`✅ Game initialized with balance: $${gameInitResult.balance}`);
      } else {
        console.warn(`⚠️ Game initialization failed: ${gameInitResult.error}`);
      }
      
      onMarketFound(market, awayTeam, homeTeam, date, userName.trim());
    } catch (err) {
      console.error(`❌ Market search failed:`, err);
      
      let errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      
      // Add helpful suggestions for common issues
      if (errorMessage.includes('No market found')) {
        errorMessage += '\n\nTry:\n• Different date (markets may not exist for this date)\n• Reverse team order (BOS @ COL instead of COL @ BOS)\n• Check if teams are playing on this date';
      } else if (errorMessage.includes('405')) {
        errorMessage = 'API Error: The request was rejected by Polymarket. This could be due to rate limiting or API restrictions. Please try again in a few moments.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getTeamNameSafe = (teamCode: string): string => {
    try {
      return getMLBTeamName(teamCode);
    } catch {
      return teamCode.toUpperCase();
    }
  };

  const isFormValid = userName.trim() && 
    awayTeam && homeTeam && date && 
    isValidMLBTeamCode(awayTeam) && isValidMLBTeamCode(homeTeam) &&
    awayTeam !== homeTeam;

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">⚾ Baseball Game Setup</h1>
          <p className="text-gray-600">Enter team codes to find the Polymarket and start simulation</p>
          
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {nameError && (
              <p className="text-sm text-red-600 mt-1 flex items-center">
                <span className="mr-1">✗</span>
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Away Team Code
            </label>
            <input
              type="text"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value.toLowerCase())}
              placeholder="e.g., col"
              maxLength={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono uppercase"
              required
            />
            {awayTeam && (
              <div className="mt-2">
                {isValidMLBTeamCode(awayTeam) ? (
                  <p className="text-sm text-green-600 flex items-center">
                    <span className="mr-1">✓</span>
                    {getTeamNameSafe(awayTeam)}
                  </p>
                ) : (
                  <p className="text-sm text-red-600 flex items-center">
                    <span className="mr-1">✗</span>
                    Invalid team code
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="text-center text-gray-500 font-bold">@</div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Home Team Code
            </label>
            <input
              type="text"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value.toLowerCase())}
              placeholder="e.g., bos"
              maxLength={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono uppercase"
              required
            />
            {homeTeam && (
              <div className="mt-2">
                {isValidMLBTeamCode(homeTeam) ? (
                  <p className="text-sm text-green-600 flex items-center">
                    <span className="mr-1">✓</span>
                    {getTeamNameSafe(homeTeam)}
                  </p>
                ) : (
                  <p className="text-sm text-red-600 flex items-center">
                    <span className="mr-1">✗</span>
                    Invalid team code
                  </p>
                )}
              </div>
            )}
          </div>

          {awayTeam && homeTeam && awayTeam === homeTeam && (
            <div className="text-sm text-red-600 flex items-center">
              <span className="mr-1">⚠️</span>
              Away and home teams must be different
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Game Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>



          {/* Load Save Button - Shows when save exists */}
          {saveExists && (
            <button
              type="button"
              onClick={handleLoadSave}
              disabled={loadingSave || !isFormValid}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg mb-3"
            >
              {loadingSave ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Loading Saved Game...
                </span>
              ) : (
                '📂 Load Saved Game'
              )}
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Finding Market...
              </span>
            ) : (
              'Find Market & Start Game'
            )}
          </button>
        </form>

        {/* Error Display */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <div className="text-red-600 mr-2">❌</div>
              <div>
                <h3 className="text-red-800 font-medium">Error</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}