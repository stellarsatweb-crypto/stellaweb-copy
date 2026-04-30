-- ============================================================
--  STELLARSAT SOLUTIONS INC
--  FILE: financial_report.sql
--  Financial Report — Views + Queries
--  Run AFTER all main tables are created.
-- ============================================================

-- ── Drop existing ──────────────────────────────────────────────
DROP VIEW IF EXISTS v_monthly_summary   CASCADE;
DROP VIEW IF EXISTS v_annual_summary    CASCADE;
DROP VIEW IF EXISTS v_income_vs_expense CASCADE;

-- ============================================================
--  VIEW 1: v_monthly_summary
--  Full P&L per calendar month.
--  income | comp expenses | proj expenses | total expenses
--  | collections | net income
-- ============================================================
CREATE OR REPLACE VIEW v_monthly_summary AS
SELECT
    m.period,
    TO_CHAR(m.period, 'FMMonth YYYY')                                   AS month_label,
    COALESCE(i.total_income,     0)                                      AS total_income,
    COALESCE(ce.total_comp_exp,  0)                                      AS total_comp_expenses,
    COALESCE(pe.total_proj_exp,  0)                                      AS total_proj_expenses,
    COALESCE(ce.total_comp_exp,0) + COALESCE(pe.total_proj_exp,0)        AS total_expenses,
    COALESCE(col.total_collected,0)                                      AS total_collections,
    COALESCE(i.total_income,0)
        - COALESCE(ce.total_comp_exp,0)
        - COALESCE(pe.total_proj_exp,0)                                  AS net_income
FROM (
    SELECT DISTINCT DATE_TRUNC('month', date) AS period FROM income_records
    UNION
    SELECT DISTINCT DATE_TRUNC('month', date)             FROM company_expenses
    UNION
    SELECT DISTINCT DATE_TRUNC('month', date)             FROM project_expenses
    UNION
    SELECT DISTINCT DATE_TRUNC('month', date)             FROM collections
) m
LEFT JOIN (
    SELECT DATE_TRUNC('month', date) AS p, SUM(amount) AS total_income
    FROM income_records GROUP BY 1
) i   ON i.p   = m.period
LEFT JOIN (
    SELECT DATE_TRUNC('month', date) AS p, SUM(amount) AS total_comp_exp
    FROM company_expenses GROUP BY 1
) ce  ON ce.p  = m.period
LEFT JOIN (
    SELECT DATE_TRUNC('month', date) AS p, SUM(amount) AS total_proj_exp
    FROM project_expenses GROUP BY 1
) pe  ON pe.p  = m.period
LEFT JOIN (
    SELECT DATE_TRUNC('month', date) AS p, SUM(amount_collected) AS total_collected
    FROM collections GROUP BY 1
) col ON col.p = m.period
ORDER BY m.period;

-- ============================================================
--  VIEW 2: v_annual_summary
--  Year-over-year P&L comparison.
-- ============================================================
CREATE OR REPLACE VIEW v_annual_summary AS
SELECT
    EXTRACT(YEAR FROM m.period)::INT                                     AS year,
    SUM(COALESCE(i.total_income,     0))                                 AS total_income,
    SUM(COALESCE(ce.total_comp_exp,  0))                                 AS total_comp_expenses,
    SUM(COALESCE(pe.total_proj_exp,  0))                                 AS total_proj_expenses,
    SUM(COALESCE(ce.total_comp_exp,0) + COALESCE(pe.total_proj_exp,0))  AS total_expenses,
    SUM(COALESCE(col.total_collected,0))                                 AS total_collections,
    SUM(COALESCE(i.total_income,0)
        - COALESCE(ce.total_comp_exp,0)
        - COALESCE(pe.total_proj_exp,0))                                 AS net_income
