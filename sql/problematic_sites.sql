CREATE TABLE problematic_sites (
    id SERIAL PRIMARY KEY,

    "Sitename" TEXT NOT NULL,
    "Province" TEXT,
    "Municipality" TEXT,

    "Status" TEXT,
    "Cause (Assume)" TEXT,
    "Remarks" TEXT,

    "KAD Name" TEXT,
    "KAD Visit Date" DATE,
    "Site Online Date" DATE,

    "Found Problem / Cause in the Site" TEXT,
    "Solution" TEXT
);

SELECT * FROM problematic_sites;