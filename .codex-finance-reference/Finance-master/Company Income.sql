-- ============================================================
--  STELLARSAT SOLUTIONS INC
--  FILE 1: company_income.sql
--  Standalone Company Income Database
--  Updated: "name" column renamed to "project_name"
-- ============================================================


-- ============================================================
--  STEP 1: DROP ALL
-- ============================================================

DROP TABLE  IF EXISTS income_records       CASCADE;
DROP TABLE  IF EXISTS income_sources       CASCADE;
DROP TABLE  IF EXISTS users                CASCADE;
DROP VIEW   IF EXISTS v_income_summary     CASCADE;
DROP VIEW   IF EXISTS v_income_monthly     CASCADE;
DROP VIEW   IF EXISTS v_income_pending     CASCADE;
DROP VIEW   IF EXISTS v_income_by_project  CASCADE;
DROP TYPE   IF EXISTS income_status        CASCADE;


-- ============================================================
--  STEP 2: ENUM
-- ============================================================

-- "pending" = money invoiced/expected but NOT yet received
CREATE TYPE income_status AS ENUM (
    'received',
    'pending',
    'cancelled'
);


-- ============================================================
--  STEP 3: USERS
-- ============================================================

CREATE TABLE users (
    id          SERIAL        PRIMARY KEY,
    full_name   VARCHAR(150)  NOT NULL,
    email       VARCHAR(150)  UNIQUE NOT NULL,
    role        VARCHAR(50)   NOT NULL DEFAULT 'finance_officer',
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

INSERT INTO users (full_name, email, role) VALUES
('Juan Dela Cruz',  'juan@stellarsat.com',  'finance_manager'),
('Maria Santos',    'maria@stellarsat.com', 'finance_officer'),
('Pedro Reyes',     'pedro@stellarsat.com', 'finance_officer');


-- ============================================================
--  STEP 4: INCOME SOURCES LOOKUP
-- ============================================================

CREATE TABLE income_sources (
    id    SERIAL        PRIMARY KEY,
    name  VARCHAR(100)  NOT NULL UNIQUE
);

INSERT INTO income_sources (name) VALUES
('Service Fee'),
('Installation Fee'),
('Subscription'),
('Maintenance'),
('Client Payment'),
('Other');


-- ============================================================
--  STEP 5: INCOME RECORDS
--
--  "project_name" column:
--    NULL            → General Company Income (no specific project)
--    'Lot A'–'Lot G' → Project / Client Income tied to a project
--
--  "status":
--    received  → money has arrived
--    pending   → invoiced but NOT yet received (money on the way)
--    cancelled → deal cancelled
-- ============================================================

CREATE TABLE income_records (
    id            SERIAL          PRIMARY KEY,
    date          DATE            NOT NULL,
    project_name  VARCHAR(100),                         -- NULL = general company income; 'Lot A' etc = project income
    source_id     INT             NOT NULL REFERENCES income_sources(id) ON DELETE RESTRICT,
    description   VARCHAR(255)    NOT NULL,
    amount        NUMERIC(15,2)   NOT NULL CHECK (amount > 0),
    status        income_status   NOT NULL DEFAULT 'pending',
    or_number     VARCHAR(100),
    remarks       TEXT,
    recorded_by   INT             REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP       NOT NULL DEFAULT NOW()
);

ALTER TABLE income_records
ALTER COLUMN source_id DROP NOT NULL;  

CREATE INDEX idx_income_date          ON income_records(date);
CREATE INDEX idx_income_status        ON income_records(status);
CREATE INDEX idx_income_project_name  ON income_records(project_name);
CREATE INDEX idx_income_source        ON income_records(source_id);
CREATE INDEX idx_income_recorder      ON income_records(recorded_by);


-- ============================================================
--  STEP 6: SEED DATA
-- ============================================================

-- General Company Income (project_name IS NULL)
INSERT INTO income_records (date, project_name, source_id, description, amount, status, or_number, recorded_by) VALUES
('2026-01-05',  NULL, 1, 'Monthly Satellite Internet Service — Jan',  320000.00, 'received', 'OR-2026-001', 1),
('2026-01-18',  NULL, 2, 'Equipment Setup — Client Group A',           60000.00, 'received', 'OR-2026-002', 2),
('2026-02-05',  NULL, 1, 'Monthly Satellite Internet Service — Feb',  350000.00, 'received', 'OR-2026-003', 1),
('2026-02-20',  NULL, 3, 'Annual Maintenance Plan Renewal',            52000.00, 'pending',  NULL,          2),
('2026-03-05',  NULL, 1, 'Monthly Satellite Internet Service — Mar',  400000.00, 'received', 'OR-2026-004', 1),
('2026-03-12',  NULL, 2, 'Tower Setup — New Site',                     80000.00, 'pending',  NULL,          2),
('2026-03-22',  NULL, 4, 'Quarterly Maintenance — Client B',           45000.00, 'pending',  NULL,          3);

-- Project Income (project_name = Lot / Client name)
INSERT INTO income_records (date, project_name, source_id, description, amount, status, or_number, recorded_by) VALUES
('2026-01-10', 'Lot A', 5, 'Satellite Service — Lot A Client',        120000.00, 'received', 'OR-2026-010', 2),
('2026-01-25', 'Lot B', 2, 'Equipment Setup — Lot B',                  80000.00, 'received', 'OR-2026-011', 2),
('2026-02-08', 'Lot C', 3, 'Monthly Plan — Lot C',                     60000.00, 'received', 'OR-2026-012', 2),
('2026-02-15', 'Lot D', 5, 'Satellite Service — Lot D',                95000.00, 'pending',  NULL,          3),
('2026-03-03', 'Lot E', 4, 'Tower Inspection — Lot E',                 45000.00, 'received', 'OR-2026-013', 2),
('2026-03-18', 'Lot F', 5, 'Satellite Service — Lot F',               110000.00, 'pending',  NULL,          3),
('2026-03-28', 'Lot G', 2, 'Full Setup — Lot G New Client',            75000.00, 'pending',  NULL,          3);

ALTER TABLE income_records ALTER COLUMN description DROP NOT NULL;

select * from income_records;
-- ============================================================
--  STEP 7: VIEWS
-- ============================================================

-- Overall KPI summary
CREATE OR REPLACE VIEW v_income_summary AS
SELECT
    SUM(amount)                                                         AS grand_total,
    SUM(CASE WHEN status = 'received'        THEN amount ELSE 0 END)   AS total_received,
    SUM(CASE WHEN status = 'pending'         THEN amount ELSE 0 END)   AS total_pending,
    SUM(CASE WHEN status = 'cancelled'       THEN amount ELSE 0 END)   AS total_cancelled,
    SUM(CASE WHEN project_name IS NULL       THEN amount ELSE 0 END)   AS company_income,
    SUM(CASE WHEN project_name IS NOT NULL   THEN amount ELSE 0 END)   AS project_income
FROM income_records;

-- Monthly breakdown
CREATE OR REPLACE VIEW v_income_monthly AS
SELECT
    TO_CHAR(date, 'YYYY-MM')   AS month_key,
    TO_CHAR(date, 'Month')     AS month_label,
    SUM(amount)                AS total,
    SUM(CASE WHEN status = 'received' THEN amount ELSE 0 END)  AS received,
    SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END)  AS pending
