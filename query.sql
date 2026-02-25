-- SQLite users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'NOC' CHECK(role IN ('admin','executive','NOC','finance')),
    created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

select * from users;

select * from roles

ALTER TABLE users
DROP COLUMN username;

SELECT CURRENT_database()