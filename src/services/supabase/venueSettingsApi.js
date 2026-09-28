import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { assertSupabase } from "./assertSupabase";
import { LOCAL_STORAGE_SALES_SETTINGS_KEY } from "../../config";
import { DEFAULT_GAME_RATES } from "../../utils/gameRates";
import { DEFAULT_VENUE_HOURS, LOCAL_STORAGE_VENUE_HOURS_KEY } from "../../utils/venueHours";

// venue_settings is one row (id = 1): game rates, opening hours, sale window.
// The database is the source of truth — online booking prices are computed
// from it server-side. Staff devices keep a localStorage copy so the
// synchronous billing helpers (loadGameRates, loadVenueHours, sale window)
// keep working offline.

export const DEFAULT_SALE_WINDOW = { fromHour: 12, toHour: 15, hourlyRate: 12 };

function normalizeSettings(row) {
  const venueHours = {};
  for (let i = 0; i < 7; i++) {
    venueHours[i] = row?.venue_hours?.[i] ?? DEFAULT_VENUE_HOURS[i];
  }
  return {
    gameRates: { ...DEFAULT_GAME_RATES, ...(row?.game_rates || {}) },
    venueHours,
    saleWindow: { ...DEFAULT_SALE_WINDOW, ...(row?.sale_window || {}) },
    // null until a superadmin has saved the Settings page at least once
    updatedAt: row?.updated_at ?? null,
  };
}

export async function fetchVenueSettings() {
  if (!isSupabaseConfigured || !supabase) return normalizeSettings(null);
  const { data, error } = await supabase
    .from("venue_settings")
    .select("game_rates, venue_hours, sale_window, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return normalizeSettings(data);
}

export async function saveVenueSettings({ gameRates, venueHours, saleWindow }) {
  assertSupabase();
  const { data, error } = await supabase
    .from("venue_settings")
    .update({
      game_rates: gameRates,
      venue_hours: venueHours,
      sale_window: saleWindow,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("game_rates, venue_hours, sale_window, updated_at")
    .single();
  if (error) throw error;
  const settings = normalizeSettings(data);
  writeVenueSettingsCache(settings);
  return settings;
}

// Mirror the DB settings into the localStorage keys the billing code reads.
export function writeVenueSettingsCache({ gameRates, venueHours, saleWindow }) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SALES_SETTINGS_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      LOCAL_STORAGE_SALES_SETTINGS_KEY,
      JSON.stringify({
        ...existing,
        saleFromHour: Number(saleWindow.fromHour),
        saleToHour: Number(saleWindow.toHour),
        saleHourlyRate: Number(saleWindow.hourlyRate),
        gameRates: { ...gameRates },
      })
    );
    localStorage.setItem(LOCAL_STORAGE_VENUE_HOURS_KEY, JSON.stringify(venueHours));
  } catch (e) {
    console.error("Failed to cache venue settings:", e);
  }
}

// Pull the latest settings into this device's cache (staff portal start-up).
export async function syncVenueSettingsCache() {
  try {
    const settings = await fetchVenueSettings();
    // Never saved yet: keep whatever this device has until an admin saves.
    if (settings.updatedAt) writeVenueSettingsCache(settings);
    return settings;
  } catch (e) {
    console.error("Failed to sync venue settings:", e);
    return null;
  }
}
