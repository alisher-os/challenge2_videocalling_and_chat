import React, { useState } from 'react';
import './LoginForm.css';

function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin(username.trim());
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Real-Time Chat</h1>
        <p>Enter your username to start chatting</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <button type="submit">Join Chat</button>
        </form>
      </div>
    </div>
  );
}

export default LoginForm;

