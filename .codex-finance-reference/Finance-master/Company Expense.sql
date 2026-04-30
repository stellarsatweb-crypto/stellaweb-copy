-- ============================================================
--  STELLARSAT SOLUTIONS INC
--  FILE 2: company_expenses.sql
--  Standalone Company Expenses Database
--
--  TABS COVERED:
--    Overview     → all expenses with specific date filter
--    Expenses     → type = 'expenses'
--    Purchases    → type = 'purchases'
--    Overhead     → type = 'overhead'
--    Contribution → SSS / PhilHealth / Pag-Ibig per employee
-- ============================================================


-- ============================================================
--  STEP 1: DROP ALL
-- ============================================================

DROP TABLE  IF EXISTS contributions         CASCADE;
DROP TABLE  IF EXISTS company_expenses      CASCADE;
DROP TABLE  IF EXISTS users                 CASCADE;

DROP VIEW   IF EXISTS v_expense_kpis        CASCADE;
DROP VIEW   IF EXISTS v_expense_sub_kpis    CASCADE;
DROP VIEW   IF EXISTS v_expense_monthly     CASCADE;
DROP VIEW   IF EXISTS v_expense_by_date     CASCADE;
DROP VIEW   IF EXISTS v_contribution_kpis   CASCADE;

DROP TYPE   IF EXISTS expense_type          CASCADE;
DROP TYPE   IF EXISTS expense_status        CASCADE;
DROP TYPE   IF EXISTS contribution_type     CASCADE;
DROP TYPE   IF EXISTS contribution_status   CASCADE;


-- ============================================================
--  STEP 2: ENUMS
-- ============================================================

CREATE TYPE expense_type AS ENUM (
    'expenses',    -- Salaries, Contractor Fees, Legal, Utilities
    'purchases',   -- Equipment, Software, Supplies, Materials
    'overhead'     -- Rent, Internet, Insurance, Depreciation
);

CREATE TYPE expense_status AS ENUM (
    'paid',
    'unpaid',
    'pending'
);

-- Contribution: government-mandated benefit types
CREATE TYPE contribution_type AS ENUM (
    'SSS',
    'PhilHealth',
    'Pag-Ibig'
);

