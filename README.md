# Real-Time Chat Application

A full-stack real-time chat and video calling application built with Rust (backend) and React (frontend), designed for peer-to-peer communication with enterprise-grade real-time features.

## ✨ Features

- 💬 **Real-time messaging** via WebSocket (sub-second latency)
- 👥 **Online/offline status** with presence tracking
- ✓✓ **Read receipts** (double checkmarks like WhatsApp)
- ⌨️ **Typing indicators** (see when others are typing)
- 🔔 **Desktop notifications** with sound alerts
- 📹 **Video calling** with WebRTC (peer-to-peer, no server bandwidth)
- 📱 **Fully responsive** design (desktop, tablet, mobile)
- 📸 **Photo sharing** with inline preview
- 📎 **File sharing** (up to 5MB)
- 🔢 **Unread message badges** on user list
- 🔒 **HTTPS/WSS support** for production and mobile

## 🛠️ Tech Stack

### Backend
- **Rust** (2021 edition) with **Axum 0.7** web framework
- **WebSocket** for bidirectional real-time communication
- **Tokio** async runtime with full features
- **DashMap** 5.5 for lock-free concurrent state management
- **Serde** for JSON serialization/deserialization
- **axum-server** with rustls for HTTPS/WSS support
- **UUID** for unique IDs, **Chrono** for timestamps

### Frontend
- **React** 18 with hooks-based architecture
- **WebSocket API** for real-time server communication
- **WebRTC** for peer-to-peer video/audio
- Modern CSS3 with gradients, animations, and responsive design
- **File API** for photo/file uploads

### Development Tools
- **Bun** or npm for frontend package management
- **Cargo** for Rust dependency management
- **OpenSSL** for self-signed certificates (development)

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, data flow, and technical decisions
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Code standards and contribution guidelines
- **[MOBILE_SETUP.md](MOBILE_SETUP.md)** - HTTPS setup for mobile video calling
- **[.cursorrules](.cursorrules)** - AI assistant guidelines for this project

## Getting Started

### Prerequisites
- Rust (latest stable version)
- Node.js 16+ and npm

### Backend Setup

```bash
cd backend
cargo run
```

The backend server will start on `https://0.0.0.0:3002`

**Note**: Backend uses HTTPS for mobile compatibility. Self-signed certificates are in `/certs/`.

### Frontend Setup

```bash
cd frontend
npm install  # or: bun install
npm start    # or: bun start
```

The frontend will start on `https://localhost:3001` (network: `https://[your-ip]:3001`)

### SSL Certificates (Required)

For HTTPS/video calling:
```bash
mkdir -p certs
cd certs
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:10.0.35.132"
```

Replace `10.0.35.132` with your local IP address.

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

## 🚀 Future Enhancements

- [ ] Database persistence (PostgreSQL/MongoDB)
- [ ] User authentication with passwords/JWT
- [ ] Group chats and channels
- [ ] Group video calls with SFU (Selective Forwarding Unit)
- [ ] Message search and filtering
- [ ] Screen sharing during calls
- [ ] Voice messages
- [ ] Message reactions (emoji)
- [ ] Message editing and deletion
- [ ] End-to-end encryption

## 🤖 AI Assistant Instructions

This repository includes comprehensive documentation for AI coding assistants:

- **`.cursorrules`**: Project-specific patterns, common pitfalls, and guidelines
- **`ARCHITECTURE.md`**: System design, data flow diagrams, and technical decisions
- **`CONTRIBUTING.md`**: Code standards, examples of good/bad patterns

When working with AI assistants on this project:
1. Reference `.cursorrules` for project conventions
2. Check `ARCHITECTURE.md` for system understanding
3. Follow patterns in `CONTRIBUTING.md` for code quality
4. Always test changes on both desktop and mobile
5. Verify WebSocket message types match backend enums

## 🐛 Troubleshooting

### Video call shows black screen
- Ensure HTTPS is enabled on both frontend and backend
- Accept self-signed certificates in browser
- Check browser console for `ontrack` events
- Verify tracks are not muted: check `track.muted` and `track.enabled`

### WebSocket connection fails
- Verify backend is running on port 3002
- Check protocol matches (both HTTP or both HTTPS)
- Accept SSL certificate by visiting `https://localhost:3002`
- Check firewall allows WebSocket connections

### Messages not appearing
- Check browser console for WebSocket errors
- Verify user ID is set (appears in console on login)
- Ensure `user_sockets` contains both users (backend logs)

See `.cursorrules` for complete troubleshooting guide.

## 📄 License

MIT License - Feel free to use for learning and development.

