-- Enable case-insensitive text
CREATE EXTENSION IF NOT EXISTS citext;
DROP TABLE terminals;
-- =========================
-- TERMINALS TABLE
-- =========================
CREATE TABLE terminals (
    id              SERIAL PRIMARY KEY,

    -- Basic Site Info
    sitename        CITEXT NOT NULL,
    display_name    CITEXT,
    province        CITEXT,
    municipality    CITEXT,
    -- Hardware
    modem           CITEXT,
    transceiver     CITEXT,
    dish            CITEXT,
    -- Network
    ip              CITEXT,
    mac             CITEXT,
    -- Location
    lat             NUMERIC(10,7),
    long            NUMERIC(10,7),
    -- Contacts
    contacts        CITEXT,
    email           CITEXT,
    -- Status
    status          CITEXT,
    -- Edge Router (ER)
    er_sn           CITEXT,
    er_mac          CITEXT,
    er_model        CITEXT,
    er_lic          CITEXT,
    -- Access Point 1
    ap1_sn          CITEXT,
    ap1_mac         CITEXT,
    ap1_model       CITEXT,
    ap1_lic         CITEXT,
    -- Access Point 2
    ap2_sn          CITEXT,
    ap2_mac         CITEXT,
    ap2_model       CITEXT,
    ap2_lic         CITEXT,
    -- Project
    project_name    CITEXT,
    -- Timestamps
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COPY terminals (
    sitename,
    display_name,
    province,
    municipality,
    modem,
    transceiver,
    dish,
    ip,
    mac,
    lat,
    long,
    contacts,
    email,
    status,
    er_sn,
    er_mac,
    er_model,
    er_lic,
    ap1_sn,
    ap1_mac,
    ap1_model,
    ap1_lic,
    ap2_sn,
    ap2_mac,
    ap2_model,
    ap2_lic,
    project_name
)
FROM 'C:\Users\Jae\OneDrive\Desktop\Updated_Map\terminals.csv'
DELIMITER ','
CSV HEADER;

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON terminals
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX idx_terminals_sitename ON terminals(sitename);
CREATE INDEX idx_terminals_province ON terminals(province);
CREATE INDEX idx_terminals_status ON terminals(status);

SELECT * FROM terminals;