FROM income_records
GROUP BY month_key, month_label
ORDER BY month_key;

-- Pending income only (money not yet received)
CREATE OR REPLACE VIEW v_income_pending AS
SELECT
    ir.id,
    ir.date,
    ir.project_name,
    s.name       AS source,
    ir.description,
    ir.amount,
    ir.or_number,
    ir.remarks,
    u.full_name  AS recorded_by
FROM income_records ir
JOIN income_sources s ON s.id = ir.source_id
LEFT JOIN users u     ON u.id = ir.recorded_by
WHERE ir.status = 'pending'
ORDER BY ir.date;

-- Project income breakdown per project_name
CREATE OR REPLACE VIEW v_income_by_project AS
SELECT
    project_name,
    COUNT(*)                                                        AS total_entries,
    SUM(amount)                                                     AS total_amount,
    SUM(CASE WHEN status = 'received' THEN amount ELSE 0 END)      AS received,
    SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END)      AS pending
FROM income_records
WHERE project_name IS NOT NULL
GROUP BY project_name
ORDER BY project_name;


-- ============================================================
--  STEP 8: AUTO-UPDATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_income_updated
    BEFORE UPDATE ON income_records
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================
--  VERIFICATION QUERIES (uncomment to test)
-- ============================================================

-- SELECT * FROM income_records ORDER BY date;
-- SELECT * FROM v_income_summary;
-- SELECT * FROM v_income_monthly;
-- SELECT * FROM v_income_pending;
-- SELECT * FROM v_income_by_project;
-- SELECT project_name, COUNT(*) FROM income_records GROUP BY project_name;