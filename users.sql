CREATE EXTENSION IF NOT EXISTS citext;

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  id_no         CITEXT UNIQUE NOT NULL,
  full_name     CITEXT NOT NULL,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          CITEXT NOT NULL CHECK
    (LOWER(role) IN ('executive','finance','noc','admin','bidder')),
  photo         TEXT,                        -- stores file path or URL
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verify
SELECT * FROM users;