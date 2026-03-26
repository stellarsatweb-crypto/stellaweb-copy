DROP VIEW  IF EXISTS regional_progress_view   CASCADE;
DROP TABLE IF EXISTS regional_progress_reports CASCADE;
DROP TABLE IF EXISTS other_data               CASCADE;

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE other_data (
    id          SERIAL PRIMARY KEY,
    date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mir         NUMERIC(5,2),
    ticket      NUMERIC(5,2),
    sla         NUMERIC(5,2),
    created_by  INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE regional_progress_reports (
    id          SERIAL PRIMARY KEY,
    region      CITEXT NOT NULL,
    deadline    DATE,                                        -- kept as DATE
    report_id   INT REFERENCES other_data(id) ON DELETE CASCADE
);

CREATE VIEW regional_progress_view AS
SELECT
    r.id,
    r.region,
    r.deadline,                                             -- just displayed, not in formula
    o.mir,
    o.ticket,
    o.sla,
    (
        (COALESCE(o.mir,    0) +
         COALESCE(o.ticket, 0) +
         COALESCE(o.sla,    0))
        / 3.0                                               -- divided by 3 now, not 4
    )::NUMERIC(5,2) AS progress,
    u.full_name     AS created_by,
    o.date
FROM regional_progress_reports r
JOIN other_data o ON r.report_id = o.id
JOIN users u ON o.created_by = u.id;

SELECT * FROM regional_progress_view;
SELECT * FROM other_data;
SELECT * FROM regional_progress_reports;

---------------------------------------


CREATE TABLE report_project_sites (
    site_id SERIAL PRIMARY KEY,
    region CITEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE regional_progress_reports
ADD COLUMN site_id INT,
ADD CONSTRAINT fk_site_progress
FOREIGN KEY (site_id)
REFERENCES report_project_sites(site_id)
ON DELETE CASCADE;

ALTER TABLE other_data
ADD COLUMN site_id INT,
ADD CONSTRAINT fk_site_data
FOREIGN KEY (site_id)
REFERENCES report_project_sites(site_id)
ON DELETE SET NULL;

DROP VIEW regional_progress_view;

CREATE VIEW regional_progress_view AS
SELECT
    r.id,
    s.region AS site_region,   -- from project_sites
    r.region AS report_region,
    r.deadline,
    o.mir,
    o.ticket,
    o.sla,
    (
        (COALESCE(o.mir, 0) +
         COALESCE(o.ticket, 0) +
         COALESCE(o.sla, 0))
        / 3.0
    )::NUMERIC(5,2) AS progress,
    u.full_name AS created_by,
    o.date
FROM regional_progress_reports r
JOIN other_data o ON r.report_id = o.id
JOIN users u ON o.created_by = u.id
LEFT JOIN report_project_sites s ON r.site_id = s.site_id;

ALTER TABLE other_data
ADD COLUMN extra_data JSONB;