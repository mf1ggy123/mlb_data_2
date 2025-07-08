export interface GameState {
  homeScore: number;
  awayScore: number;
  inning: number;
  isTopOfInning: boolean;
  outs: number;
  strikes: number;
  balls: number;
  bases: {
    first: boolean;
    second: boolean;
    third: boolean;
  };
  homeTeam: string;
  awayTeam: string;
}

export interface PlayOption {
  id: string;
  label: string;
  description: string;
  category: 'hit' | 'out' | 'error' | 'advance';
  outcome?: any; // Store the full outcome data from Retrosheet
}

export interface StealOption {
  id: string;
  label: string;
  description: string;
  from: 'first' | 'second' | 'third';
  to: 'second' | 'third' | 'home';
  outcome?: any; // Store the full outcome data from Retrosheet
}