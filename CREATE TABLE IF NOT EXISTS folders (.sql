CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    folder_name VARCHAR(150) NOT NULL,
    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (folder_name, parent_id)
);

INSERT INTO folders (folder_name, parent_id)
VALUES 
('Human Intervention', NULL),
('Relocation', NULL)
ON CONFLICT DO NOTHING;


CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,

    -- Store uploader name instead of user ID
    uploader_name VARCHAR(150),

    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,

    file_size INTEGER,
    file_type VARCHAR(50),

    last_access TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


SELECT * FROM files;
DROP TABLE IF EXISTS files;

SELECT * FROM folders;

CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files( uploader_name);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);