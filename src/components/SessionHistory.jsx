// src/components/SessionHistory.jsx
import React from 'react';
import { formatTime } from '../utils/utils';
import './SessionHistory.css';

const SessionHistory = ({ history }) => {
  if (!history || history.length === 0) {
    return (
      <div className="session-history-container">
        <h4>Session History</h4>
        <p>No sessions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="session-history-container">
      <h4>Session History</h4>
      <div className="history-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>End Time</th>
              <th>Duration</th>
              <th>Amount Paid</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {history.slice().reverse().map(session => ( // .slice().reverse() to show newest first without mutating
              <tr key={session.id}>
                <td>{session.tableName}</td>
                <td>{new Date(session.endTime).toLocaleString("en-GB", { timeZone: "Asia/Tbilisi" })}</td>
                <td>{formatTime(session.durationPlayed)}</td>
                <td>{session.amountPaid} GEL</td>
                <td>{session.sessionType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SessionHistory;