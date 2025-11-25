# System Architecture

## Overview
This is a real-time chat application with video calling, designed for peer-to-peer communication between multiple users on the same network or via the internet.

## High-Level Architecture

```
┌─────────────────┐         WebSocket (WSS)        ┌─────────────────┐
│                 │◄──────────────────────────────►│                 │
│  React Frontend │                                │  Axum Backend   │
│   (Port 3001)   │         HTTPS REST API         │  (Port 3002)    │
│                 │◄──────────────────────────────►│                 │
└────────┬────────┘                                └─────────────────┘
         │                                                   │
         │                                                   │
         │ WebRTC (P2P)                            In-Memory Storage
         │ Audio/Video                              ┌──────────────┐
         │                                          │   DashMap    │
         │                                          ├──────────────┤
         │                                          │   Users      │
         ▼                                          │   Messages   │
┌─────────────────┐                                │   Sockets    │
│                 │                                └──────────────┘
│  Other Clients  │
│                 │
└─────────────────┘
```

## Backend Architecture (Rust/Axum)

### Core Components

#### 1. **AppState** (Shared Application State)
```rust
struct AppState {
    users: Arc<DashMap<String, User>>,
    messages: Arc<DashMap<String, ChatMessage>>,
    user_sockets: Arc<DashMap<String, UnboundedSender<ServerMessage>>>,
}
```

- **Thread-safe**: Uses `Arc` (Atomic Reference Counting) for shared ownership
- **Concurrent**: Uses `DashMap` for lock-free concurrent access
- **Scalable**: Each WebSocket connection is independent

#### 2. **Data Models**

**User**:
- `id`: UUID string
- `username`: Display name
- `online`: Boolean status
- `last_seen`: Timestamp

**ChatMessage**:
- `id`: UUID string
- `from_user_id`, `to_user_id`: User references
- `content`: Message text
- `timestamp`: When sent
- `read`: Boolean receipt status
- `file_data`, `file_name`, `file_type`: Optional file attachments (base64)

#### 3. **Message Flow**

```
Client Message → WebSocket → Deserialize → Match Handler → Update State → Broadcast → Serialize → WebSocket → Clients
```

**Example: Sending a Message**
1. Client sends `SendMessage` via WebSocket
2. Backend receives and deserializes to `ClientMessage::SendMessage`
3. Creates `ChatMessage` with UUID and timestamp
4. Stores in `messages` DashMap
5. Looks up recipient in `user_sockets`
6. Sends `ServerMessage::NewMessage` to recipient
7. Also confirms to sender

#### 4. **WebSocket Connection Lifecycle**

```
Connect → Login → Online → Active → Disconnect → Offline → Cleanup
```

**On Connect**:
- Split socket into sender/receiver
- Create mpsc channel for outgoing messages
- Spawn send task and receive task

**On Login**:
- Generate UUID for user
- Store user in `users` DashMap
- Store sender channel in `user_sockets`
- Broadcast `UserOnline` to all other users
- Send `OnlineUsers` list to new user

**On Disconnect**:
- Mark user as offline
- Remove from `user_sockets`
- Broadcast `UserOffline` to all users
- Tasks are aborted via tokio::select!

### Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health check |
| GET | `/ws` | WebSocket upgrade |
| GET | `/api/users` | Get all users |
| GET | `/api/messages/:user_id` | Get messages for user |

### Security

- **HTTPS/WSS**: Required for production and mobile
- **CORS**: Permissive in development (CorsLayer::permissive())
- **TLS**: Uses axum-server with rustls
- **Certificates**: Self-signed in `/certs/` for development

## Frontend Architecture (React)

### Component Hierarchy

```
App (WebSocket + Global State)
├── LoginForm (username input)
├── OnlineUsers (user list sidebar)
│   └── User items with badges
├── ChatWindow (1-on-1 chat)
│   ├── Chat header
│   ├── Message list
│   │   ├── Text messages
│   │   ├── Image messages
│   │   └── File attachments
│   └── Input form with file upload
├── IncomingCall (modal)
└── VideoCall (full-screen)
    ├── Remote video (main)
    ├── Local video (PIP)
    └── Controls (mute, camera, end)
```