-- Contribution: payment status — matches the colored badges in the picture
CREATE TYPE contribution_status AS ENUM (
    'Paid',
    'Unpaid',
    'Overdue'
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
--  STEP 4: COMPANY EXPENSES
--
--  "date" column is fully indexed for the Overview
--  specific date range filter feature.
--
--  Tab routing on the frontend:
--    Overview   → SELECT * (all types), filtered by date range
--    Expenses   → WHERE type = 'expenses'
--    Purchases  → WHERE type = 'purchases'
--    Overhead   → WHERE type = 'overhead'
-- ============================================================

CREATE TABLE company_expenses (
    id          SERIAL          PRIMARY KEY,
    type        expense_type    NOT NULL DEFAULT 'expenses',
    date        DATE            NOT NULL,
    category    VARCHAR(100)    NOT NULL,
    description VARCHAR(500)    NOT NULL,
    vendor      VARCHAR(200),
    amount      NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (amount >= 0),
    status      expense_status  NOT NULL DEFAULT 'pending',
    recorded_by INT             REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

-- Indexes for fast tab filtering and date range queries
CREATE INDEX idx_exp_type           ON company_expenses(type);
CREATE INDEX idx_exp_date           ON company_expenses(date);
CREATE INDEX idx_exp_status         ON company_expenses(status);
CREATE INDEX idx_exp_type_date      ON company_expenses(type, date);
CREATE INDEX idx_exp_type_status    ON company_expenses(type, status);
CREATE INDEX idx_exp_date_range     ON company_expenses(date, type, status);


-- ============================================================
--  STEP 5: SEED DATA — COMPANY EXPENSES
-- ============================================================

INSERT INTO company_expenses (type, date, category, description, vendor, amount, status) VALUES

-- ── EXPENSES ──────────────────────────────────────────────
('expenses', '2026-01-02', 'Salaries',        'Staff Payroll — January',               'Payroll System',         200000.00, 'paid'),
('expenses', '2026-01-13', 'Contractor Fees', 'Tower Installation Contractor',          'Alpha Contractors',       45000.00, 'unpaid'),
('expenses', '2026-01-28', 'Legal Fees',      'Contract Review — Legal Team',           'Santos Law Office',       15000.00, 'pending'),
('expenses', '2026-02-02', 'Salaries',        'Staff Payroll — February',              'Payroll System',         200000.00, 'paid'),
('expenses', '2026-02-14', 'Utilities',       'Electricity Bill — February',            'MERALCO',                 18500.00, 'paid'),
('expenses', '2026-02-20', 'Contractor Fees', 'Satellite Dish Maintenance',             'TechServ Corp',           22000.00, 'pending'),
('expenses', '2026-03-02', 'Salaries',        'Staff Payroll — March',                 'Payroll System',         200000.00, 'paid'),
('expenses', '2026-03-15', 'Legal Fees',      'Permit Processing Fees',                'City Hall',                8500.00, 'paid'),
('expenses', '2026-03-22', 'Utilities',       'Water Bill — March',                    'Manila Water',             3200.00, 'paid'),

-- ── PURCHASES ─────────────────────────────────────────────
('purchases', '2026-01-10', 'Equipment',  'Network Switch — Cisco 24-port',            'CDO Computers',           85000.00, 'paid'),
('purchases', '2026-01-28', 'Software',   'Monthly Service Plan — MS365',              'Microsoft Philippines',   60000.00, 'paid'),
('purchases', '2026-02-05', 'Supplies',   'Office Supplies — Q1 Batch',                'National Bookstore',      12500.00, 'paid'),
('purchases', '2026-02-18', 'Materials',  'Cabling Materials — Phase 2',               'EleKtrikal Supply',       38000.00, 'pending'),
('purchases', '2026-03-01', 'Equipment',  'UPS Backup Units x4',                       'APC Distributor PH',      64000.00, 'paid'),
('purchases', '2026-03-10', 'Software',   'Antivirus License Renewal',                 'Kaspersky PH',            15000.00, 'paid'),
('purchases', '2026-03-25', 'Supplies',   'Printer Ink & Paper — Q1',                  'Office Depot',             7800.00, 'pending'),

-- ── OVERHEAD ──────────────────────────────────────────────
('overhead', '2026-01-01', 'Rent',         'Office Space Rental — January',            'SM Prime Holdings',       35000.00, 'paid'),
('overhead', '2026-01-15', 'Internet',     'Fiber Internet — January',                 'PLDT',                    12000.00, 'paid'),
('overhead', '2026-01-25', 'Insurance',    'Office Building Insurance Premium',        'Malayan Insurance',        8500.00, 'paid'),
('overhead', '2026-02-01', 'Rent',         'Office Space Rental — February',           'SM Prime Holdings',       35000.00, 'paid'),
('overhead', '2026-02-15', 'Internet',     'Fiber Internet — February',                'PLDT',                    12000.00, 'paid'),
('overhead', '2026-03-01', 'Rent',         'Office Space Rental — March',              'SM Prime Holdings',       35000.00, 'paid'),
('overhead', '2026-03-15', 'Depreciation', 'Equipment Depreciation — Q1',             NULL,                       6200.00, 'pending'),
('overhead', '2026-03-20', 'Insurance',    'Vehicle Insurance Renewal',                'Pioneer Insurance',        9800.00, 'paid');


-- ============================================================
--  STEP 6: CONTRIBUTION TABLE
--
--  Matches the picture EXACTLY:
--  Columns: Name | Type | Employee Share | Employer Share | Total | Due Date | Status
--
--  Summary cards (top of Contribution tab):
--    Total ₱569,200 | Paid ₱340,000 | Unpaid ₱167,500 | Overdue ₱61,700
--
--  Status badge colors (frontend):
--    Paid    → green
--    Unpaid  → orange/yellow
--    Overdue → red
-- ============================================================

CREATE TABLE contributions (
    id              SERIAL               PRIMARY KEY,
    name            VARCHAR(150)         NOT NULL,
    type            contribution_type    NOT NULL,
    employee_share  NUMERIC(10,2)        NOT NULL DEFAULT 0 CHECK (employee_share >= 0),
    employer_share  NUMERIC(10,2)        NOT NULL DEFAULT 0 CHECK (employer_share >= 0),
    -- "total" is auto-calculated: employee_share + employer_share
    total           NUMERIC(10,2)        GENERATED ALWAYS AS (employee_share + employer_share) STORED,
    due_date        DATE                 NOT NULL,
    status          contribution_status  NOT NULL DEFAULT 'Unpaid',
    recorded_by     INT                  REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP            NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP            NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contrib_name     ON contributions(name);
CREATE INDEX idx_contrib_type     ON contributions(type);
CREATE INDEX idx_contrib_status   ON contributions(status);
CREATE INDEX idx_contrib_due_date ON contributions(due_date);


-- ============================================================
--  STEP 7: SEED DATA — CONTRIBUTION
--  Copied exactly from the picture you sent
-- ============================================================

INSERT INTO contributions (name, type, employee_share, employer_share, due_date, status) VALUES
('Lyka Sergantes',  'SSS',        1125.00,  2250.00, '2026-05-20', 'Paid'),
('Javob De Belen',  'PhilHealth',  900.00,  5000.00, '2026-05-20', 'Unpaid'),
('Shiella Pinili',  'Pag-Ibig',    600.00, 15000.00, '2026-05-20', 'Overdue'),
('Mergu Ewan',      'PhilHealth',  700.00,  5000.00, '2026-05-20', 'Unpaid'),
('Jae Yumul',       'Pag-Ibig',    800.00,  3000.00, '2026-05-20', 'Paid'),
('Printet Jimenez', 'PhilHealth',  400.00,  4000.00, '2026-05-20', 'Overdue'),
('Chini Acosta',    'Pag-Ibig',    300.00,  1000.00, '2026-05-20', 'Paid');


-- ============================================================
--  STEP 8: VIEWS
-- ============================================================

-- ── Overview: grand total KPIs ──
CREATE OR REPLACE VIEW v_expense_kpis AS
SELECT
    SUM(amount)                                                 AS grand_total,
    SUM(CASE WHEN type = 'expenses'  THEN amount ELSE 0 END)   AS expenses_total,
    SUM(CASE WHEN type = 'purchases' THEN amount ELSE 0 END)   AS purchases_total,
    SUM(CASE WHEN type = 'overhead'  THEN amount ELSE 0 END)   AS overhead_total
FROM company_expenses;

-- ── Per-tab KPIs: total + paid / unpaid / pending ──
CREATE OR REPLACE VIEW v_expense_sub_kpis AS
SELECT
    type,
    SUM(amount)                                                    AS total,
    SUM(CASE WHEN status = 'paid'    THEN amount ELSE 0 END)      AS paid,
    SUM(CASE WHEN status = 'unpaid'  THEN amount ELSE 0 END)      AS unpaid,
    SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END)      AS pending
FROM company_expenses
GROUP BY type;

-- ── Monthly totals per type (for Overview date-range chart) ──
CREATE OR REPLACE VIEW v_expense_monthly AS
SELECT
    TO_CHAR(date, 'YYYY-MM')  AS month_key,
    TO_CHAR(date, 'Mon YYYY') AS month_label,
    type,
    SUM(amount)               AS total,
    SUM(CASE WHEN status = 'paid'    THEN amount ELSE 0 END) AS paid,
    SUM(CASE WHEN status = 'unpaid'  THEN amount ELSE 0 END) AS unpaid,
    SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending
FROM company_expenses
GROUP BY month_key, month_label, type
ORDER BY month_key, type;

-- ── Specific date filter view for Overview tab ──
--  Usage: SELECT * FROM v_expense_by_date
--         WHERE date BETWEEN '2026-03-01' AND '2026-03-31';
CREATE OR REPLACE VIEW v_expense_by_date AS
SELECT
    id,
    type,
    date,
    category,
    description,
    vendor,
    amount,
    status,
    created_at
FROM company_expenses
ORDER BY date DESC;

-- ── Contribution tab: 4 summary cards ──
--  Total | Paid | Unpaid | Overdue  (matches picture exactly)
CREATE OR REPLACE VIEW v_contribution_kpis AS
SELECT
    SUM(total)                                                  AS grand_total,
    SUM(CASE WHEN status = 'Paid'    THEN total ELSE 0 END)    AS total_paid,
    SUM(CASE WHEN status = 'Unpaid'  THEN total ELSE 0 END)    AS total_unpaid,
    SUM(CASE WHEN status = 'Overdue' THEN total ELSE 0 END)    AS total_overdue
FROM contributions;

-- ── Contribution: per-type breakdown ──
CREATE OR REPLACE VIEW v_contribution_by_type AS
SELECT
    type,
    COUNT(*)                                                    AS employee_count,
    SUM(employee_share)                                         AS total_employee_share,
    SUM(employer_share)                                         AS total_employer_share,
    SUM(total)                                                  AS grand_total,
    SUM(CASE WHEN status = 'Paid'    THEN total ELSE 0 END)    AS paid,
    SUM(CASE WHEN status = 'Unpaid'  THEN total ELSE 0 END)    AS unpaid,
    SUM(CASE WHEN status = 'Overdue' THEN total ELSE 0 END)    AS overdue
FROM contributions
GROUP BY type;


-- ============================================================
--  STEP 9: AUTO-UPDATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expenses_updated
    BEFORE UPDATE ON company_expenses
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_contributions_updated
    BEFORE UPDATE ON contributions
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================
--  SAMPLE QUERIES
-- ============================================================

-- Overview tab (all expenses, specific date range):
-- SELECT * FROM v_expense_by_date
-- WHERE date BETWEEN '2026-03-01' AND '2026-03-31'
-- ORDER BY date DESC;

-- Expenses tab:
-- SELECT * FROM company_expenses WHERE type = 'expenses' ORDER BY date DESC;

-- Purchases tab:
-- SELECT * FROM company_expenses WHERE type = 'purchases' ORDER BY date DESC;

-- Overhead tab:
-- SELECT * FROM company_expenses WHERE type = 'overhead' ORDER BY date DESC;

-- Contribution tab — table:
-- SELECT name, type, employee_share, employer_share, total, due_date, status
-- FROM contributions ORDER BY name;

-- Contribution tab — 4 summary cards:
-- SELECT * FROM v_contribution_kpis;

-- Contribution tab — filter by Status:
-- SELECT * FROM contributions WHERE status = 'Unpaid' ORDER BY due_date;

-- Contribution tab — filter by Type:
-- SELECT * FROM contributions WHERE type = 'PhilHealth' ORDER BY name;

-- Contribution tab — filter by Custom Date:
-- SELECT * FROM contributions WHERE due_date BETWEEN '2026-05-01' AND '2026-05-31';