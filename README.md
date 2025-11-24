# Real-Time Chat Application

A full-stack real-time chat application built with Rust (backend) and React (frontend).

## Features

- ✅ Real-time messaging via WebSocket
- ✅ Online/offline user status
- ✅ Read receipts (double checkmarks)
- ✅ Typing indicators
- ✅ Desktop notifications for new messages
- ✅ Video calling with WebRTC (peer-to-peer)
- ✅ Fully responsive design for mobile devices
- ✅ PWA support (installable on mobile)

## Tech Stack

### Backend
- **Rust** with **Axum** web framework
- **WebSocket** for real-time communication
- **Tokio** for async runtime
- **DashMap** for concurrent data structures

### Frontend
- **React** 18
- **WebSocket API** for real-time communication
- Modern CSS with gradients and animations

## Getting Started

### Prerequisites
- Rust (latest stable version)
- Node.js 16+ and npm

### Backend Setup

```bash
cd backend
cargo run
```

The backend server will start on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

The frontend will start on `http://localhost:3000`

## Usage

1. Open the application in your browser
2. Enter a username to login
3. Select an online user from the sidebar to start chatting
4. Type messages and see them appear in real-time
5. See typing indicators when someone is typing
6. Check read receipts (double checkmarks) when messages are read
7. Click the **"📹 Video Call"** button to start a video call
8. Accept or decline incoming video calls
9. During calls: mute/unmute, turn video on/off, or end the call

## Architecture

### Backend
- WebSocket server handles all real-time communication
- User state managed in memory (DashMap)
- Messages stored in memory (can be extended to use a database)
- Broadcast channels for message distribution

### Frontend
- React hooks for state management
- WebSocket client for real-time updates
- Component-based architecture

## Video Calling

The app includes full WebRTC video calling:
- **Start a call**: Click the "📹 Video Call" button in the chat header
- **Incoming calls**: Beautiful modal with accept/decline options
- **During call**: 
  - 🎤 Mute/unmute your microphone
  - 📷 Turn your camera on/off
  - 📞 End the call
- **Peer-to-peer**: Direct connection using WebRTC (STUN servers)
- **Like Telegram**: Clean, intuitive interface
- **Mobile optimized**: Works perfectly on phones in portrait and landscape modes

## Mobile Experience

The application is fully responsive and optimized for mobile devices:
- **📱 Adaptive Layout**: Switches between desktop and mobile layouts automatically
- **👆 Touch Optimized**: All interactions work smoothly on touchscreens
- **🔙 Back Navigation**: Easy back button to return to user list on mobile
- **📐 Full Screen**: Utilizes full viewport on mobile devices
- **🎥 Mobile Video Calls**: Video calling works great on phones
- **⚡ PWA Ready**: Can be installed on home screen like a native app
- **🔄 Auto-Scaling**: Text, buttons, and UI elements scale perfectly
- **🌅 Landscape Support**: Video calls adapt to landscape orientation

### Mobile Testing
- **Text Chat**: Open on your phone's browser: `http://[your-local-ip]:3001`
- **Video Calling**: Requires HTTPS on mobile - see `MOBILE_SETUP.md` for instructions
- **Desktop Testing**: Use browser dev tools responsive mode (F12 → Toggle device toolbar)

### Important Note About Mobile Video Calling
⚠️ Mobile browsers require HTTPS for camera/microphone access. Video calling will work:
- ✅ Between two computers on localhost
- ✅ On mobile with HTTPS setup (see `MOBILE_SETUP.md`)
- ❌ On mobile with HTTP (security restriction)

All other features (chat, typing, read receipts, notifications) work perfectly on mobile with HTTP!

## Future Enhancements

- Database persistence for messages
- User authentication with passwords
- Group chats and group video calls
- File sharing
- Message search
- Screen sharing during calls

