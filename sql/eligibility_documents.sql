-- ============================================================
--  ELIGIBILITY DOCUMENTS  (updated — adds result column)
-- ============================================================

CREATE TABLE IF NOT EXISTS eligibility_documents (
  id            SERIAL        PRIMARY KEY,
  bidder_id     INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name     TEXT          NOT NULL,
  file_url      TEXT,
  doc_name      TEXT,
  category      TEXT,
  issued_date   DATE,
  expiry_date   DATE          NOT NULL,
  file_size     BIGINT        DEFAULT 0,
  result        TEXT          CHECK (result IN ('win','loss')),   -- ← NEW
  notes         TEXT,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- If the table already exists, just add the column:
ALTER TABLE eligibility_documents
  ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('win','loss'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_elig_bidder_id   ON eligibility_documents(bidder_id);
CREATE INDEX IF NOT EXISTS idx_elig_expiry_date ON eligibility_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_elig_result      ON eligibility_documents(result);

-- Trigger
DROP TRIGGER IF EXISTS eligibility_documents_updated_at ON eligibility_documents;
CREATE TRIGGER eligibility_documents_updated_at
  BEFORE UPDATE ON eligibility_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- View with computed status + result
CREATE OR REPLACE VIEW eligibility_documents_with_status AS
SELECT *,
  CASE
    WHEN expiry_date - CURRENT_DATE <= 30 THEN 'expired'
    WHEN expiry_date - CURRENT_DATE <= 90 THEN 'expiring'
    ELSE                                       'valid'
  END AS status
FROM eligibility_documents;

-- Destructive DROP notes from the source extract were intentionally omitted.
