-- ============================================================
-- ID REQUEST TABLE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;

DROP VIEW  IF EXISTS id_requests_full CASCADE;
DROP TABLE IF EXISTS id_requests CASCADE;


-- ============================================================
-- ID REQUESTS TABLE
-- ============================================================

CREATE TABLE id_requests (
    id              SERIAL PRIMARY KEY,
    requested_by    INT REFERENCES users(id) ON DELETE SET NULL,
    request_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    id_type         CITEXT NOT NULL CHECK (
                        LOWER(id_type) IN (
                            'company id','access card',
                            'visitor id','temporary id','other'
                        )),
    purpose         TEXT,
    approved_by     INT REFERENCES users(id) ON DELETE SET NULL,
    approval_date   DATE,
    release_date    DATE,
    released_by     INT REFERENCES users(id) ON DELETE SET NULL,
    status          CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                        LOWER(status) IN (
                            'pending','approved','processing',
                            'released','rejected','cancelled'
                        )),
    remarks         TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- TRIGGER — auto-set dates on status change
-- ============================================================

CREATE OR REPLACE FUNCTION fn_id_request_dates()
RETURNS TRIGGER AS $$
BEGIN
    IF LOWER(NEW.status) = 'approved' AND
       (OLD.status IS NULL OR LOWER(OLD.status) != 'approved') THEN
        NEW.approval_date := CURRENT_DATE;
    END IF;

    IF LOWER(NEW.status) = 'released' AND
       (OLD.status IS NULL OR LOWER(OLD.status) != 'released') THEN
        NEW.release_date := CURRENT_DATE;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_id_request_dates
BEFORE UPDATE ON id_requests
FOR EACH ROW EXECUTE FUNCTION fn_id_request_dates();


-- ============================================================
-- VIEW
-- ============================================================

CREATE VIEW id_requests_full AS
SELECT
    ir.id,
    ir.request_date,
    req.full_name       AS requested_by,
    req.role            AS requester_role,
    ir.id_type,
    ir.purpose,
    apr.full_name       AS approved_by,
    ir.approval_date,
    ir.release_date,
    rel.full_name       AS released_by,
    ir.status,
    ir.remarks,
    ir.created_at,
    ir.updated_at
FROM id_requests ir
LEFT JOIN users req ON ir.requested_by = req.id
LEFT JOIN users apr ON ir.approved_by  = apr.id
LEFT JOIN users rel ON ir.released_by  = rel.id
ORDER BY ir.request_date DESC;


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_id_requests_status    ON id_requests(status);
CREATE INDEX IF NOT EXISTS idx_id_requests_requester ON id_requests(requested_by);


-- ============================================================
-- DUMMY DATA
-- ============================================================

INSERT INTO id_requests (requested_by, id_type, purpose, status) VALUES
    (1, 'company id',   'New employee ID',       'Pending'),
    (1, 'access card',  'Replacement lost card', 'Approved'),
    (1, 'temporary id', 'Visitor access March',  'Released');


-- ============================================================
-- VERIFY
-- ============================================================

SELECT * FROM id_requests_full;