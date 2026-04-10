// src/components/TableCard.jsx
import React from "react";
import { formatTime, playTableEndSound } from "../utils/utils";
import "./TableCard.css";
import SwitchToggle from "./SwitchToggle";
import { HOURLY_RATE, LOCAL_STORAGE_SALES_SETTINGS_KEY } from "../config";
import { getTableCardViewModel, loadSalesSettings } from "../utils/tableCardView";
import TableCardUnavailable from "./table-card/TableCardUnavailable";

const GAME_TYPE_MAP = {
  pingpong: "pingpong",
  foosball: "foosball",
  airhockey: "airhockey",
  playstation: "playstation",
};

// Returns the soonest upcoming paid booking for this card's game type within 1.5 hours.
function getSoonestBooking(upcomingBookings, gameType) {
  if (!upcomingBookings || upcomingBookings.length === 0) return null;
  const cutoff = Date.now() + 1.5 * 60 * 60 * 1000;
  const matches = upcomingBookings.filter((b) => {
    if (!b.booking_at) return false;
    const t = new Date(b.booking_at).getTime();
    if (t > cutoff) return false;
    // If game_type is specified on the booking, it must match this card
    if (b.game_type && GAME_TYPE_MAP[b.game_type] && b.game_type !== gameType) return false;
    return true;
  });
  if (matches.length === 0) return null;
  // Return the earliest one
  return matches.reduce((a, b) =>
    new Date(a.booking_at) <= new Date(b.booking_at) ? a : b
  );
}

function formatShortTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const TableCard = ({ table, onOpenStartModal, onStop, onPayAndClear, handleToggleAvailability, onTransferTimer, upcomingBookings }) => {
  const {
    name,
    isAvailable,
    elapsedTimeInSeconds,
    isRunning,
    timerMode,
    initialCountdownSeconds,
    gameType,
  } = table;
  const sales = loadSalesSettings(LOCAL_STORAGE_SALES_SETTINGS_KEY);
  const {
    displayTimeSeconds,
    currentCost,
    sessionCost,
    canStart,
    canPayAndClear,
    isCountdownEnded,
  } = getTableCardViewModel(table, HOURLY_RATE, sales);

  const soonestBooking = getSoonestBooking(upcomingBookings, gameType);

  if (!isAvailable) {
    return (
      <TableCardUnavailable
        table={table}
        name={name}
        isAvailable={isAvailable}
        handleToggleAvailability={handleToggleAvailability}
      />
    );
  }

  const handleDragStart = (e) => {
    // mark source table id
    e.dataTransfer.setData("text/plain", String(table.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const fromIdStr = e.dataTransfer.getData("text/plain");
    const fromId = parseInt(fromIdStr, 10);
    if (!Number.isFinite(fromId)) return;
    if (fromId === table.id) return;
    if (typeof onTransferTimer === 'function') {
      onTransferTimer(fromId, table.id);
    }
  };

  return (
    <div
      className={`table-card ${isRunning ? "running" : ""} ${
        timerMode === "countdown" ? "countdown-mode" : ""
      } ${gameType ? `game-${gameType}` : ''} `}
      draggable={isRunning || elapsedTimeInSeconds > 0 || (timerMode === 'countdown' && initialCountdownSeconds > 0)}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      title="Drag to another table to transfer the timer"
    >
      {soonestBooking && (
        <div className="table-booking-warning">
          Booked {formatShortTime(soonestBooking.booking_at)} · {soonestBooking.tables_count} table{soonestBooking.tables_count > 1 ? "s" : ""}
        </div>
      )}
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <SwitchToggle isAvailable={isAvailable} tableId={table.id} handleToggleAvailability={handleToggleAvailability} />
      </div>
      <h3>
        <div>{name || "Custom Timer"}</div>
      </h3>
      <div className="timer-mode-display">
        Mode:{" "}
        {timerMode === "countdown"
          ? `Countdown (${formatTime(initialCountdownSeconds || 0)})`
          : "Standard Timer"}
      </div>
      {isCountdownEnded ? (
        <div className="timer-ended-indicator">Time's Up!</div>
      ) : (
        <div className="timer-display">{formatTime(displayTimeSeconds)}</div>
      )}
      <div className="cost-display">
        {timerMode === "countdown" && initialCountdownSeconds > 0
          ? `Session Cost: ${sessionCost} GEL`
          : `Current Cost: ${currentCost} GEL`}
      </div>
      <div className="controls">
        <button
          onClick={() => playTableEndSound(table.id, table.gameType)}
          className="start-btn"
          title="Play table sound"
          style={{ flexGrow: 0 }}
        >
          🔊
        </button>
        {canStart && (
          <button
            onClick={() => onOpenStartModal(table.id)}
            className="start-btn"
          >
            Start
          </button>
        )}
        {isRunning && (
          <button onClick={() => onStop(table.id)} className="stop-btn">
            Stop
          </button>
        )}
        <button
          onClick={() => onPayAndClear(table.id)}
          className="pay-clear-btn"
          disabled={!canPayAndClear}
        >
          Pay & Clear
        </button>
      </div>
    </div>
  );
};

export default TableCard;
