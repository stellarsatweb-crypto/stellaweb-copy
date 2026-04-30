-- ============================================================
--  STELLARSAT SOLUTIONS INC
--  FILE: collections.sql
--  Collections Module
--
--  Columns: # | Date | Client | Project | OR Number |
--           Amount Due | Amount Collected | Balance | Status
--
--  Status: Approved | Pending | Decline
--  OR Number: optional
-- ============================================================


-- ============================================================
--  STEP 1: DROP
-- ============================================================

DROP TABLE  IF EXISTS collections         CASCADE;
DROP VIEW   IF EXISTS v_collections_summary CASCADE;
DROP TYPE   IF EXISTS collection_status   CASCADE;


-- ============================================================
--  STEP 2: ENUM
-- ============================================================

CREATE TYPE collection_status AS ENUM (
    'Pending',
    'Approved',
    'Decline'
);


-- ============================================================
--  STEP 3: TABLE
-- ============================================================

CREATE TABLE collections (
    id                SERIAL             PRIMARY KEY,
    date              DATE               NOT NULL,
    client            VARCHAR(200)       NOT NULL,
    project           VARCHAR(200),                    -- optional, e.g. 'Project A', 'Project B'
    or_number         VARCHAR(100),                    -- optional OR number
    amount_due        NUMERIC(15,2)      NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
    amount_collected  NUMERIC(15,2)      NOT NULL DEFAULT 0 CHECK (amount_collected >= 0),
    -- balance is computed: amount_due - amount_collected
    status            collection_status  NOT NULL DEFAULT 'Pending',
    created_at        TIMESTAMP          NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP          NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_collected_lte_due CHECK (amount_collected <= amount_due)
);

-- Indexes for fast search and filter
CREATE INDEX idx_col_date    ON collections(date);
CREATE INDEX idx_col_client  ON collections(client);
CREATE INDEX idx_col_project ON collections(project);
CREATE INDEX idx_col_status  ON collections(status);


-- ============================================================
--  STEP 4: SEED DATA  (matches the picture exactly)
-- ============================================================

INSERT INTO collections (date, client, project, or_number, amount_due, amount_collected, status) VALUES
('2026-03-22', 'BBM',           'Project B', '2434', 3200.00, 800.00,  'Approved'),
('2026-03-22', 'Jae',           'Project A', '3463', 1500.00, 3200.00, 'Approved'),
('2026-03-22', 'chisca',        'Project C', '6858', 1500.00, 1500.00, 'Decline'),
('2026-03-22', 'Mariott',       'Project B', '8537', 800.00,  800.00,  'Pending'),
('2026-03-22', 'Andie',         'Project A', '4736', 1500.00, 3200.00, 'Decline'),
('2026-03-22', 'Tita Raquel',   'Project B', '5748', 3200.00, 1500.00, 'Approved'),
('2026-03-22', 'Lola Ador',     'Project C', '6859', 800.00,  3200.00, 'Pending'),
('2026-03-22', 'Auntie Jovelyn','Project B', '5847', 1500.00, 1500.00, 'Approved'),
('2026-03-22', 'Bulfa',         'Project A', '2156', 3200.00, 3200.00, 'Pending'),
('2026-03-22', 'Printet',       'Project C', '7899', 800.00,  800.00,  'Decline');

select * from collections;

CREATE TABLE collection_payments (
  id             SERIAL          PRIMARY KEY,
  collection_id  INT             NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  amount_paid    NUMERIC(15,2)   NOT NULL CHECK (amount_paid > 0),
  date           DATE            NOT NULL,
  status         VARCHAR(20)     NOT NULL DEFAULT 'Pending',
  created_at     TIMESTAMP       NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_colpay_collection ON collection_payments(collection_id);

-- ============================================================
--  STEP 5: VIEW — balance computed, summary KPIs
-- ============================================================

-- Full collections view with computed balance
CREATE OR REPLACE VIEW v_collections AS
SELECT
    id,
    date,
    client,
    project,
    or_number,
    amount_due,
    amount_collected,
    (amount_due - amount_collected)  AS balance,
    status,
    created_at,
    updated_at
FROM collections
ORDER BY date DESC, id DESC;

-- Summary KPIs for dashboard
CREATE OR REPLACE VIEW v_collections_summary AS
SELECT
    COUNT(*)                                                           AS total_records,
    COALESCE(SUM(amount_due), 0)                                      AS total_due,
    COALESCE(SUM(amount_collected), 0)                                AS total_collected,
    COALESCE(SUM(amount_due - amount_collected), 0)                   AS total_balance,
    COALESCE(SUM(amount_due) FILTER (WHERE status = 'Approved'), 0)   AS approved_total,
    COALESCE(SUM(amount_due) FILTER (WHERE status = 'Pending'),  0)   AS pending_total,
    COALESCE(SUM(amount_due) FILTER (WHERE status = 'Decline'),  0)   AS decline_total
FROM collections;


-- ============================================================
--  STEP 6: AUTO-UPDATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION fn_col_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_collections_updated
    BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION fn_col_set_updated_at();


-- ============================================================
--  USEFUL QUERIES
-- ============================================================

-- All collections with computed balance:
-- SELECT * FROM v_collections;

-- Filter by date range:
-- SELECT * FROM v_collections WHERE date BETWEEN '2026-03-01' AND '2026-03-31';

-- Filter by status:
-- SELECT * FROM v_collections WHERE status = 'Pending';

-- Filter by project:
-- SELECT * FROM v_collections WHERE project = 'Project A';

-- Search by client or OR number:
-- SELECT * FROM v_collections
-- WHERE client ILIKE '%jae%' OR or_number ILIKE '%346%';

-- Dashboard KPIs:
-- SELECT * FROM v_collections_summary;

-- Collections per project:
-- SELECT project, COUNT(*) AS records,
--        SUM(amount_due) AS total_due,
--        SUM(amount_collected) AS total_collected,
--        SUM(amount_due - amount_collected) AS balance
-- FROM collections
-- GROUP BY project ORDER BY project;