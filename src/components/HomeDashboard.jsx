import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import TableCard from "./TableCard";
import Sidebar from "./Sidebar";
import SessionHistory from "./SessionHistory";
import CocktailRecipes from "./CocktailRecipes";

/**
 * For each upcoming booking, decide which specific table IDs should show the
 * warning badge.  Rules:
 *  - Only show on tables whose gameType matches the booking (or any if no game_type).
 *  - Show on up to `tables_count` FREE tables (not running, no elapsed time).
 *  - If fewer free tables than needed, fill remaining slots with the
 *    EARLIEST-finishing busy table(s).
 *  Returns a Map<tableId, booking>.
 */
function buildTableBookingMap(tables, upcomingBookings) {
  const map = new Map();             // tableId → booking
  if (!upcomingBookings?.length) return map;

  const now = Date.now();
  const cutoff = now + 1.5 * 60 * 60 * 1000; // 1.5 h ahead

  // Sort bookings by start time (earliest first) so the first booking "claims" tables first
  const sorted = [...upcomingBookings]
    .filter((b) => b.booking_at && new Date(b.booking_at).getTime() <= cutoff && new Date(b.booking_at).getTime() > now)
    .sort((a, b) => new Date(a.booking_at) - new Date(b.booking_at));

  const claimed = new Set(); // table IDs already assigned to a booking

  for (const booking of sorted) {
    const needed = booking.tables_count || 1;
    const matchingTables = tables.filter((t) => {
      if (!t.isAvailable) return false;
      if (claimed.has(t.id)) return false;
      if (booking.game_type && booking.game_type !== t.gameType && t.gameType !== "custom") return false;
      return true;
    });

    // Separate into free vs busy
    const free = matchingTables.filter((t) => !t.isRunning && t.elapsedTimeInSeconds === 0);
    const busy = matchingTables.filter((t) => t.isRunning || t.elapsedTimeInSeconds > 0);

    // Sort busy tables by estimated finish time (earliest first)
    busy.sort((a, b) => {
      const finishA = estimateFinish(a, now);
      const finishB = estimateFinish(b, now);
      return finishA - finishB;
    });

    // Pick up to `needed` tables: prefer free, then fill with earliest-finishing busy
    const chosen = [];
    for (const t of free) {
      if (chosen.length >= needed) break;
      chosen.push(t);
    }
    for (const t of busy) {
      if (chosen.length >= needed) break;
      chosen.push(t);
    }

    for (const t of chosen) {
      map.set(t.id, booking);
      claimed.add(t.id);
    }
  }

  return map;
}

function estimateFinish(table, now) {
  if (!table.isRunning) return now; // already stopped, can be freed any time
  if (table.timerMode === "countdown" && table.initialCountdownSeconds && table.timerStartTime) {
    const elapsed = table.elapsedTimeInSeconds + (now - table.timerStartTime) / 1000;
    const remaining = Math.max(0, table.initialCountdownSeconds - elapsed);
    return now + remaining * 1000;
  }
  // Standard timer — unknown end; assume far future so it's lowest priority
  return now + 24 * 60 * 60 * 1000;
}

export default function HomeDashboard({
  tables,
  openStartModal,
  handleStopTimer,
  handlePayAndClear,
  handleToggleAvailability,
  handleTransferTimer,
  upcomingBookings,
  isSidebarOpen,
  cart,
  incrementQuantity,
  decrementQuantity,
  removeItem,
  calculateTotal,
  handleSubmit,
  addToCart,
  toggleSidebar,
  sessionHistory,
}) {
  const tableBookingMap = useMemo(
    () => buildTableBookingMap(tables, upcomingBookings),
    [tables, upcomingBookings]
  );

  return (
    <>
      <div className="tables-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onOpenStartModal={openStartModal}
            onStop={handleStopTimer}
            onPayAndClear={handlePayAndClear}
            handleToggleAvailability={handleToggleAvailability}
            onTransferTimer={handleTransferTimer}
            assignedBooking={tableBookingMap.get(table.id) || null}
          />
        ))}
      </div>
      {isSidebarOpen && (
        <Sidebar
          cart={cart}
          increment={incrementQuantity}
          decrement={decrementQuantity}
          remove={removeItem}
          total={calculateTotal}
          submit={handleSubmit}
          addToCart={addToCart}
          toggleSidebar={toggleSidebar}
        />
      )}
      <SessionHistory history={sessionHistory} />
      <CocktailRecipes />
      <Link className="analyticsButton" to="analytics">
        Analytics Page
      </Link>
    </>
  );
}

