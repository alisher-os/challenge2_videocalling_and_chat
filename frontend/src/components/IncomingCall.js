import React from 'react';
import './IncomingCall.css';

function IncomingCall({ caller, onAccept, onReject }) {
  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-modal">
        <div className="caller-avatar">
          {caller.username.charAt(0).toUpperCase()}
        </div>
        <h2>{caller.username}</h2>
        <p>Incoming video call...</p>
        
        <div className="call-actions">
          <button className="reject-btn" onClick={onReject}>
            <span className="icon">📞</span>
            <span>Decline</span>
          </button>
          <button className="accept-btn" onClick={onAccept}>
            <span className="icon">📹</span>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default IncomingCall;

