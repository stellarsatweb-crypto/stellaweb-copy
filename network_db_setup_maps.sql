-- ============================================================
-- FULL NETWORK DATABASE SETUP  (FIXED)
-- DICT-IGAYA Network Device & Site Management
-- ============================================================
-- HOW TO USE:
--   1. Run this entire file in pgAdmin or VS Code SQL Tools
--   2. Files must be in C:\temp\ folder
--      (or update all paths below to match your folder)
--   3. Run sections in ORDER (top to bottom)
--   4. Script is safe to re-run — upserts prevent duplicate errors
-- ============================================================
-- KNOWN DIRTY DATA FIXED BY THIS SCRIPT:
--
-- COORDINATES (space inside value):
--   BENGUET_Master.csv  row 36 : long='120. 82169'
--   QUEZON_Master.csv   row 19 : long='121. 636839'

--   QUEZON_Master.csv   row 46 : long='121. 651703'
--
-- SERIAL NUMBERS:
--   NetworkDeviceList_Quezon.csv rows 14-15 : serial=' n/a' → NULL
--
-- SITE NAME MISMATCHES (device file ≠ master file):
--   BENGUET   :  6 mismatches  (suffix/wording differences)
--   IFUGAO    : 37 mismatches  (missing -BRGY suffix, typo on 0076)
--   PANGASINAN: 31 mismatches  (missing -BRGY suffix)
--   QUEZON    : 17 mismatches  (missing -BRGY suffix, typo on 0012, name diff on 0057/0080)
--   (Ilocos and Kalinga: 0 mismatches — no fix needed)
-- ============================================================


-- ============================================================
-- STEP 1: ENABLE EXTENSION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;


-- ============================================================
-- STEP 2: DROP EXISTING  (safe to re-run)
-- ============================================================

DROP VIEW  IF EXISTS network_devices_full CASCADE;
DROP TABLE IF EXISTS network_devices_full_history CASCADE;
DROP TABLE IF EXISTS network_devices CASCADE;
DROP TABLE IF EXISTS network_sites CASCADE;
DROP TABLE IF EXISTS network_sites_staging CASCADE;


-- ============================================================
-- STEP 3: CREATE TABLES
-- ============================================================

-- Staging table for master sites (accepts raw text to avoid coord errors)
CREATE TABLE network_sites_staging (
    site_name    TEXT,
    municipality TEXT,
    lat          TEXT,
    long         TEXT,
    contacts     TEXT,
    email        TEXT,
    mac          TEXT,
    ip           TEXT,
    province     TEXT
);

