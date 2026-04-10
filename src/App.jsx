// src/App.jsx
import React, { useState, useEffect, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import StartModal from "./components/StartModal";
import AnalyticsPage from "./pages/AnalyticsPage";
import SalesSettingsPage from "./pages/SalesSettingsPage";
import MenuAdminPage from "./pages/MenuAdminPage";
import BookingsPage from "./pages/BookingsPage";
import BookingPublicPage from "./pages/BookingPublicPage";
import BookingSuccessPage from "./pages/BookingSuccessPage";
import BookingCancelledPage from "./pages/BookingCancelledPage";
import ProductsAdminPage from "./pages/ProductsAdminPage";
import BlogAdminPage from "./pages/BlogAdminPage";
import EventsAdminPage from "./pages/EventsAdminPage";
import GlobalSoundButtons from "./components/GlobalSoundButtons";
import HomeDashboard from "./components/HomeDashboard";
import BookingNotifications from "./components/BookingNotifications";
import AdminAuthGate, { AdminLogoutButton } from "./components/admin/AdminAuthGate";
import { LanguageProvider } from "./i18n/LanguageContext";
import useCart from "./hooks/useCart";
import useTables from "./hooks/useTables";
import useBookingNotifications from "./hooks/useBookingNotifications";
import useActiveBookingsCount from "./hooks/useActiveBookingsCount";
import { playTableEndSound } from "./utils/utils";
import "./App.css";
import "./components/BookingNotifications.css";
import { HOURLY_RATE, LOCAL_STORAGE_TABLES_KEY, LOCAL_STORAGE_HISTORY_KEY } from './config';

// Public pages (lazy loaded)
const LandingPage = React.lazy(() => import("./pages/public/LandingPage"));
const ContactPage = React.lazy(() => import("./pages/public/ContactPage"));
const ProductDetailPage = React.lazy(() => import("./pages/public/ProductDetailPage"));
const BlogListPage = React.lazy(() => import("./pages/public/BlogListPage"));
const BlogPostPage = React.lazy(() => import("./pages/public/BlogPostPage"));
const EventsListPage = React.lazy(() => import("./pages/public/EventsListPage"));
const EventDetailPage = React.lazy(() => import("./pages/public/EventDetailPage"));

// ─── Staff portal (all internal pages, password-protected) ────────────────────
// role: "superadmin" | "staff" — staff has limited nav & routes
function StaffPortal({ role = "superadmin" }) {
  const isSuperadmin = role === "superadmin";
  const basePath = isSuperadmin ? "/superadmin" : "/staff";
  const [_, setTick] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { notifications, dismissNotification } = useBookingNotifications();
  const activeBookingsCount = useActiveBookingsCount();
  const { cart, addToCart, incrementQuantity, decrementQuantity, removeItem, calculateTotal, handleSubmit } = useCart();
  const {
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
  } = useTables();

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  // Tick every second to update running timers
  useEffect(() => {
    const intervalId = setInterval(() => {
      let needsVisualUpdate = false;

      setTables((prevTables) => {
        let tableStateChangedDueToCountdown = false;

        const newTables = prevTables.map((table) => {
          if (!table.isRunning) return table;

          needsVisualUpdate = true;
          if (
            table.timerMode === "countdown" &&
            table.initialCountdownSeconds &&
            table.timerStartTime
          ) {
            const elapsedSinceStart = (Date.now() - table.timerStartTime) / 1000;
            const totalPassedTime = table.elapsedTimeInSeconds + elapsedSinceStart;

            if (totalPassedTime >= table.initialCountdownSeconds) {
              playTableEndSound(table.id, table.gameType);
              tableStateChangedDueToCountdown = true;
              return {
                ...table,
                isRunning: false,
                elapsedTimeInSeconds: table.initialCountdownSeconds,
                timerStartTime: null,
              };
            }
          }
          return table;
        });

        return tableStateChangedDueToCountdown ? newTables : prevTables;
      });

      if (needsVisualUpdate) {
        setTick((prevTick) => prevTick + 1);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [setTables]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_TABLES_KEY, JSON.stringify(tables));
    } catch (e) {
      console.error("Tables Effect: Error saving tables to localStorage:", e);
    }
  }, [tables]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(sessionHistory));
    } catch (e) {
      console.error("SessionHistory Effect: Error saving history to localStorage:", e);
    }
  }, [sessionHistory]);

  const tableForModal = tables.find((t) => t.id === showModalForTableId);

  return (
    <div className="app">
      <header className="app-header">
        <Link className="logo" to={basePath}>
          <h1>
            <img src="/matchpoint-logo.png" alt="MatchPoint logo" className="header-logo-image" />
            MatchPoint {isSuperadmin ? "Admin" : "Staff"}
          </h1>
        </Link>
        <div className="nav-container">
          <Link className="nav-link" to={`${basePath}/menu`}>Manage Bar</Link>
          <Link className="nav-link nav-link-with-badge" to={`${basePath}/bookings`}>
            Bookings
            {activeBookingsCount > 0 && (
              <span className="booking-count-badge">{activeBookingsCount}</span>
            )}
          </Link>
          {isSuperadmin && <Link className="nav-link" to={`${basePath}/products`}>Products</Link>}
          {isSuperadmin && <Link className="nav-link" to={`${basePath}/blog`}>Blog</Link>}
          {isSuperadmin && <Link className="nav-link" to={`${basePath}/events`}>Events</Link>}
          {isSuperadmin && <Link className="nav-link" to={`${basePath}/sales`}>Sales</Link>}
          <Link className="nav-link home-link" to={basePath}>Home</Link>
          <button onClick={toggleSidebar} className="sidebar-toggle-btn">
            {isSidebarOpen ? "Close Bar" : "Open Bar"}
          </button>
          <AdminLogoutButton role={role} />
        </div>
      </header>

      <main className="main-content">
        <BookingNotifications notifications={notifications} onDismiss={dismissNotification} />
        <GlobalSoundButtons />
        <Routes>
          <Route
            path={basePath}
            element={
              <HomeDashboard
                tables={tables}
                openStartModal={openStartModal}
                handleStopTimer={handleStopTimer}
                handlePayAndClear={handlePayAndClear}
                handleToggleAvailability={handleToggleAvailability}
                handleTransferTimer={handleTransferTimer}
                isSidebarOpen={isSidebarOpen}
                cart={cart}
                incrementQuantity={incrementQuantity}
                decrementQuantity={decrementQuantity}
                removeItem={removeItem}
                calculateTotal={calculateTotal}
                handleSubmit={handleSubmit}
                addToCart={addToCart}
                toggleSidebar={toggleSidebar}
                sessionHistory={sessionHistory}
              />
            }
          />
          <Route
            path={`${basePath}/analytics`}
            element={
              <Suspense fallback={<div>Loading Analytics…</div>}>
                <AnalyticsPage />
              </Suspense>
            }
          />
          <Route path={`${basePath}/menu`} element={<MenuAdminPage />} />
          <Route path={`${basePath}/bookings`} element={<BookingsPage />} />
          {isSuperadmin && <Route path={`${basePath}/sales`} element={<SalesSettingsPage />} />}
          {isSuperadmin && <Route path={`${basePath}/products`} element={<ProductsAdminPage />} />}
          {isSuperadmin && <Route path={`${basePath}/blog`} element={<BlogAdminPage />} />}
          {isSuperadmin && <Route path={`${basePath}/events`} element={<EventsAdminPage />} />}
        </Routes>
      </main>

      {tableForModal && (
        <StartModal
          table={tableForModal}
          isOpen={!!showModalForTableId}
          onClose={closeStartModal}
          onStart={handleStartTimer}
        />
      )}

      <footer className="app-footer">
        <p>Hourly Rate: {HOURLY_RATE} GEL</p>
      </footer>
    </div>
  );
}

