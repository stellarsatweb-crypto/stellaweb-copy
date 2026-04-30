-- ============================================================
--  STELLARSAT SOLUTIONS INC
--  FILE: project_expenses.sql
--  Project Expenses & Purchases Module
--
--  TABS:
--    Overview   → Charts (Purchases per Month + Expenses per Month)
--                 + Recent Project Records table
--    Purchases  → type = 'purchases'  (KPIs + full table + CRUD)
--    Expenses   → type = 'expenses'   (KPIs + full table + CRUD)
-- ============================================================


-- ============================================================
--  STEP 1: DROP ALL (clean slate)
-- ============================================================

DROP TABLE  IF EXISTS project_expenses   CASCADE;
DROP VIEW   IF EXISTS v_pe_kpis          CASCADE;
DROP VIEW   IF EXISTS v_pe_monthly       CASCADE;
DROP VIEW   IF EXISTS v_pe_recent        CASCADE;
DROP TYPE   IF EXISTS pe_status          CASCADE;
DROP TYPE   IF EXISTS pe_type            CASCADE;


-- ============================================================
--  STEP 2: ENUMS
-- ============================================================

CREATE TYPE pe_type AS ENUM (
    'expenses',    -- labor, subcontractor fees, permits, etc.
    'purchases'    -- materials, equipment, supplies, etc.
);

CREATE TYPE pe_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


-- ============================================================
--  STEP 3: PROJECT EXPENSES TABLE
-- ============================================================

CREATE TABLE project_expenses (
    id           SERIAL       PRIMARY KEY,
    date         DATE         NOT NULL,
    project      VARCHAR(200) NOT NULL,           -- project name (FK to projects table)
    type         pe_type      NOT NULL DEFAULT 'expenses',
    description  VARCHAR(500) NOT NULL,
    category     VARCHAR(100) NOT NULL DEFAULT 'Materials',
    vendor       VARCHAR(200),
    amount       NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    status       pe_status    NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering
CREATE INDEX idx_pe_date     ON project_expenses(date);
CREATE INDEX idx_pe_type     ON project_expenses(type);
CREATE INDEX idx_pe_status   ON project_expenses(status);
CREATE INDEX idx_pe_project  ON project_expenses(project);
CREATE INDEX idx_pe_type_dt  ON project_expenses(type, date);


-- ============================================================
--  STEP 4: AUTO-UPDATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_pe_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pe_updated
    BEFORE UPDATE ON project_expenses
    FOR EACH ROW EXECUTE FUNCTION fn_pe_set_updated_at();


-- ============================================================
--  STEP 5: SEED DATA
-- ============================================================

INSERT INTO project_expenses (date, project, type, description, category, vendor, amount, status) VALUES

-- ── PURCHASES ─────────────────────────────────────────────
('2026-01-15', 'Project A', 'purchases', 'Concrete and Rebar — Phase 1',       'Materials',  'ABC Supplies',      45000.00, 'approved'),
('2026-01-22', 'Project B', 'purchases', 'Network Cabling Batch 1',             'Materials',  'EleKtrikal Supply', 28000.00, 'approved'),
('2026-02-03', 'Project A', 'purchases', 'Construction Equipment Rental',       'Equipment',  'Rental PH',         38000.00, 'approved'),
('2026-02-10', 'Project C', 'purchases', 'Office Supplies and Furniture',       'Materials',  'Office Depot',       9500.00, 'pending'),
('2026-02-20', 'Project B', 'purchases', 'Switch and Router — Site B',          'Equipment',  'CDO Computers',     42000.00, 'approved'),
('2026-03-04', 'Project A', 'purchases', 'Welding Materials',                   'Materials',  'SM Construct',       3200.00, 'approved'),
('2026-03-04', 'Project B', 'purchases', 'Fiber Optic Cables — 500m',           'Materials',  'TechServ Corp',     15800.00, 'pending'),
('2026-03-18', 'Project C', 'purchases', 'UPS Units x2',                        'Equipment',  'APC Distributor',   22000.00, 'approved'),
('2026-04-02', 'Project A', 'purchases', 'Finishing Materials — Phase 2',       'Materials',  'ABC Supplies',      29500.00, 'pending'),

-- ── EXPENSES ──────────────────────────────────────────────
('2026-01-10', 'Project B', 'expenses',  'Subcontractor — Tower Installation', 'Labor',      'Alpha Contractors', 35000.00, 'approved'),
('2026-01-28', 'Project A', 'expenses',  'Permit and LGU Clearance Fees',      'Logistics',  'City Hall',          8500.00, 'approved'),
('2026-02-05', 'Project C', 'expenses',  'Site Engineer Daily Rate x20',       'Labor',      NULL,                40000.00, 'approved'),
('2026-02-15', 'Project B', 'expenses',  'Delivery and Hauling — Materials',   'Logistics',  'FastTrack Cargo',    6200.00, 'approved'),
('2026-02-25', 'Project A', 'expenses',  'Miscellaneous Site Expenses',        'Other',      NULL,                 4800.00, 'pending'),
('2026-03-01', 'Project C', 'expenses',  'Electrician Team — 3 weeks',         'Labor',      NULL,                28000.00, 'approved'),
('2026-03-10', 'Project B', 'expenses',  'Fuel and Transportation — March',    'Logistics',  NULL,                 5500.00, 'pending'),
('2026-03-20', 'Project A', 'expenses',  'Quality Inspection Fee',             'Other',      'QA Inspect PH',      3000.00, 'rejected'),
('2026-04-01', 'Project B', 'expenses',  'Subcontractor — Final Phase',        'Labor',      'Alpha Contractors', 30000.00, 'pending');


-- ============================================================
--  STEP 6: VIEWS
-- ============================================================

-- ── Overall KPIs (used for financial report integration) ──
CREATE OR REPLACE VIEW v_pe_kpis AS
SELECT
    SUM(amount)                                                          AS grand_total,
    SUM(CASE WHEN type = 'purchases' THEN amount ELSE 0 END)            AS purchases_total,
    SUM(CASE WHEN type = 'expenses'  THEN amount ELSE 0 END)            AS expenses_total,
    SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END)           AS approved_total,
    SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END)           AS pending_total,
    SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END)           AS rejected_total
