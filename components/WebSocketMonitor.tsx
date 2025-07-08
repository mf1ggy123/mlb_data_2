'use client';

import React, { useState, useEffect } from 'react';
import { usePolymarketWebSocketMonitor, MarketDataMessage } from '@/utils/polymarketWebSocketMonitor';

interface WebSocketMonitorProps {
  marketId?: string;
}

export default function WebSocketMonitor({ marketId }: WebSocketMonitorProps) {
  const {
    connectionStatus,
    messages,
    connect,
    disconnect,
    subscribeToMarket,
    unsubscribeFromMarket,
    isConnected
  } = usePolymarketWebSocketMonitor();

  const [subscribedMarkets, setSubscribedMarkets] = useState<Set<string>>(new Set());
  const [inputMarketId, setInputMarketId] = useState(marketId || '');

  useEffect(() => {
    // Auto-connect when component mounts
    if (connectionStatus === 'disconnected') {
      console.log('🚀 Auto-connecting to WebSocket...');
      connect().catch(console.error);
    }

    return () => {
      // Cleanup on unmount
      disconnect();
    };
  }, []);

  const handleConnect = async () => {
    try {
      await connect();
      console.log('✅ WebSocket connection initiated');
    } catch (error) {
      console.error('❌ Failed to connect:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setSubscribedMarkets(new Set());
  };

  const handleSubscribe = () => {
    if (!inputMarketId.trim()) {
      alert('Please enter a market ID');
      return;
    }

    if (!isConnected) {
      alert('WebSocket not connected. Please connect first.');
      return;
    }

    subscribeToMarket(inputMarketId.trim());
    setSubscribedMarkets(prev => new Set(prev).add(inputMarketId.trim()));
  };

  const handleUnsubscribe = (marketId: string) => {
    unsubscribeFromMarket(marketId);
    setSubscribedMarkets(prev => {
      const newSet = new Set(prev);
      newSet.delete(marketId);
      return newSet;
    });
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'disconnected': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'disconnected': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        📊 Polymarket WebSocket Monitor
      </h2>
      
      <div className="space-y-6">
        {/* Connection Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Connection Status</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getStatusIcon()}</span>
              <span className={`font-medium ${getStatusColor()}`}>
                {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={isConnected}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors"
              >
                Connect
              </button>
              <button
                onClick={handleDisconnect}
                disabled={!isConnected}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>

        {/* Market Subscription */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Market Monitoring</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={inputMarketId}
              onChange={(e) => setInputMarketId(e.target.value)}
              placeholder="Enter market ID (e.g., mlb-col-bos-2025-07-07)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSubscribe}
              disabled={!isConnected}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors"
            >
              Subscribe
            </button>
          </div>

          {/* Subscribed Markets */}
          {subscribedMarkets.size > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Subscribed Markets:</h4>
              <div className="space-y-2">
                {Array.from(subscribedMarkets).map((market) => (
                  <div key={market} className="flex items-center justify-between bg-white p-2 rounded border">
                    <span className="font-mono text-sm">{market}</span>
                    <button
                      onClick={() => handleUnsubscribe(market)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Unsubscribe
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Message Log */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            Live Messages ({messages.length})
          </h3>
          <div className="h-64 overflow-y-auto bg-white border rounded-md p-3">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No messages received yet. Connect and subscribe to see live data.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.slice(-20).reverse().map((message, index) => (
                  <div key={index} className="border-b border-gray-200 pb-2">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-800">
                        {message.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    {message.market && (
                      <div className="text-xs text-gray-600">Market: {message.market}</div>
                    )}
                    {(message.price || message.volume) && (
                      <div className="text-xs text-gray-600">
                        {message.price && `Price: $${message.price}`}
                        {message.price && message.volume && ' | '}
                        {message.volume && `Volume: ${message.volume}`}
                      </div>
                    )}
                    <details className="mt-1">
                      <summary className="text-xs text-blue-600 cursor-pointer">Raw Data</summary>
                      <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-x-auto">
                        {JSON.stringify(message.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">Instructions</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Click "Connect" to establish WebSocket connection</li>
            <li>• Enter a market ID and click "Subscribe" to monitor market data</li>
            <li>• All received messages will appear in the Live Messages section</li>
            <li>• This is read-only monitoring - no trading functionality</li>
          </ul>
        </div>
      </div>
    </div>
  );
}