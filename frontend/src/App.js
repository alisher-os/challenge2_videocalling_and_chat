import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import ChatWindow from './components/ChatWindow';
import LoginForm from './components/LoginForm';
import OnlineUsers from './components/OnlineUsers';
import VideoCall from './components/VideoCall';
import IncomingCall from './components/IncomingCall';

function App() {
  const [user, setUser] = useState(null);
  const [ws, setWs] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({}); // Track unread messages per user
  const [callState, setCallState] = useState(null); // null, 'calling', 'ringing', 'connected'
  const [incomingCall, setIncomingCall] = useState(null);
  const [currentCall, setCurrentCall] = useState(null);
  const [messageHistoryMeta, setMessageHistoryMeta] = useState({}); // Track pagination per chat
  const [loadingHistory, setLoadingHistory] = useState(false);
  const userRef = useRef(user);
  const onlineUsersRef = useRef(onlineUsers);
  const selectedUserRef = useRef(selectedUser);

  // Keep refs in sync
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Request notification permission when user logs in
  useEffect(() => {
    if (user && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          console.log('Notification permission:', permission);
        });
      }
    }
  }, [user]);

  const handleEndCall = useCallback(() => {
    if (currentCall && ws) {
      ws.send(JSON.stringify({
        type: 'CallEnd',
        to_user_id: currentCall.id
      }));
    }
    setCurrentCall(null);
    setCallState(null);
  }, [currentCall, ws]);

  const handleServerMessage = useCallback((message) => {
    console.log('Received message:', message);
    const currentUser = userRef.current;
    
    switch (message.type) {
      case 'LoginSuccess':
      case 'RegisterSuccess':
        console.log('Auth success:', message.user);
        setUser(prev => {
          const updated = { ...prev, id: message.user.id };
          userRef.current = updated;
          return updated;
        });
        break;
      
      case 'AuthError':
        console.error('Auth error:', message.message);
        alert('Authentication error: ' + message.message);
        break;

      case 'UserOnline':
        // If it's the current user, update their ID (backward compat)
        if (currentUser && !currentUser.id && message.user.username === currentUser.username) {
          console.log('Setting user ID:', message.user.id);
          setUser(prev => {
            const updated = { ...prev, id: message.user.id };
            userRef.current = updated;
            return updated;
          });
        } else if (currentUser) {
          const currentUserId = userRef.current?.id || currentUser.id;
          // Only add other users to online list (not ourselves)
          if (message.user.id !== currentUserId) {
            console.log('Adding online user:', message.user.username, 'Current user ID:', currentUserId);
            setOnlineUsers(prev => {
              const exists = prev.find(u => u.id === message.user.id);
              if (exists) {
                return prev.map(u => u.id === message.user.id ? message.user : u);
              }
              return [...prev, message.user];
            });
          }
        }
        break;
      
      case 'UserOffline':
        console.log('User offline:', message.user_id);
        setOnlineUsers(prev => prev.filter(u => u.id !== message.user_id));
        break;
      
      case 'OnlineUsers':
        console.log('Online users list received:', message.users);
        setOnlineUsers(prev => {
          const currentUserId = userRef.current?.id;
          if (currentUserId) {
            const filtered = message.users.filter(u => u.id !== currentUserId);
            console.log('Filtered online users (excluding self):', filtered);
            return filtered;
          } else {
            console.log('No user ID yet, showing all users:', message.users);
            return message.users;
          }
        });
        break;
      
      case 'MessageHistory':
        console.log('Message history received:', message.messages.length, 'messages');
        setLoadingHistory(false);
        
        if (message.messages.length > 0) {
          // Get the other user ID from the first message
          const firstMsg = message.messages[0];
          const currentUserId = userRef.current?.id;
          const otherUserId = firstMsg.from_user_id === currentUserId 
            ? firstMsg.to_user_id 
            : firstMsg.from_user_id;
          
          const key = [currentUserId, otherUserId].sort().join('-');
          
          setMessages(prev => {
            const existing = prev[key] || [];
            // Merge messages, avoiding duplicates
            const existingIds = new Set(existing.map(m => m.id));
            const newMessages = message.messages.filter(m => !existingIds.has(m.id));
            // Prepend new messages (they are older)
            return {
              ...prev,
              [key]: [...newMessages, ...existing]
            };
          });
          
          // Update pagination meta
          setMessageHistoryMeta(prev => ({
            ...prev,
            [key]: {
              totalCount: message.total_count,
              hasMore: message.has_more,
              loadedCount: (prev[key]?.loadedCount || 0) + message.messages.length
            }
          }));
        }
        break;
      
      case 'NewMessage':
        setMessages(prev => {
          const key = [message.message.from_user_id, message.message.to_user_id]
            .sort()
            .join('-');
          return {
            ...prev,
            [key]: [...(prev[key] || []), message.message]
          };
        });
        
        // Show notification if message is for current user and not from them
        const currentUserId = userRef.current?.id;
        if (currentUserId && message.message.to_user_id === currentUserId) {
          const fromUserId = message.message.from_user_id;
          
          // Increment unread count only if the chat is not currently open
          const currentSelectedUser = selectedUserRef.current;
          setUnreadCounts(prev => {
            const isCurrentlyViewing = currentSelectedUser?.id === fromUserId;
            if (isCurrentlyViewing) {
              return prev; // Don't increment if user is viewing this chat
            }
            return {
              ...prev,
              [fromUserId]: (prev[fromUserId] || 0) + 1
            };
          });
          
          // Find the sender's username
          const sender = onlineUsersRef.current.find(u => u.id === fromUserId);
          const senderName = sender?.username || 'Someone';
          
          // Show browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`New message from ${senderName}`, {
              body: message.message.content || 'Sent a file',
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: 'chat-message',
              requireInteraction: false
            });
            
            // Auto close after 5 seconds
            setTimeout(() => notification.close(), 5000);
            
            // Optional: Play a sound
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltryxnMpBSp+zPDajz4J');
              audio.volume = 0.3;
              audio.play().catch(() => {}); // Ignore errors if audio fails
            } catch (e) {
              // Silently fail if audio doesn't work
            }
          }
        }
        break;
      
      case 'MessageRead':
        setMessages(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            updated[key] = updated[key].map(msg => 
              msg.id === message.message_id 
                ? { ...msg, read: true }
                : msg
            );
          });
          return updated;
        });
        break;
      
      case 'Typing':
        setTypingUsers(prev => ({
          ...prev,
          [message.from_user_id]: message.is_typing
        }));
        setTimeout(() => {
          setTypingUsers(prev => ({
            ...prev,
            [message.from_user_id]: false
          }));
        }, 3000);
        break;
      
      case 'Success':
        console.log('Success:', message.message);
        break;
      
      case 'Error':
        console.error('Error:', message.message);
        break;
      
      case 'CallOffer':
        console.log('Incoming call from:', message.from_user_id);
        const caller = onlineUsersRef.current.find(u => u.id === message.from_user_id);
        if (caller) {
          setIncomingCall({ caller, offer: message.offer });
        }
        break;
      
      case 'CallAnswer':
        console.log('Call answered by:', message.from_user_id);
        setCallState('connected');
        break;
      
      case 'IceCandidate':
        console.log('Received ICE candidate from:', message.from_user_id);
        break;
      
      case 'MessageReaction':
        console.log('Message reaction:', message.message_id, message.user_id, message.emoji);
        setMessages(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            updated[key] = updated[key].map(msg => {
              if (msg.id === message.message_id) {
                const reactions = { ...(msg.reactions || {}) };
                if (message.emoji) {
                  reactions[message.user_id] = message.emoji;
                } else {
                  delete reactions[message.user_id];
                }
                return { ...msg, reactions };
              }
              return msg;
            });
          });
          return updated;
        });
        break;
      
      case 'CallEnd':
        console.log('Call ended by:', message.from_user_id);
        handleEndCall();
        break;
      
      default:
        // Only log unknown messages if they're not dev server messages
        const devServerMessages = ['hot', 'liveReload', 'reconnect', 'overlay', 'hash', 'warnings', 'errors'];
        if (!devServerMessages.includes(message.type)) {
          console.log('Unknown message type:', message.type);
        }
        break;
    }
  }, [handleEndCall]);

  useEffect(() => {
    if (user && !ws) {
      console.log('Attempting to connect to WebSocket...');
      // Use the current host instead of localhost for network access
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname;
      const wsUrl = `${wsProtocol}//${wsHost}:3002/ws`;
      console.log('WebSocket URL:', wsUrl);
      const websocket = new WebSocket(wsUrl);
      let isConnected = false;
      
      websocket.onopen = () => {
        console.log('WebSocket connected successfully!');
        isConnected = true;
        websocket.send(JSON.stringify({
          type: 'Login',
          username: user.username
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // Ignore React dev server messages
          const devServerMessages = ['hot', 'liveReload', 'reconnect', 'overlay', 'hash', 'warnings', 'errors'];
          if (devServerMessages.includes(message.type)) {
            return;
          }
          handleServerMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        if (isConnected) {
          // Only try to reconnect if we were previously connected
          setWs(null);
        } else {
          console.error('Failed to connect. Is the backend server running on port 3002?');
        }
      };

      setWs(websocket);

      return () => {
        websocket.close();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  const handleLogin = (username) => {
    setUser({ id: null, username });
  };

  const handleSendMessage = (content, fileData = null) => {
    if (ws && selectedUser) {
      const message = {
        type: 'SendMessage',
        to_user_id: selectedUser.id,
        content
      };
      
      if (fileData) {
        message.file_data = fileData.file_data;
        message.file_name = fileData.file_name;
        message.file_type = fileData.file_type;
        if (fileData.audio_duration) {
          message.audio_duration = fileData.audio_duration;
        }
      }
      
      ws.send(JSON.stringify(message));
    }
  };

  const handleMarkAsRead = (messageId) => {
    if (ws) {
      ws.send(JSON.stringify({
        type: 'MarkAsRead',
        message_id: messageId
      }));
    }
  };

  const handleTyping = (isTyping) => {
    if (ws && selectedUser) {
      ws.send(JSON.stringify({
        type: 'Typing',
        to_user_id: selectedUser.id,
        is_typing: isTyping
      }));
    }
  };

  const handleAddReaction = (messageId, emoji) => {
    if (ws) {
      ws.send(JSON.stringify({
        type: 'AddReaction',
        message_id: messageId,
        emoji: emoji
      }));
    }
  };

  const handleRemoveReaction = (messageId) => {
    if (ws) {
      ws.send(JSON.stringify({
        type: 'RemoveReaction',
        message_id: messageId
      }));
    }
  };

  const handleLoadMoreMessages = useCallback(() => {
    if (ws && selectedUser && user?.id && !loadingHistory) {
      const key = [user.id, selectedUser.id].sort().join('-');
      const meta = messageHistoryMeta[key];
      
      if (!meta || meta.hasMore) {
        setLoadingHistory(true);
        const offset = messages[key]?.length || 0;
        
        ws.send(JSON.stringify({
          type: 'GetMessageHistory',
          other_user_id: selectedUser.id,
          limit: 50,
          offset: offset
        }));
      }
    }
  }, [ws, selectedUser, user?.id, loadingHistory, messageHistoryMeta, messages]);

  const handleStartVideoCall = () => {
    if (selectedUser) {
      setCurrentCall(selectedUser);
      setCallState('calling');
    }
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      setCurrentCall({ ...incomingCall.caller, offer: incomingCall.offer });
      setCallState('connected');
      setIncomingCall(null);
    }
  };

  const handleRejectCall = () => {
    if (incomingCall && ws) {
      ws.send(JSON.stringify({
        type: 'CallEnd',
        to_user_id: incomingCall.caller.id
      }));
      setIncomingCall(null);
    }
  };

  const handleSelectUser = useCallback((selectedUserObj) => {
    setSelectedUser(selectedUserObj);
    // Clear unread count for this user
    setUnreadCounts(prev => {
      const updated = { ...prev };
      delete updated[selectedUserObj.id];
      return updated;
    });
    
    // Load message history for this conversation if we don't have any
    if (ws && user?.id) {
      const key = [user.id, selectedUserObj.id].sort().join('-');
      if (!messages[key] || messages[key].length === 0) {
        setLoadingHistory(true);
        ws.send(JSON.stringify({
          type: 'GetMessageHistory',
          other_user_id: selectedUserObj.id,
          limit: 50,
          offset: 0
        }));
      }
    }
  }, [ws, user?.id, messages]);

  if (!user) {
    return <LoginForm onLogin={handleLogin} />;
  }

  const messageKey = selectedUser && user.id
    ? [user.id, selectedUser.id].sort().join('-')
    : null;
  const currentMessages = messageKey ? (messages[messageKey] || []) : [];
  const currentMeta = messageKey ? messageHistoryMeta[messageKey] : null;

  const handleBackToUsers = () => {
    setSelectedUser(null);
  };

  return (
    <div className="app">
      <div className={`app-container ${selectedUser ? 'chat-active' : ''}`}>
        {(!selectedUser || window.innerWidth > 768) && (
          <OnlineUsers
            users={onlineUsers}
            selectedUser={selectedUser}
            onSelectUser={handleSelectUser}
            unreadCounts={unreadCounts}
          />
        )}
        {selectedUser ? (
          <ChatWindow
            currentUser={user}
            otherUser={selectedUser}
            messages={currentMessages}
            typing={typingUsers[selectedUser.id] || false}
            onSendMessage={handleSendMessage}
            onMarkAsRead={handleMarkAsRead}
            onTyping={handleTyping}
            onStartVideoCall={handleStartVideoCall}
            onAddReaction={handleAddReaction}
            onRemoveReaction={handleRemoveReaction}
            onBack={handleBackToUsers}
            onLoadMore={handleLoadMoreMessages}
            hasMoreMessages={currentMeta?.hasMore ?? true}
            loadingHistory={loadingHistory}
          />
        ) : (
          <div className="no-chat-selected">
            <h2>Select a user to start chatting</h2>
          </div>
        )}
      </div>

      {/* Incoming call modal */}
      {incomingCall && (
        <IncomingCall
          caller={incomingCall.caller}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Video call */}
      {currentCall && callState && (
        <VideoCall
          currentUser={user}
          otherUser={currentCall}
          ws={ws}
          callState={callState}
          onEndCall={handleEndCall}
          incomingOffer={currentCall.offer}
        />
      )}
    </div>
  );
}

export default App;
