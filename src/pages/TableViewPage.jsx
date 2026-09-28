import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBookings,
  subscribeToBookingsChanges,
  createBooking,
  updateBooking,
  deleteBooking,
  autoAssignBookingTables,
} from "../services/supabaseData";
import TableViewBookingModal from "../components/table-view/TableViewBookingModal";
import { BOOKABLE_TABLES, BOOKABLE_TABLE_IDS, getBookableTable } from "../utils/bookableTables";
import { loadVenueHours } from "../utils/venueHours";
import "./TableViewPage.css";

const DRAG_THRESHOLD_PX = 5;
const PENDING_PAYMENT_WINDOW_MS = 20 * 60 * 1000;

const DAY_START_HOUR = 15;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT_PX = 64;
const COUNT_UP_PREDICTION_MS = 1.5 * 60 * 60 * 1000;

function formatHourLabel(hour24) {
  const normalized = ((hour24 % 24) + 24) % 24;
  if (normalized === 0) return "12 AM";
  if (normalized === 12) return "12 PM";
  if (normalized < 12) return `${normalized} AM`;
  return `${normalized - 12} PM`;
}

function formatRangeLabel(startMs, endMs) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const fmt = (d) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${fmt(start)} – ${fmt(end)}`;
}

function buildLocalDateTimeInput(date, hour, minute = 0) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function buildLocalDateTimeInputFromMs(ms) {
  const d = new Date(ms);
  return buildLocalDateTimeInput(d, d.getHours(), d.getMinutes());
}

function parseHourFromMs(ms, dayStart) {
  const dayMs = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate()
  ).getTime();
  return (ms - dayMs) / (60 * 60 * 1000);
}

// Does this booking hold its tables? Mirrors public.active_bookings_between:
// staff and paid bookings do; online bookings only while their 20-minute
// payment window is open; failed ones never.
function isBookingHoldingTables(booking, nowMs) {
  const status = booking.payment_status;
  if (!status || status === "none" || status === "paid") return true;
  if (status === "pending") {
    return nowMs - new Date(booking.created_at).getTime() < PENDING_PAYMENT_WINDOW_MS;
  }
  return false;
}

function bookingTimeRange(booking) {
  const startMs = booking.booking_at
    ? new Date(booking.booking_at).getTime()
    : booking.created_at
    ? new Date(booking.created_at).getTime()
    : null;
  if (!startMs) return null;
  const hours =
    booking.hours_count && Number(booking.hours_count) > 0 ? Number(booking.hours_count) : 1;
  return { startMs, endMs: startMs + hours * 60 * 60 * 1000 };
}

function bookingBadge(booking) {
  if (booking.booking_source !== "online") return null;
  if (booking.payment_status === "paid") return "Online · Paid";
  if (booking.payment_status === "pending") return "Online · Awaiting payment";
  return "Online";
}

// Tables for a booking dropped on `targetId`: the target first, then the
// nearest free tables of the same game so a group sits side by side.
function pickTablesAround(targetId, count, busyIds) {
  const target = getBookableTable(targetId);
  if (!target) return [targetId];
  const group = BOOKABLE_TABLES.filter((t) => t.gameType === target.gameType).map((t) => t.id);
  const ordered = [...group].sort((a, b) => {
    const da = Math.abs(a - targetId);
    const db = Math.abs(b - targetId);
    return da !== db ? da - db : b - a;
  });
  const picked = ordered.filter((id) => id === targetId || !busyIds.has(id)).slice(0, Math.max(1, count));
  return picked.sort((a, b) => a - b);
}

function isSameLocalDay(aMs, bDate) {
  const a = new Date(aMs);
  return (
    a.getFullYear() === bDate.getFullYear() &&
    a.getMonth() === bDate.getMonth() &&
    a.getDate() === bDate.getDate()
  );
}

export default function TableViewPage({ tables = [] }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [bookings, setBookings] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [modalState, setModalState] = useState(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [draggingState, setDraggingState] = useState(null);
  const [assigningIds, setAssigningIds] = useState([]);
  const [assignMessage, setAssignMessage] = useState("");
  const gridBodyRef = useRef(null);
  const columnsRef = useRef(null);
  const dragStartRef = useRef(null);
  const recentDragEndRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await fetchBookings();
        setBookings(rows);
      } catch (error) {
        console.error("Failed to load bookings for table view:", error);
      }
    };
    load();

    const unsubscribe = subscribeToBookingsChanges((payload) => {
      const { eventType, new: newBooking, old: oldBooking } = payload;
      if (eventType === "INSERT" && newBooking) {
        setBookings((prev) => {
          if (prev.some((b) => b.id === newBooking.id)) return prev;
          return [newBooking, ...prev];
        });
      }
      if (eventType === "UPDATE" && newBooking) {
        if (newBooking.is_done) {
          setBookings((prev) => prev.filter((b) => b.id !== newBooking.id));
        } else {
          setBookings((prev) =>
            prev.map((b) => (b.id === newBooking.id ? newBooking : b))
          );
        }
      }
      if (eventType === "DELETE" && oldBooking) {
        setBookings((prev) => prev.filter((b) => b.id !== oldBooking.id));
      }
    });

    return () => unsubscribe();
  }, []);

  // Start the grid at opening time when the venue opens before 15:00.
  const dayStartHour = useMemo(() => {
    const open = Number(loadVenueHours()[selectedDate.getDay()]?.open);
    return Number.isFinite(open) ? Math.min(DAY_START_HOUR, Math.floor(open)) : DAY_START_HOUR;
  }, [selectedDate]);

  const isViewingToday = useMemo(() => {
    return isSameLocalDay(now, selectedDate);
  }, [now, selectedDate]);

  const liveTimerBlocks = useMemo(() => {
    if (!isViewingToday) return [];
    const blocks = [];
    tables.forEach((table) => {
      if (!BOOKABLE_TABLE_IDS.includes(table.id)) return;
      const hasActivity =
        table.isRunning ||
        (table.elapsedTimeInSeconds || 0) > 0 ||
        (table.timerMode === "countdown" && (table.initialCountdownSeconds || 0) > 0);
      if (!hasActivity) return;

      const startMs = table.sessionStartTime || null;
      if (!startMs) return;

      const isCountdown =
        table.timerMode === "countdown" && !!table.initialCountdownSeconds;
      const isCountUp = !isCountdown;
      let endMs;
      let isPredicted = false;

      if (isCountdown) {
        endMs = startMs + table.initialCountdownSeconds * 1000;
      } else if (table.isRunning) {
        const projected = startMs + COUNT_UP_PREDICTION_MS;
        endMs = Math.max(projected, now);
        isPredicted = true;
      } else {
        endMs = table.sessionEndTime || startMs + (table.elapsedTimeInSeconds || 0) * 1000;
      }

      if (!isSameLocalDay(startMs, selectedDate)) return;
      if (endMs <= startMs) return;

      blocks.push({
        id: `live-${table.id}`,
        tableId: table.id,
        startMs,
        endMs,
        title: table.name || `Table ${table.id}`,
        kind: "live",
        isRunning: table.isRunning,
        isCountUp,
        isPredicted,
      });
    });
    return blocks;
  }, [tables, now, selectedDate, isViewingToday]);

  // Bookings for the selected day that currently hold tables.
  const dayBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const range = bookingTimeRange(booking);
        return range && isSameLocalDay(range.startMs, selectedDate) && isBookingHoldingTables(booking, now);
      }),
    [bookings, selectedDate, now]
  );

  const bookingBlocks = useMemo(() => {
    const blocks = [];
    dayBookings.forEach((booking) => {
      const { startMs, endMs } = bookingTimeRange(booking);
      const tableIds = Array.isArray(booking.table_ids) ? booking.table_ids : [];
      tableIds.forEach((tableId) => {
        if (!BOOKABLE_TABLE_IDS.includes(Number(tableId))) return;
        blocks.push({
          id: `booking-${booking.id}-t${tableId}`,
          tableId: Number(tableId),
          startMs,
          endMs,
          title: booking.customer_name || "Booking",
          kind: "booking",
          bookingId: booking.id,
          booking,
        });
      });
    });
    return blocks;
  }, [dayBookings]);

  // Bookings with no table numbers yet (older online bookings, staff
  // bookings entered without tables): shown in the "Needs a table" tray.
  const unassignedBlocks = useMemo(
    () =>
      dayBookings
        .filter((booking) => !(Array.isArray(booking.table_ids) && booking.table_ids.length > 0))
        .map((booking) => ({
          id: `unassigned-${booking.id}`,
          tableId: null,
          ...bookingTimeRange(booking),
          title: booking.customer_name || "Booking",
          kind: "booking",
          bookingId: booking.id,
          booking,
          lockTime: true,
        }))
        .sort((a, b) => a.startMs - b.startMs),
    [dayBookings]
  );

  const blocksByTable = useMemo(() => {
    const grouped = new Map();
    BOOKABLE_TABLE_IDS.forEach((id) => grouped.set(id, []));
    const draggedTrayBlock = unassignedBlocks.find(
      (block) => draggingState?.block?.id === block.id
    );
    [...liveTimerBlocks, ...bookingBlocks, ...(draggedTrayBlock ? [draggedTrayBlock] : [])].forEach((block) => {
      const isDraggingThis =
        draggingState && draggingState.block && draggingState.block.id === block.id;
      let displayBlock = block;
      let displayTableId = block.tableId;

      if (isDraggingThis) {
        displayTableId = draggingState.currentTableId;
        displayBlock = {
          ...block,
          startMs: draggingState.currentStartMs,
          endMs: draggingState.currentStartMs + draggingState.durationMs,
          isDragging: true,
        };
      }

      if (!grouped.has(displayTableId)) return;
      grouped.get(displayTableId).push(displayBlock);
    });
    return grouped;
  }, [liveTimerBlocks, bookingBlocks, unassignedBlocks, draggingState]);

  const totalHours = DAY_END_HOUR - dayStartHour;

  const computeBlockStyle = (block) => {
    const startHour = parseHourFromMs(block.startMs, selectedDate);
    const endHour = parseHourFromMs(block.endMs, selectedDate);
    const top = Math.max(0, (startHour - dayStartHour) * HOUR_HEIGHT_PX);
    const bottom = Math.min(
      totalHours * HOUR_HEIGHT_PX,
      (endHour - dayStartHour) * HOUR_HEIGHT_PX
    );
    const height = Math.max(20, bottom - top);
    return { top, height };
  };

  const computeNowLineTop = () => {
    if (!isViewingToday) return null;
    const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
    if (hour < dayStartHour || hour > DAY_END_HOUR) return null;
    return (hour - dayStartHour) * HOUR_HEIGHT_PX;
  };

  const handleColumnClick = (e, tableId) => {
    if (Date.now() - recentDragEndRef.current < 250) return;
    if (e.target.closest(".table-view-block")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const totalHeight = totalHours * HOUR_HEIGHT_PX;
    const clampedY = Math.max(0, Math.min(totalHeight, offsetY));
    const hourFloat = dayStartHour + clampedY / HOUR_HEIGHT_PX;
    const hour = Math.min(
      DAY_END_HOUR - 1,
      Math.max(dayStartHour, Math.floor(hourFloat))
    );

    setModalState({
      mode: "create",
      bookingDateTime: buildLocalDateTimeInput(selectedDate, hour, 0),
      tableIds: [tableId],
      bookingName: "",
      hoursCount: "1",
    });
  };

  const openEditModal = useCallback((block) => {
    if (block.kind !== "booking") return;
    const booking = block.booking;
    if (!booking) return;
    setModalState({
      mode: "edit",
      bookingId: booking.id,
      bookingDateTime: booking.booking_at
        ? buildLocalDateTimeInputFromMs(new Date(booking.booking_at).getTime())
        : "",
      tableIds: Array.isArray(booking.table_ids) ? [...booking.table_ids] : [],
      bookingName: booking.customer_name || "",
      hoursCount:
        booking.hours_count !== null && booking.hours_count !== undefined
          ? String(booking.hours_count)
          : "",
      booking,
    });
  }, []);

  const handleBlockPointerDown = (block, e) => {
    if (block.kind !== "booking") return;
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    dragStartRef.current = {
      block,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      started: false,
    };
  };

  const commitDrag = useCallback((state) => {
    const { block, currentTableId, currentStartMs } = state;
    const originalTableId = block.tableId;
    const originalStartMs = block.startMs;

    if (
      originalTableId !== null &&
      currentTableId === originalTableId &&
      currentStartMs === originalStartMs
    ) {
      return;
    }

    const booking = block.booking;
    if (!booking) return;

    const existingIds = Array.isArray(booking.table_ids) ? booking.table_ids : [];
    let newTableIds;
    if (originalTableId === null) {
      // Dropped from the tray: this table plus the nearest free ones.
      const busy = new Set(
        bookingBlocks
          .filter(
            (b) =>
              b.bookingId !== booking.id &&
              b.startMs < block.endMs &&
              b.endMs > block.startMs
          )
          .map((b) => b.tableId)
      );
      newTableIds = pickTablesAround(Number(currentTableId), booking.tables_count || 1, busy);
    } else {
      newTableIds = Array.from(
        new Set(
          existingIds.map((id) =>
            Number(id) === Number(originalTableId) ? Number(currentTableId) : Number(id)
          )
        )
      ).sort((a, b) => a - b);
    }

    const newBookingAt = block.lockTime ? booking.booking_at : new Date(currentStartMs).toISOString();
    const previousBooking = booking;

    setBookings((prev) =>
      prev.map((b) =>
        b.id === booking.id
          ? { ...b, booking_at: newBookingAt, table_ids: newTableIds }
          : b
      )
    );

    updateBooking(booking.id, {
      ...(block.lockTime ? {} : { bookingAt: newBookingAt }),
      tableIds: newTableIds,
    }).catch((error) => {
      console.error("Failed to update booking via drag:", error);
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? previousBooking : b))
      );
    });
  }, [bookingBlocks]);

  useEffect(() => {
    const computeDragPosition = (clientX, clientY) => {
      const columnsEl = columnsRef.current;
      if (!columnsEl) return null;
      const rect = columnsEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const colWidth = rect.width / BOOKABLE_TABLE_IDS.length;
      const x = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
      const colIndex = Math.max(
        0,
        Math.min(BOOKABLE_TABLE_IDS.length - 1, Math.floor(x / colWidth))
      );
      const tableId = BOOKABLE_TABLE_IDS[colIndex];

      const y = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
      const hourFloat = dayStartHour + y / HOUR_HEIGHT_PX;
      const hour = Math.max(
        dayStartHour,
        Math.min(DAY_END_HOUR - 1, Math.floor(hourFloat))
      );

      const newDate = new Date(selectedDate);
      newDate.setHours(hour, 0, 0, 0);
      return { tableId, startMs: newDate.getTime() };
    };

    const handlePointerMove = (e) => {
      const dragInfo = dragStartRef.current;
      if (!dragInfo) return;

      const dx = e.clientX - dragInfo.startX;
      const dy = e.clientY - dragInfo.startY;

      if (!dragInfo.started) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragInfo.started = true;
        const block = dragInfo.block;
        const initial =
          computeDragPosition(e.clientX, e.clientY) || {
            tableId: block.tableId,
            startMs: block.startMs,
          };
        setDraggingState({
          block,
          currentTableId: initial.tableId ?? BOOKABLE_TABLE_IDS[0],
          currentStartMs: block.lockTime ? block.startMs : initial.startMs,
          durationMs: block.endMs - block.startMs,
        });
        e.preventDefault();
        return;
      }

      const pos = computeDragPosition(e.clientX, e.clientY);
      if (!pos) return;
      e.preventDefault();
      setDraggingState((prev) =>
        prev
          ? {
              ...prev,
              currentTableId: pos.tableId,
              currentStartMs: prev.block.lockTime ? prev.block.startMs : pos.startMs,
            }
          : null
      );
    };

    const handlePointerUp = () => {
      const dragInfo = dragStartRef.current;
      dragStartRef.current = null;

      if (!dragInfo) return;

      if (!dragInfo.started) {
        setDraggingState(null);
        openEditModal(dragInfo.block);
        return;
      }

      recentDragEndRef.current = Date.now();
      setDraggingState((prev) => {
        if (prev) commitDrag(prev);
        return null;
      });
    };

    const handlePointerCancel = () => {
      dragStartRef.current = null;
      setDraggingState(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [selectedDate, dayStartHour, openEditModal, commitDrag]);

  const handleSubmitBooking = async (formState) => {
    if (isSubmittingBooking) return;
    try {
      setIsSubmittingBooking(true);
      if (modalState?.mode === "edit" && modalState.bookingId) {
        const updated = await updateBooking(modalState.bookingId, {
          customerName: formState.bookingName.trim(),
          hoursCount:
            formState.hoursCount === "" ? null : Number(formState.hoursCount),
          bookingAt: formState.bookingDateTime
            ? new Date(formState.bookingDateTime).toISOString()
            : null,
          tableIds: formState.tableIds,
        });
        setBookings((prev) =>
          prev.map((b) => (b.id === updated.id ? updated : b))
        );
      } else {
        const created = await createBooking({
          customerName: formState.bookingName.trim(),
          tablesCount: formState.tableIds.length || 1,
          hoursCount:
            formState.hoursCount === "" ? null : Number(formState.hoursCount),
          bookingAt: formState.bookingDateTime
            ? new Date(formState.bookingDateTime).toISOString()
            : null,
          tableIds: formState.tableIds,
        });
        setBookings((prev) => {
          if (prev.some((b) => b.id === created.id)) return prev;
          return [created, ...prev];
        });
      }
      setModalState(null);
    } catch (error) {
      console.error("Failed to save booking from table view:", error);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleAutoAssign = async (bookingIds) => {
    setAssignMessage("");
    setAssigningIds((prev) => [...prev, ...bookingIds]);
    const failed = [];
    for (const id of bookingIds) {
      try {
        const tableIds = await autoAssignBookingTables(id);
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, table_ids: tableIds } : b)));
      } catch (error) {
        console.error("Failed to auto-assign booking:", error);
        const booking = bookings.find((b) => b.id === id);
        failed.push(booking?.customer_name || "a booking");
      }
    }
    setAssigningIds((prev) => prev.filter((id) => !bookingIds.includes(id)));
    if (failed.length > 0) {
      setAssignMessage(
        `No free tables for ${failed.join(", ")} — drag onto a table to place it anyway.`
      );
    }
  };

  const handleDeleteBooking = async () => {
    if (!modalState?.bookingId) return;
    if (isSubmittingBooking) return;
    try {
      setIsSubmittingBooking(true);
      await deleteBooking(modalState.bookingId);
      setBookings((prev) => prev.filter((b) => b.id !== modalState.bookingId));
      setModalState(null);
    } catch (error) {
      console.error("Failed to delete booking:", error);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const goPrevDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 1);
      return next;
    });
  };

  const goNextDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      return next;
    });
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  };

  const dateLabel = useMemo(() => {
    return selectedDate.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate]);

  const nowLineTop = computeNowLineTop();

  return (
    <div className="table-view-page">
      <div className="table-view-toolbar">
        <div className="table-view-nav">
          <button className="admin-btn" type="button" onClick={goPrevDay}>
            ‹ Prev
          </button>
          <button className="admin-btn admin-btn-primary" type="button" onClick={goToday}>
            Today
          </button>
          <button className="admin-btn" type="button" onClick={goNextDay}>
            Next ›
          </button>
        </div>
        <div className="table-view-date">{dateLabel}</div>
      </div>

      {unassignedBlocks.length > 0 && (
        <div className="table-view-tray">
          <div className="table-view-tray-header">
            <span className="table-view-tray-title">
              Needs a table <span className="table-view-tray-count">{unassignedBlocks.length}</span>
            </span>
            <span className="table-view-tray-hint">Drag onto a table, or let us pick</span>
            <button
              type="button"
              className="admin-btn admin-btn-primary table-view-tray-auto-all"
              disabled={assigningIds.length > 0}
              onClick={() => handleAutoAssign(unassignedBlocks.map((b) => b.bookingId))}
            >
              ✨ Auto-assign all
            </button>
          </div>
          <div className="table-view-tray-items">
            {unassignedBlocks.map((block) => {
              const { booking } = block;
              const badge = bookingBadge(booking);
              const isBusy = assigningIds.includes(booking.id);
              const isDragging = draggingState?.block?.id === block.id;
              return (
                <div
                  key={block.id}
                  className={`table-view-tray-chip${isDragging ? " is-dragging" : ""}${
                    booking.booking_source === "online" ? " online" : ""
                  }${booking.payment_status === "pending" ? " pending" : ""}`}
                  onPointerDown={(e) => handleBlockPointerDown(block, e)}
                  title="Drag onto a table column, or click to edit"
                >
                  <div className="table-view-tray-chip-main">
                    <span className="table-view-tray-chip-name">{block.title}</span>
                    <span className="table-view-tray-chip-meta">
                      {formatRangeLabel(block.startMs, block.endMs)} · {booking.tables_count} table
                      {booking.tables_count > 1 ? "s" : ""}
                      {badge ? ` · ${badge}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="table-view-tray-chip-auto"
                    disabled={isBusy}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleAutoAssign([booking.id])}
                    aria-label={`Auto-assign tables for ${block.title}`}
                  >
                    {isBusy ? "…" : "✨ Auto"}
                  </button>
                </div>
              );
            })}
          </div>
          {assignMessage && <p className="table-view-tray-message">{assignMessage}</p>}
        </div>
      )}

      <div className="table-view-grid" style={{ "--table-view-cols": BOOKABLE_TABLE_IDS.length }}>
        <div className="table-view-grid-header">
          <div className="table-view-time-col-header">GMT+04</div>
          {BOOKABLE_TABLE_IDS.map((id) => {
            const liveTable = tables.find((t) => t.id === id);
            return (
              <div className="table-view-col-header" key={id}>
                <div className="table-view-col-header-label">
                  {liveTable?.name || getBookableTable(id)?.name || `Table ${id}`}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="table-view-grid-body"
          ref={gridBodyRef}
          style={{ height: totalHours * HOUR_HEIGHT_PX }}
        >
          <div
            className="table-view-time-col"
            style={{ height: totalHours * HOUR_HEIGHT_PX }}
          >
            {Array.from({ length: totalHours + 1 }).map((_, idx) => {
              const hour = dayStartHour + idx;
              const top = idx * HOUR_HEIGHT_PX;
              const isFirst = idx === 0;
              const isLast = idx === totalHours;
              const labelClass = `table-view-time-label${
                isFirst ? " is-first" : ""
              }${isLast ? " is-last" : ""}`;
              return (
                <div className={labelClass} key={hour} style={{ top }}>
                  {formatHourLabel(hour)}
                </div>
              );
            })}
          </div>

          <div className="table-view-columns" ref={columnsRef}>
            {BOOKABLE_TABLE_IDS.map((tableId) => {
              const blocks = blocksByTable.get(tableId) || [];
              const isDropTarget =
                draggingState && draggingState.currentTableId === tableId;
              return (
                <div
                  className={`table-view-column ${
                    isDropTarget ? "is-drop-target" : ""
                  }`}
                  key={tableId}
                  onClick={(e) => handleColumnClick(e, tableId)}
                >
                  {Array.from({ length: totalHours }).map((_, idx) => (
                    <div
                      className="table-view-hour-slot"
                      key={idx}
                      style={{ height: HOUR_HEIGHT_PX }}
                    />
                  ))}
                  {blocks.map((block) => {
                    const { top, height } = computeBlockStyle(block);
                    const isDraggable = block.kind === "booking";
                    const className = [
                      "table-view-block",
                      block.kind === "live" ? "live" : "booking",
                      block.isRunning ? "running" : "",
                      block.isCountUp ? "countup" : "",
                      block.isPredicted ? "predicted" : "",
                      isDraggable ? "clickable" : "",
                      block.isDragging ? "dragging" : "",
                      block.booking?.booking_source === "online" ? "online" : "",
                      block.booking?.payment_status === "pending" ? "pending" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={block.id}
                        className={className}
                        style={{ top, height }}
                        title={`${block.title} • ${formatRangeLabel(
                          block.startMs,
                          block.endMs
                        )}${block.isPredicted ? " (projected 1.5h)" : ""}${
                          isDraggable ? " (drag to reschedule)" : ""
                        }`}
                        onPointerDown={
                          isDraggable
                            ? (e) => handleBlockPointerDown(block, e)
                            : undefined
                        }
                      >
                        <div className="table-view-block-title">{block.title}</div>
                        <div className="table-view-block-time">
                          {formatRangeLabel(block.startMs, block.endMs)}
                        </div>
                        {block.booking && bookingBadge(block.booking) && (
                          <div className="table-view-block-badge">{bookingBadge(block.booking)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {nowLineTop !== null && (
            <div className="table-view-now-line" style={{ top: nowLineTop }}>
              <span className="table-view-now-dot" />
            </div>
          )}
        </div>
      </div>

      {modalState && (
        <TableViewBookingModal
          initialState={modalState}
          isSubmitting={isSubmittingBooking}
          isEditing={modalState.mode === "edit"}
          tableOptions={BOOKABLE_TABLES}
          onSubmit={handleSubmitBooking}
          onDelete={modalState.mode === "edit" ? handleDeleteBooking : undefined}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
