
export enum GuessResult {
  TOO_LOW_EXTREME = 'TOO_LOW_EXTREME', // Too low
  TOO_LOW = 'TOO_LOW',                 // Low
  TOO_LOW_SLIGHT = 'TOO_LOW_SLIGHT',   // Slightly low
  TOO_HIGH_SLIGHT = 'TOO_HIGH_SLIGHT', // Slightly high
  TOO_HIGH = 'TOO_HIGH',               // High
  TOO_HIGH_EXTREME = 'TOO_HIGH_EXTREME', // Too high
  CORRECT = 'CORRECT',
  NONE = 'NONE'
}

export interface GuessHistoryItem {
  id: number;
  number: number;
  result: GuessResult;
  timestamp: number;
}

export interface GameStats {
  guessesCount: number;
  bestScore: number | null;
  sessionNumber: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number; // number of guesses
  timestamp: number;
}
