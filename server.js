const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'demo',
  password: '12345',
  port: 5432,
});

// Test connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL ✅'))
  .catch(err => {
    console.error('Connection error ❌', err);
    process.exit(1);
  });

// Create users table if not exists (removed username)
const createTable = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'NOC',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

pool.query(createTable)
  .then(() => console.log('Users table ready ✅'))
  .catch(err => console.error(err));


// AUTH ROUTE
app.post('/api/auth', async (req, res) => {
  const { action, email: rawEmail, password, role } = req.body || {};
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  try {
    if (!action || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing email, password, or action' });
    }

    if (action === 'signup') {
      // DB expects: 'admin', 'executive', 'NOC', 'finance' (NOC uppercase, rest lowercase)
      const roleValue = (role || 'NOC').trim();
      const roleNormalized = roleValue === 'NOC' ? 'NOC' : roleValue.toLowerCase();

      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1',
        [email]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'User already exists' });
      }

      const hash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id, email, role, created_at',
        [email, hash, roleNormalized]
      );

      return res.json({ success: true, user: result.rows[0] });
    }

    if (action === 'signin') {

      const result = await pool.query(
        'SELECT * FROM users WHERE LOWER(TRIM(email)) = $1',
        [email]
      );

      console.log('Sign-in attempt:', { email, found: result.rows.length });

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const storedHash = user.password_hash;
      if (!storedHash) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }
      const valid = await bcrypt.compare(password, storedHash);
      console.log('Sign-in password match:', { email, valid });

      if (!valid) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      delete user.password_hash;
      return res.json({ success: true, user });
    }

    res.status(400).json({ success: false, error: 'Invalid action' });

  } catch (err) {
    console.error('API error:', err);
    const message = err.message || 'Server error';
    res.status(500).json({ success: false, error: message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Stop the other process or start this server on a different port.');
    console.error('PowerShell example: $env:PORT=3001; node server.js');
  } else {
    console.error('Server failed to start:', err);
  }
  process.exit(1);
});