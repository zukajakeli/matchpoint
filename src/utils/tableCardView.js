import { calculateSegmentedPrice } from "./utils";
import { loadGameRates, FITPASS_RATE } from "./gameRates";

export function loadSalesSettings(storageKey) {
  let sales = { saleFromHour: 12, saleToHour: 15, saleHourlyRate: 12 };
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) sales = { ...sales, ...JSON.parse(raw) };
  } catch {
    // ignore invalid local sales settings
  }
  return sales;
}

export function getTableCardViewModel(table, hourlyRate, sales) {
  const {
    timerStartTime,
    elapsedTimeInSeconds,
    isRunning,
    timerMode,
    initialCountdownSeconds,
    sessionStartTime,
    fitPass,
    gameType,
    hourlyRate: customHourlyRate,
    extraEquipment,
  } = table;
  const rates = loadGameRates();
  const equipmentBonus = extraEquipment ? rates.equipmentBonus : 0;

  let displayTimeSeconds = 0;
  let currentCost = "0.00";
  let sessionCost = "0.00";
  const hasCustomRate =
    typeof customHourlyRate === "number" && customHourlyRate > 0;

  if (timerMode === "countdown") {
    const totalPassedTime =
      isRunning && timerStartTime
        ? elapsedTimeInSeconds + (Date.now() - timerStartTime) / 1000
        : elapsedTimeInSeconds;
    displayTimeSeconds = initialCountdownSeconds
      ? initialCountdownSeconds - totalPassedTime
      : 0;

    if (gameType === "foosball" || gameType === "airhockey") {
      const gameRate = rates[gameType] || 12;
      const ratePerSecond = gameRate / 3600;
      sessionCost = ((initialCountdownSeconds || 0) * ratePerSecond).toFixed(2);
    } else if (fitPass) {
      const ratePerSecond = FITPASS_RATE / (30 * 60);
      sessionCost = ((initialCountdownSeconds || 0) * ratePerSecond).toFixed(2);
    } else if (hasCustomRate) {
      const ratePerSecond = (customHourlyRate + equipmentBonus) / 3600;
      sessionCost = ((initialCountdownSeconds || 0) * ratePerSecond).toFixed(2);
    } else {
      const startMs = sessionStartTime || Date.now();
      const endMs = (sessionStartTime || Date.now()) + (initialCountdownSeconds || 0) * 1000;
      sessionCost = calculateSegmentedPrice({
        startTimeMs: startMs,
        endTimeMs: endMs,
        hourlyRate: hourlyRate + equipmentBonus,
        saleFromHour: sales.saleFromHour,
        saleToHour: sales.saleToHour,
        saleHourlyRate: sales.saleHourlyRate + equipmentBonus,
      });
    }
    currentCost = sessionCost;
    if (isRunning && displayTimeSeconds < 0) displayTimeSeconds = 0;
  } else {
    displayTimeSeconds =
      isRunning && timerStartTime
        ? elapsedTimeInSeconds + (Date.now() - timerStartTime) / 1000
        : elapsedTimeInSeconds;
    if (gameType === "foosball" || gameType === "airhockey") {
      const gameRate = rates[gameType] || 12;
      const ratePerSecond = gameRate / 3600;
      currentCost = (displayTimeSeconds * ratePerSecond).toFixed(2);
    } else if (fitPass) {
      const ratePerSecond = FITPASS_RATE / (30 * 60);
      currentCost = (displayTimeSeconds * ratePerSecond).toFixed(2);
    } else if (hasCustomRate) {
      const ratePerSecond = (customHourlyRate + equipmentBonus) / 3600;
      currentCost = (displayTimeSeconds * ratePerSecond).toFixed(2);
    } else {
      const startMs = sessionStartTime || Date.now() - displayTimeSeconds * 1000;
      const endMs = isRunning ? Date.now() : startMs + displayTimeSeconds * 1000;
      currentCost = calculateSegmentedPrice({
        startTimeMs: startMs,
        endTimeMs: endMs,
        hourlyRate: hourlyRate + equipmentBonus,
        saleFromHour: sales.saleFromHour,
        saleToHour: sales.saleToHour,
        saleHourlyRate: sales.saleHourlyRate + equipmentBonus,
      });
    }
    sessionCost = currentCost;
  }

  const canStart =
    !isRunning &&
    (!initialCountdownSeconds ||
      displayTimeSeconds <= 0 ||
      timerMode === "standard");
  const canPayAndClear =
    (timerMode === "standard" && (elapsedTimeInSeconds > 0 || isRunning)) ||
    (timerMode === "countdown" && initialCountdownSeconds > 0);
  const isCountdownEnded =
    timerMode === "countdown" && !isRunning && displayTimeSeconds <= 0;

  return {
    displayTimeSeconds,
    currentCost,
    sessionCost,
    canStart,
    canPayAndClear,
    isCountdownEnded,
  };
}

