// src/components/TableCard.jsx
import React, { useState, useEffect, useRef } from "react";
import { formatTime, playTableEndSound } from "../utils/utils";
import "./TableCard.css";
import SwitchToggle from "./SwitchToggle";
import { HOURLY_RATE, LOCAL_STORAGE_SALES_SETTINGS_KEY } from "../config";
import { getTableCardViewModel, loadSalesSettings } from "../utils/tableCardView";
import TableCardUnavailable from "./table-card/TableCardUnavailable";

function formatShortTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-GB", { timeZone: "Asia/Tbilisi", hour: "2-digit", minute: "2-digit" });
}

const TableCard = ({ table, onOpenStartModal, onStop, onPayAndClear, handleToggleAvailability, onTransferTimer, assignedBooking }) => {
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

  const [showStopPrompt, setShowStopPrompt] = useState(false);
  const promptRef = useRef(null);

  // Close prompt on outside click
  useEffect(() => {
    if (!showStopPrompt) return;
    const handler = (e) => {
      if (promptRef.current && !promptRef.current.contains(e.target)) {
        setShowStopPrompt(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showStopPrompt]);

  // Auto-dismiss prompt when timer stops
  useEffect(() => {
    if (!isRunning) setShowStopPrompt(false);
  }, [isRunning]);

  // Pay & Clear: block if timer is still running (unless countdown ended)
  const handlePayClear = () => {
    if (isRunning && !isCountdownEnded) {
      setShowStopPrompt(true);
      return;
    }
    onPayAndClear(table.id);
  };

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
      {assignedBooking && (
        <div className="table-booking-warning">
          Booked {formatShortTime(assignedBooking.booking_at)} · {assignedBooking.customer_name}
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
      {(isRunning || elapsedTimeInSeconds > 0 || isCountdownEnded) && (
        <div className={`table-payment-badge ${timerMode === "countdown" ? "paid" : "unpaid"}`}>
          {timerMode === "countdown" ? "Paid" : "Unpaid"}
        </div>
      )}
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
        <div className="pay-clear-wrapper" ref={promptRef}>
          <button
            onClick={handlePayClear}
            className="pay-clear-btn"
            disabled={!canPayAndClear}
          >
            Pay & Clear
          </button>
          {showStopPrompt && (
            <div className="stop-prompt">
              Stop the timer first!
              <button
                className="stop-prompt-btn"
                onClick={() => {
                  onStop(table.id);
                  setShowStopPrompt(false);
                }}
              >
                Stop Now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableCard;