FROM (
    SELECT DISTINCT DATE_TRUNC('month', date) AS period FROM income_records
    UNION
    SELECT DISTINCT DATE_TRUNC('month', date) FROM company_expenses
    UNION
    SELECT DISTINCT DATE_TRUNC('month', date) FROM project_expenses
    UNION
    SELECT DISTINCT DATE_TRUNC('month', date) FROM collections
) m
LEFT JOIN (SELECT DATE_TRUNC('month',date) AS p, SUM(amount)           AS total_income   FROM income_records   GROUP BY 1) i   ON i.p  = m.period
LEFT JOIN (SELECT DATE_TRUNC('month',date) AS p, SUM(amount)           AS total_comp_exp FROM company_expenses GROUP BY 1) ce  ON ce.p = m.period
LEFT JOIN (SELECT DATE_TRUNC('month',date) AS p, SUM(amount)           AS total_proj_exp FROM project_expenses GROUP BY 1) pe  ON pe.p = m.period
LEFT JOIN (SELECT DATE_TRUNC('month',date) AS p, SUM(amount_collected) AS total_collected FROM collections     GROUP BY 1) col ON col.p= m.period
GROUP BY EXTRACT(YEAR FROM m.period)
ORDER BY year;

-- ============================================================
--  VIEW 3: v_income_vs_expense
--  Chart data — monthly income, expenses, net.
-- ============================================================
CREATE OR REPLACE VIEW v_income_vs_expense AS
SELECT
    period,
    TO_CHAR(period, 'Mon YYYY') AS label,
    total_income,
    total_expenses,
    net_income
FROM v_monthly_summary
ORDER BY period;

-- ============================================================
--  QUERIES USED BY /api/report/kpis  (year + optional month)
-- ============================================================

-- Full year KPIs (replace 2026 with desired year):
SELECT
    (SELECT COALESCE(SUM(amount),0)           FROM income_records   WHERE EXTRACT(YEAR FROM date) = 2026) AS total_income,
    (SELECT COALESCE(SUM(amount),0)           FROM company_expenses WHERE EXTRACT(YEAR FROM date) = 2026) AS comp_expenses,
    (SELECT COALESCE(SUM(amount),0)           FROM project_expenses WHERE EXTRACT(YEAR FROM date) = 2026) AS proj_expenses,
    (SELECT COALESCE(SUM(amount_collected),0) FROM collections      WHERE EXTRACT(YEAR FROM date) = 2026) AS total_collections;

-- Single month KPIs (March 2026):
SELECT
    (SELECT COALESCE(SUM(amount),0)           FROM income_records   WHERE EXTRACT(YEAR FROM date)=2026 AND EXTRACT(MONTH FROM date)=3) AS total_income,
    (SELECT COALESCE(SUM(amount),0)           FROM company_expenses WHERE EXTRACT(YEAR FROM date)=2026 AND EXTRACT(MONTH FROM date)=3) AS comp_expenses,
    (SELECT COALESCE(SUM(amount),0)           FROM project_expenses WHERE EXTRACT(YEAR FROM date)=2026 AND EXTRACT(MONTH FROM date)=3) AS proj_expenses,
    (SELECT COALESCE(SUM(amount_collected),0) FROM collections      WHERE EXTRACT(YEAR FROM date)=2026 AND EXTRACT(MONTH FROM date)=3) AS total_collections;

-- ============================================================
--  QUERIES USED BY /api/report/monthly  (year + optional month)
-- ============================================================

-- Full year monthly breakdown:
SELECT * FROM v_monthly_summary
WHERE EXTRACT(YEAR FROM period) = 2026
ORDER BY period;

-- Single month daily breakdown:
SELECT
    DATE_TRUNC('day', date) AS period,
    TO_CHAR(DATE_TRUNC('day', date), 'Mon DD') AS month_label,
    COALESCE(SUM(ir.amount),0)  AS total_income,
    0                           AS total_comp_expenses,
    0                           AS total_proj_expenses,
    0                           AS total_expenses,
    0                           AS total_collections,
    COALESCE(SUM(ir.amount),0)  AS net_income
FROM income_records ir
WHERE EXTRACT(YEAR FROM date)=2026 AND EXTRACT(MONTH FROM date)=3
GROUP BY 1 ORDER BY 1;

-- Year-over-year comparison:
SELECT * FROM v_annual_summary ORDER BY year DESC;

-- Best months by net income (2026):
SELECT month_label, total_income, total_expenses, net_income
FROM v_monthly_summary
WHERE EXTRACT(YEAR FROM period) = 2026
ORDER BY net_income DESC;

-- Loss months (2026):
SELECT month_label, total_income, total_expenses, net_income
FROM v_monthly_summary
WHERE EXTRACT(YEAR FROM period) = 2026
  AND net_income < 0
ORDER BY net_income ASC;