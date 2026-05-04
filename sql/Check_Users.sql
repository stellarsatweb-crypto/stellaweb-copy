SHOW max_connections;

SELECT COUNT(*) AS active_connections
FROM pg_stat_activity;

SELECT version();

SHOW config_file;