/**
 * Save/Load Service for managing user game state persistence
 */

const API_BASE_URL = 'http://localhost:8000';

export interface SaveStateRequest {
  username: string;
  gameState: any;
}

export interface LoadStateRequest {
  username: string;
  homeTeam: string;
  awayTeam: string;
  date?: string;
}

export interface SaveStateResponse {
  success: boolean;
  message?: string;
  filename?: string;
  username?: string;
  teams?: {
    homeTeam: string;
    awayTeam: string;
  };
  error?: string;
}

export interface LoadStateResponse {
  success: boolean;
  message?: string;
  filename?: string;
  gameState?: any;
  teams?: {
    homeTeam: string;
    awayTeam: string;
  };
  balance?: {
    current_balance: number;
    contracts: {
      home: number;
      away: number;
    };
    transaction_history: any[];
  };
  username?: string;
  date?: string;
  error?: string;
}

export interface CheckSaveExistsResponse {
  exists: boolean;
  filename: string;
  username: string;
  teams: {
    homeTeam: string;
    awayTeam: string;
  };
  date: string;
}

/**
 * Save the current game state for a user
 */
export async function saveGameState(request: SaveStateRequest): Promise<SaveStateResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/save_game_state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('💾 Save game state response:', data);
    return data;
  } catch (error) {
    console.error('❌ Save game state failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Load a saved game state for a user
 */
export async function loadGameState(request: LoadStateRequest): Promise<LoadStateResponse> {
  try {
    console.log('📤 Sending load request:', request);
    const response = await fetch(`${API_BASE_URL}/load_game_state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    console.log('📥 Load response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Load response error:', errorData);
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📂 Load game state response:', data);
    return data;
  } catch (error) {
    console.error('❌ Load game state failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Check if a save file exists for the given parameters
 */
export async function checkSaveExists(username: string, homeTeam: string, awayTeam: string, date?: string): Promise<CheckSaveExistsResponse | null> {
  try {
    const dateParam = date ? `?date=${encodeURIComponent(date)}` : '';
    const url = `${API_BASE_URL}/check_save_exists/${encodeURIComponent(username)}/${encodeURIComponent(homeTeam)}/${encodeURIComponent(awayTeam)}${dateParam}`;
    console.log('🔍 Calling check save exists URL:', url);
    
    const response = await fetch(url);

    if (!response.ok) {
      console.error('❌ HTTP error response:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('🔍 Check save exists response:', data);
    return data;
  } catch (error) {
    console.error('❌ Check save exists failed:', error);
    return null;
  }
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodaysDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate save file name (for display purposes)
 */
export function generateSaveFileName(username: string, homeTeam: string, awayTeam: string, date?: string): string {
  const cleanUsername = username.replace(/[^a-zA-Z0-9\-_]/g, '');
  const cleanHome = homeTeam.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cleanAway = awayTeam.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const dateStr = date || getTodaysDate();
  
  return `${cleanUsername}_${dateStr}_${cleanAway}_${cleanHome}.json`;
}