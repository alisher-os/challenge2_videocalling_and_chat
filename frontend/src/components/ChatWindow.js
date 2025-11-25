import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';
import VoiceRecorder from './VoiceRecorder';

function ChatWindow({
  currentUser,
  otherUser,
  messages,
  typing,
  onSendMessage,
  onMarkAsRead,
  onTyping,
  onStartVideoCall,
  onAddReaction,
  onRemoveReaction,
  onBack,
  onLoadMore,
  hasMoreMessages,
  loadingHistory
}) {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [showReactionPicker, setShowReactionPicker] = useState(null); // message id
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const hasTypedRef = useRef(false);
  const markedAsReadRef = useRef(new Set());
  const fileInputRef = useRef(null);

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

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

  const handleReactionClick = (messageId, emoji) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const currentReaction = message.reactions?.[currentUser.id];
    
    if (currentReaction === emoji) {
      // Remove reaction if clicking same emoji
      onRemoveReaction(messageId);
    } else {
      // Add or change reaction
      onAddReaction(messageId, emoji);
    }
    
    setShowReactionPicker(null);
  };

  const renderReactions = (message) => {
    const reactions = message.reactions || {};
    const reactionCounts = {};
    
    // Count reactions by emoji
    Object.values(reactions).forEach(emoji => {
      reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
    });

    if (Object.keys(reactionCounts).length === 0) return null;

    return (
      <div className="message-reactions">
        {Object.entries(reactionCounts).map(([emoji, count]) => (
          <div 
            key={emoji} 
            className={`reaction-bubble ${reactions[currentUser.id] === emoji ? 'own-reaction' : ''}`}
            onClick={() => handleReactionClick(message.id, emoji)}
          >
            <span className="reaction-emoji">{emoji}</span>
            {count > 1 && <span className="reaction-count">{count}</span>}
          </div>
        ))}
      </div>
    );
  };

  const handleSendVoice = (voiceData) => {
    console.log('handleSendVoice called, sending voice message...');
    onSendMessage('🎤 Voice message', voiceData);
    console.log('Voice message sent, closing recorder...');
    setIsRecordingVoice(false);
  };

  const handleCancelVoice = () => {
    console.log('handleCancelVoice called, closing recorder...');
    setIsRecordingVoice(false);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderMessageContent = (message) => {
    const hasFile = message.file_data && message.file_name;
    const isImage = hasFile && message.file_type?.startsWith('image/');
    const isAudio = hasFile && message.file_type?.startsWith('audio/');

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
        ) : isAudio ? (
          <div className="message-audio-container">
            <div className="audio-icon">🎤</div>
            <audio src={message.file_data} controls className="message-audio-player" />
            {message.audio_duration && (
              <div className="audio-duration">{formatDuration(message.audio_duration)}</div>
            )}
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
        {message.content && !isAudio && <div className="message-text">{message.content}</div>}
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
        {/* Load More Button */}
        {hasMoreMessages && onLoadMore && (
          <div className="load-more-container">
            <button 
              className="load-more-btn" 
              onClick={onLoadMore}
              disabled={loadingHistory}
            >
              {loadingHistory ? (
                <span className="loading-spinner">⏳</span>
              ) : (
                '↑ Load earlier messages'
              )}
            </button>
          </div>
        )}
        
        {messages.map((message) => {
          const isOwn = message.from_user_id === currentUser.id;
          return (
            <div
              key={message.id}
              className={`message-wrapper ${isOwn ? 'own' : 'other'}`}
            >
              <div
                className={`message ${isOwn ? 'own' : 'other'}`}
                onMouseEnter={() => setShowReactionPicker(message.id)}
                onMouseLeave={() => setShowReactionPicker(null)}
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
                
                {/* Reaction Picker - shows on hover */}
                {showReactionPicker === message.id && (
                  <div className="reaction-picker">
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        className="reaction-emoji-btn"
                        onClick={() => handleReactionClick(message.id, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Display existing reactions */}
              {renderReactions(message)}
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

      {isRecordingVoice && (
        <VoiceRecorder 
          onSend={handleSendVoice}
          onCancel={handleCancelVoice}
        />
      )}

      {!isRecordingVoice && (
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
          <button 
            type="button"
            className="voice-button"
            onClick={() => {
              console.log('🎤 button clicked, opening voice recorder...');
              setIsRecordingVoice(true);
            }}
            title="Send voice message"
          >
            <span>🎤</span>
          </button>
          <button type="submit" className="send-button" disabled={!input.trim() && !selectedFile}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}

export default ChatWindow;
