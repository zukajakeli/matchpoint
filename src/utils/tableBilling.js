import { calculateSegmentedPrice } from "./utils";
import { loadGameRates, FITPASS_RATE } from "./gameRates";

export function getFinalElapsedTimeInSeconds(table) {
  let finalElapsedTimeInSeconds = table.elapsedTimeInSeconds;
  if (table.isRunning && table.timerStartTime) {
    finalElapsedTimeInSeconds += (Date.now() - table.timerStartTime) / 1000;
  }
  return finalElapsedTimeInSeconds;
}

export function calculateBillingSummary({
  table,
  finalElapsedTimeInSeconds,
  hourlyRate,
  salesSettingsStorageKey,
}) {
  let durationForBilling = 0;
  if (table.timerMode === "countdown") {
    durationForBilling = table.initialCountdownSeconds || 0;
  } else {
    durationForBilling = finalElapsedTimeInSeconds;
  }

  let sales = { saleFromHour: 12, saleToHour: 15, saleHourlyRate: 12 };
  try {
    const raw = localStorage.getItem(salesSettingsStorageKey);
    if (raw) sales = { ...sales, ...JSON.parse(raw) };
  } catch {
    // ignore malformed sales config in localStorage
  }

  const nowMs = Date.now();
  const startTimeMs =
    table.sessionStartTime || nowMs - finalElapsedTimeInSeconds * 1000;
  const purchasedEndMsForCountdown =
    startTimeMs + (table.initialCountdownSeconds || 0) * 1000;
  const standardEndMs = table.isRunning
    ? nowMs
    : table.sessionEndTime || startTimeMs + finalElapsedTimeInSeconds * 1000;
  const endTimeMsForBilling =
    table.timerMode === "countdown" ? purchasedEndMsForCountdown : standardEndMs;

  const rates = loadGameRates();
  let amountToPay = 0;
  const hasCustomRate =
    typeof table.hourlyRate === "number" && table.hourlyRate > 0;
  const isFoosOrHockey =
    table.gameType === "foosball" || table.gameType === "airhockey";
  if (isFoosOrHockey) {
    const seconds =
      table.timerMode === "countdown"
        ? table.initialCountdownSeconds || 0
        : finalElapsedTimeInSeconds;
    const gameRate = rates[table.gameType] || 12;
    const ratePerSecond = gameRate / 3600;
    amountToPay = seconds * ratePerSecond;
  } else if (table.fitPass) {
    const seconds =
      table.timerMode === "countdown"
        ? table.initialCountdownSeconds || 0
        : finalElapsedTimeInSeconds;
    const ratePerSecond = FITPASS_RATE / (30 * 60);
    amountToPay = seconds * ratePerSecond;
  } else if (hasCustomRate) {
    const seconds =
      table.timerMode === "countdown"
        ? table.initialCountdownSeconds || 0
        : finalElapsedTimeInSeconds;
    amountToPay = seconds * (table.hourlyRate / 3600);
  } else {
    amountToPay = parseFloat(
      calculateSegmentedPrice({
        startTimeMs,
        endTimeMs: endTimeMsForBilling,
        hourlyRate,
        saleFromHour: sales.saleFromHour,
        saleToHour: sales.saleToHour,
        saleHourlyRate: sales.saleHourlyRate,
        timezoneOffsetMinutes: 240,
      })
    );
  }

  return { durationForBilling, amountToPay, endTimeMsForBilling };
}

export function getClearedTableState(table) {
  return {
    ...table,
    name: table.gameType === "custom" ? "Blank Timer" : table.name,
    hourlyRate: table.gameType === "custom" ? null : table.hourlyRate ?? null,
    timerStartTime: null,
    elapsedTimeInSeconds: 0,
    isRunning: false,
    timerMode: "standard",
    initialCountdownSeconds: null,
    sessionStartTime: null,
    sessionEndTime: null,
    fitPass: false,
  };
}

