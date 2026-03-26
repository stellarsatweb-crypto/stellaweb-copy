-- ============================================================
-- FILE REQUESTS TABLE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;

DROP VIEW  IF EXISTS file_requests_full CASCADE;
DROP TABLE IF EXISTS file_request_evidence CASCADE;
DROP TABLE IF EXISTS file_requests CASCADE;


-- ============================================================
-- FILE REQUESTS TABLE
-- ============================================================

CREATE TABLE file_requests (
    id               SERIAL PRIMARY KEY,

    -- Who is requesting
    requested_by     INT REFERENCES users(id) ON DELETE SET NULL,
    request_date     DATE NOT NULL DEFAULT CURRENT_DATE,

    -- File details
    file_description CITEXT NOT NULL,
    document_type    CITEXT NOT NULL CHECK (
                         LOWER(document_type) IN ('original','copy')
                     ),
    -- Action
    action_type      CITEXT NOT NULL CHECK (
                         LOWER(action_type) IN ('pick-up','return')
                     ),
    -- Approval — NOC Head or Executive only
    approved_by      INT REFERENCES users(id) ON DELETE SET NULL,
    approval_date    DATE,

    -- Pick-up / Return tracking
    pickup_date      DATE,
    return_date      DATE,
    pickup_by        CITEXT,
    returned_by      CITEXT,

    -- Proof of pick-up path
    proof_path       TEXT,

    -- Status
    status           CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                         LOWER(status) IN (
                             'pending','approved','released',
                             'returned','rejected','cancelled'
                         )
                     ),
    remarks          TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- EVIDENCE TABLE — proof of pick-up / evidence uploads
-- ============================================================

CREATE TABLE file_request_evidence (
    id              SERIAL PRIMARY KEY,
    file_request_id INT NOT NULL REFERENCES file_requests(id) ON DELETE CASCADE,
    evidence_type   CITEXT CHECK (
                        LOWER(evidence_type) IN (
                            'proof of pickup','proof of return',
                            'signature','other'
                        )),
    file_name       CITEXT,
    file_path       TEXT NOT NULL,
    file_size       NUMERIC(10,2),
    uploaded_by     INT REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- TRIGGER — auto-set dates on status change
-- ============================================================

CREATE OR REPLACE FUNCTION fn_file_request_dates()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-set approval_date when approved
    IF LOWER(NEW.status) = 'approved' AND
       (OLD.status IS NULL OR LOWER(OLD.status) != 'approved') THEN
        NEW.approval_date := CURRENT_DATE;
    END IF;

    -- Auto-set pickup_date when released
    IF LOWER(NEW.status) = 'released' AND
       (OLD.status IS NULL OR LOWER(OLD.status) != 'released') THEN
        NEW.pickup_date := CURRENT_DATE;
    END IF;

    -- Auto-set return_date when returned
    IF LOWER(NEW.status) = 'returned' AND
       (OLD.status IS NULL OR LOWER(OLD.status) != 'returned') THEN
        NEW.return_date := CURRENT_DATE;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_file_request_dates
BEFORE UPDATE ON file_requests
FOR EACH ROW EXECUTE FUNCTION fn_file_request_dates();


-- ============================================================
-- VIEW — only shows needed columns with user names
-- ============================================================

CREATE VIEW file_requests_full AS
SELECT
    fr.id,
    fr.request_date,
    req.full_name       AS requested_by,
    req.role            AS requester_role,
    fr.file_description,
    fr.document_type,                       -- original or copy
    fr.action_type,                         -- pick-up or return
    apr.full_name       AS approved_by,     -- NOC Head or Executive
    apr.role            AS approver_role,
    fr.approval_date,
    fr.pickup_date,
    fr.return_date,
    fr.pickup_by,
    fr.returned_by,
    fr.proof_path,                          -- proof of pick-up
    fr.status,
    fr.remarks,
    fr.created_at,
    fr.updated_at
FROM file_requests fr
LEFT JOIN users req ON fr.requested_by = req.id
LEFT JOIN users apr ON fr.approved_by  = apr.id
ORDER BY fr.request_date DESC;


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_file_requests_status    ON file_requests(status);
CREATE INDEX IF NOT EXISTS idx_file_requests_requester ON file_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_file_evidence_request   ON file_request_evidence(file_request_id);


-- ============================================================
-- DUMMY DATA
-- ============================================================

INSERT INTO file_requests
    (requested_by, file_description, document_type, action_type, status)
VALUES
    (1, 'NOC Acceptance Form - Benguet', 'original', 'pick-up', 'Pending'),
    (1, 'Project Completion Report Q1',  'copy',     'pick-up', 'Approved'),
    (1, 'Site Survey Document - Ifugao', 'copy',     'return',  'Returned');


-- ============================================================
-- VERIFY
-- ============================================================

SELECT * FROM file_requests_full;
SELECT * FROM file_request_evidence;