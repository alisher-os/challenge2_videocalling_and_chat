# Contributing Guide

## Code Standards

### General Principles
1. **Write self-documenting code** - Use descriptive variable and function names
2. **Add comments for complex logic** - Especially WebRTC signaling and state management
3. **Handle errors explicitly** - No silent failures
4. **Test on mobile** - Always verify responsive design
5. **Keep it simple** - Prefer clarity over cleverness

## Backend (Rust) Standards

### Code Style
```rust
// ✅ Good: Descriptive names, proper error handling
async fn handle_user_login(
    username: String, 
    state: &AppState
) -> Result<User, LoginError> {
    let user_id = Uuid::new_v4().to_string();
    let user = User {
        id: user_id.clone(),
        username,
        online: true,
        last_seen: Utc::now(),
    };
    state.users.insert(user_id, user.clone());
    Ok(user)
}

// ❌ Bad: Generic names, unwrap can panic
fn login(u: String, s: &AppState) -> User {
    let id = Uuid::new_v4().to_string();
    s.users.insert(id.clone(), create_user(u)).unwrap()
}
```

### Message Handling Pattern
When adding new message types:

1. **Add to enum**:
```rust
enum ClientMessage {
    NewFeature { param1: String, param2: i32 },
}
```

2. **Add handler in match**:
```rust
match client_msg {
    ClientMessage::NewFeature { param1, param2 } => {
        if let Some(user_id) = &current_user_id {
            // Implementation
        }
    }
}
```

3. **Broadcast to relevant users**:
```rust
if let Some(recipient_tx) = state.user_sockets.get(&recipient_id) {
    let _ = recipient_tx.send(ServerMessage::FeatureResponse { ... });
}
```

### Logging Standards
```rust
// ✅ Use tracing macros
tracing::info!("User {} logged in", username);
tracing::error!("Failed to parse message: {}", error);
tracing::debug!("Current user count: {}", state.users.len());

// ❌ Don't use println!
println!("Something happened");
```

### Testing
```bash
# Before committing
cargo fmt              # Format code
cargo clippy          # Lint checks
cargo test            # Run tests
cargo build --release # Verify production build
```

## Frontend (React) Standards

### Component Structure
```javascript
// ✅ Good: Functional component with hooks, proper cleanup
function MyComponent({ prop1, prop2, onAction }) {
  const [state, setState] = useState(initialValue);
  const ref = useRef(null);

  useEffect(() => {
    // Setup
    const subscription = subscribe();
    
    return () => {
      // Cleanup
      subscription.unsubscribe();
    };
  }, [dependencies]);

  const handleEvent = () => {
    // Handler logic
  };

  return (
    <div className="my-component">
      {/* JSX */}
    </div>
  );
}

// ❌ Bad: Class component, missing cleanup, inline functions
class MyComponent extends Component {
  componentDidMount() {
    subscribe(); // No cleanup!
  }
  
  render() {
    return <div onClick={() => this.handleEvent()}>...</div>; // New function every render!
  }
}
```

### WebSocket Message Handling
```javascript
// ✅ Good: Type checking, error handling
const handleServerMessage = (message) => {
  console.log('Received message:', message);
  
  switch (message.type) {
    case 'NewFeature':
      if (message.data && message.data.value) {
        updateState(message.data.value);
      } else {
        console.error('Invalid NewFeature message:', message);
      }
      break;
    
    default:
      console.log('Unknown message type:', message.type);
  }
};

// ❌ Bad: No logging, no error handling, assumes structure
const handleServerMessage = (message) => {
  if (message.type === 'NewFeature') {
    updateState(message.data.value);
  }
};
```

### State Update Patterns
```javascript
// ✅ Good: Functional updates, immutable
setMessages(prev => ({
  ...prev,
  [key]: [...(prev[key] || []), newMessage]
}));

setUnreadCounts(prev => {
  const updated = { ...prev };
  delete updated[userId];
  return updated;
});

// ❌ Bad: Direct mutation
messages[key].push(newMessage);
setMessages(messages);
```

### CSS Standards
```css
/* ✅ Good: Mobile-first, clear naming */
.chat-window {
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .chat-window {
    position: fixed;
    width: 100%;
  }
}

/* ❌ Bad: Desktop-first, unclear naming */
.cw {
  display: flex;
}
```

