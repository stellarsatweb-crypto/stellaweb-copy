-- ============================================================
--  Bidding Documents — Database Migration
--  Run this once against your PostgreSQL database
-- ============================================================

-- Table
CREATE TABLE IF NOT EXISTS bidding_documents (
  id            SERIAL PRIMARY KEY,
  bidder_id     INTEGER       NOT NULL,          -- FK to your users table
  file_name     TEXT          NOT NULL,
  file_url      TEXT,                             -- path / S3 URL after upload
  doc_type      TEXT,                             -- "Letter of Award", "Contract", etc.
  file_size     BIGINT        DEFAULT 0,          -- bytes
  status        TEXT          NOT NULL            -- 'awarded' | 'rejected'
                CHECK (status IN ('awarded','rejected')),
  description   TEXT,
  date          DATE          DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bidding_documents_updated_at ON bidding_documents;
CREATE TRIGGER bidding_documents_updated_at
  BEFORE UPDATE ON bidding_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bidding_bidder_id ON bidding_documents(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bidding_status    ON bidding_documents(status);
CREATE INDEX IF NOT EXISTS idx_bidding_date      ON bidding_documents(date DESC);

-- ============================================================
--  Sample data (optional — remove before production)
-- ============================================================
INSERT INTO bidding_documents (bidder_id, file_name, doc_type, file_size, status, date, description) VALUES
  (1, 'DPWH Road Rehabilitation - LOA.pdf',          'Letter of Award',    2400000, 'awarded',  '2026-04-22', 'Official letter of award for road rehabilitation project.'),
  (1, 'Bridge Construction Contract.docx',            'Contract',           1100000, 'awarded',  '2026-04-15', 'Signed contract for bridge construction.'),
  (1, 'Medical Supplies - Bill of Quantities.xlsx',   'BOQ',                 890000, 'awarded',  '2026-03-30', 'Itemized bill of quantities for medical supplies procurement.'),
  (1, 'School Building Phase 2 - Rejection.pdf',      'Notice of Rejection',1800000, 'rejected', '2026-04-20', 'Rejection notice for school building phase 2 bid.'),
  (1, 'Flood Control - Disqualification Letter.docx', 'Disqualification',    765000, 'rejected', '2026-03-12', 'Disqualification letter for flood control project.');

  SELECT * FROM bidding_documents;