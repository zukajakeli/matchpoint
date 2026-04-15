// src/utils/gameRates.js
// Centralised default game-type pricing and a loader that reads from localStorage.

import { LOCAL_STORAGE_SALES_SETTINGS_KEY } from "../config";

export const DEFAULT_GAME_RATES = {
  pingpong: 16,       // GEL per hour
  foosball: 12,       // GEL per hour
  airhockey: 12,      // GEL per hour
  playstation: 20,    // GEL per hour
  equipmentBonus: 5,  // GEL per hour extra (rackets / controllers)
};

// FitPass is a fixed-rate program, not configurable from settings
export const FITPASS_RATE = 6; // GEL per 30 minutes

/**
 * Load game rates from localStorage, falling back to defaults.
 * Returns a plain object with the same shape as DEFAULT_GAME_RATES.
 */
export function loadGameRates() {
  const rates = { ...DEFAULT_GAME_RATES };
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SALES_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.gameRates) {
        for (const key of Object.keys(DEFAULT_GAME_RATES)) {
          const v = Number(parsed.gameRates[key]);
          if (Number.isFinite(v) && v >= 0) rates[key] = v;
        }
      }
    }
  } catch {
    // ignore — use defaults
  }
  return rates;
}
