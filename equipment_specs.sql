-- ============================================================
-- EQUIPMENT SPECS TABLE
-- Add after STEP 3 (CREATE TABLES), before STEP 4 (COPY)
-- ============================================================

DROP TABLE IF EXISTS equipment_specs CASCADE;

CREATE TABLE equipment_specs (
    id          SERIAL PRIMARY KEY,
    site_id     INT UNIQUE REFERENCES network_sites(id) ON DELETE CASCADE,
    modem       CITEXT,
    trans       CITEXT,
    dish        CITEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO equipment_specs (site_id, modem, trans, dish)
SELECT id, 'MDM2010', 'ILB3210 Single Coax', '1.2m Jonsa Satellite Dish'
FROM network_sites
WHERE id NOT IN (SELECT site_id FROM equipment_specs WHERE site_id IS NOT NULL);

SELECT COUNT(*) AS total_sites_with_specs FROM equipment_specs;
-- Should match:
SELECT COUNT(*) AS total_sites FROM network_sites;

SELECT * FROM equipment_specs;