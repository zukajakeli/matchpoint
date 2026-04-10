import React from "react";
import { Bar } from "react-chartjs-2";
import {
  buildDayUsageData,
  buildHourUsageData,
  buildTableUsageData,
  getAverageDurationMinutes,
} from "../../utils/analyticsCharts";

export default function MonthlyAnalyticsSection({ monthKey, rows }) {
  const dayUsageData = buildDayUsageData(rows);
  const hourUsageData = buildHourUsageData(rows);
  const tableUsageData = buildTableUsageData(rows);
  const avgDuration = getAverageDurationMinutes(rows);
  const monthLabel = new Date(`${monthKey}-01`).toLocaleString("default", {
    timeZone: "Asia/Tbilisi",
    month: "long",
    year: "numeric",
  });

  return (
    <div key={monthKey} style={{ marginBottom: "60px" }}>
      <h3>{monthLabel}</h3>
      <p>Average session duration: {avgDuration.toFixed(1)} minutes</p>

      <div style={{ marginBottom: "40px" }}>
        <h4>Day of Week Usage</h4>
        <Bar data={dayUsageData} />
      </div>

      <div style={{ marginBottom: "40px" }}>
        <h4>Hour of Day Usage</h4>
        <Bar data={hourUsageData} />
      </div>

      <div style={{ marginBottom: "40px" }}>
        <h4>Most Used Tables</h4>
        <Bar data={tableUsageData} />
      </div>
    </div>
  );
}

