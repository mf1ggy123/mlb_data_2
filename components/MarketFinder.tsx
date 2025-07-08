'use client';

import React, { useState } from 'react';
import { 
  getMLBGameMarket, 
  getValidMLBTeamCodes, 
  getMLBTeamName, 
  isValidMLBTeamCode,
  formatMarketForDisplay,
  PolymarketMarket 
} from '@/utils/polymarketApi';

export default function MarketFinder() {
  const [awayTeam, setAwayTeam] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [date, setDate] = useState('2025-07-07');
  const [market, setMarket] = useState<PolymarketMarket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validTeamCodes = getValidMLBTeamCodes();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMarket(null);
    setLoading(true);

    try {
      // The API will validate team codes and throw errors if invalid
      const foundMarket = await getMLBGameMarket(awayTeam, homeTeam, date);
      setMarket(foundMarket);
    } catch (err) {
      // Display the error message to the user
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Find MLB Market</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Away Team Code
            </label>
            <input
              type="text"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value.toLowerCase())}
              placeholder="e.g., col"
              maxLength={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              required
            />
            {awayTeam && isValidMLBTeamCode(awayTeam) && (
              <p className="text-sm text-green-600 mt-1">
                ✓ {getTeamNameSafe(awayTeam)}
              </p>
            )}
            {awayTeam && !isValidMLBTeamCode(awayTeam) && (
              <p className="text-sm text-red-600 mt-1">
                ✗ Invalid team code
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Home Team Code
            </label>
            <input
              type="text"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value.toLowerCase())}
              placeholder="e.g., bos"
              maxLength={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              required
            />
            {homeTeam && isValidMLBTeamCode(homeTeam) && (
              <p className="text-sm text-green-600 mt-1">
                ✓ {getTeamNameSafe(homeTeam)}
              </p>
            )}
            {homeTeam && !isValidMLBTeamCode(homeTeam) && (
              <p className="text-sm text-red-600 mt-1">
                ✗ Invalid team code
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Game Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !awayTeam || !homeTeam || !date}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-md transition-colors"
        >
          {loading ? 'Finding Market...' : 'Find Market'}
        </button>
      </form>

      {/* Generated Slug Preview */}
      {awayTeam && homeTeam && date && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            <strong>Generated Slug:</strong> mlb-{awayTeam.toLowerCase()}-{homeTeam.toLowerCase()}-{date}
          </p>
          {awayTeam && homeTeam && isValidMLBTeamCode(awayTeam) && isValidMLBTeamCode(homeTeam) && (
            <p className="text-sm text-gray-600 mt-1">
              <strong>Matchup:</strong> {getTeamNameSafe(awayTeam)} @ {getTeamNameSafe(homeTeam)}
            </p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start">
            <div className="text-red-600 mr-2">❌</div>
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Market Display */}
      {market && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-start">
            <div className="text-green-600 mr-2">✅</div>
            <div className="flex-1">
              <h3 className="text-green-800 font-medium mb-2">Market Found!</h3>
              <div className="space-y-2 text-sm">
                <p><strong>ID:</strong> {market.id}</p>
                <p><strong>Question:</strong> {market.question}</p>
                {market.description && (
                  <p><strong>Description:</strong> {market.description}</p>
                )}
                <p><strong>Category:</strong> {market.category}</p>
                {market.outcomes && market.outcomes.length > 0 && (
                  <div>
                    <strong>Outcomes:</strong>
                    <ul className="list-disc list-inside ml-2">
                      {market.outcomes.map((outcome, index) => (
                        <li key={index}>{outcome}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p><strong>Volume:</strong> ${market.volume?.toLocaleString() || 'N/A'}</p>
                <p><strong>Liquidity:</strong> ${market.liquidity?.toLocaleString() || 'N/A'}</p>
                <p><strong>End Date:</strong> {market.endDate || 'N/A'}</p>
                <p><strong>Resolved:</strong> {market.resolved ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Valid Team Codes Reference */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h3 className="text-blue-800 font-medium mb-2">Valid MLB Team Codes</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
          {validTeamCodes.map((code) => (
            <span
              key={code}
              className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-center font-mono"
            >
              {code.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}