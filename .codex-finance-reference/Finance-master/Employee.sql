-- ============================================================
--  STELLARSAT SOLUTIONS INC
--  FILE: employee.sql
--  Employee Module — All 4 Tabs
--
--  TABS COVERED:
--    1. Reimburse        → Employee reimbursement requests
--    2. Request of Budget→ Budget requests by employees
--    3. Salary Advance   → Salary loans with payment breakdown
--    4. Employee Salary  → Employee salary records
-- ============================================================


-- ============================================================
--  STEP 1: DROP ALL (clean slate)
-- ============================================================

DROP TABLE  IF EXISTS salary_advance_payments  CASCADE;
DROP TABLE  IF EXISTS salary_advances          CASCADE;
DROP TABLE  IF EXISTS reimbursements           CASCADE;
DROP TABLE  IF EXISTS budget_requests          CASCADE;
DROP TABLE  IF EXISTS employee_salaries        CASCADE;
DROP TABLE  IF EXISTS employees                CASCADE;
DROP TABLE  IF EXISTS departments              CASCADE;
DROP TABLE  IF EXISTS positions                CASCADE;

DROP VIEW   IF EXISTS v_reimburse_summary      CASCADE;
DROP VIEW   IF EXISTS v_budget_request_summary CASCADE;
DROP VIEW   IF EXISTS v_salary_advance_summary CASCADE;
DROP VIEW   IF EXISTS v_salary_summary         CASCADE;
DROP VIEW   IF EXISTS v_advance_with_details   CASCADE;

DROP TYPE   IF EXISTS request_status           CASCADE;
DROP TYPE   IF EXISTS advance_status           CASCADE;
DROP TYPE   IF EXISTS payment_status           CASCADE;


-- ============================================================
--  STEP 2: ENUMS
-- ============================================================

-- Used by Reimburse, Request of Budget
CREATE TYPE request_status AS ENUM (
    'Pending',
    'Approved',
    'Done',
    'Decline'
);

-- Used by Salary Advance main record
CREATE TYPE advance_status AS ENUM (
    'Approved',
    'Decline',
    'Pending'
);

-- Used by individual salary advance payment rows
CREATE TYPE payment_status AS ENUM (
    'Paid',
    'Unpaid',
    'Pending'
);


-- ============================================================
--  STEP 3: DEPARTMENTS
-- ============================================================

