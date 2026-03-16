-- Enable citext extension for case-insensitive text
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE sites (
    id              SERIAL PRIMARY KEY,
    sitename        CITEXT          NOT NULL,
    display_name    CITEXT,
    province        CITEXT,
    municipality    CITEXT,
    modem           CITEXT,
    transceiver     CITEXT,
    dish            CITEXT,
    ip              CITEXT,
    mac             CITEXT,
    lat             NUMERIC(10, 7),
    long            NUMERIC(10, 7),
    contacts        CITEXT,
    email           CITEXT,
    status          CITEXT,
    er_sn           CITEXT,
    er_mac          CITEXT,
    er_model        CITEXT,
    er_lic          CITEXT,
    ap1_sn          CITEXT,
    ap1_mac         CITEXT,
    ap1_model       CITEXT,
    ap1_lic         CITEXT,
    ap2_sn          CITEXT,
    ap2_mac         CITEXT,
    ap2_model       CITEXT,
    ap2_lic         CITEXT,
    project_name    CITEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COPY site_inventory(
    "NO.", "SITENAME", "PROVINCE", "MUNICIPALITY", "REGION",
    "PHASE 1 ORIGINAL AIRMAC", "SPARE MODEM USED", "PHASE 2 AIRMAC",
    "PHASE 1 GRAFANA AIMAC", "PHASE 1 IP ADDRESS", "PHASE 2 IP ADDRESS",
    "PHASE 1 SERIAL", "PHASE 1 TRANCEIVER", "PHASE 1 EAP225-outdoor s/n 1",
    "PHASE 1 EAP225-outdoor s/n 2", "PHASE 1 ER-605 SERIAL", "PHASE 1 LAT",
    "PHASE 1 LONG", "PHASE 1 TRANCEIVER MODEL", "PHASE 1 MODEM MODEL",
    "PHASE 2 EAP225-outdoor s/n 1", "PHASE 2 ASSIGNED KAD", "INSTALLATION DATE",
    "UAT SPEEDTEST MIR DL", "UAT SPEEDTEST MIR UL", "LATENCY",
    "UAT SPEEDTEST CIR AP1 DL", "UAT SPEEDTEST CIR AP1 UL", "AP1 LATENCY",
    "UAT SPEEDTEST CIR AP2 DL", "UAT SPEEDTEST CIR AP2 UL", "AP2 LATENCY",
    "UAT TEST DATE (DICT INPUT)", "LAT", "LONG", "2 - 3 SITE CONTACTS",
    "OLD EAP225", "SITE CONTACT EMAIL/SOCMED", "REMARKS"
)
FROM 'C:\Users\Jae\OneDrive\Desktop\Updated_Map\terminals.csv' DELIMITER ',' CSV HEADER;