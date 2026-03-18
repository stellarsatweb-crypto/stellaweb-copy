-- ============================================================
-- STEP 1: ENABLE EXTENSION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;


-- ============================================================
-- STEP 2: DROP EXISTING (safe to re-run)
-- ============================================================

DROP VIEW  IF EXISTS project_progress_view CASCADE;
DROP TABLE IF EXISTS project_files CASCADE;
DROP TABLE IF EXISTS project_images CASCADE;
DROP TABLE IF EXISTS project_videos CASCADE;
DROP TABLE IF EXISTS project_progress CASCADE;
DROP TABLE IF EXISTS project_sites CASCADE;


-- ============================================================
-- STEP 3: SITES TABLE
-- status only: 'Pending' or 'Done'
-- ============================================================

CREATE TABLE project_sites (
    id          SERIAL PRIMARY KEY,
    site_name   CITEXT NOT NULL,
    status      CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                    LOWER(status) IN ('pending','done')
                ),
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 4: FILES TABLE
-- ============================================================

CREATE TABLE project_files (
    id          SERIAL PRIMARY KEY,
    site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
    file_name   CITEXT NOT NULL,
    file_path   TEXT NOT NULL,
    file_size   NUMERIC(10,2),
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 5: IMAGES TABLE
-- ============================================================

CREATE TABLE project_images (
    id          SERIAL PRIMARY KEY,
    site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
    image_name  CITEXT NOT NULL,
    image_path  TEXT NOT NULL,
    file_size   NUMERIC(10,2),
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 6: VIDEOS TABLE
-- ============================================================

CREATE TABLE project_videos (
    id          SERIAL PRIMARY KEY,
    site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
    video_name  CITEXT NOT NULL,
    video_path  TEXT NOT NULL,
    file_size   NUMERIC(10,2),
    duration    VARCHAR(20),
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 7: PROGRESS TABLE
-- only stores project_name + progress %
-- pending/done counts are computed internally, NOT stored
-- ============================================================

CREATE TABLE project_progress (
    id           SERIAL PRIMARY KEY,
    project_name CITEXT NOT NULL UNIQUE,
    progress     NUMERIC(5,2) DEFAULT 0,    -- % of Done sites
    updated_at   TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 8: TRIGGER — auto-updates progress % on every site change
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_project_name CITEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_project_name := OLD.site_name;
    ELSE
        v_project_name := NEW.site_name;
    END IF;

    -- Create project entry if it doesn't exist yet
    INSERT INTO project_progress (project_name)
    VALUES (v_project_name)
    ON CONFLICT (project_name) DO NOTHING;

    -- Recalculate progress % from site statuses
    UPDATE project_progress pp
    SET
        progress   = ROUND(
                        (
                            SELECT COUNT(*) FILTER (WHERE LOWER(status) = 'done')::NUMERIC
                            / NULLIF(COUNT(*), 0) * 100
                            FROM project_sites
                            WHERE site_name = v_project_name
                        ), 2),
        updated_at = NOW()
    WHERE pp.project_name = v_project_name;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_project_progress
AFTER INSERT OR UPDATE OR DELETE ON project_sites
FOR EACH ROW EXECUTE FUNCTION fn_update_project_progress();


-- ============================================================
-- STEP 9: PROGRESS VIEW — only shows project_name + progress
-- ============================================================

CREATE VIEW project_progress_view AS
SELECT
    project_name,
    progress        AS progress_percent,
    updated_at
FROM project_progress
ORDER BY project_name;


-- ============================================================
-- REMINDER: REFERENCED USERS TABLE
-- ============================================================

-- Check if you have any users first
SELECT id, full_name, role FROM users;


-- ============================================================
-- STEP 10: VERIFY
-- ============================================================

-- Progress per project (only project_name + progress % shown)
SELECT * FROM project_progress_view;

-- Sites with uploader name
SELECT
    ps.id,
    ps.site_name,
    ps.status,
    u.full_name AS uploaded_by,
    ps.created_at
FROM project_sites ps
LEFT JOIN users u ON ps.uploaded_by = u.id
ORDER BY ps.site_name;

SELECT * FROM project_files;
SELECT * FROM project_images;
SELECT * FROM project_videos;
```