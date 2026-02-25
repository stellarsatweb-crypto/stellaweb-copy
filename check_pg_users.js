const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'demo',
  password: '12345',
  port: 5432,
});

async function main() {
  const { rows } = await pool.query(
    "select id, email, role, created_at, length(password_hash) as hash_len, substring(password_hash from 1 for 4) as prefix from users order by id desc limit 20"
  );
  console.table(rows);
}

main()
  .catch((err) => {
    console.error('DB query failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

