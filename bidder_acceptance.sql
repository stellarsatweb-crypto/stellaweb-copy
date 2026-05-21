-- ============================================================
--  BIDDER — ACCEPTANCE DOCUMENTS
--  Mirrors the NOC letters folder/file pattern but:
--    • Scoped per bidder via bidder_id
--    • Acceptance-specific metadata: project_name, issued_by,
--      issued_date, status, acceptance_type
-- ============================================================


-- ── 1. FOLDERS ───────────────────────────────────────────────
-- Bidders organise their acceptance docs into folders,
-- just like NOC letters. Supports unlimited sub-folder nesting.

CREATE TABLE IF NOT EXISTS acceptance_doc_folders (
  id           SERIAL        PRIMARY KEY,
  bidder_id    INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_name  VARCHAR(150)  NOT NULL,
  parent_id    INTEGER       REFERENCES acceptance_doc_folders(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (bidder_id, folder_name, parent_id)   -- prevent duplicate names per level
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS acc_doc_folders_updated_at ON acceptance_doc_folders;
CREATE TRIGGER acc_doc_folders_updated_at
  BEFORE UPDATE ON acceptance_doc_folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acc_doc_folders_bidder   ON acceptance_doc_folders(bidder_id);
CREATE INDEX IF NOT EXISTS idx_acc_doc_folders_parent   ON acceptance_doc_folders(parent_id);


-- ── 2. FILES ─────────────────────────────────────────────────
-- Each file lives inside a folder.
-- acceptance_type: the kind of acceptance document
--   e.g. 'Certificate of Final Acceptance', 'Warranty Bond',
--        'Notice of Completion', 'Snag List', etc.
-- status: 'active' | 'expired' | 'archived'

CREATE TABLE IF NOT EXISTS acceptance_doc_files (
  id               SERIAL        PRIMARY KEY,
  folder_id        INTEGER       NOT NULL REFERENCES acceptance_doc_folders(id) ON DELETE CASCADE,
  bidder_id        INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File info (mirrors letters / acceptance_files pattern)
  file_name        VARCHAR(255)  NOT NULL,
  file_path        TEXT          NOT NULL,
  file_size        BIGINT        DEFAULT 0,
  file_type        VARCHAR(50),              -- 'pdf' | 'word' | 'excel' | 'image' | …

  -- Acceptance-specific metadata
  project_name     TEXT,                     -- e.g. 'DPWH Road Rehabilitation – Brgy. Road'
  acceptance_type  TEXT,                     -- e.g. 'Certificate of Final Acceptance'
  issued_by        TEXT,                     -- issuing agency / office
  issued_date      DATE,
  expiry_date      DATE,                     -- for docs with validity periods (Warranty Bond etc.)
  status           TEXT          DEFAULT 'active'
                   CHECK (status IN ('active','expired','archived')),
  notes            TEXT,

  last_access      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

SELECT * FROM acceptance_doc_files;
SELECT * FROM acceptance_doc_folders;

DROP TRIGGER IF EXISTS acc_doc_files_updated_at ON acceptance_doc_files;
CREATE TRIGGER acc_doc_files_updated_at
  BEFORE UPDATE ON acceptance_doc_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at(); SET

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acc_doc_files_folder  ON acceptance_doc_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_acc_doc_files_bidder  ON acceptance_doc_files(bidder_id);
CREATE INDEX IF NOT EXISTS idx_acc_doc_files_status  ON acceptance_doc_files(status);
CREATE INDEX IF NOT EXISTS idx_acc_doc_files_expiry  ON acceptance_doc_files(expiry_date);


-- ── 3. SEED — Default top-level folders per bidder ───────────
-- Run this once per bidder, or adapt to your onboarding flow.
-- Replace <BIDDER_ID> with the actual bidder's user id.
--
-- INSERT INTO acceptance_doc_folders (bidder_id, folder_name, parent_id)
-- VALUES
--   (<BIDDER_ID>, 'Certificates of Final Acceptance', NULL),
--   (<BIDDER_ID>, 'Warranty Bonds',                   NULL),
--   (<BIDDER_ID>, 'Notices of Completion',             NULL),
--   (<BIDDER_ID>, 'Snag Lists',                        NULL)
-- ON CONFLICT DO NOTHING;


-- ── 4. HELPFUL VIEW ──────────────────────────────────────────
-- Returns files with computed expiry status and folder path,
-- useful for the Overview expiry tracker.

CREATE OR REPLACE VIEW acceptance_doc_files_view AS
SELECT
  f.*,
  fo.folder_name,
  fo.parent_id,
  CASE
    WHEN f.expiry_date IS NULL               THEN 'active'
    WHEN f.expiry_date < CURRENT_DATE        THEN 'expired'
    WHEN f.expiry_date - CURRENT_DATE <= 30  THEN 'critical'
    WHEN f.expiry_date - CURRENT_DATE <= 90  THEN 'expiring'
    ELSE                                          'active'
  END AS computed_status,
  CASE
    WHEN f.expiry_date IS NOT NULL
    THEN (f.expiry_date - CURRENT_DATE)
  END AS days_until_expiry
FROM acceptance_doc_files f
JOIN acceptance_doc_folders fo ON fo.id = f.folder_id;


-- ── 5. SAMPLE DATA (remove before production) ────────────────
DO $$
DECLARE
  bid_id  INTEGER := 1;   -- ← replace with a real bidder user id
  fld1_id INTEGER;
  fld2_id INTEGER;
  fld3_id INTEGER;
BEGIN
  INSERT INTO acceptance_doc_folders (bidder_id, folder_name, parent_id)
  VALUES
    (bid_id, 'Certificates of Final Acceptance', NULL),
    (bid_id, 'Warranty Bonds',                   NULL),
    (bid_id, 'Notices of Completion',             NULL)
  ON CONFLICT DO NOTHING;

  SELECT id INTO fld1_id FROM acceptance_doc_folders
    WHERE bidder_id = bid_id AND folder_name = 'Certificates of Final Acceptance' AND parent_id IS NULL;
  SELECT id INTO fld2_id FROM acceptance_doc_folders
    WHERE bidder_id = bid_id AND folder_name = 'Warranty Bonds' AND parent_id IS NULL;
  SELECT id INTO fld3_id FROM acceptance_doc_folders
    WHERE bidder_id = bid_id AND folder_name = 'Notices of Completion' AND parent_id IS NULL;

  -- Sub-folders under Certificates
  INSERT INTO acceptance_doc_folders (bidder_id, folder_name, parent_id)
  VALUES
    (bid_id, 'DPWH Projects',    fld1_id),
    (bid_id, 'DepEd Projects',   fld1_id),
    (bid_id, 'LGU Projects',     fld1_id)
  ON CONFLICT DO NOTHING;

  -- Sample files
  INSERT INTO acceptance_doc_files
    (folder_id, bidder_id, file_name, file_path, file_size, file_type,
     project_name, acceptance_type, issued_by, issued_date, expiry_date, status)
  VALUES
    (fld1_id, bid_id,
     'CFA – Road Rehabilitation Brgy Road.pdf',
     '/uploads/acceptance/sample1.pdf', 1240000, 'pdf',
     'Road Rehabilitation – Brgy. Road', 'Certificate of Final Acceptance',
     'DPWH Region IV-A', '2025-11-05', NULL, 'active'),

    (fld2_id, bid_id,
     'Warranty Bond – Medical Center.pdf',
     '/uploads/acceptance/sample2.pdf', 980000, 'pdf',
     'Medical Center Construction', 'Warranty Bond',
     'DOH Region IV', '2025-11-12', CURRENT_DATE + 15, 'active'),

    (fld3_id, bid_id,
     'Notice of Completion – School Building.pdf',
     '/uploads/acceptance/sample3.pdf', 760000, 'pdf',
     'School Building Phase 2', 'Notice of Completion',
     'DepEd Division Office', '2025-10-30', NULL, 'active')
  ON CONFLICT DO NOTHING;

END $$;