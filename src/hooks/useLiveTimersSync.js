import { useEffect, useRef } from "react";
import {
  fetchLiveTimers,
  upsertLiveTimers,
  subscribeToLiveTimerChanges,
} from "../services/supabaseData";

const LIVE_SYNC_FIELDS = [
  "name",
  "isAvailable",
  "timerStartTime",
  "elapsedTimeInSeconds",
  "isRunning",
  "timerMode",
  "initialCountdownSeconds",
  "sessionStartTime",
  "sessionEndTime",
  "fitPass",
  "gameType",
  "hourlyRate",
  "memberId",
  "memberSessionId",
  "memberName",
  "syncRevision",
];

function mergeRemoteTable(localTable, remoteTable) {
  if (!remoteTable) return localTable;
  const merged = { ...localTable };
  LIVE_SYNC_FIELDS.forEach((key) => {
    merged[key] = remoteTable[key];
  });
  return merged;
}

function areTablesEquivalentForSync(a, b) {
  if (!a || !b) return false;
  return LIVE_SYNC_FIELDS.every((key) => a[key] === b[key]);
}

function hasSyncRelevantDifference(a, b) {
  if (!a || !b) return true;
  return LIVE_SYNC_FIELDS.some((key) => key !== "syncRevision" && a[key] !== b[key]);
}

function getNextRevision(previousRevision = 0) {
  return Math.max(Date.now(), Number(previousRevision || 0) + 1);
}

export default function useLiveTimersSync(tables, setTables) {
  const isApplyingRemoteSyncRef = useRef(false);
  const hasBootstrappedRemoteRef = useRef(false);
  const latestTablesRef = useRef(tables);
  const pendingLocalSyncRef = useRef(false);
  const tableRevisionRef = useRef({});
  const lastSentTablesRef = useRef(tables);

  useEffect(() => {
    latestTablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    let isCancelled = false;
    let didLoadRemoteSnapshot = false;
    let shouldSeedFromLocal = false;

    const bootstrapLiveTimers = async () => {
      try {
        const remoteTables = await fetchLiveTimers();
        if (isCancelled) return;
        didLoadRemoteSnapshot = true;

        if (remoteTables.length > 0) {
          isApplyingRemoteSyncRef.current = true;
          shouldSeedFromLocal = false;
          tableRevisionRef.current = remoteTables.reduce((acc, table) => {
            acc[table.id] = Number(table.syncRevision || 0);
            return acc;
          }, {});
          setTables((prevTables) => {
            const localById = new Map(prevTables.map((t) => [t.id, t]));
            const merged = prevTables.map((table) => {
              const remote = remoteTables.find((rt) => rt.id === table.id);
              return mergeRemoteTable(table, remote);
            });
            // Defensive: pull in any remote rows that don't have a matching local entry
            // (e.g. localStorage was missing ids that exist in Supabase).
            remoteTables.forEach((remote) => {
              if (!localById.has(remote.id)) {
                merged.push(mergeRemoteTable(remote, remote));
              }
            });
            lastSentTablesRef.current = merged;
            return merged;
          });
        } else {
          shouldSeedFromLocal = true;
          const currentMaxRevision = Math.max(
            0,
            ...Object.values(tableRevisionRef.current).map((value) => Number(value || 0))
          );
          const revision = getNextRevision(currentMaxRevision);
          tableRevisionRef.current = latestTablesRef.current.reduce((acc, table) => {
            acc[table.id] = revision;
            return acc;
          }, {});
          lastSentTablesRef.current = latestTablesRef.current;
          await upsertLiveTimers(latestTablesRef.current, revision);
        }
      } catch (error) {
        console.error("Failed to bootstrap live timers:", error);
      } finally {
        hasBootstrappedRemoteRef.current = true;
        if (pendingLocalSyncRef.current && didLoadRemoteSnapshot && shouldSeedFromLocal) {
          pendingLocalSyncRef.current = false;
          const currentMaxRevision = Math.max(
            0,
            ...Object.values(tableRevisionRef.current).map((value) => Number(value || 0))
          );
          const revision = getNextRevision(currentMaxRevision);
          tableRevisionRef.current = latestTablesRef.current.reduce((acc, table) => {
            acc[table.id] = revision;
            return acc;
          }, {});
          lastSentTablesRef.current = latestTablesRef.current;
          upsertLiveTimers(latestTablesRef.current, revision).catch((error) => {
            console.error("Failed to flush pending live timer sync:", error);
          });
        } else if (didLoadRemoteSnapshot && !shouldSeedFromLocal) {
          // Remote snapshot exists; never flush local bootstrap state over it.
          pendingLocalSyncRef.current = false;
        } else if (pendingLocalSyncRef.current && !didLoadRemoteSnapshot) {
          // Keep pending=true so we do not overwrite remote state after a failed bootstrap fetch.
          // Local edits made after bootstrap will still sync through the normal tables effect.
          console.warn("Live timer bootstrap snapshot unavailable; skipping initial local sync flush.");
        }
      }
    };

    bootstrapLiveTimers();

    const unsubscribe = subscribeToLiveTimerChanges((remoteTable) => {
      if (isCancelled) return;
      const remoteRevision = Number(remoteTable.syncRevision || 0);
      const localRevision = Number(tableRevisionRef.current[remoteTable.id] || 0);
      if (remoteRevision <= localRevision) return;
      tableRevisionRef.current[remoteTable.id] = remoteRevision;
      isApplyingRemoteSyncRef.current = true;
      lastSentTablesRef.current = lastSentTablesRef.current.map((table) =>
        table.id === remoteTable.id ? mergeRemoteTable(table, remoteTable) : table
      );
      setTables((prevTables) =>
        prevTables.map((table) => {
          if (table.id !== remoteTable.id) return table;
          const merged = mergeRemoteTable(table, remoteTable);
          return areTablesEquivalentForSync(table, merged) ? table : merged;
        })
      );
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [setTables]);

  useEffect(() => {
    if (!hasBootstrappedRemoteRef.current) {
      const changedBeforeBootstrap = tables.some((table) => {
        const previous = lastSentTablesRef.current.find((t) => t.id === table.id);
        return hasSyncRelevantDifference(previous, table);
      });
      if (changedBeforeBootstrap) {
        pendingLocalSyncRef.current = true;
      }
      return;
    }
    if (isApplyingRemoteSyncRef.current) {
      isApplyingRemoteSyncRef.current = false;
      lastSentTablesRef.current = tables;
      return;
    }

    const changedTables = tables.filter((table) => {
      const previous = lastSentTablesRef.current.find((t) => t.id === table.id);
      return hasSyncRelevantDifference(previous, table);
    });
    if (changedTables.length === 0) return;

    const maxPreviousRevisionForChanged = changedTables.reduce((maxValue, table) => {
      const current = Number(tableRevisionRef.current[table.id] || 0);
      return Math.max(maxValue, current);
    }, 0);
    const revision = getNextRevision(maxPreviousRevisionForChanged);
    tableRevisionRef.current = changedTables.reduce(
      (acc, table) => {
        acc[table.id] = revision;
        return acc;
      },
      { ...tableRevisionRef.current }
    );

    lastSentTablesRef.current = tables;
    upsertLiveTimers(changedTables, revision).catch((error) => {
      console.error("Failed to sync live timers:", error);
    });
  }, [tables]);
}

