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

-- Sample data intentionally omitted for production safety.