### State Management Patterns

#### Global State (App.js)
```javascript
const [user, setUser] = useState(null);              // Current user
const [ws, setWs] = useState(null);                  // WebSocket connection
const [onlineUsers, setOnlineUsers] = useState([]);  // Other users
const [messages, setMessages] = useState({});        // All messages keyed by chat
const [unreadCounts, setUnreadCounts] = useState({}); // Unread per user
const [selectedUser, setSelectedUser] = useState(null); // Active chat
```

#### Refs for Callbacks
```javascript
const userRef = useRef(user);
const onlineUsersRef = useRef(onlineUsers);
```
**Why?**: WebSocket callbacks capture closure values. Refs always have current values.

#### Message Keys
Messages are keyed by sorted user IDs: `"userId1-userId2"`
- Ensures same key regardless of who sent the message
- Enables efficient message lookup

### WebSocket Management

**Connection Flow**:
1. Create WebSocket when user logs in
2. Send `Login` message on `onopen`
3. Listen for messages in `onmessage`
4. Handle errors in `onerror`
5. Reconnect on `onclose` if was previously connected

**Message Handling**:
```javascript
websocket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleServerMessage(message);
};
```

All server messages go through `handleServerMessage` switch statement.

### WebRTC Architecture

#### Peer Connection Setup
1. Get local media stream (getUserMedia)
2. Create RTCPeerConnection with ICE servers
3. Add local tracks to peer connection
4. Set up event handlers (ontrack, onicecandidate)
5. Create offer/answer and exchange via WebSocket
6. Exchange ICE candidates via WebSocket

#### Signaling Flow (Caller → Answerer)
```
Caller                    Backend                    Answerer
  │                          │                          │
  ├─CallOffer────────────────►│                          │
  │                          ├─CallOffer────────────────►│
  │                          │                          │
  │◄─────────────CallAnswer──┤                          │
  │                          │◄─────────CallAnswer───────┤
  │                          │                          │
  ├─IceCandidate─────────────►├─IceCandidate────────────►│
  │◄────────────IceCandidate──┤◄────────IceCandidate─────┤
  │                          │                          │
  │◄────────Media Stream─────────────────────────────────►│
```

#### State Handling
- **Caller**: `callState: 'calling'` → 'connected' on CallAnswer
- **Answerer**: `callState: 'connected'` immediately on accept
- Both sides handle ontrack events independently

### File Sharing

**Upload Flow**:
1. User selects file (input type="file")
2. Read file as Data URL (base64)
3. Send via WebSocket with message
4. Backend stores entire base64 in ChatMessage
5. Recipient receives and displays

**Display**:
- **Images**: Render as `<img>` with click to enlarge
- **Files**: Render as download link with filename

**Limitations**:
- Max 5MB per file (enforced in frontend)
- Base64 encoding adds ~33% overhead
- No chunking (future enhancement for large files)

## Data Flow Examples

### Sending a Message
```
User types "Hello" → Input onChange → State update → Form submit →
handleSendMessage → WebSocket.send(SendMessage) →
Backend receives → Creates ChatMessage → Stores in DashMap →
Looks up recipient socket → Sends NewMessage →
Frontend receives → handleServerMessage → Updates messages state →
Component re-renders → Message appears
```

### Read Receipts
```
ChatWindow mounts → useEffect → Checks unread messages →
Calls onMarkAsRead → WebSocket.send(MarkAsRead) →
Backend updates message.read = true →
Sends MessageRead to original sender →
Sender updates UI → Double checkmark appears
```

### Unread Badges
```
NewMessage arrives → Check if viewing that chat →
If NOT viewing: Increment unreadCounts[userId] →
Badge appears on user item →
User clicks user → handleSelectUser → Clear unreadCounts[userId] →
Badge disappears
```

