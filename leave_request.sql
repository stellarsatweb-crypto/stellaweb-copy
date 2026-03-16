-- ============================================================
-- FULL LEAVE REQUEST SETUP
-- ============================================================


-- ============================================================
-- STEP 1: DROP EXISTING (safe to re-run)
-- ============================================================

DROP VIEW  IF EXISTS leave_requests_full CASCADE;
DROP TABLE IF EXISTS leave_requests_history CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;

CREATE EXTENSION IF NOT EXISTS citext;


-- ============================================================
-- STEP 2: CREATE LEAVE REQUESTS TABLE
-- ============================================================

CREATE TABLE leave_requests (
    id              SERIAL PRIMARY KEY,
    -- Employee Info
    employee_id     INT REFERENCES users(id) ON DELETE SET NULL,
    department      CITEXT,
    position        CITEXT,
    -- Leave Details
    leave_type      CITEXT NOT NULL CHECK (
                        LOWER(leave_type) IN (
                            'vacation','sick','emergency',
                            'maternity','paternity','others'
                        )),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    number_of_days  NUMERIC(5,1),
    -- Reason & Attachment
    reason          CITEXT,
    attachment      TEXT,
    -- Approval Info
    status          CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                        LOWER(status) IN (
                            'pending','approved','rejected','cancelled'
                        )),
    remarks         TEXT,
    submitted_at    TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 3: HISTORY TABLE
-- ============================================================

CREATE TABLE leave_requests_history (
    history_id      SERIAL PRIMARY KEY,
    request_id      INT,
    employee_name   CITEXT,
    employee_id_no  CITEXT,
    department      CITEXT,
    position        CITEXT,
    leave_type      CITEXT,
    start_date      DATE,
    end_date        DATE,
    number_of_days  NUMERIC(5,1),
    reason          CITEXT,
    attachment      TEXT,
    status          CITEXT,
    remarks         TEXT,
    submitted_at    TIMESTAMP,
    updated_at      TIMESTAMP,
    change_type     VARCHAR(10) CHECK (change_type IN ('INSERT','UPDATE')),
    saved_at        TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 4: AUTO-CALCULATE number_of_days + update timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION fn_calculate_leave_days()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.number_of_days IS NULL THEN
        NEW.number_of_days := (NEW.end_date - NEW.start_date) + 1;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_leave_days
BEFORE INSERT OR UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION fn_calculate_leave_days();


-- ============================================================
-- STEP 5: VIEW
-- ============================================================

CREATE VIEW leave_requests_full AS
SELECT
    lr.id,
    e.full_name         AS employee_name,
    e.id_no             AS employee_id_no,
    lr.department,
    lr.position,
    lr.leave_type,
    lr.start_date,
    lr.end_date,
    lr.number_of_days,
    lr.reason,
    lr.attachment,
    lr.status,
    lr.remarks,
    lr.submitted_at,
    lr.updated_at
FROM leave_requests lr
LEFT JOIN users e ON lr.employee_id = e.id
ORDER BY lr.submitted_at DESC;


-- ============================================================
-- STEP 6: HISTORY TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_save_leave_history()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO leave_requests_history (
        request_id, employee_name, employee_id_no,
        department, position, leave_type,
        start_date, end_date, number_of_days,
        reason, attachment, status,
        remarks, submitted_at, updated_at,
        change_type
    )
    SELECT
        v.id, v.employee_name, v.employee_id_no,
        v.department, v.position, v.leave_type,
        v.start_date, v.end_date, v.number_of_days,
        v.reason, v.attachment, v.status,
        v.remarks, v.submitted_at, v.updated_at,
        TG_OP
    FROM leave_requests_full v
    WHERE v.id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leave_requests_history
AFTER INSERT OR UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION fn_save_leave_history();

-- ============================================================
-- STEP 7: VERIFY
-- ============================================================

-- Full view
SELECT * FROM leave_requests_full;

-- History (auto-populated by trigger)
SELECT * FROM leave_requests_history ORDER BY saved_at DESC;

-- Summary per employee
SELECT
    employee_name,
    COUNT(*)                AS total_requests,
    SUM(number_of_days)     AS total_days_taken,
    MAX(saved_at)           AS last_activity
FROM leave_requests_history
GROUP BY employee_name
ORDER BY employee_name;

-- Filter by status
SELECT * FROM leave_requests_full WHERE LOWER(status) = 'pending';
SELECT * FROM leave_requests_full WHERE LOWER(status) = 'approved';
SELECT * FROM leave_requests_full WHERE LOWER(status) = 'rejected';