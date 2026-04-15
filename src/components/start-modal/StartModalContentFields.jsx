import React from "react";
import { loadGameRates, FITPASS_RATE } from "../../utils/gameRates";

export default function StartModalContentFields({
  table,
  mode,
  setMode,
  durationMinutes,
  setDurationMinutes,
  isPlayStation,
  isPingPong,
  isCustomTimer,
  customName,
  setCustomName,
  customHourlyRate,
  setCustomHourlyRate,
  isFoosOrHockey,
  fitPass,
  setFitPass,
  extraEquipment,
  setExtraEquipment,
  validationError,
}) {
  const rates = loadGameRates();
  return (
    <>
      <div className="mode-selection">
        <label>
          <input
            type="radio"
            name={`mode-${table.id}`}
            value="standard"
            checked={mode === "standard"}
            onChange={() => setMode("standard")}
          />
          Standard Timer (Count Up)
        </label>
        <label>
          <input
            type="radio"
            name={`mode-${table.id}`}
            value="countdown"
            checked={mode === "countdown"}
            onChange={() => setMode("countdown")}
          />
          Countdown Stopwatch (Count Down)
        </label>
      </div>

      {mode === "countdown" && (
        <div className="duration-input">
          <label htmlFor={`duration-${table.id}`}>Duration (minutes):</label>
          <div className="duration-presets">
            {[
              { label: "30m", value: 30 },
              { label: "60m", value: 60 },
              { label: "1.5h", value: 90 },
              { label: "2h", value: 120 },
            ].map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`duration-preset-btn${Number(durationMinutes) === preset.value ? " active" : ""}`}
                onClick={() => setDurationMinutes(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            id={`duration-${table.id}`}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            min="1"
          />
        </div>
      )}
      {isPlayStation && (
        <>
          <div className="duration-input" style={{ marginTop: 8, opacity: 0.9 }}>
            Pricing: {extraEquipment ? rates.playstation + rates.equipmentBonus : rates.playstation} GEL per hour
          </div>
          <div style={{ marginTop: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={extraEquipment}
                onChange={(e) => setExtraEquipment(e.target.checked)}
              />
              &nbsp;+2 Controllers (+{rates.equipmentBonus} GEL/hour)
            </label>
          </div>
        </>
      )}
      {isPingPong && (
        <div style={{ marginTop: 12 }}>
          <label>
            <input
              type="checkbox"
              checked={extraEquipment}
              onChange={(e) => setExtraEquipment(e.target.checked)}
            />
            &nbsp;+2 Rackets (+{rates.equipmentBonus} GEL/hour)
          </label>
        </div>
      )}
      {isCustomTimer && (
        <>
          <div className="duration-input" style={{ marginTop: 8 }}>
            <label htmlFor={`custom-name-${table.id}`}>Timer Name:</label>
            <input
              id={`custom-name-${table.id}`}
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. VIP Room"
            />
          </div>
          <div className="duration-input" style={{ marginTop: 8 }}>
            <label htmlFor={`custom-rate-${table.id}`}>Cost per hour (GEL):</label>
            <input
              id={`custom-rate-${table.id}`}
              type="number"
              min="0.01"
              step="0.01"
              value={customHourlyRate}
              onChange={(e) => setCustomHourlyRate(e.target.value)}
              placeholder="e.g. 25"
            />
          </div>
        </>
      )}
      {isFoosOrHockey && (
        <div className="duration-input" style={{ marginTop: 8, opacity: 0.8 }}>
          Pricing: {table?.gameType === "foosball" ? rates.foosball : rates.airhockey} GEL per hour
        </div>
      )}

      {!isFoosOrHockey && (
        <div style={{ marginTop: 12 }}>
          <label>
            <input
              type="checkbox"
              checked={fitPass}
              onChange={(e) => setFitPass(e.target.checked)}
            />
            &nbsp;FitPass (30 minutes = {FITPASS_RATE} GEL)
          </label>
        </div>
      )}
      {validationError && (
        <div style={{ color: "#d6336c", fontWeight: 600, marginTop: 8 }}>
          {validationError}
        </div>
      )}
    </>
  );
}