## Mobile Considerations

### Responsive Breakpoints
- Desktop: > 768px (sidebar + chat side-by-side)
- Tablet: 480px - 768px (single view, can switch)
- Mobile: < 480px (single view, smaller controls)

### Video Call Mobile Optimizations
- `playsInline` prevents fullscreen takeover on iOS
- Fixed controls at bottom of screen
- Smaller local video window
- Touch-optimized buttons (larger hit areas)

### HTTPS Requirement
Mobile browsers require HTTPS to access:
- Camera (getUserMedia video)
- Microphone (getUserMedia audio)
- Notifications

Solution: Use self-signed certs for development, proper certs for production.

## Performance Optimization Strategies

### Current Implementation
- **In-memory storage**: Fast but not persistent
- **No pagination**: All messages loaded at once
- **WebSocket per user**: Scalable to ~10K concurrent users
- **P2P video**: No server bandwidth for media

### Future Enhancements
1. **Add database**: PostgreSQL or MongoDB for persistence
2. **Message pagination**: Load older messages on scroll
3. **Lazy loading**: Load user list incrementally
4. **Message compression**: Gzip WebSocket frames
5. **SFU for group calls**: Selective Forwarding Unit for multi-user video

## Deployment Considerations

### Development
- Backend: `cargo run` (debug mode)
- Frontend: `npm start` (dev server with hot reload)
- Self-signed certs in `/certs/`

### Production
- Backend: `cargo build --release` + process manager (systemd/pm2)
- Frontend: `npm run build` + serve via Nginx/Apache
- Proper SSL certificates (Let's Encrypt)
- Reverse proxy (Nginx) for both services
- Environment variables for configuration
- Database for message persistence
- Redis for user session management

## Monitoring & Debugging

### Backend Logs
```rust
tracing::info!("Server running on {}", addr);
tracing::error!("WebSocket error: {}", err);
```

### Frontend Console
All components use extensive `console.log()`:
- `🎥` Video/WebRTC events
- `📹` Metadata and stream events
- `✅` Success operations
- `❌` Errors and failures

### Common Debug Commands
```bash
# Backend logs
RUST_LOG=debug cargo run

# Frontend with source maps
npm start

# Check WebSocket in browser
# Chrome DevTools → Network → WS → Click connection → View frames
```

## Technology Choices & Rationale

| Technology | Why Chosen |
|------------|------------|
| **Rust + Axum** | Type safety, performance, async/await, excellent WebSocket support |
| **React** | Component reusability, large ecosystem, hooks for state management |
| **DashMap** | Lock-free concurrent HashMap, perfect for shared state |
| **WebSocket** | Full-duplex real-time communication, lower latency than polling |
| **WebRTC** | P2P video, no server bandwidth needed, industry standard |
| **axum-server** | Easy HTTPS/TLS support for Axum |
| **Tokio** | Best-in-class async runtime for Rust |

## Extension Points

### Easy to Add
- Emoji reactions to messages
- Message editing/deletion
- User profiles with avatars
- Status messages ("Away", "Busy")
- Sound on/off toggle

### Moderate Complexity
- Group chats (rooms/channels)
- Message search
- File preview thumbnails
- Persistent storage (DB)
- User authentication

### Advanced Features
- End-to-end encryption
- Screen sharing during calls
- Multi-party video calls (SFU)
- Voice messages
- Message threading

## Code Quality Standards

### Rust
- Run `cargo clippy` before committing
- Format with `cargo fmt`
- No warnings allowed in production builds
- Use `expect()` with meaningful messages, avoid `unwrap()`

### JavaScript
- ESLint configured (react-app preset)
- No unused variables
- PropTypes or TypeScript (future)
- Functional components only (no class components)

## Git Workflow
- Feature branches from `main`
- Descriptive commit messages
- Test locally before pushing
- `.gitignore` excludes: `node_modules/`, `target/`, `/certs/`, `.env`

