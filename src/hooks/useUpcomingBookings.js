import { useState, useEffect } from "react";
import { fetchUpcomingPaidBookings, subscribeToBookingsChanges } from "../services/supabaseData";
import { isSupabaseConfigured } from "../services/supabaseClient";

// Fetches confirmed (paid) online bookings within the next 3 hours.
// Refreshes on Realtime changes so staff always see the latest state.
export default function useUpcomingBookings() {
  const [upcomingBookings, setUpcomingBookings] = useState([]);

  const load = async () => {
    if (!isSupabaseConfigured) return;
    try {
      const rows = await fetchUpcomingPaidBookings();
      // Keep only bookings starting in the next 3 hours
      const cutoff = new Date(Date.now() + 3 * 60 * 60 * 1000);
      setUpcomingBookings(
        rows.filter((b) => b.booking_at && new Date(b.booking_at) <= cutoff)
      );
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    load();

    const unsubscribe = subscribeToBookingsChanges(() => {
      load();
    });

    // Also refresh on window focus
    window.addEventListener("focus", load);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", load);
    };
  }, []);

  return upcomingBookings;
}
