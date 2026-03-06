
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const FALLBACK_COMMENTARY: Record<string, string[]> = {
  TOO_HIGH: [
    "A bit high, don't you think?",
    "Try aiming a little lower.",
    "Too high! Give it another shot.",
    "Over-shot it slightly."
  ],
  TOO_LOW: [
    "A bit low, maybe?",
    "Aim higher next time!",
    "Too low! Try again.",
    "Under-shot it a bit."
  ],
  CORRECT: [
    "Spot on! Well played.",
    "You nailed it! Perfection.",
    "Perfect guess! Victory is yours.",
    "Legendary! You found it."
  ]
};

const getStaticFallback = (result: 'TOO_HIGH' | 'TOO_LOW' | 'CORRECT'): string => {
  const options = FALLBACK_COMMENTARY[result] || ["Nice try!"];
  return options[Math.floor(Math.random() * options.length)];
};

/**
 * Sleeps for a given duration.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches game commentary from Gemini with retry logic and fallback.
 */
export const getGameCommentary = async (
  guess: number,
  target: number,
  result: 'TOO_HIGH' | 'TOO_LOW' | 'CORRECT',
  historyCount: number,
  retries: number = 2
): Promise<string> => {
  if (!process.env.API_KEY) return getStaticFallback(result);

  const prompt = `
    The user is playing a number guessing game (1-100).
    They just guessed: ${guess}.
    The secret number is: ${target}.
    The result of this guess is: ${result}.
    This is their guess number ${historyCount}.

    Provide a very short, witty, and encouraging one-sentence commentary for the player. 
    If they won (CORRECT), make it celebratory. 
    If they are close (within 5), mention they are burning up. 
    Keep it under 60 characters.
  `;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          maxOutputTokens: 100,
          temperature: 0.7,
        },
      });

      const text = response.text?.trim();
      if (text) return text;
      
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      
      if (isRateLimit && i < retries) {
        // Exponential backoff: 1s, 2s...
        const delay = Math.pow(2, i) * 1000;
        console.warn(`Gemini Rate Limited (429). Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      
      console.error("Gemini Commentary Error:", error);
      break; // Exit loop on non-retryable error or exhausted retries
    }
  }

  // Final fallback if all retries fail or an immediate error occurs
  return getStaticFallback(result);
};