-- Master Sites Table
CREATE TABLE network_sites (
    id           SERIAL PRIMARY KEY,
    site_name    CITEXT UNIQUE NOT NULL,
    municipality CITEXT,
    lat          NUMERIC(10,7),
    long         NUMERIC(10,7),
    contacts     TEXT,
    email        CITEXT,
    mac          CITEXT,
    ip           CITEXT,
    province     CITEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Network Devices Table
CREATE TABLE network_devices (
    id            SERIAL PRIMARY KEY,
    device_name   CITEXT NOT NULL,
    site_name     CITEXT NOT NULL,
    serial_number CITEXT,
    mac_address   CITEXT UNIQUE NOT NULL,
    model         CITEXT NOT NULL,
    license_due   CITEXT,
    province      CITEXT,
    site_id       INT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index on serial_number — NULLs excluded (allows multiple NULL serials)
CREATE UNIQUE INDEX idx_serial_number_unique
ON network_devices (serial_number)
WHERE serial_number IS NOT NULL;

-- History Table (auto-populated by triggers)
CREATE TABLE network_devices_full_history (
    history_id    SERIAL PRIMARY KEY,
    device_id     INT,
    device_name   CITEXT,
    serial_number CITEXT,
    mac_address   CITEXT,
    model         CITEXT,
    license_due   CITEXT,
    province      CITEXT,
    site_name     CITEXT,
    municipality  CITEXT,
    lat           NUMERIC(10,7),
    long          NUMERIC(10,7),
    contacts      TEXT,
    email         CITEXT,
    ip            CITEXT,
    change_type   VARCHAR(10) CHECK (change_type IN ('INSERT','UPDATE')),
    saved_at      TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- STEP 4: COPY MASTER FILES INTO STAGING
-- (raw TEXT avoids coordinate cast errors)
-- ============================================================

COPY network_sites_staging (site_name, municipality, lat, long, contacts, email, mac, ip)
FROM 'C:\temp\BENGUET_Master.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_sites_staging SET province = 'Benguet' WHERE province IS NULL;

COPY network_sites_staging (site_name, municipality, lat, long, contacts, email, mac, ip)
FROM 'C:\temp\IFUGAO_Master.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_sites_staging SET province = 'Ifugao' WHERE province IS NULL;

COPY network_sites_staging (site_name, municipality, lat, long, contacts, email, mac, ip)
FROM 'C:\temp\ILOCOS_Master.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_sites_staging SET province = 'Ilocos' WHERE province IS NULL;

COPY network_sites_staging (site_name, municipality, lat, long, contacts, email, mac, ip)
FROM 'C:\temp\KALINGA_Master.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_sites_staging SET province = 'Kalinga' WHERE province IS NULL;

COPY network_sites_staging (site_name, municipality, lat, long, contacts, email, mac, ip)
FROM 'C:\temp\PANGASINAN_Master.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_sites_staging SET province = 'Pangasinan' WHERE province IS NULL;

COPY network_sites_staging (site_name, municipality, lat, long, contacts, email, mac, ip)
FROM 'C:\temp\QUEZON_Master.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_sites_staging SET province = 'Quezon' WHERE province IS NULL;


-- ============================================================
-- STEP 5: CLEAN + MOVE STAGING → network_sites
-- REPLACE strips spaces inside coordinates before casting.
-- ON CONFLICT DO UPDATE ensures re-runs refresh all site data
-- instead of failing on the unique constraint.
-- ============================================================

INSERT INTO network_sites (site_name, municipality, lat, long, contacts, email, mac, ip, province)
SELECT
    site_name,
    municipality,
    NULLIF(REPLACE(lat,  ' ', ''), '')::NUMERIC(10,7),
    NULLIF(REPLACE(long, ' ', ''), '')::NUMERIC(10,7),
    contacts,
    email,
    mac,
    ip,
    province
FROM network_sites_staging
ON CONFLICT (site_name) DO UPDATE SET
    municipality = EXCLUDED.municipality,
    lat          = EXCLUDED.lat,
    long         = EXCLUDED.long,
    contacts     = EXCLUDED.contacts,
    email        = EXCLUDED.email,
    mac          = EXCLUDED.mac,
    ip           = EXCLUDED.ip,
    province     = EXCLUDED.province;

DROP TABLE network_sites_staging;


-- ============================================================
-- STEP 6: IMPORT NETWORK DEVICE FILES
-- All provinces load into a shared staging table first,
-- then a single upsert inserts/updates network_devices.
-- This avoids COPY hitting the unique constraint on re-runs.
-- ============================================================

CREATE TEMP TABLE network_devices_staging (
    device_name   TEXT,
    site_name     TEXT,
    serial_number TEXT,
    mac_address   TEXT,
    model         TEXT,
    license_due   TEXT,
    province      TEXT
);

-- Benguet
COPY network_devices_staging (device_name, site_name, serial_number, mac_address, model, license_due)
FROM 'C:\temp\NetworkDeviceList_Benguet.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_devices_staging SET province = 'Benguet' WHERE province IS NULL;

-- Ifugao
COPY network_devices_staging (device_name, site_name, serial_number, mac_address, model, license_due)
FROM 'C:\temp\NetworkDeviceList_Ifugao.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_devices_staging SET province = 'Ifugao' WHERE province IS NULL;

-- Ilocos
COPY network_devices_staging (device_name, site_name, serial_number, mac_address, model, license_due)
FROM 'C:\temp\NetworkDeviceList_Ilocos.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_devices_staging SET province = 'Ilocos' WHERE province IS NULL;

-- Kalinga
COPY network_devices_staging (device_name, site_name, serial_number, mac_address, model, license_due)
FROM 'C:\temp\NetworkDeviceList_Kalinga.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_devices_staging SET province = 'Kalinga' WHERE province IS NULL;

-- Pangasinan
COPY network_devices_staging (device_name, site_name, serial_number, mac_address, model, license_due)
FROM 'C:\temp\NetworkDeviceList_Pangasinan.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_devices_staging SET province = 'Pangasinan' WHERE province IS NULL;

-- Quezon — clean ' n/a' serials before the unique index fires
COPY network_devices_staging (device_name, site_name, serial_number, mac_address, model, license_due)
FROM 'C:\temp\NetworkDeviceList_Quezon.csv'
DELIMITER ',' CSV HEADER ENCODING 'UTF8';
UPDATE network_devices_staging SET province = 'Quezon' WHERE province IS NULL;
UPDATE network_devices_staging
SET    serial_number = NULL
WHERE  province = 'Quezon'
  AND  TRIM(LOWER(serial_number)) IN ('n/a', '');

-- Upsert all staged rows into network_devices.
-- ON CONFLICT DO UPDATE keeps every field current on re-runs.
INSERT INTO network_devices (device_name, site_name, serial_number, mac_address, model, license_due, province)
SELECT
    device_name,
    site_name,
    TRIM(serial_number),
    TRIM(mac_address),
    model,
    license_due,
    province
FROM network_devices_staging
ON CONFLICT (mac_address) DO UPDATE SET
    device_name   = EXCLUDED.device_name,
    site_name     = EXCLUDED.site_name,
    serial_number = EXCLUDED.serial_number,
    model         = EXCLUDED.model,
    license_due   = EXCLUDED.license_due,
    province      = EXCLUDED.province;

DROP TABLE network_devices_staging;


-- ============================================================
-- STEP 7: FIX SITE NAME MISMATCHES
-- Device files used slightly different names from master files.
-- These UPDATEs align device site_name values to match network_sites
-- so the FK join in Step 8 links all devices correctly.
-- ============================================================

-- ---- BENGUET (6 fixes) ----
UPDATE network_devices SET site_name = 'VSTG2-L1-0003-POBLACION-BRGY'
WHERE site_name = 'VSTG2-L1-0003-POBLACION-BRGY-ATOK';

UPDATE network_devices SET site_name = 'VSTG2-L1-0026-POBLACION-BRGY'
WHERE site_name = 'VSTG2-L1-0026-POBLACION-BRGY-BUGUIS';

UPDATE network_devices SET site_name = 'VSTG2-L1-0031-MAXIMINO-FIANZA-LOPEZ-ELEM'
WHERE site_name = 'VSTG2-L1-0031-MAXIMINO FIANZA LOPEZ ELEMENTARY SCHOOL';

UPDATE network_devices SET site_name = 'VSTG2-L1-0053-BAGONG-BRGY'
WHERE site_name = 'VSTG2-L1-0053-BAGONG';

UPDATE network_devices SET site_name = 'VSTG2-L1-0057-CAMP-3-BRGY'
WHERE site_name = 'VSTG2-L1-0057-CAMP-3';

UPDATE network_devices SET site_name = 'VSTG2-L1-0067-POBLACION-BRGY'
WHERE site_name = 'VSTG2-L1-0067-POBLACION-BRGY-ITOGON';

-- ---- IFUGAO (37 fixes) ----
UPDATE network_devices SET site_name = 'VSTG2-L2-0003-DAMAG -BRGY'        WHERE site_name = 'VSTG2-L2-0003-DAMAG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0004-ITAB -BRGY'         WHERE site_name = 'VSTG2-L2-0004-ITAB';
UPDATE network_devices SET site_name = 'VSTG2-L2-0005-UBAO -BRGY'         WHERE site_name = 'VSTG2-L2-0005-UBAO';
UPDATE network_devices SET site_name = 'VSTG2-L2-0006-BUNHIAN-BRGY'       WHERE site_name = 'VSTG2-L2-0006-BUNHIAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0007-BUTAC-BRGY'         WHERE site_name = 'VSTG2-L2-0007-BUTAC';
UPDATE network_devices SET site_name = 'VSTG2-L2-0010-TALITE-BRGY'        WHERE site_name = 'VSTG2-L2-0010-TALITE';
UPDATE network_devices SET site_name = 'VSTG2-L2-0014-CARAGASAN -BRGY'    WHERE site_name = 'VSTG2-L2-0014-CARAGASAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0015-NAMNAMA-BRGY'       WHERE site_name = 'VSTG2-L2-0015-NAMNAMA';
UPDATE network_devices SET site_name = 'VSTG2-L2-0019-ANTIPOLO-BRGY'      WHERE site_name = 'VSTG2-L2-0019-ANTIPOLO';
UPDATE network_devices SET site_name = 'VSTG2-L2-0020-HALLAP-BRGY'        WHERE site_name = 'VSTG2-L2-0020-HALLAP';
UPDATE network_devices SET site_name = 'VSTG2-L2-0023-PULA-BRGY'          WHERE site_name = 'VSTG2-L2-0023-PULA';
UPDATE network_devices SET site_name = 'VSTG2-L2-0025-GOHANG-BRGY'        WHERE site_name = 'VSTG2-L2-0025-GOHANG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0026-DUCLIGAN-BRGY'      WHERE site_name = 'VSTG2-L2-0026-DUCLIGAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0027-AMGANAD-BRGY'       WHERE site_name = 'VSTG2-L2-0027-AMGANAD';
UPDATE network_devices SET site_name = 'VSTG2-L2-0030-ANABA-BRGY'         WHERE site_name = 'VSTG2-L2-0030-ANABA';
UPDATE network_devices SET site_name = 'VSTG2-L2-0035-ABATAN -BRGY'       WHERE site_name = 'VSTG2-L2-0035-ABATAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0037-BOKIAWAN-BRGY'      WHERE site_name = 'VSTG2-L2-0037-BOKIAWAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0044-CABA-BRGY'          WHERE site_name = 'VSTG2-L2-0044-CABA';
UPDATE network_devices SET site_name = 'VSTG2-L2-0045-OLILICON-BRGY'      WHERE site_name = 'VSTG2-L2-0045-OLILICON';
UPDATE network_devices SET site_name = 'VSTG2-L2-0046-DULAO-BRGY'         WHERE site_name = 'VSTG2-L2-0046-DULAO';
UPDATE network_devices SET site_name = 'VSTG2-L2-0048-PONGHAL-BRGY'       WHERE site_name = 'VSTG2-L2-0048-PONGHAL';
UPDATE network_devices SET site_name = 'VSTG2-L2-0049-POBLACION-E-BRGY'   WHERE site_name = 'VSTG2-L2-0049-POBLACION-E';
UPDATE network_devices SET site_name = 'VSTG2-L2-0051-MAGULON-BRGY'       WHERE site_name = 'VSTG2-L2-0051-MAGULON-BRGY-L';
UPDATE network_devices SET site_name = 'VSTG2-L2-0055-BALANGBANG-BRGY'    WHERE site_name = 'VSTG2-L2-0055-BALANGBANG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0060-BATO-ALATBANG-BRGY' WHERE site_name = 'VSTG2-L2-0060-BATO-ALATBANG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0063-CHAYA-BRGY'         WHERE site_name = 'VSTG2-L2-0063-CHAYA';
UPDATE network_devices SET site_name = 'VSTG2-L2-0064-CHUMANG-BRGY'       WHERE site_name = 'VSTG2-L2-0064-CHUMANG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0065-EPENG-BRGY'         WHERE site_name = 'VSTG2-L2-0065-EPENG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0066-GUINIHON-BRGY'      WHERE site_name = 'VSTG2-L2-0066-GUINIHON';
UPDATE network_devices SET site_name = 'VSTG2-L2-0067-INWALOY-BRGY'       WHERE site_name = 'VSTG2-L2-0067-INWALOY';
UPDATE network_devices SET site_name = 'VSTG2-L2-0068-LANGAYAN-BRGY'      WHERE site_name = 'VSTG2-L2-0068-LANGAYAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0069-LIWO-BRGY'          WHERE site_name = 'VSTG2-L2-0069-LIWO';
UPDATE network_devices SET site_name = 'VSTG2-L2-0072-MAPAWOY-BRGY'       WHERE site_name = 'VSTG2-L2-0072-MAPAWOY';
UPDATE network_devices SET site_name = 'VSTG2-L2-0075-BINABLAYAN-BRGY'    WHERE site_name = 'VSTG2-L2-0075-BINABLAYAN';
UPDATE network_devices SET site_name = 'VSTG2-L2-0076-IIMPUGONG-BRGY'     WHERE site_name = 'VSTG2-L2-0076-IMPUGONG';  -- typo in master: double-I
UPDATE network_devices SET site_name = 'VSTG2-L2-0079-LUHONG-BRGY'        WHERE site_name = 'VSTG2-L2-0079-LUHONG';
UPDATE network_devices SET site_name = 'VSTG2-L2-0080-BANGAAN-BRGY'       WHERE site_name = 'VSTG2-L2-0080-BANGAAN';

-- ---- PANGASINAN (31 fixes) ----
UPDATE network_devices SET site_name = 'VSTG2-L4-0001-BARUAN-BRGY'       WHERE site_name = 'VSTG2-L4-0001-BARUAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0002-BOCBOC-W-BRGY'     WHERE site_name = 'VSTG2-L4-0002-BOCBOC-W';
UPDATE network_devices SET site_name = 'VSTG2-L4-0015-CACAYASEN-BRGY'    WHERE site_name = 'VSTG2-L4-0015-CACAYASEN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0016-CONCORDIA-BRGY'    WHERE site_name = 'VSTG2-L4-0016-CONCORDIA';
UPDATE network_devices SET site_name = 'VSTG2-L4-0017-ILIO-ILIO-BRGY'    WHERE site_name = 'VSTG2-L4-0017-ILIO-ILIO';
UPDATE network_devices SET site_name = 'VSTG2-L4-0018-PAPALLASEN-BRGY'   WHERE site_name = 'VSTG2-L4-0018-PAPALLASEN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0019-POBLACION-BRGY'    WHERE site_name = 'VSTG2-L4-0019-POBLACION';
UPDATE network_devices SET site_name = 'VSTG2-L4-0020-POGORUAC-BRGY'     WHERE site_name = 'VSTG2-L4-0020-POGORUAC';
UPDATE network_devices SET site_name = 'VSTG2-L4-0023-SAN-PASCUAL-BRGY'  WHERE site_name = 'VSTG2-L4-0023-SAN-PASCUAL';
UPDATE network_devices SET site_name = 'VSTG2-L4-0025-SAPA-GRANDE-BRGY'  WHERE site_name = 'VSTG2-L4-0025-SAPA-GRANDE';
UPDATE network_devices SET site_name = 'VSTG2-L4-0026-SAPA-PEQUEÑA-BRGY' WHERE site_name = 'VSTG2-L4-0026-SAPA-PEQUEÑA';
UPDATE network_devices SET site_name = 'VSTG2-L4-0027-TAMBACAN-BRGY'     WHERE site_name = 'VSTG2-L4-0027-TAMBACAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0028-HERMOSA-BRGY'      WHERE site_name = 'VSTG2-L4-0028-HERMOSA';
UPDATE network_devices SET site_name = 'VSTG2-L4-0029-MALACAPAS-BRGY'    WHERE site_name = 'VSTG2-L4-0029-MALACAPAS';
UPDATE network_devices SET site_name = 'VSTG2-L4-0030-OSMEÑA-BRGY'       WHERE site_name = 'VSTG2-L4-0030-OSMEÑA';
UPDATE network_devices SET site_name = 'VSTG2-L4-0031-PETAL-BRGY'        WHERE site_name = 'VSTG2-L4-0031-PETAL';
UPDATE network_devices SET site_name = 'VSTG2-L4-0032-POBLACION-BRGY'    WHERE site_name = 'VSTG2-L4-0032-POBLACION';
UPDATE network_devices SET site_name = 'VSTG2-L4-0033-TAMBAC-BRGY'       WHERE site_name = 'VSTG2-L4-0033-TAMBAC';
UPDATE network_devices SET site_name = 'VSTG2-L4-0035-AMALBALAN-BRGY'    WHERE site_name = 'VSTG2-L4-0035-AMALBALAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0036-TAMBOBONG-BRGY'    WHERE site_name = 'VSTG2-L4-0036-TAMBOBONG';
UPDATE network_devices SET site_name = 'VSTG2-L4-0039-MACALANG-BRGY'     WHERE site_name = 'VSTG2-L4-0039-MACALANG';
UPDATE network_devices SET site_name = 'VSTG2-L4-0040-MAGSAYSAY-BRGY'    WHERE site_name = 'VSTG2-L4-0040-MAGSAYSAY';
UPDATE network_devices SET site_name = 'VSTG2-L4-0041-MALIMPIN-BRGY'     WHERE site_name = 'VSTG2-L4-0041-MALIMPIN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0042-BABUYAN-BRGY'      WHERE site_name = 'VSTG2-L4-0042-BABUYAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0044-DOLIMAN-BRGY'      WHERE site_name = 'VSTG2-L4-0044-DOLIMAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0046-FATIMA-BRGY'       WHERE site_name = 'VSTG2-L4-0046-FATIMA';
UPDATE network_devices SET site_name = 'VSTG2-L4-0047-PITA-BRGY'         WHERE site_name = 'VSTG2-L4-0047-PITA';
UPDATE network_devices SET site_name = 'VSTG2-L4-0048-CABILAOAN-W-BRGY'  WHERE site_name = 'VSTG2-L4-0048-CABILAOAN-W';
UPDATE network_devices SET site_name = 'VSTG2-L4-0050-CABANAETAN-BRGY'   WHERE site_name = 'VSTG2-L4-0050-CABANAETAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0067-CALITLITAN-BRGY'   WHERE site_name = 'VSTG2-L4-0067-CALITLITAN';
UPDATE network_devices SET site_name = 'VSTG2-L4-0078-SAN-VICENTE-BRGY'  WHERE site_name = 'VSTG2-L4-0078-SAN-VICENTE';

-- ---- QUEZON (17 fixes) ----
-- Note: 0012 has encoding issue (nião vs niño) — ILIKE wildcard handles it
-- Note: 0057 device uses 'BINULASAN-INTEG' but master has 'BINULASAN-IS'
-- Note: 0080 device uses 'MUN-CRAB-FACILITY' but master has 'EVACUATION-BUILDING'
UPDATE network_devices SET site_name = 'VSTG2-L5-0012-SANTO-NIÑO-ILAYA-BRGY'  WHERE site_name ILIKE 'VSTG2-L5-0012-SANTO-N%O-ILAYA-BRGY';
UPDATE network_devices SET site_name = 'VSTG2-L5-0015-ABIAWIN-BRGY'           WHERE site_name = 'VSTG2-L5-0015-ABIAWIN';
UPDATE network_devices SET site_name = 'VSTG2-L5-0016-AGOS-AGOS-BRGY'         WHERE site_name = 'VSTG2-L5-0016-AGOS-AGOS';
UPDATE network_devices SET site_name = 'VSTG2-L5-0017-ALITAS-BRGY'            WHERE site_name = 'VSTG2-L5-0017-ALITAS';
UPDATE network_devices SET site_name = 'VSTG2-L5-0023-BANUGAO-BRGY'           WHERE site_name = 'VSTG2-L5-0023-BANUGAO';
UPDATE network_devices SET site_name = 'VSTG2-L5-0024-BATICAN-BRGY'           WHERE site_name = 'VSTG2-L5-0024-BATICAN';
UPDATE network_devices SET site_name = 'VSTG2-L5-0027-BOBOIN-BRGY'            WHERE site_name = 'VSTG2-L5-0027-BOBOIN';
UPDATE network_devices SET site_name = 'VSTG2-L5-0028-CATAMBUNGAN-BRGY'       WHERE site_name = 'VSTG2-L5-0028-CATAMBUNGAN';
UPDATE network_devices SET site_name = 'VSTG2-L5-0033-ILOG-BRGY'              WHERE site_name = 'VSTG2-L5-0033-ILOG';
UPDATE network_devices SET site_name = 'VSTG2-L5-0034-INGAS-BRGY'             WHERE site_name = 'VSTG2-L5-0034-INGAS';
UPDATE network_devices SET site_name = 'VSTG2-L5-0036-LIBJO-BRGY'             WHERE site_name = 'VSTG2-L5-0036-LIBJO';
UPDATE network_devices SET site_name = 'VSTG2-L5-0038-MAGSAYSAY-BRGY'         WHERE site_name = 'VSTG2-L5-0038-MAGSAYSAY';
UPDATE network_devices SET site_name = 'VSTG2-L5-0041-PILAWAY-BRGY'           WHERE site_name = 'VSTG2-L5-0041-PILAWAY';
UPDATE network_devices SET site_name = 'VSTG2-L5-0042-PINAGLAPATAN-BRGY'      WHERE site_name = 'VSTG2-L5-0042-PINAGLAPATAN';
UPDATE network_devices SET site_name = 'VSTG2-L5-0049-TONGOHIN-BRGY'          WHERE site_name = 'VSTG2-L5-0049-TONGOHIN';
UPDATE network_devices SET site_name = 'VSTG2-L5-0057-BINULASAN-IS'           WHERE site_name = 'VSTG2-L5-0057-BINULASAN-INTEG';
UPDATE network_devices SET site_name = 'VSTG2-L5-0080-EVACUATION-BUILDING'    WHERE site_name = 'VSTG2-L5-0080-MUN-CRAB-FACILITY';


-- ============================================================
-- STEP 8: LINK DEVICES TO SITES
-- ============================================================

ALTER TABLE network_devices
ADD CONSTRAINT fk_network_devices_site
FOREIGN KEY (site_id) REFERENCES network_sites(id) ON DELETE SET NULL;

UPDATE network_devices nd
SET site_id = ns.id
FROM network_sites ns
WHERE nd.site_name = ns.site_name;


-- ============================================================
-- STEP 9: CREATE JOINED VIEW
-- ============================================================

-- Replace the existing CREATE VIEW network_devices_full in STEP 9
DROP VIEW IF EXISTS network_devices_full CASCADE;

CREATE VIEW network_devices_full AS
SELECT
    nd.id               AS device_id,
    nd.device_name,
    nd.serial_number,
    nd.mac_address,
    nd.model,
    nd.license_due,
    nd.province,
    ns.site_name,
    ns.municipality,
    ns.lat,
    ns.long,
    ns.contacts,
    ns.email,
    ns.ip,
    -- Equipment Specs
    es.modem            AS spec_modem,
    es.trans            AS spec_trans,
    es.dish             AS spec_dish
FROM network_devices nd
LEFT JOIN network_sites    ns ON nd.site_id = ns.id
LEFT JOIN equipment_specs  es ON es.site_id = ns.id
ORDER BY nd.province, ns.site_name, nd.device_name;


-- ============================================================
-- STEP 10: CREATE TRIGGERS  (auto-save to history)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_save_network_history()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO network_devices_full_history (
        device_id, device_name, serial_number, mac_address,
        model, license_due, province,
        site_name, municipality, lat, long,
        contacts, email, ip, change_type
    )
    SELECT
        v.device_id, v.device_name, v.serial_number, v.mac_address,
        v.model, v.license_due, v.province,
        v.site_name, v.municipality, v.lat, v.long,
        v.contacts, v.email, v.ip, TG_OP
    FROM network_devices_full v
    WHERE v.device_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_network_devices_history
AFTER INSERT OR UPDATE ON network_devices
FOR EACH ROW EXECUTE FUNCTION fn_save_network_history();

CREATE OR REPLACE FUNCTION fn_save_network_history_from_sites()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO network_devices_full_history (
        device_id, device_name, serial_number, mac_address,
        model, license_due, province,
        site_name, municipality, lat, long,
        contacts, email, ip, change_type
    )
    SELECT
        v.device_id, v.device_name, v.serial_number, v.mac_address,
        v.model, v.license_due, v.province,
        v.site_name, v.municipality, v.lat, v.long,
        v.contacts, v.email, v.ip, TG_OP
    FROM network_devices_full v
    WHERE v.site_name = NEW.site_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_network_sites_history
AFTER INSERT OR UPDATE ON network_sites
FOR EACH ROW EXECUTE FUNCTION fn_save_network_history_from_sites();


-- ============================================================
-- STEP 11: VERIFY EVERYTHING
-- ============================================================

-- Site counts per province (expect: 80 Benguet, 80 Ifugao, 38 Ilocos,
--                                    80 Kalinga, 80 Pangasinan, 80 Quezon = 438 total)
SELECT province, COUNT(*) AS total_sites
FROM network_sites
GROUP BY province ORDER BY province;

-- Device counts per province (expect: 240 Benguet, 240 Ifugao, 114 Ilocos,
--                                      240 Kalinga, 240 Pangasinan, 239 Quezon = 1313 total)
SELECT province, COUNT(*) AS total_devices
FROM network_devices
GROUP BY province ORDER BY province;

-- Link check — unlinked_devices should be 0
SELECT
    COUNT(*)                  AS total_devices,
    COUNT(site_id)            AS linked_devices,
    COUNT(*) - COUNT(site_id) AS unlinked_devices
FROM network_devices;

-- Quezon NULL serials — should be exactly 2 rows
SELECT device_name, serial_number, mac_address
FROM network_devices
WHERE province = 'Quezon' AND serial_number IS NULL;

-- Full joined view
SELECT * FROM network_devices_full;

-- History log
SELECT * FROM network_devices_full_history ORDER BY saved_at DESC;

-- Equipment specs check
SELECT
    ns.site_name,
    ns.province,
    es.modem,
    es.trans,
    es.dish
FROM equipment_specs es
JOIN network_sites ns ON es.site_id = ns.id
ORDER BY ns.province, ns.site_name;