-- Drop and recreate with message column
DROP TABLE IF EXISTS ticket_information;

CREATE TABLE ticket_information (
    id          SERIAL PRIMARY KEY,
    subject     VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    airmac_esn  VARCHAR(100),
    status      VARCHAR(50) NOT NULL,
    message     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ticket_information
ADD COLUMN IF NOT EXISTS file_path  TEXT;   -- path for uploaded file

SELECT * FROM ticket_information;