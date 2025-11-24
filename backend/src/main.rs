use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    Login { username: String },
    SendMessage { 
        to_user_id: String, 
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_data: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_type: Option<String>,
    },
    MarkAsRead { message_id: String },
    Typing { to_user_id: String, is_typing: bool },
    GetOnlineUsers,
    // WebRTC signaling messages
    CallOffer { to_user_id: String, offer: String },
    CallAnswer { to_user_id: String, answer: String },
    IceCandidate { to_user_id: String, candidate: String },
    CallEnd { to_user_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ServerMessage {
    UserOnline { user: User },
    UserOffline { user_id: String },
    NewMessage { message: ChatMessage },
    MessageRead { message_id: String, user_id: String },
    Typing { from_user_id: String, is_typing: bool },
    OnlineUsers { users: Vec<User> },
    Error { message: String },
    Success { message: String },
    // WebRTC signaling messages
    CallOffer { from_user_id: String, offer: String },
    CallAnswer { from_user_id: String, answer: String },
    IceCandidate { from_user_id: String, candidate: String },
    CallEnd { from_user_id: String },
}

type Users = Arc<DashMap<String, User>>;
type Messages = Arc<DashMap<String, ChatMessage>>;
type UserSockets = Arc<DashMap<String, tokio::sync::mpsc::UnboundedSender<ServerMessage>>>;

#[derive(Clone)]
struct AppState {
    users: Users,
    messages: Messages,
    user_sockets: UserSockets,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let users: Users = Arc::new(DashMap::new());
    let messages: Messages = Arc::new(DashMap::new());
    let user_sockets: UserSockets = Arc::new(DashMap::new());

    let state = AppState {
        users,
        messages,
        user_sockets,
    };

    let app = Router::new()
        .route("/", get(health_check))
        .route("/ws", get(websocket_handler))
        .route("/api/users", get(get_users))
        .route("/api/messages/:user_id", get(get_messages))
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
    "Chat server is running"
}

async fn get_users(State(state): State<AppState>) -> Json<Vec<User>> {
    let users: Vec<User> = state
        .users
        .iter()
        .map(|entry| entry.value().clone())
        .collect();
    Json(users)
}

async fn get_messages(
    State(state): State<AppState>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> Json<Vec<ChatMessage>> {
    let messages: Vec<ChatMessage> = state
        .messages
        .iter()
        .filter(|entry| {
            let msg = entry.value();
            msg.from_user_id == user_id || msg.to_user_id == user_id
        })
        .map(|entry| entry.value().clone())
        .collect();
    Json(messages)
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

    // Task to receive messages from the client
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                match client_msg {
                    ClientMessage::Login { username } => {
                        let user_id = Uuid::new_v4().to_string();
                        let user = User {
                            id: user_id.clone(),
                            username: username.clone(),
                            online: true,
                            last_seen: Utc::now(),
                        };

                        state.users.insert(user_id.clone(), user.clone());
                        current_user_id = Some(user_id.clone());

                        // Store this user's sender channel
                        state.user_sockets.insert(user_id.clone(), user_tx.clone());

                        // Send user's own info first (so frontend knows their ID)
                        let _ = user_tx.send(ServerMessage::UserOnline {
                            user: user.clone(),
                        });

                        // Send success message directly to this user
                        let _ = user_tx.send(ServerMessage::Success {
                            message: format!("Logged in as {}", username),
                        });

                        // Send online users list to the new user (excluding themselves)
                        let online_users: Vec<User> = state
                            .users
                            .iter()
                            .filter(|u| u.value().online && u.value().id != user_id)
                            .map(|u| u.value().clone())
                            .collect();
                        let _ = user_tx.send(ServerMessage::OnlineUsers {
                            users: online_users.clone(),
                        });

                        // Notify all other users about new online user
                        for entry in state.user_sockets.iter() {
                            if entry.key() != &user_id {
                                let _ = entry.value().send(ServerMessage::UserOnline {
                                    user: user.clone(),
                                });
                            }
                        }
                    }
                    ClientMessage::SendMessage { to_user_id, content, file_data, file_name, file_type } => {
                        if let Some(from_user_id) = &current_user_id {
                            let message = ChatMessage {
                                id: Uuid::new_v4().to_string(),
                                from_user_id: from_user_id.clone(),
                                to_user_id: to_user_id.clone(),
                                content,
                                timestamp: Utc::now(),
                                read: false,
                                file_data,
                                file_name,
                                file_type,
                            };

                            state.messages.insert(message.id.clone(), message.clone());

                            // Send to recipient if online
                            if let Some(recipient_tx) = state.user_sockets.get(&to_user_id) {
                                let _ = recipient_tx.send(ServerMessage::NewMessage {
                                    message: message.clone(),
                                });
                            }

                            // Also send to sender for confirmation
                            let _ = user_tx.send(ServerMessage::NewMessage {
                                message: message.clone(),
                            });
                        }
                    }
                    ClientMessage::MarkAsRead { message_id } => {
                        if let Some(mut msg) = state.messages.get_mut(&message_id) {
                            msg.read = true;
                            let from_user_id = msg.from_user_id.clone();

                            // Notify sender that message was read
                            if let Some(sender_tx) = state.user_sockets.get(&from_user_id) {
                                let _ = sender_tx.send(ServerMessage::MessageRead {
                                    message_id: message_id.clone(),
                                    user_id: current_user_id.clone().unwrap_or_default(),
                                });
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
                            .users
                            .iter()
                            .filter(|u| u.value().online)
                            .map(|u| u.value().clone())
                            .collect();
                        let _ = user_tx.send(ServerMessage::OnlineUsers {
                            users: online_users,
                        });
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
            if let Some(mut user) = state.users.get_mut(&user_id) {
                user.online = false;
                user.last_seen = Utc::now();
            }
            state.user_sockets.remove(&user_id);
            
            // Notify all users about offline user
            for entry in state.user_sockets.iter() {
                let _ = entry.value().send(ServerMessage::UserOffline {
                    user_id: user_id.clone(),
                });
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}

