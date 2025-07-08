// Read-only WebSocket connection for Polymarket market data monitoring
// This is for data observation only - NO TRADING FUNCTIONALITY

export interface MarketDataMessage {
  type: string;
  market?: string;
  price?: number;
  volume?: number;
  timestamp?: number;
  data?: any;
}

export type MessageHandler = (message: MarketDataMessage) => void;

class PolymarketWebSocketMonitor {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000;
  private messageHandlers: MessageHandler[] = [];
  private keepAliveInterval: NodeJS.Timeout | null = null;

  // READ-ONLY WebSocket endpoint for market data
  private readonly WS_ENDPOINT = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

  constructor() {
    console.log('📊 Initializing read-only Polymarket WebSocket monitor');
  }

  // Add message handler for received data
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  // Remove message handler
  removeMessageHandler(handler: MessageHandler) {
    const index = this.messageHandlers.indexOf(handler);
    if (index > -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  // Connect to WebSocket for read-only monitoring
  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('🔄 WebSocket already connecting or connected');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`🔌 Connecting to WebSocket: ${this.WS_ENDPOINT}`);
        this.isConnecting = true;

        this.ws = new WebSocket(this.WS_ENDPOINT);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startKeepAlive();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📨 Received WebSocket message:', data);
            
            const message: MarketDataMessage = {
              type: data.type || 'unknown',
              market: data.market,
              price: data.price,
              volume: data.volume,
              timestamp: Date.now(),
              data: data
            };

            // Notify all handlers
            this.messageHandlers.forEach(handler => {
              try {
                handler(message);
              } catch (error) {
                console.error('❌ Error in message handler:', error);
              }
            });

          } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket closed:', event.code, event.reason);
          this.isConnecting = false;
          this.cleanup();
          
          // Auto-reconnect if not intentionally closed
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        console.error('❌ Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  // Subscribe to market data (read-only monitoring)
  subscribeToMarket(marketId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not connected. Cannot subscribe to market.');
      return;
    }

    try {
      const subscribeMessage = {
        type: 'subscribe',
        market: marketId,
        channel: 'market_data' // Read-only market data channel
      };

      console.log(`📺 Subscribing to market data for: ${marketId}`);
      this.ws.send(JSON.stringify(subscribeMessage));
    } catch (error) {
      console.error('❌ Error subscribing to market:', error);
    }
  }

  // Unsubscribe from market data
  unsubscribeFromMarket(marketId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not connected. Cannot unsubscribe from market.');
      return;
    }

    try {
      const unsubscribeMessage = {
        type: 'unsubscribe',
        market: marketId
      };

      console.log(`📺 Unsubscribing from market: ${marketId}`);
      this.ws.send(JSON.stringify(unsubscribeMessage));
    } catch (error) {
      console.error('❌ Error unsubscribing from market:', error);
    }
  }

  // Keep connection alive with periodic ping
  private startKeepAlive() {
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
          console.log('🏓 Sent ping to keep connection alive');
        } catch (error) {
          console.error('❌ Error sending ping:', error);
        }
      }
    }, 30000); // Ping every 30 seconds
  }

  // Schedule reconnection attempt
  private scheduleReconnect() {
    this.reconnectAttempts++;
    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect().catch(error => {
          console.error('❌ Reconnection failed:', error);
        });
      }
    }, this.reconnectInterval);
  }

  // Clean up resources
  private cleanup() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  // Disconnect from WebSocket
  disconnect() {
    console.log('🔌 Disconnecting WebSocket...');
    this.cleanup();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }

  // Get connection status
  getConnectionStatus(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance for read-only monitoring
export const polymarketWSMonitor = new PolymarketWebSocketMonitor();

// React hook for WebSocket monitoring
export const usePolymarketWebSocketMonitor = () => {
  const [connectionStatus, setConnectionStatus] = React.useState<string>('disconnected');
  const [messages, setMessages] = React.useState<MarketDataMessage[]>([]);

  React.useEffect(() => {
    const handleMessage = (message: MarketDataMessage) => {
      setMessages(prev => [...prev.slice(-99), message]); // Keep last 100 messages
    };

    polymarketWSMonitor.onMessage(handleMessage);

    // Update connection status periodically
    const statusInterval = setInterval(() => {
      setConnectionStatus(polymarketWSMonitor.getConnectionStatus());
    }, 1000);

    return () => {
      polymarketWSMonitor.removeMessageHandler(handleMessage);
      clearInterval(statusInterval);
    };
  }, []);

  const connect = React.useCallback(() => {
    return polymarketWSMonitor.connect();
  }, []);

  const disconnect = React.useCallback(() => {
    polymarketWSMonitor.disconnect();
  }, []);

  const subscribeToMarket = React.useCallback((marketId: string) => {
    polymarketWSMonitor.subscribeToMarket(marketId);
  }, []);

  const unsubscribeFromMarket = React.useCallback((marketId: string) => {
    polymarketWSMonitor.unsubscribeFromMarket(marketId);
  }, []);

  return {
    connectionStatus,
    messages,
    connect,
    disconnect,
    subscribeToMarket,
    unsubscribeFromMarket,
    isConnected: polymarketWSMonitor.isConnected()
  };
};

// Import React for the hook
import React from 'react';