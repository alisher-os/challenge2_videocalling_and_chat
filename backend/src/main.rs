mod db;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::Response,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::{Database, DbMessage};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use uuid::Uuid;
use axum_server::tls_rustls::RustlsConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct User {
    id: String,
    username: String,
    online: bool,
    last_seen: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatMessage {
    id: String,
    from_user_id: String,
    to_user_id: String,
    content: String,
    timestamp: DateTime<Utc>,
    read: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_data: Option<String>, // base64 encoded file
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_type: Option<String>, // MIME type
    #[serde(skip_serializing_if = "Option::is_none")]
    audio_duration: Option<f64>, // Duration in seconds for voice messages
    #[serde(default)]
    reactions: HashMap<String, String>, // user_id -> emoji
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    // Auth messages
    Register { username: String, password: String },
    Login { username: String, password: Option<String> },
    // Chat messages
    SendMessage { 
        to_user_id: String, 
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_data: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        audio_duration: Option<f64>,
    },
    MarkAsRead { message_id: String },
    Typing { to_user_id: String, is_typing: bool },
    GetOnlineUsers,
    GetMessageHistory { other_user_id: String, limit: Option<i32>, offset: Option<i32> },
    AddReaction { message_id: String, emoji: String },
    RemoveReaction { message_id: String },
    // WebRTC signaling messages
    CallOffer { to_user_id: String, offer: String },
    CallAnswer { to_user_id: String, answer: String },
    IceCandidate { to_user_id: String, candidate: String },
    CallEnd { to_user_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ServerMessage {
    // Auth responses
    LoginSuccess { user: User },
    RegisterSuccess { user: User },
    AuthError { message: String },
    // Chat messages
    UserOnline { user: User },
    UserOffline { user_id: String },
    NewMessage { message: ChatMessage },
    MessageHistory { messages: Vec<ChatMessage>, total_count: i32, has_more: bool },
    MessageRead { message_id: String, user_id: String },
    Typing { from_user_id: String, is_typing: bool },
    OnlineUsers { users: Vec<User> },
    Error { message: String },
    Success { message: String },
    MessageReaction { message_id: String, user_id: String, emoji: Option<String> },
    // WebRTC signaling messages
    CallOffer { from_user_id: String, offer: String },
    CallAnswer { from_user_id: String, answer: String },
    IceCandidate { from_user_id: String, candidate: String },
    CallEnd { from_user_id: String },
}

type OnlineUsers = Arc<DashMap<String, User>>;
type UserSockets = Arc<DashMap<String, tokio::sync::mpsc::UnboundedSender<ServerMessage>>>;

#[derive(Clone)]
struct AppState {
    db: Arc<Database>,
    online_users: OnlineUsers,
    user_sockets: UserSockets,
}

#[derive(Debug, Deserialize)]
struct PaginationParams {
    limit: Option<i32>,
    offset: Option<i32>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Initialize database
    let db = Database::new("sqlite:chat.db?mode=rwc")
        .await
        .expect("Failed to connect to database");
    
    tracing::info!("Database connected and initialized");

    let online_users: OnlineUsers = Arc::new(DashMap::new());
    let user_sockets: UserSockets = Arc::new(DashMap::new());

    let state = AppState {
        db: Arc::new(db),
        online_users,
        user_sockets,
    };

    let app = Router::new()
        .route("/", get(health_check))
        .route("/ws", get(websocket_handler))
        .route("/api/users", get(get_users))
        .route("/api/messages/{user1_id}/{user2_id}", get(get_messages_api))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3002));
    
    // Configure TLS
    let config = RustlsConfig::from_pem_file(
        "../certs/cert.pem",
        "../certs/key.pem"
    )
    .await
    .expect("Failed to load TLS certificates");

    tracing::info!("Server running on https://{}", addr);

    axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}

async fn health_check() -> &'static str {
    "Chat server is running with SQLite persistence"
}

