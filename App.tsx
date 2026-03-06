import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GuessResult, GuessHistoryItem, GameStats, LeaderboardEntry } from './types';
import { getGameCommentary } from './services/geminiService';

const App: React.FC = () => {
  // UI States
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('game_theme');
    if (saved) return saved as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('game_sound_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isAskingName, setIsAskingName] = useState(true);

  // Audio References
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const failSoundRef = useRef<HTMLAudioElement | null>(null);

  // Game & User State
  const [playerName, setPlayerName] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    const saved = localStorage.getItem('number_game_leaderboard');
    return saved ? JSON.parse(saved) : [];
  });

  // Game Loop State
  const [targetNumber, setTargetNumber] = useState<number>(0);
  const [currentInput, setCurrentInput] = useState<string>('');
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [feedback, setFeedback] = useState<{ text: string; sub: string; result: GuessResult }>({
    text: 'READY?',
    sub: 'Start by entering a number',
    result: GuessResult.NONE
  });
  const [stats, setStats] = useState<GameStats>(() => {
    const saved = localStorage.getItem('number_game_stats');
    if (saved) return JSON.parse(saved);
    return { guessesCount: 0, bestScore: null, sessionNumber: 0 };
  });
  const [commentary, setCommentary] = useState<string>('');
  const [isGameOver, setIsGameOver] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Audio Initialization
  useEffect(() => {
    // Smooth Lofi Night Beats
    bgMusicRef.current = new Audio('https://assets.mixkit.co/music/preview/mixkit-lo-fi-night-120.mp3');
    bgMusicRef.current.loop = true;
    bgMusicRef.current.volume = 0.15;

    // Confetti Cannon sound for winning
    winSoundRef.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-confetti-cannon-explosion-2778.mp3');
    // Wrong answer buzz sound
    failSoundRef.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-buzzer-948.mp3');
    
    return () => {
      bgMusicRef.current?.pause();
    };
  }, []);

  // Sync sound settings with Audio objects
  useEffect(() => {
    if (bgMusicRef.current) {
      if (soundEnabled && !isAskingName) {
        bgMusicRef.current.play().catch(() => {}); // Autoplay might still block
      } else {
        bgMusicRef.current.pause();
      }
    }
    localStorage.setItem('game_sound_enabled', JSON.stringify(soundEnabled));
  }, [soundEnabled, isAskingName]);

  // Apply Theme
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('game_theme', theme);
  }, [theme]);

  // Persist Data
  useEffect(() => {
    localStorage.setItem('number_game_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('number_game_leaderboard', JSON.stringify(leaderboard));
  }, [leaderboard]);

  // Initialize Game Logic
  const initGameSession = useCallback(() => {
    const newTarget = Math.floor(Math.random() * 100) + 1;
    setTargetNumber(newTarget);
    setHistory([]);
    setCurrentInput('');
    setIsGameOver(false);
    setCommentary('');
    setFeedback({
      text: 'NEW GAME',
      sub: 'Guess the secret number between 1 and 100',
      result: GuessResult.NONE
    });
    setStats(prev => ({
      ...prev,
      guessesCount: 0,
      sessionNumber: prev.sessionNumber + 1
    }));
  }, []);

  const handleStartSession = () => {
    if (!playerName.trim()) return;
    setIsAskingName(false);
    initGameSession();
    // Start music on user interaction
    if (soundEnabled && bgMusicRef.current) {
      bgMusicRef.current.play().catch(e => console.log("Music play blocked", e));
    }
  };

  const updateLeaderboard = (score: number) => {
    const name = playerName.trim() || 'Anonymous';
    setLeaderboard(prev => {
      const existingIndex = prev.findIndex(e => e.name === name);
      if (existingIndex > -1) {
        if (score < prev[existingIndex].score) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], score, timestamp: Date.now() };
          return next;
        }
        return prev;
      }
      return [...prev, { name, score, timestamp: Date.now() }];
    });
  };

  const handleGuess = async () => {
    const num = parseInt(currentInput);
    if (isNaN(num) || num < 1 || num > 100) return;

    const newGuessesCount = stats.guessesCount + 1;
    let result = GuessResult.NONE;
    let feedbackText = '';
    let feedbackSub = '';

    const diff = num - targetNumber;

    if (num === targetNumber) {
      result = GuessResult.CORRECT;
      feedbackText = 'CORRECT!';
      feedbackSub = `You found it in ${newGuessesCount} guesses!`;
      setIsGameOver(true);
      
      if (soundEnabled && winSoundRef.current) {
        winSoundRef.current.currentTime = 0;
        winSoundRef.current.play();
      }

      setStats(prev => ({
        ...prev,
        guessesCount: newGuessesCount,
        bestScore: prev.bestScore === null ? newGuessesCount : Math.min(prev.bestScore, newGuessesCount)
      }));

      updateLeaderboard(newGuessesCount);
    } else {
      if (soundEnabled && failSoundRef.current) {
        failSoundRef.current.currentTime = 0;
        failSoundRef.current.play();
      }

      if (diff > 20) {
        result = GuessResult.TOO_HIGH_EXTREME;
        feedbackText = 'TOO HIGH';
      } else if (diff > 10) {
        result = GuessResult.TOO_HIGH;
        feedbackText = 'HIGH';
      } else if (diff > 0) {
        result = GuessResult.TOO_HIGH_SLIGHT;
        feedbackText = 'SLIGHTLY HIGH';
      } else if (diff < -20) {
        result = GuessResult.TOO_LOW_EXTREME;
        feedbackText = 'TOO LOW';
      } else if (diff < -10) {
        result = GuessResult.TOO_LOW;
        feedbackText = 'LOW';
      } else {
        result = GuessResult.TOO_LOW_SLIGHT;
        feedbackText = 'SLIGHTLY LOW';
      }
      feedbackSub = 'Try again!';
      setStats(prev => ({ ...prev, guessesCount: newGuessesCount }));
    }

    setFeedback({ text: feedbackText, sub: feedbackSub, result });

    const newHistoryItem: GuessHistoryItem = {
      id: history.length + 1,
      number: num,
      result,
      timestamp: Date.now()
    };

    setHistory(prev => [newHistoryItem, ...prev]);
    setCurrentInput('');
    
    const geminiResult = result === GuessResult.CORRECT ? 'CORRECT' : (diff > 0 ? 'TOO_HIGH' : 'TOO_LOW');
    const aiComment = await getGameCommentary(num, targetNumber, geminiResult as any, newGuessesCount);
    setCommentary(aiComment);
  };

  const clearHistory = () => {
    setHistory([]);
    setCommentary('');
  };

  const rankedLeaderboard = useMemo(() => {
    const sorted = [...leaderboard].sort((a, b) => a.score - b.score || a.timestamp - b.timestamp);
    let currentRank = 0;
    let lastScore = -1;
    
    return sorted.map((entry) => {
      if (entry.score !== lastScore) {
        currentRank++;
        lastScore = entry.score;
      }
      return { ...entry, rank: currentRank };
    });
  }, [leaderboard]);

  const existingBestScore = useMemo(() => {
    const match = leaderboard.find(e => e.name === playerName.trim());
    return match ? match.score : null;
  }, [playerName, leaderboard]);

  return (
    <div className="relative flex min-h-screen w-full flex-col max-w-[480px] mx-auto overflow-x-hidden border-x border-slate-200 dark:border-slate-800 shadow-2xl bg-background-light dark:bg-background-dark">
      {/* Top App Bar */}
      <header className="flex items-center justify-between p-4 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0 z-10">
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">settings</span>
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold tracking-widest uppercase opacity-50">
            Session #{stats.sessionNumber.toString().padStart(2, '0')}
          </span>
          <span className="text-[12px] font-bold text-primary truncate max-w-[120px]">{playerName || 'The Number Game'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">
              {soundEnabled ? 'volume_up' : 'volume_off'}
            </span>
          </button>
          <button 
            onClick={() => setShowLeaderboard(true)}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">leaderboard</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 pt-8 pb-12">
        <div className="mb-12 text-center">
          <h1 className="text-5xl font-black tracking-tighter leading-none mb-2 text-slate-900 dark:text-white uppercase">
            The<br />Number<br />Game
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm min-h-[1.25rem]">
            {commentary || "Guess the secret number between 1 and 100"}
          </p>
        </div>

        <div className="flex flex-col gap-6 items-center">
          <div className="w-full">
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 text-center">
              Your Guess
            </label>
            <div className="relative group">
              <input
                ref={inputRef}
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isGameOver && handleGuess()}
                disabled={isGameOver || isAskingName}
                className="w-full text-center text-4xl font-bold h-24 bg-white dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all outline-none disabled:opacity-50 dark:text-white"
                placeholder="--"
                type="number"
                min="1"
                max="100"
              />
            </div>
          </div>

          {!isGameOver ? (
            <button
              onClick={handleGuess}
              disabled={isAskingName}
              className="w-full bg-primary hover:bg-primary/90 text-background-dark h-16 rounded-2xl font-bold text-xl shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>GUESS</span>
              <span className="material-symbols-outlined">rocket_launch</span>
            </button>
          ) : (
            <button
              onClick={() => setIsAskingName(true)}
              className="w-full bg-green-500 hover:bg-green-400 text-white h-16 rounded-2xl font-bold text-xl shadow-lg shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>PLAY AGAIN</span>
              <span className="material-symbols-outlined">refresh</span>
            </button>
          )}
        </div>

        <div className={`mt-10 mb-8 py-6 px-4 rounded-3xl border flex flex-col items-center justify-center min-h-[120px] transition-all duration-500 ${
          feedback.result === GuessResult.CORRECT ? 'bg-green-500/10 border-green-500/20' : 
          feedback.result === GuessResult.NONE ? 'bg-slate-500/5 border-slate-500/10' :
          'bg-primary/10 border-primary/20'
        }`}>
          <span className={`font-bold text-3xl tracking-tight mb-1 text-center ${
            feedback.result === GuessResult.CORRECT ? 'text-green-500' : 'text-primary'
          } ${feedback.result !== GuessResult.NONE ? 'animate-pulse' : ''}`}>
            {feedback.text}
          </span>
          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">{feedback.sub}</p>
        </div>

        <div className="flex items-center justify-between px-2 mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Guesses</span>
            <span className="text-2xl font-bold">{stats.guessesCount.toString().padStart(2, '0')}</span>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Best Score</span>
            <span className="text-2xl font-bold">{stats.bestScore ? stats.bestScore.toString().padStart(2, '0') : '--'}</span>
          </div>
        </div>

        <div className="mt-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">History</h3>
            <button 
              onClick={clearHistory}
              className="text-xs font-bold text-primary flex items-center gap-1 uppercase tracking-wider hover:opacity-80"
            >
              Clear <span className="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2 hide-scrollbar">
            {history.length > 0 ? (
              history.map((item, index) => (
                <HistoryItem key={item.timestamp} item={item} index={history.length - index} />
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm italic">
                No guesses yet...
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Name Input Screen */}
      {isAskingName && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background-dark/95 backdrop-blur-xl">
          <div className="w-full max-w-sm flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-6 text-primary border-4 border-primary/10">
              <span className="material-symbols-outlined text-5xl">person</span>
            </div>
            <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Enter Your Name</h2>
            <p className="text-slate-400 mb-8 text-center text-sm font-medium">To start your session and join the leaderboard</p>
            
            <div className="w-full relative">
              <input 
                autoFocus
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartSession()}
                placeholder="PLAYER NAME"
                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl h-16 text-center text-xl font-bold text-white focus:border-primary transition-all outline-none mb-2 placeholder:text-white/20"
              />
              {existingBestScore !== null && (
                <p className="text-primary text-[10px] font-black uppercase tracking-widest text-center animate-in fade-in duration-300">
                  Welcome back! Your personal best: {existingBestScore} guesses
                </p>
              )}
            </div>
            
            <button 
              onClick={handleStartSession}
              disabled={!playerName.trim()}
              className="w-full mt-6 bg-primary text-background-dark h-16 rounded-2xl font-black text-xl shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
            >
              START GAME
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background-dark/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-8 pb-4">
              <h2 className="text-3xl font-black mb-2 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-4xl">workspace_premium</span> Hall of Fame
              </h2>
              <p className="text-slate-500 text-sm font-medium">Top players with least guesses</p>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 hide-scrollbar">
              {rankedLeaderboard.length > 0 ? (
                rankedLeaderboard.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {entry.rank <= 3 ? (
                          <span className={`material-symbols-outlined text-3xl ${
                            entry.rank === 1 ? 'text-yellow-500' :
                            entry.rank === 2 ? 'text-slate-400' :
                            'text-amber-700'
                          }`}>workspace_premium</span>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs">
                            {entry.rank}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-black dark:text-white text-lg leading-tight truncate max-w-[150px]">{entry.name}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-black text-primary leading-none">{entry.score}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Guesses</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400 italic">No entries yet. Be the first!</div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
              <button 
                onClick={() => setShowLeaderboard(false)}
                className="w-full py-4 bg-slate-200 dark:bg-slate-800 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                BACK TO GAME
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background-dark/80 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-black mb-8 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">tune</span> Configuration
            </h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-bold text-lg">Visual Mode</span>
                  <span className="text-xs text-slate-500">Switch dark/light theme</span>
                </div>
                <button 
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className={`w-14 h-8 rounded-full transition-all relative ${theme === 'dark' ? 'bg-primary' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${theme === 'dark' ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-bold text-lg">Game Audio</span>
                  <span className="text-xs text-slate-500">Music & Sound Effects</span>
                </div>
                <button 
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-14 h-8 rounded-full transition-all relative ${soundEnabled ? 'bg-primary' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${soundEnabled ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="w-full mt-10 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold text-sm uppercase tracking-widest"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background-dark/80 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-black mb-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">school</span> How to Play
            </h2>
            <div className="space-y-4 mb-8">
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                Guess the number and we'll tell you if it's low, high, or correct.
              </p>
              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-xs text-primary font-bold uppercase tracking-widest mb-2">Hint Logic</p>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Low Range</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> High Range</div>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setShowTutorial(false)}
              className="w-full py-4 bg-primary text-background-dark rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20"
            >
              UNDERSTOOD
            </button>
          </div>
        </div>
      )}

      <footer className="pb-6 pt-2 flex justify-center mt-auto">
        <div className="w-32 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
      </footer>
    </div>
  );
};

const HistoryItem: React.FC<{ item: GuessHistoryItem; index: number }> = ({ item, index }) => {
  const getColors = () => {
    switch (item.result) {
      case GuessResult.TOO_HIGH_EXTREME:
      case GuessResult.TOO_HIGH:
      case GuessResult.TOO_HIGH_SLIGHT:
        return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
      case GuessResult.TOO_LOW_EXTREME:
      case GuessResult.TOO_LOW:
      case GuessResult.TOO_LOW_SLIGHT:
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case GuessResult.CORRECT:
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    }
  };

  const getLabel = () => {
    switch (item.result) {
      case GuessResult.TOO_HIGH_EXTREME: return 'Too High';
      case GuessResult.TOO_HIGH: return 'High';
      case GuessResult.TOO_HIGH_SLIGHT: return 'Slightly High';
      case GuessResult.TOO_LOW_EXTREME: return 'Too Low';
      case GuessResult.TOO_LOW: return 'Low';
      case GuessResult.TOO_LOW_SLIGHT: return 'Slightly Low';
      case GuessResult.CORRECT: return 'Correct';
      default: return '';
    }
  };

  return (
    <div className={`flex items-center justify-between p-4 bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800/50 transition-all duration-300 ${index === 0 ? 'scale-105 border-primary shadow-sm' : 'opacity-60'}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-500">
          {index + 1}
        </div>
        <span className="font-black text-xl dark:text-white">{item.number.toString().padStart(2, '0')}</span>
      </div>
      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${getColors()}`}>
        {getLabel()}
      </span>
    </div>
  );
};

export default App;