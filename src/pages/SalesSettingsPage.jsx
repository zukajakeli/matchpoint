// src/pages/SalesSettingsPage.jsx
import React, { useEffect, useState } from "react";
import { LOCAL_STORAGE_SALES_SETTINGS_KEY } from "../config";
import { DEFAULT_GAME_RATES } from "../utils/gameRates";
import { DAY_NAMES, DEFAULT_VENUE_HOURS, loadVenueHours } from "../utils/venueHours";
import { fetchVenueSettings, saveVenueSettings } from "../services/supabaseData";
import "./SalesSettingsPage.css";

// Settings live in the venue_settings table: every staff device and the
// public booking page read them from there, and online booking prices are
// computed from them in the database.
function SalesSettingsPage() {
  // ── Sale-price settings ──────────────────────────────────────────────────
  const [saleFromHour, setSaleFromHour] = useState(12);
  const [saleToHour, setSaleToHour] = useState(15);
  const [saleHourlyRate, setSaleHourlyRate] = useState(12);
  const [saleSaved, setSaleSaved] = useState(false);

  // ── Per-game-type pricing ────────────────────────────────────────────────
  const [gameRates, setGameRates] = useState({ ...DEFAULT_GAME_RATES });
  const [ratesSaved, setRatesSaved] = useState(false);

  // ── Venue opening-hours settings ─────────────────────────────────────────
  const [venueHours, setVenueHours] = useState(() => loadVenueHours());
  const [hoursSaved, setHoursSaved] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadedFromThisDevice, setLoadedFromThisDevice] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchVenueSettings()
      .then((settings) => {
        if (cancelled) return;
        if (settings.updatedAt) {
          setSaleFromHour(settings.saleWindow.fromHour);
          setSaleToHour(settings.saleWindow.toHour);
          setSaleHourlyRate(settings.saleWindow.hourlyRate);
          setGameRates(settings.gameRates);
          setVenueHours(settings.venueHours);
          return;
        }
        // Never saved to the database yet: start from this browser's old
        // local settings so the first save carries them over.
        try {
          const raw = localStorage.getItem(LOCAL_STORAGE_SALES_SETTINGS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.saleFromHour === "number") setSaleFromHour(parsed.saleFromHour);
            if (typeof parsed.saleToHour === "number") setSaleToHour(parsed.saleToHour);
            if (typeof parsed.saleHourlyRate === "number") setSaleHourlyRate(parsed.saleHourlyRate);
            if (parsed.gameRates) setGameRates((prev) => ({ ...prev, ...parsed.gameRates }));
          }
        } catch (e) {
          console.error("Failed to read local sales settings:", e);
        }
        setLoadedFromThisDevice(true);
      })
      .catch((e) => console.error("Failed to load venue settings:", e))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Everything is saved together as one venue_settings row.
  const saveAll = async (overrides = {}) => {
    setSaveError("");
    const numericRates = Object.fromEntries(
      Object.entries(gameRates).map(([key, value]) => [key, Number(value)])
    );
    try {
      await saveVenueSettings({
        gameRates: numericRates,
        venueHours,
        saleWindow: {
          fromHour: Number(saleFromHour),
          toHour: Number(saleToHour),
          hourlyRate: Number(saleHourlyRate),
        },
        ...overrides,
      });
      setLoadedFromThisDevice(false);
      return true;
    } catch (e) {
      console.error("Failed to save venue settings:", e);
      setSaveError("Couldn't save settings. Check your connection and try again.");
      return false;
    }
  };

  const flash = (setter) => {
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  const handleSaleSave = async () => {
    if (await saveAll()) flash(setSaleSaved);
  };

  const handleRatesSave = async () => {
    if (await saveAll()) flash(setRatesSaved);
  };

  const handleRateChange = (key, value) => {
    setGameRates((prev) => ({ ...prev, [key]: value }));
  };

  const handleHoursChange = (dayIndex, field, value) => {
    setVenueHours((prev) => ({
      ...prev,
      [dayIndex]: { ...prev[dayIndex], [field]: Number(value) },
    }));
  };

  const handleHoursSave = async () => {
    if (await saveAll()) flash(setHoursSaved);
  };

  const handleHoursReset = async () => {
    setVenueHours({ ...DEFAULT_VENUE_HOURS });
    if (await saveAll({ venueHours: { ...DEFAULT_VENUE_HOURS } })) flash(setHoursSaved);
  };

  return (
    <div className="sales-settings">
      <h2>Settings</h2>
      {isLoading && <p className="help-text">Loading settings…</p>}
      {loadedFromThisDevice && (
        <p className="help-text">
          These values come from this browser and haven't been saved to the database yet.
          Press any Save button to publish them to every device and the booking page.
        </p>
      )}
      {saveError && <p className="help-text" style={{ color: "#dc2626" }}>{saveError}</p>}

      {/* ── Sale-price card ── */}
      <h3 className="settings-section-title">Sale Price Window</h3>
      <div className="settings-card">
        <div className="settings-row">
          <label className="settings-label">
            From Hour (0–23)
            <input
              className="settings-input"
              type="number"
              min={0}
              max={23}
              value={saleFromHour}
              onChange={(e) => setSaleFromHour(e.target.value)}
            />
          </label>
          <label className="settings-label">
            To Hour (0–23)
            <input
              className="settings-input"
              type="number"
              min={0}
              max={24}
              value={saleToHour}
              onChange={(e) => setSaleToHour(e.target.value)}
            />
          </label>
          <label className="settings-label">
            Sale Rate (GEL/hr)
            <input
              className="settings-input"
              type="number"
              min={0}
              step="0.1"
              value={saleHourlyRate}
              onChange={(e) => setSaleHourlyRate(e.target.value)}
            />
          </label>
        </div>
        <div className="actions">
          <button className="save-btn" onClick={handleSaleSave}>Save</button>
          {saleSaved && <span className="saved-chip">Saved!</span>}
        </div>
        <p className="help-text">
          Example: 12 → 15 at 12 GEL/hr means 14:30–15:30 costs 6 GEL (sale) + regular thereafter.
        </p>
      </div>

      {/* ── Per-game pricing card ── */}
      <h3 className="settings-section-title" style={{ marginTop: 32 }}>Game Pricing</h3>
      <div className="settings-card">
        <p className="help-text" style={{ marginTop: 0, marginBottom: 16 }}>
          Set the hourly rate for each game type and extra equipment pricing.
        </p>
        <div className="game-rates-grid">
          {[
            { key: "pingpong", label: "Ping-Pong", unit: "GEL / hour" },
            { key: "foosball", label: "Foosball", unit: "GEL / hour" },
            { key: "airhockey", label: "Air Hockey", unit: "GEL / hour" },
            { key: "playstation", label: "PlayStation", unit: "GEL / hour" },
            { key: "equipmentBonus", label: "Extra Equipment", unit: "GEL / hour extra" },
          ].map(({ key, label, unit }) => (
            <label key={key} className="settings-label game-rate-label">
              <span className="game-rate-name">{label}</span>
              <div className="game-rate-input-group">
                <input
                  className="settings-input game-rate-input"
                  type="number"
                  min={0}
                  step="0.5"
                  value={gameRates[key]}
                  onChange={(e) => handleRateChange(key, e.target.value)}
                />
                <span className="game-rate-unit">{unit}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="actions">
          <button className="save-btn" onClick={handleRatesSave}>Save Pricing</button>
          {ratesSaved && <span className="saved-chip">Saved!</span>}
        </div>
      </div>

      {/* ── Venue hours card ── */}
      <h3 className="settings-section-title" style={{ marginTop: 32 }}>
        Online Booking Hours
      </h3>
      <div className="settings-card">
        <p className="help-text" style={{ marginTop: 0, marginBottom: 16 }}>
          Set the opening and closing hour for each day. Use 24 for midnight (last slot 23:45).
          Changes take effect immediately on the public booking page, and online bookings outside these hours are refused.
        </p>
        <div className="venue-hours-grid">
          {DAY_NAMES.map((name, i) => (
            <div key={i} className="venue-hours-row">
              <span className="venue-hours-day">{name}</span>
              <label className="settings-label venue-hours-label">
                Open
                <input
                  className="settings-input venue-hours-input"
                  type="number"
                  min={0}
                  max={23}
                  value={venueHours[i]?.open ?? 17}
                  onChange={(e) => handleHoursChange(i, "open", e.target.value)}
                />
              </label>
              <label className="settings-label venue-hours-label">
                Close
                <input
                  className="settings-input venue-hours-input"
                  type="number"
                  min={1}
                  max={24}
                  value={venueHours[i]?.close ?? 24}
                  onChange={(e) => handleHoursChange(i, "close", e.target.value)}
                />
              </label>
              <span className="venue-hours-preview">
                {String(venueHours[i]?.open ?? 17).padStart(2, "0")}:00 –{" "}
                {venueHours[i]?.close === 24
                  ? "midnight"
                  : `${String(venueHours[i]?.close ?? 24).padStart(2, "0")}:00`}
              </span>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="save-btn" onClick={handleHoursSave}>Save Hours</button>
          <button className="save-btn" style={{ background: "var(--neutral-white)" }} onClick={handleHoursReset}>
            Reset to Defaults
          </button>
          {hoursSaved && <span className="saved-chip">Saved!</span>}
        </div>
      </div>
    </div>
  );
}

export default SalesSettingsPage;
