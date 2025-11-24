# Mobile Video Calling Setup

## The Problem
Mobile browsers (iOS Safari, Chrome, etc.) **require HTTPS** to access camera and microphone for security reasons. When accessing via `http://10.0.35.132:3001`, video calling won't work on phones.

## Solutions

### Option 1: Use Desktop/Laptop Only (Easiest)
Video calling works perfectly between two computers on the same network because `localhost` is considered secure.

### Option 2: Enable HTTPS with Self-Signed Certificate (Recommended for Testing)

#### Step 1: Generate SSL Certificate
```bash
# Install mkcert (one-time setup)
# On macOS:
brew install mkcert
mkcert -install

# Create certificate for your local IP
mkcert 10.0.35.132 localhost 127.0.0.1

# This creates:
# - 10.0.35.132+2.pem (certificate)
# - 10.0.35.132+2-key.pem (private key)
```

#### Step 2: Update Frontend to Use HTTPS
```bash
cd frontend

# Create .env file
echo "HTTPS=true" > .env
echo "SSL_CRT_FILE=../10.0.35.132+2.pem" >> .env
echo "SSL_KEY_FILE=../10.0.35.132+2-key.pem" >> .env

# Restart the frontend
npm start
```

#### Step 3: Access from Phone
```
https://10.0.35.132:3001
```

Your phone will show a security warning. Accept it to proceed.

### Option 3: Use ngrok (For Internet Access)

```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# In terminal 1 (backend still runs on 3002)
cd backend
cargo run

# In terminal 2 (frontend still runs on 3001)
cd frontend
npm start

# In terminal 3 (create tunnel)
ngrok http 3001
```

Ngrok will give you a public HTTPS URL like: `https://abc123.ngrok.io`

**Important**: Update WebSocket URL in `App.js` to use ngrok's URL for the backend too.

### Option 4: Chrome with Insecure Origins Flag (Development Only)

On Android Chrome, you can enable insecure origins:

1. Go to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Add your IP: `http://10.0.35.132:3001`
3. Restart Chrome
4. Camera/microphone will work on HTTP

⚠️ **This is for testing only!** Don't use in production.

## Testing Without Video Calling

All other features work perfectly without HTTPS:
- ✅ Real-time messaging
- ✅ Online status
- ✅ Read receipts
- ✅ Typing indicators
- ✅ Notifications

Only **video calling** requires HTTPS on mobile.

## Recommended Flow

For your demo/testing:
1. **Text chat**: Works everywhere (HTTP is fine)
2. **Video calling**: 
   - Mac to Mac: ✅ Works perfectly
   - Phone to Mac: ⚠️ Requires HTTPS (use Option 2)
   - Phone to Phone: ⚠️ Requires HTTPS (use Option 2)

## Production Deployment

For production, deploy to a server with proper HTTPS:
- Vercel, Netlify (frontend)
- Heroku, Railway, AWS (backend)
- All will have proper SSL certificates