async fn get_users(State(state): State<AppState>) -> Json<Vec<User>> {
    // Get all users from database, with online status from memory
    match state.db.get_all_users().await {
        Ok(db_users) => {
            let users: Vec<User> = db_users
                .iter()
                .map(|u| {
                    let is_online = state.online_users.contains_key(&u.id);
                    User {
                        id: u.id.clone(),
                        username: u.username.clone(),
                        online: is_online,
                        last_seen: chrono::DateTime::parse_from_rfc3339(&u.last_seen)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now()),
                    }
                })
                .collect();
            Json(users)
        }
        Err(e) => {
            tracing::error!("Failed to get users: {:?}", e);
            Json(vec![])
        }
    }
}

async fn get_messages_api(
    State(state): State<AppState>,
    Path((user1_id, user2_id)): Path<(String, String)>,
    Query(params): Query<PaginationParams>,
) -> Json<Vec<ChatMessage>> {
    let limit = params.limit.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);

    match state.db.get_messages_between_users(&user1_id, &user2_id, limit, offset).await {
        Ok(db_messages) => {
            let message_ids: Vec<String> = db_messages.iter().map(|m| m.id.clone()).collect();
            let reactions_map = state.db.get_reactions_batch(&message_ids).await.unwrap_or_default();

            let messages: Vec<ChatMessage> = db_messages
                .into_iter()
                .map(|m| {
                    let reactions = reactions_map.get(&m.id).cloned();
                    db_message_to_chat_message(m, reactions)
                })
                .collect();
            Json(messages)
        }
        Err(e) => {
            tracing::error!("Failed to get messages: {:?}", e);
            Json(vec![])
        }
    }
}

