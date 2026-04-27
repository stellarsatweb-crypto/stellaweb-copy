const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbFile = path.join(__dirname, 'data', 'database.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) return console.error('open err', err);
});

db.serialize(() => {
  db.all('SELECT id, username, email, role, created_at FROM users ORDER BY id DESC LIMIT 10', (err, rows) => {
    if (err) {
      console.error('query error', err);
      process.exit(1);
    }
    console.log('latest users (up to 10):');
    console.log(rows);
    process.exit(0);
  });
});
