import React from "react";
import { Link } from "react-router-dom";
import TableCard from "./TableCard";
import Sidebar from "./Sidebar";
import SessionHistory from "./SessionHistory";
import CocktailRecipes from "./CocktailRecipes";
import useUpcomingBookings from "../hooks/useUpcomingBookings";

export default function HomeDashboard({
  tables,
  openStartModal,
  handleStopTimer,
  handlePayAndClear,
  handleToggleAvailability,
  handleTransferTimer,
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
  const upcomingBookings = useUpcomingBookings();

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
            upcomingBookings={upcomingBookings}
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

