import React from 'react';
import './OnlineUsers.css';

function OnlineUsers({ users, selectedUser, onSelectUser, unreadCounts = {} }) {
  return (
    <div className="online-users">
      <div className="online-users-header">
        <h2>Online Users</h2>
        <div className="online-indicator">
          <span className="dot"></span>
          <span>{users.length} online</span>
        </div>
      </div>
      <div className="users-list">
        {users.length === 0 ? (
          <div className="no-users">No other users online</div>
        ) : (
          users.map(user => (
            <div
              key={user.id}
              className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
              onClick={() => onSelectUser(user)}
            >
              <div className="user-info">
                <div className="user-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="user-details">
                  <div className="user-name">{user.username}</div>
                  <div className="user-status">
                    <span className="status-dot online"></span>
                    Online
                  </div>
                </div>
              </div>
              {unreadCounts[user.id] > 0 && (
                <div className="unread-badge">
                  {unreadCounts[user.id]}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default OnlineUsers;

