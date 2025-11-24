import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';

function ChatWindow({
  currentUser,
  otherUser,
  messages,
  typing,
  onSendMessage,
  onMarkAsRead,
  onTyping,
  onStartVideoCall,
  onBack
}) {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const hasTypedRef = useRef(false);
  const markedAsReadRef = useRef(new Set());
  const fileInputRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
    // Mark messages as read when they're viewed (only once per message)
    if (currentUser && currentUser.id) {
      messages.forEach(msg => {
        if (msg.to_user_id === currentUser.id && !msg.read && !markedAsReadRef.current.has(msg.id)) {
          markedAsReadRef.current.add(msg.id);
          onMarkAsRead(msg.id);
        }
      });
    }
  }, [messages, currentUser, onMarkAsRead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    
    if (!hasTypedRef.current) {
      hasTypedRef.current = true;
      onTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
      hasTypedRef.current = false;
    }, 1000);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      setSelectedFile(file);

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreview(reader.result);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedFile) {
      // Send file
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result;
        onSendMessage(input.trim() || `Sent ${selectedFile.name}`, {
          file_data: base64Data,
          file_name: selectedFile.name,
          file_type: selectedFile.type
        });
        setInput('');
        clearFile();
      };
      reader.readAsDataURL(selectedFile);
    } else if (input.trim()) {
      // Send text only
      onSendMessage(input.trim());
      setInput('');
    }

    onTyping(false);
    hasTypedRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const renderMessageContent = (message) => {
    const hasFile = message.file_data && message.file_name;
    const isImage = hasFile && message.file_type?.startsWith('image/');

    return (
      <>
        {isImage ? (
          <div className="message-image-container">
            <img 
              src={message.file_data} 
              alt={message.file_name}
              className="message-image"
              onClick={() => window.open(message.file_data, '_blank')}
            />
          </div>
        ) : hasFile ? (
          <div className="message-file-container">
            <a 
              href={message.file_data} 
              download={message.file_name}
              className="message-file-link"
            >
              📎 {message.file_name}
            </a>
          </div>
        ) : null}
        {message.content && <div className="message-text">{message.content}</div>}
      </>
    );
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        {onBack && (
          <button className="back-btn" onClick={onBack}>
            ‹
          </button>
        )}
        <div className="chat-header-user">
          <div className="chat-avatar">
            {otherUser.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="chat-username">{otherUser.username}</div>
            <div className="chat-status">
              <span className="status-dot online"></span>
              Online
            </div>
          </div>
        </div>
        {onStartVideoCall && (
          <button className="video-call-btn" onClick={onStartVideoCall}>
            📹 Video Call
          </button>
        )}
      </div>
      
      <div className="chat-messages">
        {messages.map((message) => {
          const isOwn = message.from_user_id === currentUser.id;
          return (
            <div
              key={message.id}
              className={`message ${isOwn ? 'own' : 'other'}`}
            >
              <div className="message-content">
                {renderMessageContent(message)}
              </div>
              <div className="message-meta">
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                {isOwn && (
                  <span className={`read-indicator ${message.read ? 'read' : 'unread'}`}>
                    {message.read ? '✓✓' : '✓'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {filePreview && (
        <div className="file-preview">
          <div className="file-preview-content">
            {selectedFile?.type.startsWith('image/') ? (
              <img src={filePreview} alt="Preview" className="preview-image" />
            ) : (
              <div className="preview-file">
                📎 {selectedFile?.name}
              </div>
            )}
            <button className="clear-file-btn" onClick={clearFile}>
              ✕
            </button>
          </div>
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*,application/pdf,.doc,.docx,.txt"
          style={{ display: 'none' }}
        />
        <button 
          type="button" 
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach file or photo"
        >
          📎
        </button>
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={handleInputChange}
        />
        <button type="submit" className="send-button" disabled={!input.trim() && !selectedFile}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatWindow;
