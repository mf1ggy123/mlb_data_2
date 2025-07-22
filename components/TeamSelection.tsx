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

interface TeamSelectionProps {
  onMarketFound: (market: PolymarketMarket, awayTeam: string, homeTeam: string, date: string) => void;
}

export default function TeamSelection({ onMarketFound }: TeamSelectionProps) {
  const [awayTeam, setAwayTeam] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Today's date
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const validTeamCodes = getValidMLBTeamCodes();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

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
      
      // Create buy order for home team (CLOB client handles authentication internally)
      if (market.homeTokenId) {
        console.log(`🏠 Creating buy order for home team: ${homeTeam.toUpperCase()}`);
        setAuthStatus('success'); // CLOB client handles auth internally
        
        try {
          const orderResponse = await fetch('/api/polymarket/python-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokenID: "74222696496792012687871550915060213431290440776324791435820797297779043018992", // Use the specific working token ID
              price: prices.homePrices?.sellPrice ? parseFloat(prices.homePrices.sellPrice) : 0.6, // Use sell price (ask) when buying
              size: 5 // Buy 5 shares
            })
          });
          
          const orderData = await orderResponse.json();
          
          if (orderData.success) {
            console.log(`✅ Home team buy order created successfully:`, orderData);
            console.log(`📋 Order ID: ${orderData.orderId}`);
            console.log(`💰 Order Price: ${orderData.orderDetails?.priceFormatted || 'N/A'}`);
            console.log(`📊 Order Size: ${orderData.orderDetails?.size || 1} share(s)`);
            setOrderStatus('success');
          } else {
            console.error(`❌ Home team buy order creation failed:`, orderData.error);
            setOrderStatus('failed');
          }
        } catch (orderError) {
          console.error(`❌ Order creation request failed:`, orderError);
          setOrderStatus('failed');
        }
      }
      
      onMarketFound(market, awayTeam, homeTeam, date);
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

  const isFormValid = awayTeam && homeTeam && date && 
    isValidMLBTeamCode(awayTeam) && isValidMLBTeamCode(homeTeam) &&
    awayTeam !== homeTeam;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">⚾ Baseball Game Setup</h1>
          <p className="text-gray-600">Enter team codes to find the Polymarket and start simulation</p>
          
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Generated Slug Preview */}
          {awayTeam && homeTeam && date && isFormValid && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700 mb-1">
                <strong>Matchup:</strong> {getTeamNameSafe(awayTeam)} @ {getTeamNameSafe(homeTeam)}
              </p>
              <p className="text-xs text-blue-600 font-mono">
                Market Slug: mlb-{awayTeam.toLowerCase()}-{homeTeam.toLowerCase()}-{date}
              </p>
              {authStatus === 'success' && (
                <p className="text-xs text-green-600 mt-2 flex items-center">
                  <span className="mr-1">🔐</span>
                  CLOB Client Ready
                </p>
              )}
              {authStatus === 'failed' && (
                <p className="text-xs text-red-600 mt-2 flex items-center">
                  <span className="mr-1">🔐</span>
                  CLOB Client Failed
                </p>
              )}
              {orderStatus === 'success' && (
                <p className="text-xs text-green-600 mt-2 flex items-center">
                  <span className="mr-1">📋</span>
                  Home Team FOK Buy Order Created
                </p>
              )}
              {orderStatus === 'failed' && (
                <p className="text-xs text-red-600 mt-2 flex items-center">
                  <span className="mr-1">📋</span>
                  FOK Order Creation Failed
                </p>
              )}
            </div>
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

        {/* Valid Team Codes Reference */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-gray-800 font-medium mb-3 text-center">Valid MLB Team Codes</h3>
          <div className="grid grid-cols-6 gap-1 text-xs">
            {validTeamCodes.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  if (!awayTeam) {
                    setAwayTeam(code);
                  } else if (!homeTeam && code !== awayTeam) {
                    setHomeTeam(code);
                  }
                }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded text-center font-mono transition-colors cursor-pointer"
                title={getTeamNameSafe(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Click a code to auto-fill fields
          </p>
        </div>
      </div>
    </div>
  );
}