FROM project_expenses;

-- ── Monthly chart data by type ──
CREATE OR REPLACE VIEW v_pe_monthly AS
SELECT
    type,
    TO_CHAR(date, 'YYYY-MM')   AS month_key,
    TO_CHAR(date, 'Mon YYYY')  AS month_label,
    SUM(amount)                AS total,
    SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) AS approved,
    SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END) AS pending,
    SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END) AS rejected
FROM project_expenses
GROUP BY type, month_key, month_label
ORDER BY month_key, type;

-- ── Recent records (Overview table) ──
CREATE OR REPLACE VIEW v_pe_recent AS
SELECT
    id, date, project AS project_name, type,
    description, category, vendor, amount, status,
    created_at
FROM project_expenses
ORDER BY date DESC;


-- ============================================================
--  STEP 7: SAMPLE QUERIES
-- ============================================================

-- Overview: recent records (all types)
-- SELECT * FROM v_pe_recent LIMIT 20;

-- Overview chart — this month only:
-- SELECT * FROM v_pe_monthly
-- WHERE month_key = TO_CHAR(CURRENT_DATE, 'YYYY-MM');

-- Purchases tab (current month):
-- SELECT * FROM project_expenses
-- WHERE type = 'purchases'
--   AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)
-- ORDER BY date DESC;

-- Expenses tab (current month):
-- SELECT * FROM project_expenses
-- WHERE type = 'expenses'
--   AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)
-- ORDER BY date DESC;

-- KPIs for Purchases tab:
-- SELECT * FROM v_pe_kpis;

-- Filter by status:
-- SELECT * FROM project_expenses WHERE type='purchases' AND status='pending';

-- Filter by custom date range:
-- SELECT * FROM project_expenses
-- WHERE date BETWEEN '2026-01-01' AND '2026-03-31'
-- ORDER BY date DESC;

-- Per-project breakdown:
-- SELECT project, type,
--        SUM(amount) AS total,
--        COUNT(*)    AS record_count
-- FROM project_expenses
-- GROUP BY project, type
-- ORDER BY project, type;