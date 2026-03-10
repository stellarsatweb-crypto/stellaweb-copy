CREATE TABLE regional_progress_reports (
    id              SERIAL PRIMARY KEY,
    region          TEXT NOT NULL,
    date_duration   DATERANGE,
    remarks         TEXT,
    ticket_no       VARCHAR(20),
    ticket          TEXT,
    mir             VARCHAR(20),
    utilization     NUMERIC(5,2),
    progress        NUMERIC(5,2)
);
DROP TABLE IF EXISTS regional_progress_reports;
select * from regional_progress_reports;

CREATE TABLE other_data (
    id SERIAL PRIMARY KEY,
    site_name     TEXT NOT NULL,
    start_date    DATE,
    end_date      DATE,
    condition     TEXT,
    evidence      VARCHAR(500),
    status        TEXT,
    remarks       TEXT
);

select * from other_data;
DROP TABLE IF EXISTS other_data;
