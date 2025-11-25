use chrono::Utc;
use sqlx::{sqlite::SqlitePool, FromRow, Row};
use std::collections::HashMap;

/// Database layer for persistent storage
pub struct Database {
    pool: SqlitePool,
}

#[derive(Debug, Clone, FromRow)]
pub struct DbUser {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub created_at: String,
    pub last_seen: String,
}

#[derive(Debug, Clone)]
pub struct DbMessage {
    pub id: String,
    pub from_user_id: String,
    pub to_user_id: String,
    pub content: String,
    pub timestamp: String,
    pub read: bool,
    pub file_data: Option<String>,
    pub file_name: Option<String>,
    pub file_type: Option<String>,
    pub audio_duration: Option<f64>,
}

#[derive(Debug, Clone, FromRow)]
pub struct DbReaction {
    pub message_id: String,
    pub user_id: String,
    pub emoji: String,
}

impl Database {
    /// Create a new database connection and initialize schema
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = SqlitePool::connect(database_url).await?;
        let db = Self { pool };
        db.init_schema().await?;
        Ok(db)
    }

    /// Initialize database schema
    async fn init_schema(&self) -> Result<(), sqlx::Error> {
        // Create users table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create messages table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                file_data TEXT,
                file_name TEXT,
                file_type TEXT,
                audio_duration REAL,
                FOREIGN KEY (from_user_id) REFERENCES users(id),
                FOREIGN KEY (to_user_id) REFERENCES users(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create reactions table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS reactions (
                message_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                PRIMARY KEY (message_id, user_id),
                FOREIGN KEY (message_id) REFERENCES messages(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes for better query performance
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user_id)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user_id)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)
            "#,
        )
        .execute(&self.pool)
        .await?;

        tracing::info!("Database schema initialized");
        Ok(())
    }

    // ============ USER OPERATIONS ============

    /// Create a new user
    pub async fn create_user(
        &self,
        id: &str,
        username: &str,
        password_hash: &str,
    ) -> Result<DbUser, sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        
        sqlx::query(
            r#"
            INSERT INTO users (id, username, password_hash, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(id)
        .bind(username)
        .bind(password_hash)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(DbUser {
            id: id.to_string(),
            username: username.to_string(),
            password_hash: password_hash.to_string(),
            created_at: now.clone(),
            last_seen: now,
        })
    }

    /// Get user by username
    pub async fn get_user_by_username(&self, username: &str) -> Result<Option<DbUser>, sqlx::Error> {
        let user = sqlx::query_as::<_, DbUser>(
            r#"
            SELECT id, username, password_hash, created_at, last_seen
            FROM users
            WHERE username = ?
            "#,
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    /// Get user by ID
    pub async fn get_user_by_id(&self, id: &str) -> Result<Option<DbUser>, sqlx::Error> {
        let user = sqlx::query_as::<_, DbUser>(
            r#"
            SELECT id, username, password_hash, created_at, last_seen
            FROM users
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    /// Get all users
    pub async fn get_all_users(&self) -> Result<Vec<DbUser>, sqlx::Error> {
        let users = sqlx::query_as::<_, DbUser>(
            r#"
            SELECT id, username, password_hash, created_at, last_seen
            FROM users
            ORDER BY username
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(users)
    }

    /// Update user's last seen timestamp
    pub async fn update_last_seen(&self, user_id: &str) -> Result<(), sqlx::Error> {
        let now = Utc::now().to_rfc3339();
        
        sqlx::query(
            r#"
            UPDATE users SET last_seen = ? WHERE id = ?
            "#,
        )
        .bind(&now)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ============ MESSAGE OPERATIONS ============

    /// Save a message to the database
    pub async fn save_message(&self, message: &DbMessage) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO messages (id, from_user_id, to_user_id, content, timestamp, read, file_data, file_name, file_type, audio_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&message.id)
        .bind(&message.from_user_id)
        .bind(&message.to_user_id)
        .bind(&message.content)
        .bind(&message.timestamp)
        .bind(message.read as i32)
        .bind(&message.file_data)
        .bind(&message.file_name)
        .bind(&message.file_type)
        .bind(message.audio_duration)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get messages between two users with pagination
    pub async fn get_messages_between_users(
        &self,
        user1_id: &str,
        user2_id: &str,
        limit: i32,
        offset: i32,
    ) -> Result<Vec<DbMessage>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, from_user_id, to_user_id, content, timestamp, read, file_data, file_name, file_type, audio_duration
            FROM messages
            WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(user1_id)
        .bind(user2_id)
        .bind(user2_id)
        .bind(user1_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        let messages: Vec<DbMessage> = rows
            .iter()
            .map(|row| DbMessage {
                id: row.get("id"),
                from_user_id: row.get("from_user_id"),
                to_user_id: row.get("to_user_id"),
                content: row.get("content"),
                timestamp: row.get("timestamp"),
                read: row.get::<i32, _>("read") != 0,
                file_data: row.get("file_data"),
                file_name: row.get("file_name"),
                file_type: row.get("file_type"),
                audio_duration: row.get("audio_duration"),
            })
            .collect();

        Ok(messages)
    }

    /// Get all messages for a user (for loading conversation list)
    pub async fn get_user_conversations(&self, user_id: &str) -> Result<Vec<DbMessage>, sqlx::Error> {
        // Get the latest message from each conversation
        let rows = sqlx::query(
            r#"
            SELECT m.id, m.from_user_id, m.to_user_id, m.content, m.timestamp, m.read, m.file_data, m.file_name, m.file_type, m.audio_duration
            FROM messages m
            INNER JOIN (
                SELECT 
                    CASE 
                        WHEN from_user_id = ? THEN to_user_id 
                        ELSE from_user_id 
                    END as other_user,
                    MAX(timestamp) as max_ts
                FROM messages
                WHERE from_user_id = ? OR to_user_id = ?
                GROUP BY other_user
            ) latest ON (
                (m.from_user_id = ? AND m.to_user_id = latest.other_user) OR
                (m.from_user_id = latest.other_user AND m.to_user_id = ?)
            ) AND m.timestamp = latest.max_ts
            ORDER BY m.timestamp DESC
            "#,
        )
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        let messages: Vec<DbMessage> = rows
            .iter()
            .map(|row| DbMessage {
                id: row.get("id"),
                from_user_id: row.get("from_user_id"),
                to_user_id: row.get("to_user_id"),
                content: row.get("content"),
                timestamp: row.get("timestamp"),
                read: row.get::<i32, _>("read") != 0,
                file_data: row.get("file_data"),
                file_name: row.get("file_name"),
                file_type: row.get("file_type"),
                audio_duration: row.get("audio_duration"),
            })
            .collect();

        Ok(messages)
    }

    /// Mark a message as read
    pub async fn mark_message_read(&self, message_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE messages SET read = 1 WHERE id = ?
            "#,
        )
        .bind(message_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get unread message count for a user from another user
    pub async fn get_unread_count(&self, user_id: &str, from_user_id: &str) -> Result<i32, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM messages
            WHERE to_user_id = ? AND from_user_id = ? AND read = 0
            "#,
        )
        .bind(user_id)
        .bind(from_user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get::<i32, _>("count"))
    }

    // ============ REACTION OPERATIONS ============

    /// Add or update a reaction
    pub async fn add_reaction(&self, message_id: &str, user_id: &str, emoji: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO reactions (message_id, user_id, emoji)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(message_id)
        .bind(user_id)
        .bind(emoji)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Remove a reaction
    pub async fn remove_reaction(&self, message_id: &str, user_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            DELETE FROM reactions WHERE message_id = ? AND user_id = ?
            "#,
        )
        .bind(message_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get all reactions for a message
    pub async fn get_reactions(&self, message_id: &str) -> Result<HashMap<String, String>, sqlx::Error> {
        let rows = sqlx::query_as::<_, DbReaction>(
            r#"
            SELECT message_id, user_id, emoji
            FROM reactions
            WHERE message_id = ?
            "#,
        )
        .bind(message_id)
        .fetch_all(&self.pool)
        .await?;

        let mut reactions = HashMap::new();
        for row in rows {
            reactions.insert(row.user_id, row.emoji);
        }

        Ok(reactions)
    }

    /// Get reactions for multiple messages (batch load)
    pub async fn get_reactions_batch(&self, message_ids: &[String]) -> Result<HashMap<String, HashMap<String, String>>, sqlx::Error> {
        if message_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Build the IN clause
        let placeholders: Vec<&str> = message_ids.iter().map(|_| "?").collect();
        let query = format!(
            "SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN ({})",
            placeholders.join(",")
        );

        let mut query_builder = sqlx::query(&query);
        for id in message_ids {
            query_builder = query_builder.bind(id);
        }

        let rows = query_builder.fetch_all(&self.pool).await?;

        let mut reactions_map: HashMap<String, HashMap<String, String>> = HashMap::new();
        for row in rows {
            let message_id: String = row.get("message_id");
            let user_id: String = row.get("user_id");
            let emoji: String = row.get("emoji");

            reactions_map
                .entry(message_id)
                .or_default()
                .insert(user_id, emoji);
        }

        Ok(reactions_map)
    }

    /// Get total message count between two users (for pagination)
    pub async fn get_message_count_between_users(&self, user1_id: &str, user2_id: &str) -> Result<i32, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM messages
            WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
            "#,
        )
        .bind(user1_id)
        .bind(user2_id)
        .bind(user2_id)
        .bind(user1_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get::<i32, _>("count"))
    }
}