CREATE TABLE departments (
    id          SERIAL        PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

INSERT INTO departments (name) VALUES
('NOC'),
('Finance'),
('Operations'),
('IT'),
('HR'),
('Admin');


-- ============================================================
--  STEP 4: POSITIONS
-- ============================================================

CREATE TABLE positions (
    id          SERIAL        PRIMARY KEY,
    title       VARCHAR(100)  NOT NULL UNIQUE,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

INSERT INTO positions (title) VALUES
('NOC'),
('NOC Head'),
('Runner'),
('Driver'),
('Cook'),
('Finance Manager'),
('Finance Officer'),
('IT Staff'),
('HR Staff'),
('Admin Staff');


-- ============================================================
--  STEP 5: EMPLOYEES
--  Master employee list shared across all tabs
-- ============================================================

CREATE TABLE employees (
    id            SERIAL        PRIMARY KEY,
    full_name     VARCHAR(150)  NOT NULL,
    email         VARCHAR(150)  UNIQUE,
    position_id   INT           NOT NULL REFERENCES positions(id)   ON DELETE RESTRICT,
    department_id INT           NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    hired_date    DATE,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emp_dept     ON employees(department_id);
CREATE INDEX idx_emp_position ON employees(position_id);

INSERT INTO employees (full_name, email, position_id, department_id, hired_date) VALUES
('Arianne Mendiola', 'arianne@stellarsat.com',  1, 1, '2024-01-15'),
('Shiella Pinili',   'shiella@stellarsat.com',  1, 1, '2024-02-01'),
('Jacov De Belen',   'jacov@stellarsat.com',    1, 1, '2024-02-01'),
('Lyka Sergantes',   'lyka@stellarsat.com',     1, 1, '2024-03-10'),
('Ammiel Philip',    'ammiel@stellarsat.com',   2, 1, '2023-11-01'),
('Leoven',           'leoven@stellarsat.com',   1, 1, '2024-04-01'),
('Chris Brown',      'chris@stellarsat.com',    3, 1, '2024-05-15'),
('Darwin',           'darwin@stellarsat.com',   6, 2, '2023-06-01'),
('Mergu',            'mergu@stellarsat.com',    4, 1, '2024-06-01'),
('Rodiwap',          'rodiwap@stellarsat.com',  5, 1, '2024-07-01'),
('Jae Yumul',        'jae@stellarsat.com',      1, 1, '2024-08-01'),
('Chisca Renee',     'chisca@stellarsat.com',   1, 1, '2024-09-01'),
('Mergu Ewan',       'merguewan@stellarsat.com',4, 1, '2024-06-01'),
('Printet Jimenez',  'printet@stellarsat.com',  7, 2, '2024-10-01');


-- ============================================================
--  STEP 6: EMPLOYEE SALARY
--  Tab 4 — Employee Name | Position | Department | Current Salary | Date
--  Stores one salary record per payroll period per employee.
-- ============================================================

CREATE TABLE employee_salaries (
    id            SERIAL          PRIMARY KEY,
    employee_id   INT             NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    current_salary NUMERIC(10,2)  NOT NULL CHECK (current_salary >= 0),
    date          DATE            NOT NULL,          -- payroll date e.g. Feb 15, 2026
    period_start  DATE,                              -- e.g. Jan 25, 2026
    period_end    DATE,                              -- e.g. Feb 23, 2026
    remarks       TEXT,
    created_at    TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sal_employee ON employee_salaries(employee_id);
CREATE INDEX idx_sal_date     ON employee_salaries(date);

-- Seed: matches Image 1 — Jan 25 – Feb 23, 2026 payroll period
INSERT INTO employee_salaries (employee_id, current_salary, date, period_start, period_end) VALUES
(1,  18000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Arianne Mendiola
(2,  18000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Shiella Pinili
(3,  18000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Jacov De Belen
(4,  18000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Lyka Sergantes
(5,  18000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Ammiel Philip
(6,  18000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Leoven
(7,  15000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Chris Brown (Runner)
(8,  25000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Darwin (Finance Manager)
(9,  15000.00, '2026-02-15', '2026-01-25', '2026-02-23'),   -- Mergu (Driver)
(10, 15000.00, '2026-02-15', '2026-01-25', '2026-02-23');   -- Rodiwap (Cook)


-- ============================================================
--  STEP 7: REIMBURSEMENTS
--  Tab 1 — Name | Roles | Date | Description | Amount | Status | Comments
-- ============================================================

-- REIMBURSEMENTS TABLE
CREATE TABLE reimbursements (
    id           SERIAL          PRIMARY KEY,
    employee_id  INT             NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date         DATE            NOT NULL,
    description  VARCHAR(300)    NOT NULL,
    amount       NUMERIC(10,2)   NOT NULL CHECK (amount >= 0),
    status       request_status  NOT NULL DEFAULT 'Pending',
    comments     TEXT,
    created_at   TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reimb_employee ON reimbursements(employee_id);
CREATE INDEX idx_reimb_date     ON reimbursements(date);
CREATE INDEX idx_reimb_status   ON reimbursements(status);

-- SAMPLE DATA (make sure employees exist!)
INSERT INTO reimbursements (employee_id, date, description, amount, status, comments) VALUES
(1, '2026-01-02', 'Grab',    500.00,   'Done',    NULL),
(3, '2026-01-13', 'Package', 2500.00,  'Decline', NULL);

select * from income_records;

UPDATE reimbursements 
SET employee_id=$1, date=$2, description=$3, amount=$4,
    status=$5, comments=$6, updated_at=NOW()
WHERE id=$7

SELECT 
  r.id,
  e.name,
  e.role,
  r.date,
  r.description,
  r.amount,
  r.status,
  r.comments
FROM reimbursements r
JOIN employees e ON r.employee_id = e.id
WHERE 1=1 ${sw}
ORDER BY r.date DESC


SELECT * FROM employees;
SELECT * FROM reimbursements;
SELECT r.*, e.name
FROM reimbursements r
JOIN employees e ON r.employee_id = e.id;
-- ============================================================
--  STEP 8: BUDGET REQUESTS
--  Tab 2 — Name | Roles | Date | Description | Amount | Status | Comments
-- ============================================================

CREATE TABLE budget_requests (
    id           SERIAL          PRIMARY KEY,
    employee_id  INT             NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date         DATE            NOT NULL,
    description  VARCHAR(300)    NOT NULL,
    amount       NUMERIC(10,2)   NOT NULL CHECK (amount >= 0),
    status       request_status  NOT NULL DEFAULT 'Pending',
    comments     TEXT,
    created_at   TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budreq_employee ON budget_requests(employee_id);
CREATE INDEX idx_budreq_date     ON budget_requests(date);
CREATE INDEX idx_budreq_status   ON budget_requests(status);

-- Seed: matches Image 4
INSERT INTO budget_requests (employee_id, date, description, amount, status, comments) VALUES
(1, '2026-01-02', 'Bond Paper', 500.00,   'Done',    NULL),
(3, '2026-01-13', 'Package',    2500.00,  'Decline', NULL),
(4, '2026-01-15', 'Grab',       500.00,   'Pending', NULL),
(1, '2026-01-20', 'Grab',       500.00,   'Pending', NULL);


-- ============================================================
--  STEP 9: SALARY ADVANCES
--  Tab 3 (main row) — Name | Amount Borrowed | Remaining Balance | Date Borrowed | Status
--  One record per advance request per employee.
-- ============================================================

CREATE TABLE salary_advances (
    id                SERIAL          PRIMARY KEY,
    employee_id       INT             NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount_borrowed   NUMERIC(10,2)   NOT NULL CHECK (amount_borrowed > 0),
    remaining_balance NUMERIC(10,2)   NOT NULL DEFAULT 0 CHECK (remaining_balance >= 0),
    date_borrowed     DATE            NOT NULL,
    status            advance_status  NOT NULL DEFAULT 'Pending',
    remarks           TEXT,
    created_at        TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adv_employee ON salary_advances(employee_id);
CREATE INDEX idx_adv_date     ON salary_advances(date_borrowed);
CREATE INDEX idx_adv_status   ON salary_advances(status);

-- Seed: matches Image 2 & 3
INSERT INTO salary_advances (employee_id, amount_borrowed, remaining_balance, date_borrowed, status) VALUES
(1,  5000.00, 1000.00,  '2026-01-25', 'Approved'),  -- Arianne Mendiola
(4,  5000.00, 13000.00, '2026-01-25', 'Decline'),   -- Lyka Sergantes
(12, 5000.00, 13000.00, '2026-01-25', 'Decline'),   -- Chisca Renee
(11, 5000.00, 13000.00, '2026-01-25', 'Approved'),  -- Jae Yumul
(12, 5000.00, 13000.00, '2026-01-25', 'Decline'),   -- Chisca Renee
(4,  5000.00, 13000.00, '2026-01-25', 'Approved'),  -- Lyka Sergantes
(4,  5000.00, 13000.00, '2026-01-25', 'Decline'),   -- Lyka Sergantes
(12, 5000.00, 13000.00, '2026-01-25', 'Approved'),  -- Chisca Renee
(4,  5000.00, 13000.00, '2026-01-25', 'Decline'),   -- Lyka Sergantes
(12, 5000.00, 13000.00, '2026-01-25', 'Approved');  -- Chisca Renee


-- ============================================================
--  STEP 10: SALARY ADVANCE PAYMENTS
--  Tab 3 (expandable detail rows) — Amount Paid | Date | Status
--  Linked to salary_advances. Shows payment history per advance.
-- ============================================================

CREATE TABLE salary_advance_payments (
    id          SERIAL          PRIMARY KEY,
    advance_id  INT             NOT NULL REFERENCES salary_advances(id) ON DELETE CASCADE,
    amount_paid NUMERIC(10,2)   NOT NULL CHECK (amount_paid > 0),
    date        DATE            NOT NULL,
    status      payment_status  NOT NULL DEFAULT 'Unpaid',
    remarks     TEXT,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pay_advance ON salary_advance_payments(advance_id);
CREATE INDEX idx_pay_date    ON salary_advance_payments(date);
CREATE INDEX idx_pay_status  ON salary_advance_payments(status);

-- Seed: matches Image 2 — Arianne Mendiola advance (id=1) payment schedule
INSERT INTO salary_advance_payments (advance_id, amount_paid, date, status) VALUES
(1, 1000.00, '2026-02-02',  'Paid'),
(1, 1000.00, '2026-02-15',  'Paid'),
(1, 1000.00, '2026-02-25',  'Paid'),
(1, 1000.00, '2026-03-05',  'Paid'),
(1, 1000.00, '2025-12-25',  'Paid'),
(1, 1000.00, '2025-11-05',  'Paid'),
(1, 1000.00, '2025-10-05',  'Paid');


-- ============================================================
--  STEP 11: VIEWS
-- ============================================================

-- ── Tab 1: Reimburse — full view with employee info ──
CREATE OR REPLACE VIEW v_reimburse_summary AS
SELECT
    r.id,
    e.full_name                                  AS name,
    p.title                                      AS roles,
    r.date,
    r.description,
    r.amount,
    r.status,
    r.comments,
    r.created_at
FROM reimbursements r
JOIN employees   e ON e.id = r.employee_id
JOIN positions   p ON p.id = e.position_id
ORDER BY r.date DESC;

-- ── Tab 2: Request of Budget — full view with employee info ──
CREATE OR REPLACE VIEW v_budget_request_summary AS
SELECT
    br.id,
    e.full_name                                  AS name,
    p.title                                      AS roles,
    br.date,
    br.description,
    br.amount,
    br.status,
    br.comments,
    br.created_at
FROM budget_requests br
JOIN employees   e ON e.id = br.employee_id
JOIN positions   p ON p.id = e.position_id
ORDER BY br.date DESC;

-- ── Tab 3: Salary Advance — main list ──
CREATE OR REPLACE VIEW v_salary_advance_summary AS
SELECT
    sa.id,
    e.full_name                                  AS name,
    sa.amount_borrowed,
    sa.remaining_balance,
    sa.date_borrowed,
    sa.status,
    sa.remarks,
    -- computed: total already paid
    (sa.amount_borrowed - sa.remaining_balance)  AS total_paid_so_far
FROM salary_advances sa
JOIN employees e ON e.id = sa.employee_id
ORDER BY sa.date_borrowed DESC;

-- ── Tab 3: Salary Advance — payment detail rows (for expandable view) ──
CREATE OR REPLACE VIEW v_advance_with_details AS
SELECT
    sap.id                                       AS payment_id,
    sa.id                                        AS advance_id,
    e.full_name                                  AS employee_name,
    sa.amount_borrowed,
    sa.remaining_balance,
    sa.date_borrowed,
    sa.status                                    AS advance_status,
    sap.amount_paid,
    sap.date                                     AS payment_date,
    sap.status                                   AS payment_status
FROM salary_advance_payments sap
JOIN salary_advances sa ON sa.id = sap.advance_id
JOIN employees       e  ON e.id  = sa.employee_id
ORDER BY sa.id, sap.date DESC;

-- ── Tab 4: Employee Salary — full view ──
CREATE OR REPLACE VIEW v_salary_summary AS
SELECT
    es.id,
    e.full_name                                  AS employee_name,
    p.title                                      AS position,
    d.name                                       AS department,
    es.current_salary,
    es.date,
    es.period_start,
    es.period_end
FROM employee_salaries es
JOIN employees   e ON e.id = es.employee_id
JOIN positions   p ON p.id = e.position_id
JOIN departments d ON d.id = e.department_id
ORDER BY es.date DESC, e.full_name;

-- ── Summary: all pending requests (Reimburse + Budget) ──
CREATE OR REPLACE VIEW v_all_pending_requests AS
SELECT
    'Reimburse'       AS request_type,
    e.full_name       AS name,
    p.title           AS roles,
    r.date,
    r.description,
    r.amount,
    r.status,
    r.comments
FROM reimbursements r
JOIN employees e ON e.id = r.employee_id
JOIN positions p ON p.id = e.position_id
WHERE r.status = 'Pending'

UNION ALL

SELECT
    'Budget Request'  AS request_type,
    e.full_name       AS name,
    p.title           AS roles,
    br.date,
    br.description,
    br.amount,
    br.status,
    br.comments
FROM budget_requests br
JOIN employees e ON e.id = br.employee_id
JOIN positions p ON p.id = e.position_id
WHERE br.status = 'Pending'
ORDER BY date DESC;


-- ============================================================
--  STEP 12: AUTO-UPDATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_salaries_updated
    BEFORE UPDATE ON employee_salaries
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_reimb_updated
    BEFORE UPDATE ON reimbursements
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_budreq_updated
    BEFORE UPDATE ON budget_requests
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_advances_updated
    BEFORE UPDATE ON salary_advances
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================
--  STEP 13: SAMPLE QUERIES PER TAB
-- ============================================================

-- TAB 1: Reimburse
-- SELECT * FROM v_reimburse_summary;
-- SELECT * FROM v_reimburse_summary WHERE status = 'Pending';
-- SELECT * FROM v_reimburse_summary WHERE date BETWEEN '2026-01-01' AND '2026-01-31';

-- TAB 2: Request of Budget
-- SELECT * FROM v_budget_request_summary;
-- SELECT * FROM v_budget_request_summary WHERE status = 'Pending';
-- SELECT * FROM v_budget_request_summary WHERE date BETWEEN '2026-01-01' AND '2026-01-31';

-- TAB 3: Salary Advance — main list
-- SELECT * FROM v_salary_advance_summary;
-- SELECT * FROM v_salary_advance_summary WHERE status = 'Approved';

-- TAB 3: Salary Advance — expandable payment details for one employee
-- SELECT * FROM v_advance_with_details WHERE advance_id = 1;

-- TAB 4: Employee Salary
-- SELECT * FROM v_salary_summary;
-- SELECT * FROM v_salary_summary WHERE period_start = '2026-01-25' AND period_end = '2026-02-23';
-- SELECT * FROM v_salary_summary WHERE department = 'NOC';

-- ALL PENDING (dashboard badge count):
-- SELECT COUNT(*) FROM v_all_pending_requests;