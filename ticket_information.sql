CREATE TABLE ticket_information (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    airmac_esn VARCHAR(100),
    status VARCHAR(50) NOT NULL
);

SELECT * FROM ticket_information;

drop table ticket_information;