## WebRTC Best Practices

### Always Include
1. **STUN servers** for NAT traversal
2. **TURN servers** as fallback for strict NATs
3. **playsInline** for mobile video elements
4. **Connection state monitoring** for debugging
5. **ICE candidate exchange** via WebSocket

### Video Element Setup
```javascript
// ✅ Correct mobile video setup
const videoElement = document.querySelector('video');
videoElement.srcObject = stream;
videoElement.playsInline = true;
videoElement.autoplay = true;
await videoElement.play();

// ❌ Missing critical attributes for mobile
videoElement.src = stream; // Wrong! Use srcObject
```

### Error Handling
```javascript
// ✅ Handle all getUserMedia errors
try {
  const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
} catch (error) {
  if (error.name === 'NotAllowedError') {
    alert('Camera permission denied');
  } else if (error.name === 'NotFoundError') {
    alert('No camera found');
  } else {
    alert(`Error: ${error.message}`);
  }
}
```

## Adding New Features

### Step-by-Step Process

1. **Design the Feature**
   - What data needs to be stored?
   - What messages need to be sent?
   - What UI components are needed?

2. **Backend Implementation**
   - Add data structures (structs)
   - Add message types (enums)
   - Implement handlers
   - Add logging
   - Test with curl or wscat

3. **Frontend Implementation**
   - Add UI components
   - Add message handlers
   - Update state management
   - Add CSS styling
   - Test in browser

4. **Integration Testing**
   - Test with 2+ users
   - Test on mobile
   - Check error cases
   - Verify cleanup (no memory leaks)

### Example: Adding "User is Writing" Feature

**Backend (main.rs)**:
```rust
// 1. Add message type
enum ClientMessage {
    Writing { to_user_id: String, is_writing: bool },
}

enum ServerMessage {
    Writing { from_user_id: String, is_writing: bool },
}

// 2. Add handler
ClientMessage::Writing { to_user_id, is_writing } => {
    if let Some(from_user_id) = &current_user_id {
        if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
            let _ = recipient_tx.send(ServerMessage::Writing {
                from_user_id: from_user_id.clone(),
                is_writing,
            });
        }
    }
}
```

**Frontend (App.js)**:
```javascript
// 1. Add state
const [writingUsers, setWritingUsers] = useState({});

// 2. Add handler
case 'Writing':
  setWritingUsers(prev => ({
    ...prev,
    [message.from_user_id]: message.is_writing
  }));
  break;

// 3. Add send function
const handleWriting = (isWriting) => {
  if (ws && selectedUser) {
    ws.send(JSON.stringify({
      type: 'Writing',
      to_user_id: selectedUser.id,
      is_writing: isWriting
    }));
  }
};
```

**Frontend (ChatWindow.js)**:
```javascript
// 4. Add UI
{writingUsers[otherUser.id] && (
  <div className="writing-indicator">
    {otherUser.username} is writing...
  </div>
)}
```

## Pull Request Checklist

Before submitting PR:
- [ ] Code follows style guide
- [ ] Added comments for complex logic
- [ ] Ran `cargo fmt` and `cargo clippy` (backend)
- [ ] No console warnings or errors
- [ ] Tested on desktop browser
- [ ] Tested on mobile device or responsive mode
- [ ] Updated documentation if needed
- [ ] No TODO comments in committed code

## Common Mistakes to Avoid

### Backend
1. ❌ Using `unwrap()` without error handling → Use `expect()` or `?` operator
2. ❌ Forgetting to clean up `user_sockets` on disconnect → Memory leak
3. ❌ Not cloning Arc before moving into async task → Compilation error
4. ❌ Blocking operations in async functions → Use `tokio::spawn_blocking`

### Frontend
1. ❌ Not cleaning up useEffect subscriptions → Memory leak
2. ❌ Using state values in WebSocket callbacks → Stale closures (use refs!)
3. ❌ Forgetting `playsInline` on video elements → Mobile fullscreen issues
4. ❌ Not checking `ws.readyState` before sending → Errors when disconnected
5. ❌ Mutating state directly → React doesn't re-render

## Questions or Help?
- Check `ARCHITECTURE.md` for system design
- Check `.cursorrules` for AI assistant guidelines
- Review existing code for patterns
- Ask in team chat or open an issue