// ─── Root router — splits public pages from staff portal ───────────────
function AppContent() {
  const location = useLocation();

  // Superadmin routes — /superadmin/*
  if (location.pathname.startsWith("/superadmin")) {
    return (
      <AdminAuthGate role="superadmin">
        <StaffPortal role="superadmin" />
      </AdminAuthGate>
    );
  }

  // Staff routes — /staff/*
  if (location.pathname.startsWith("/staff")) {
    return (
      <AdminAuthGate role="staff">
        <StaffPortal role="staff" />
      </AdminAuthGate>
    );
  }

  // Public routes (with i18n)
  return (
    <LanguageProvider>
      <Suspense fallback={<div style={{ textAlign: "center", padding: "80px 24px", fontFamily: "Poppins, sans-serif" }}>Loading...</div>}>
        <Routes>
          {/* Landing */}
          <Route path="/" element={<LandingPage />} />

          {/* Booking */}
          <Route path="/book" element={<BookingPublicPage />} />
          <Route path="/book/success" element={<BookingSuccessPage />} />
          <Route path="/book/cancelled" element={<BookingCancelledPage />} />

          {/* Services/Products */}
          <Route path="/services/:id" element={<ProductDetailPage />} />

          {/* Blog */}
          <Route path="/blog" element={<BlogListPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />

          {/* Events */}
          <Route path="/events" element={<EventsListPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />

          {/* Contact */}
          <Route path="/contact" element={<ContactPage />} />

          {/* Fallback */}
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    </LanguageProvider>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
