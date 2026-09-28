import { useState, useCallback, useRef } from "react";
import { playSound } from "../utils/utils";
import { v4 as uuidv4 } from "uuid";
import { SOUNDS } from "../utils/constants";
import { initializeTables, initializeHistory } from "../utils/storage";
import {
  createSessionHistoryRecord,
  startMemberSession,
  updateMemberSessionTimer,
  completeMemberSession,
  recordMemberSession,
  reassignMemberSession,
  cancelMemberSession,
} from "../services/supabaseData";
import useLiveTimersSync from "./useLiveTimersSync";
import {
  calculateBillingSummary,
  getClearedTableState,
  getFinalElapsedTimeInSeconds,
} from "../utils/tableBilling";
import { HOURLY_RATE, LOCAL_STORAGE_SALES_SETTINGS_KEY } from '../config';

export default function useTables() {
    const [tables, setTables] = useState(initializeTables);
    const [sessionHistory, setSessionHistory] = useState(initializeHistory);
    const [showModalForTableId, setShowModalForTableId] = useState(null);
    useLiveTimersSync(tables, setTables);

    // Latest tables for the membership side effects below, which run after
    // (not inside) the state updates.
    const tablesRef = useRef(tables);
    tablesRef.current = tables;

    const patchTable = useCallback((tableId, fields, onlyIf = () => true) => {
      setTables((prev) =>
        prev.map((t) => (t.id === tableId && onlyIf(t) ? { ...t, ...fields } : t))
      );
    }, []);

    // ── Club membership ────────────────────────────────────────────────
    // A table's member session lives in the DB (member_sessions); the table
    // only carries memberId / memberName / memberSessionId, synced to every
    // device through live_timers. Failures never block the timer itself:
    // Pay & Clear records the session in one go if START didn't reach the DB.
    const openMemberSession = useCallback(
      async (table, member, startedAtMs) => {
        try {
          const sessionId = await startMemberSession({
            memberId: member.id,
            table,
            startedAt: startedAtMs,
            purchasedSeconds:
              table.timerMode === "countdown" ? Math.round(table.initialCountdownSeconds || 0) : null,
          });
          patchTable(table.id, { memberSessionId: sessionId }, (t) => t.memberId === member.id);
        } catch (error) {
          console.error("Failed to start member session:", error);
        }
      },
      [patchTable]
    );

    // Attach, change or detach the member on a table (any timer state).
    const handleAttachMember = useCallback(
      async (tableId, member) => {
        const table = tablesRef.current.find((t) => t.id === tableId);
        if (!table) return;
        const sessionId = table.memberSessionId;

        if (!member) {
          patchTable(tableId, { memberId: null, memberName: null, memberSessionId: null });
          if (sessionId) {
            cancelMemberSession(sessionId, "Member removed from timer").catch((error) =>
              console.error("Failed to detach member session:", error)
            );
          }
          return;
        }

        const memberName = `${member.first_name} ${member.last_name}`.trim();
        patchTable(tableId, { memberId: member.id, memberName });
        if (sessionId) {
          if (table.memberId !== member.id) {
            reassignMemberSession(sessionId, member.id).catch((error) =>
              console.error("Failed to move member session:", error)
            );
          }
          return;
        }
        const hasTimer =
          table.isRunning || table.elapsedTimeInSeconds > 0 || (table.initialCountdownSeconds || 0) > 0;
        if (hasTimer) {
          openMemberSession(table, member, table.sessionStartTime || Date.now());
        }
      },
      [patchTable, openMemberSession]
    );

    const openStartModal = useCallback((tableId) => {
        setShowModalForTableId(tableId);
    }, []);
    
    const closeStartModal = useCallback(() => {
        setShowModalForTableId(null);
    }, []);

    const handleToggleAvailability = (tableId) => {
        setTables(prevTables =>
          prevTables.map(table =>
            table.id === tableId
              ? { ...table, isAvailable: !table.isAvailable }
              : table
          )
        );
      };

      const handleStartTimer = useCallback(
    (tableId, mode, durationMinutes, options = {}) => {
      setTables((prevTables) =>
        prevTables.map((table) => {
          if (table.id === tableId) {
            const hasCustomName = typeof options.customName === "string" && options.customName.trim().length > 0;
            const customHourlyRate = Number(options.customHourlyRate);
            const hasCustomHourlyRate = Number.isFinite(customHourlyRate) && customHourlyRate > 0;
            const nextName = hasCustomName ? options.customName.trim() : table.name;
            const nextHourlyRate = hasCustomHourlyRate ? customHourlyRate : table.hourlyRate ?? null;

            if (
              mode === "countdown" &&
              durationMinutes &&
              durationMinutes > 0
            ) {
              return {
                ...table,
                name: nextName,
                hourlyRate: nextHourlyRate,
                timerMode: "countdown",
                initialCountdownSeconds: durationMinutes * 60,
                elapsedTimeInSeconds: 0, // Reset elapsed for new countdown
                isRunning: true,
                timerStartTime: Date.now(),
                sessionStartTime: Date.now(),
                sessionEndTime: null,
                fitPass: !!options.fitPass,
                extraEquipment: !!options.extraEquipment,
              };
            } else {
              // Standard mode
              return {
                ...table,
                name: nextName,
                hourlyRate: nextHourlyRate,
                timerMode: "standard",
                initialCountdownSeconds: null,
                // elapsedTimeInSeconds is kept if resuming standard timer (or 0 if new)
                isRunning: true,
                timerStartTime: Date.now(),
                sessionStartTime: table.sessionStartTime ?? Date.now(),
                sessionEndTime: null,
                fitPass: !!options.fitPass,
                extraEquipment: !!options.extraEquipment,
              };
            }
          }
          return table;
        })
      );
      closeStartModal();

      // Member picked in the Start modal (undefined = modal didn't touch it).
      if (options.member !== undefined) {
        const before = tablesRef.current.find((t) => t.id === tableId);
        const startedAtMs =
          mode === "standard" && before?.sessionStartTime ? before.sessionStartTime : Date.now();
        const table = {
          ...before,
          timerMode: mode === "countdown" && durationMinutes > 0 ? "countdown" : "standard",
          initialCountdownSeconds:
            mode === "countdown" && durationMinutes > 0 ? durationMinutes * 60 : null,
          sessionStartTime: startedAtMs,
        };
        const member = options.member;
        if (member && before?.memberSessionId && before.memberId === member.id) {
          // Resuming/restarting the same member's timer: same session.
          updateMemberSessionTimer({ sessionId: before.memberSessionId, table }).catch((error) =>
            console.error("Failed to update member session:", error)
          );
        } else if (member && !before?.memberSessionId) {
          patchTable(tableId, {
            memberId: member.id,
            memberName: `${member.first_name} ${member.last_name}`.trim(),
          });
          openMemberSession(table, member, startedAtMs);
        } else {
          handleAttachMember(tableId, member);
        }
      }
    },
    [closeStartModal, patchTable, openMemberSession, handleAttachMember]
  );

  // Fixed-time session bought more time: same session, longer purchase.
  const handleExtendTimer = useCallback(
    (tableId, minutes) => {
      const table = tablesRef.current.find((t) => t.id === tableId);
      if (!table || table.timerMode !== "countdown" || !minutes) return;
      const extended = {
        ...table,
        initialCountdownSeconds: (table.initialCountdownSeconds || 0) + minutes * 60,
        // "Time's up" tables resume from where they stopped
        isRunning: true,
        timerStartTime: table.isRunning ? table.timerStartTime : Date.now(),
        sessionEndTime: null,
      };
      patchTable(tableId, {
        initialCountdownSeconds: extended.initialCountdownSeconds,
        isRunning: true,
        timerStartTime: extended.timerStartTime,
        sessionEndTime: null,
      });
      if (table.memberSessionId) {
        updateMemberSessionTimer({ sessionId: table.memberSessionId, table: extended }).catch((error) =>
          console.error("Failed to extend member session:", error)
        );
      }
    },
    [patchTable]
  );

  const handleStopTimer = useCallback((tableId) => {
    setTables((prevTables) =>
      prevTables.map((table) => {
        if (table.id === tableId && table.isRunning && table.timerStartTime) {
          const elapsedSinceLastStart =
            (Date.now() - table.timerStartTime) / 1000;
          return {
            ...table,
            isRunning: false,
            elapsedTimeInSeconds:
              table.elapsedTimeInSeconds + elapsedSinceLastStart,
            timerStartTime: null,
            sessionEndTime: Date.now(),
          };
        }
        return table;
      })
    );
  }, []);

  const handlePayAndClear = useCallback(
    (tableId) => {
      console.log(`handlePayAndClear: Called for tableId: ${tableId}`);
      const tableToClear = tables.find((t) => t.id === tableId);

      if (!tableToClear) {
        console.error(`handlePayAndClear: Table with id ${tableId} not found.`);
        return;
      }
      const finalElapsedTimeInSeconds = getFinalElapsedTimeInSeconds(tableToClear);
      const sessionTypeForHistory = tableToClear.timerMode;
      const { durationForBilling, amountToPay, endTimeMsForBilling } =
        calculateBillingSummary({
          table: tableToClear,
          finalElapsedTimeInSeconds,
          hourlyRate: HOURLY_RATE,
          salesSettingsStorageKey: LOCAL_STORAGE_SALES_SETTINGS_KEY,
        });

      const newSessionDetails = {
        id: uuidv4(),
        tableId: tableToClear.id,
        tableName: tableToClear.name,
        endTime: new Date(endTimeMsForBilling).toISOString(),
        durationPlayed: durationForBilling,
        amountPaid: amountToPay,
        sessionType: sessionTypeForHistory,
      };
      console.log(
        "handlePayAndClear: Created newSessionDetails:",
        newSessionDetails
      );

      // Update local React state for tables
      setTables((prevTables) =>
        prevTables.map((table) => {
          if (table.id === tableId) {
            playSound(SOUNDS.PAYMENT_SUCCESS);
            console.log(`handlePayAndClear: Resetting table: ${table.name}`);
            return getClearedTableState(table);
          }
          return table;
        })
      );

      // Update local React state for session history (and thus local storage via its useEffect)
      console.log(
        "handlePayAndClear: newSessionDetails is valid, attempting to update local sessionHistory."
      );
      setSessionHistory((prevHistory) => {
        const updatedHistory = [...prevHistory, newSessionDetails];
        console.log(
          "handlePayAndClear: New local history to be set:",
          updatedHistory
        );
        return updatedHistory;
      });

      createSessionHistoryRecord(newSessionDetails).catch((error) => {
        console.error("Failed to save session history to Supabase:", error);
      });

      // Club member: this completes the session → visit + points in the DB.
      if (tableToClear.memberSessionId) {
        completeMemberSession({
          sessionId: tableToClear.memberSessionId,
          endedAt: endTimeMsForBilling,
          durationSeconds: durationForBilling,
          amount: amountToPay,
        }).catch((error) => console.error("Failed to complete member session:", error));
      } else if (tableToClear.memberId) {
        recordMemberSession({
          memberId: tableToClear.memberId,
          table: tableToClear,
          startedAt: tableToClear.sessionStartTime || endTimeMsForBilling - durationForBilling * 1000,
          endedAt: endTimeMsForBilling,
          durationSeconds: durationForBilling,
          amount: amountToPay,
        }).catch((error) => console.error("Failed to record member session:", error));
      }
    },
    [
      tables,
      setTables,
      setSessionHistory,
    ]
  );

  const handleTransferTimer = useCallback((fromTableId, toTableId) => {
    if (fromTableId === toTableId) return;
    const source = tablesRef.current.find((t) => t.id === fromTableId);
    const destination = tablesRef.current.find((t) => t.id === toTableId);
    const memberFields = {
      memberId: source?.memberId ?? null,
      memberName: source?.memberName ?? null,
      memberSessionId: source?.memberSessionId ?? null,
    };

    setTables((prevTables) => {
      const fromTable = prevTables.find((t) => t.id === fromTableId);
      const toTable = prevTables.find((t) => t.id === toTableId);
      if (!fromTable || !toTable) return prevTables;
      const toTableBusy =
        toTable.isRunning ||
        toTable.elapsedTimeInSeconds > 0 ||
        (toTable.timerMode === "countdown" && (toTable.initialCountdownSeconds || 0) > 0);
      if (toTableBusy) return prevTables;

      // Calculate total elapsed on source (including running segment)
      let totalElapsedOnSource = fromTable.elapsedTimeInSeconds || 0;
      if (fromTable.isRunning && fromTable.timerStartTime) {
        totalElapsedOnSource += (Date.now() - fromTable.timerStartTime) / 1000;
      }

      return prevTables.map((table) => {
        if (table.id === fromTableId) {
          // Reset source table
          return {
            ...table,
            timerStartTime: null,
            elapsedTimeInSeconds: 0,
            isRunning: false,
            timerMode: "standard",
            initialCountdownSeconds: null,
              sessionStartTime: null,
              sessionEndTime: null,
              fitPass: false,
              hourlyRate: table.hourlyRate ?? null,
              memberId: null,
              memberName: null,
              memberSessionId: null,
          };
        }
        if (table.id === toTableId) {
          // Start on destination based on source mode
          if (fromTable.timerMode === "countdown") {
            const initial = fromTable.initialCountdownSeconds || 0;
            const remaining = Math.max(0, initial - totalElapsedOnSource);
            if (remaining <= 0) {
              // Countdown finished on transfer; reflect finished state
              return {
                ...table,
                ...memberFields,
                timerMode: "countdown",
                initialCountdownSeconds: initial,
                elapsedTimeInSeconds: initial,
                isRunning: false,
                timerStartTime: null,
                sessionEndTime: null,
              };
            }
            // Preserve original purchased countdown for cost display
            // Continue with accumulated elapsed time so remaining stays correct
            return {
              ...table,
              ...memberFields,
              timerMode: "countdown",
              initialCountdownSeconds: initial,
              elapsedTimeInSeconds: totalElapsedOnSource,
              isRunning: true,
              timerStartTime: Date.now(),
              // carry over pricing flags
              sessionStartTime: fromTable.sessionStartTime ?? Date.now(),
              sessionEndTime: null,
              fitPass: !!fromTable.fitPass,
              hourlyRate: fromTable.hourlyRate ?? table.hourlyRate ?? null,
            };
          }
          // Standard timer: continue from accumulated elapsed
          return {
            ...table,
            ...memberFields,
            timerMode: "standard",
            initialCountdownSeconds: null,
            elapsedTimeInSeconds: totalElapsedOnSource,
            isRunning: true,
            timerStartTime: Date.now(),
            sessionStartTime: fromTable.sessionStartTime ?? Date.now(),
            sessionEndTime: null,
            fitPass: !!fromTable.fitPass,
            hourlyRate: fromTable.hourlyRate ?? table.hourlyRate ?? null,
          };
        }
        return table;
      });
    });

    const destinationBusy =
      destination &&
      (destination.isRunning ||
        destination.elapsedTimeInSeconds > 0 ||
        (destination.timerMode === "countdown" && (destination.initialCountdownSeconds || 0) > 0));
    if (source?.memberSessionId && destination && !destinationBusy) {
      updateMemberSessionTimer({
        sessionId: source.memberSessionId,
        table: { ...source, id: destination.id, name: destination.name },
      }).catch((error) => console.error("Failed to move member session:", error));
    }
  }, []);

  return {
    tables, 
    setTables, 
    sessionHistory, 
    showModalForTableId,  
    openStartModal, 
    closeStartModal, 
    handleToggleAvailability, 
    handleStartTimer, 
    handleStopTimer, 
    handlePayAndClear, 
    handleTransferTimer,
    handleExtendTimer,
    handleAttachMember,
  };

}