fn db_message_to_chat_message(m: DbMessage, reactions: Option<HashMap<String, String>>) -> ChatMessage {
    ChatMessage {
        id: m.id,
        from_user_id: m.from_user_id,
        to_user_id: m.to_user_id,
        content: m.content,
        timestamp: chrono::DateTime::parse_from_rfc3339(&m.timestamp)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now()),
        read: m.read,
        file_data: m.file_data,
        file_name: m.file_name,
        file_type: m.file_type,
        audio_duration: m.audio_duration,
        reactions: reactions.unwrap_or_default(),
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (user_tx, mut user_rx) = tokio::sync::mpsc::unbounded_channel();
    let mut current_user_id: Option<String> = None;

    // Task to send messages to the client
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = user_rx.recv().await {
            if let Ok(text) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
        }
    });

    let state_clone = state.clone();
    let user_tx_clone = user_tx.clone();

    // Task to receive messages from the client
    let mut recv_task = tokio::spawn(async move {
        let state = state_clone;
        let user_tx = user_tx_clone;

        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                match client_msg {
                    ClientMessage::Register { username, password } => {
                        // Check if username exists
                        match state.db.get_user_by_username(&username).await {
                            Ok(Some(_)) => {
                                let _ = user_tx.send(ServerMessage::AuthError {
                                    message: "Username already exists".to_string(),
                                });
                            }
                            Ok(None) => {
                                // Hash password and create user
                                let password_hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST)
                                    .unwrap_or_else(|_| password.clone());
                                let user_id = Uuid::new_v4().to_string();

                                match state.db.create_user(&user_id, &username, &password_hash).await {
                                    Ok(_) => {
                                        let user = User {
                                            id: user_id.clone(),
                                            username: username.clone(),
                                            online: true,
                                            last_seen: Utc::now(),
                                        };

                                        state.online_users.insert(user_id.clone(), user.clone());
                                        current_user_id = Some(user_id.clone());
                                        state.user_sockets.insert(user_id.clone(), user_tx.clone());

                                        let _ = user_tx.send(ServerMessage::RegisterSuccess {
                                            user: user.clone(),
                                        });

                                        // Send online users list
                                        let online_users: Vec<User> = state
                                            .online_users
                                            .iter()
                                            .filter(|u| u.value().id != user_id)
                                            .map(|u| u.value().clone())
                                            .collect();
                                        let _ = user_tx.send(ServerMessage::OnlineUsers {
                                            users: online_users,
                                        });

                                        // Notify others
                                        for entry in state.user_sockets.iter() {
                                            if entry.key() != &user_id {
                                                let _ = entry.value().send(ServerMessage::UserOnline {
                                                    user: user.clone(),
                                                });
                                            }
                                        }

                                        tracing::info!("User registered: {} ({})", username, user_id);
                                    }
                                    Err(e) => {
                                        tracing::error!("Failed to create user: {:?}", e);
                                        let _ = user_tx.send(ServerMessage::AuthError {
                                            message: "Failed to register user".to_string(),
                                        });
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Database error: {:?}", e);
                                let _ = user_tx.send(ServerMessage::AuthError {
                                    message: "Database error".to_string(),
                                });
                            }
                        }
                    }

                    ClientMessage::Login { username, password } => {
                        // Check if user exists in database
                        match state.db.get_user_by_username(&username).await {
                            Ok(Some(db_user)) => {
                                // Verify password if provided
                                let password_valid = match password {
                                    Some(ref pwd) => bcrypt::verify(pwd, &db_user.password_hash).unwrap_or(false),
                                    None => true, // Allow passwordless login for existing users (backward compat)
                                };

                                if password_valid {
                                    let user = User {
                                        id: db_user.id.clone(),
                                        username: db_user.username.clone(),
                                        online: true,
                                        last_seen: Utc::now(),
                                    };

                                    state.online_users.insert(db_user.id.clone(), user.clone());
                                    current_user_id = Some(db_user.id.clone());
                                    state.user_sockets.insert(db_user.id.clone(), user_tx.clone());

                                    let _ = user_tx.send(ServerMessage::LoginSuccess {
                                        user: user.clone(),
                                    });

                                    // Send online users list (excluding self)
                                    let online_users: Vec<User> = state
                                        .online_users
                                        .iter()
                                        .filter(|u| u.value().id != db_user.id)
                                        .map(|u| u.value().clone())
                                        .collect();
                                    let _ = user_tx.send(ServerMessage::OnlineUsers {
                                        users: online_users,
                                    });

                                    // Notify all other users
                                    for entry in state.user_sockets.iter() {
                                        if entry.key() != &db_user.id {
                                            let _ = entry.value().send(ServerMessage::UserOnline {
                                                user: user.clone(),
                                            });
                                        }
                                    }

                                    // Update last seen
                                    let _ = state.db.update_last_seen(&db_user.id).await;

                                    tracing::info!("User logged in: {} ({})", username, db_user.id);
                                } else {
                                    let _ = user_tx.send(ServerMessage::AuthError {
                                        message: "Invalid password".to_string(),
                                    });
                                }
                            }
                            Ok(None) => {
                                // Auto-register for backward compatibility (passwordless)
                                if password.is_none() {
                                    let user_id = Uuid::new_v4().to_string();
                                    let default_hash = bcrypt::hash("", bcrypt::DEFAULT_COST)
                                        .unwrap_or_default();

                                    match state.db.create_user(&user_id, &username, &default_hash).await {
                                        Ok(_) => {
                                            let user = User {
                                                id: user_id.clone(),
                                                username: username.clone(),
                                                online: true,
                                                last_seen: Utc::now(),
                                            };

                                            state.online_users.insert(user_id.clone(), user.clone());
                                            current_user_id = Some(user_id.clone());
                                            state.user_sockets.insert(user_id.clone(), user_tx.clone());

                                            let _ = user_tx.send(ServerMessage::LoginSuccess {
                                                user: user.clone(),
                                            });

                                            // Send online users
                                            let online_users: Vec<User> = state
                                                .online_users
                                                .iter()
                                                .filter(|u| u.value().id != user_id)
                                                .map(|u| u.value().clone())
                                                .collect();
                                            let _ = user_tx.send(ServerMessage::OnlineUsers {
                                                users: online_users,
                                            });

                                            // Notify others
                                            for entry in state.user_sockets.iter() {
                                                if entry.key() != &user_id {
                                                    let _ = entry.value().send(ServerMessage::UserOnline {
                                                        user: user.clone(),
                                                    });
                                                }
                                            }

                                            tracing::info!("User auto-registered: {} ({})", username, user_id);
                                        }
                                        Err(e) => {
                                            tracing::error!("Failed to auto-register: {:?}", e);
                                            let _ = user_tx.send(ServerMessage::AuthError {
                                                message: "Failed to create user".to_string(),
                                            });
                                        }
                                    }
                                } else {
                                    let _ = user_tx.send(ServerMessage::AuthError {
                                        message: "User not found".to_string(),
                                    });
                                }
                            }
                            Err(e) => {
                                tracing::error!("Database error during login: {:?}", e);
                                let _ = user_tx.send(ServerMessage::AuthError {
                                    message: "Database error".to_string(),
                                });
                            }
                        }
                    }

                    ClientMessage::SendMessage { to_user_id, content, file_data, file_name, file_type, audio_duration } => {
                        if let Some(from_user_id) = &current_user_id {
                            let message = ChatMessage {
                                id: Uuid::new_v4().to_string(),
                                from_user_id: from_user_id.clone(),
                                to_user_id: to_user_id.clone(),
                                content: content.clone(),
                                timestamp: Utc::now(),
                                read: false,
                                file_data: file_data.clone(),
                                file_name: file_name.clone(),
                                file_type: file_type.clone(),
                                audio_duration,
                                reactions: HashMap::new(),
                            };

                            // Save to database
                            let db_msg = DbMessage {
                                id: message.id.clone(),
                                from_user_id: message.from_user_id.clone(),
                                to_user_id: message.to_user_id.clone(),
                                content: message.content.clone(),
                                timestamp: message.timestamp.to_rfc3339(),
                                read: message.read,
                                file_data: message.file_data.clone(),
                                file_name: message.file_name.clone(),
                                file_type: message.file_type.clone(),
                                audio_duration: message.audio_duration,
                            };

                            if let Err(e) = state.db.save_message(&db_msg).await {
                                tracing::error!("Failed to save message: {:?}", e);
                            }

                            // Send to recipient if online
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::NewMessage {
                                    message: message.clone(),
                                });
                            }

                            // Also send to sender for confirmation
                            let _ = user_tx.send(ServerMessage::NewMessage {
                                message,
                            });
                        }
                    }

                    ClientMessage::GetMessageHistory { other_user_id, limit, offset } => {
                        if let Some(user_id) = &current_user_id {
                            let limit = limit.unwrap_or(50);
                            let offset = offset.unwrap_or(0);

                            match state.db.get_messages_between_users(user_id, &other_user_id, limit, offset).await {
                                Ok(db_messages) => {
                                    let total_count = state.db.get_message_count_between_users(user_id, &other_user_id)
                                        .await
                                        .unwrap_or(0);

                                    let message_ids: Vec<String> = db_messages.iter().map(|m| m.id.clone()).collect();
                                    let reactions_map = state.db.get_reactions_batch(&message_ids).await.unwrap_or_default();

                                    let messages: Vec<ChatMessage> = db_messages
                                        .into_iter()
                                        .map(|m| {
                                            let reactions = reactions_map.get(&m.id).cloned();
                                            db_message_to_chat_message(m, reactions)
                                        })
                                        .collect();

                                    // Messages are in DESC order, reverse for chronological display
                                    let mut messages = messages;
                                    messages.reverse();

                                    let has_more = (offset + limit) < total_count;

                                    let _ = user_tx.send(ServerMessage::MessageHistory {
                                        messages,
                                        total_count,
                                        has_more,
                                    });
                                }
                                Err(e) => {
                                    tracing::error!("Failed to get message history: {:?}", e);
                                    let _ = user_tx.send(ServerMessage::Error {
                                        message: "Failed to load message history".to_string(),
                                    });
                                }
                            }
                        }
                    }

                    ClientMessage::MarkAsRead { message_id } => {
                        if let Err(e) = state.db.mark_message_read(&message_id).await {
                            tracing::error!("Failed to mark message as read: {:?}", e);
                        }

                        // Notify sender that message was read (need to look up message first)
                        // For simplicity, broadcast to current conversation
                        if let Some(user_id) = &current_user_id {
                            for entry in state.user_sockets.iter() {
                                if entry.key() != user_id {
                                    let _ = entry.value().send(ServerMessage::MessageRead {
                                        message_id: message_id.clone(),
                                        user_id: user_id.clone(),
                                    });
                                }
                            }
                        }
                    }

                    ClientMessage::Typing { to_user_id, is_typing } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::Typing {
                                    from_user_id: from_user_id.clone(),
                                    is_typing,
                                });
                            }
                        }
                    }

                    ClientMessage::GetOnlineUsers => {
                        let online_users: Vec<User> = state
                            .online_users
                            .iter()
                            .map(|u| u.value().clone())
                            .collect();
                        let _ = user_tx.send(ServerMessage::OnlineUsers {
                            users: online_users,
                        });
                    }

                    ClientMessage::AddReaction { message_id, emoji } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Err(e) = state.db.add_reaction(&message_id, from_user_id, &emoji).await {
                                tracing::error!("Failed to add reaction: {:?}", e);
                            }

                            tracing::info!("User {} reacted to message {} with {}", from_user_id, message_id, emoji);

                            // Broadcast to all connected users (simplified)
                            for entry in state.user_sockets.iter() {
                                let _ = entry.value().send(ServerMessage::MessageReaction {
                                    message_id: message_id.clone(),
                                    user_id: from_user_id.clone(),
                                    emoji: Some(emoji.clone()),
                                });
                            }
                        }
                    }

                    ClientMessage::RemoveReaction { message_id } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Err(e) = state.db.remove_reaction(&message_id, from_user_id).await {
                                tracing::error!("Failed to remove reaction: {:?}", e);
                            }

                            tracing::info!("User {} removed reaction from message {}", from_user_id, message_id);

                            // Broadcast to all connected users
                            for entry in state.user_sockets.iter() {
                                let _ = entry.value().send(ServerMessage::MessageReaction {
                                    message_id: message_id.clone(),
                                    user_id: from_user_id.clone(),
                                    emoji: None,
                                });
                            }
                        }
                    }

                    ClientMessage::CallOffer { to_user_id, offer } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::CallOffer {
                                    from_user_id: from_user_id.clone(),
                                    offer,
                                });
                            }
                        }
                    }

                    ClientMessage::CallAnswer { to_user_id, answer } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::CallAnswer {
                                    from_user_id: from_user_id.clone(),
                                    answer,
                                });
                            }
                        }
                    }

                    ClientMessage::IceCandidate { to_user_id, candidate } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::IceCandidate {
                                    from_user_id: from_user_id.clone(),
                                    candidate,
                                });
                            }
                        }
                    }

                    ClientMessage::CallEnd { to_user_id } => {
                        if let Some(from_user_id) = &current_user_id {
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::CallEnd {
                                    from_user_id: from_user_id.clone(),
                                });
                            }
                        }
                    }
                }
            }
        }

        // User disconnected - mark as offline
        if let Some(user_id) = current_user_id {
            state.online_users.remove(&user_id);
            state.user_sockets.remove(&user_id);
            
            // Update last seen in database
            let _ = state.db.update_last_seen(&user_id).await;
            
            // Notify all users about offline user
            for entry in state.user_sockets.iter() {
                let _ = entry.value().send(ServerMessage::UserOffline {
                    user_id: user_id.clone(),
                });
            }

            tracing::info!("User disconnected: {}", user_id);
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
