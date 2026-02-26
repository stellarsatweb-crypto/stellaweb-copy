const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Explicitly handle preflight OPTIONS requests
app.options('*', cors());
app.use(express.static(path.join(__dirname, 'public')));

/* ================= POSTGRES CONNECTION ================= */

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'demo',
  password: '12345',
  port: 5432,
});

pool.connect()
  .then(() => console.log('Connected to PostgreSQL ✅'))
  .catch(err => {
    console.error('Database connection error ❌', err);
    process.exit(1);
  });

/* ================= CREATE TABLE ================= */

const createTable = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  id_no VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK 
    (role IN ('Executive','Finance','NOC','Admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

pool.query(createTable)
  .then(() => console.log('Users table ready ✅'))
  .catch(err => console.error('Table creation error:', err));


/* ================= AUTH ROUTE ================= */

app.post('/api/auth', async (req, res) => {

  console.log("REQUEST BODY:", req.body);

  const { action, id_no, full_name, email, password, role } = req.body || {};

  try {

    if (!action) {
      return res.status(400).json({ success: false, error: 'Action is required' });
    }

    /* ================= SIGN UP ================= */
    if (action === 'signup') {

      if (!id_no || !full_name || !email || !password || !role) {
        return res.status(400).json({
          success: false,
          error: 'All fields are required'
        });
      }

      const trimmedId = id_no.trim();
      const trimmedName = full_name.trim();
      const trimmedEmail = email.trim().toLowerCase();

      // Check existing user
      const existing = await pool.query(
        'SELECT id FROM users WHERE id_no = $1 OR email = $2',
        [trimmedId, trimmedEmail]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'User already exists'
        });
      }

      // Hash password
      const hash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (id_no, full_name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, id_no, full_name, email, role, created_at`,
        [trimmedId, trimmedName, trimmedEmail, hash, role]
      );

      return res.json({
        success: true,
        user: result.rows[0]
      });
    }

    /* ================= SIGN IN ================= */
    if (action === 'signin') {

      if (!id_no || !password) {
        return res.status(400).json({
          success: false,
          error: 'ID Number and password are required'
        });
      }

      const trimmedId = id_no.trim();

      const result = await pool.query(
        'SELECT * FROM users WHERE id_no = $1',
        [trimmedId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      const user = result.rows[0];

      const validPassword = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!validPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      delete user.password_hash;

      return res.json({
        success: true,
        user
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid action'
    });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

/* ================= TERMINALS TABLE MAP ================= */

const allowedTables = {
  benguet:   "benguet_inventory",
  ifugao:    "ifugao_inventory",
  ilocos:    "ilocos_inventory",
  kalinga:   "kalinga_inventory",
  pangasinan:"pangasinan_inventory",
  quezon:    "quezon_inventory"
};

/* ================= GET TERMINALS ================= */

app.get("/api/terminals/:region", async (req, res) => {
  const { region } = req.params;
  const table = allowedTables[region];

  if (!table) {
    return res.status(400).json({ error: "Invalid region" });
  }

  try {
    const result = await pool.query(`SELECT * FROM ${table}`);
    res.json(result.rows);
  } catch (err) {
    console.error("DB ERROR:", err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

/* ================= ADD TERMINAL (POST) ================= */

app.post("/api/terminals/:region", async (req, res) => {
  const { region } = req.params;
  const table = allowedTables[region];

  if (!table) {
    return res.status(400).json({ error: "Invalid region" });
  }

  const data = req.body;

  // Remove empty-string values so DB defaults/nulls apply cleanly
  const filteredEntries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
  );

  if (filteredEntries.length === 0) {
    return res.status(400).json({ error: "No data provided" });
  }

  // Build parameterized INSERT:
  // INSERT INTO table (col1, col2, ...) VALUES ($1, $2, ...) RETURNING *
  const columns = filteredEntries.map(([k]) => `"${k}"`).join(", ");
  const placeholders = filteredEntries.map((_, i) => `$${i + 1}`).join(", ");
  const values = filteredEntries.map(([, v]) => v);

  const query = `
    INSERT INTO ${table} (${columns})
    VALUES (${placeholders})
    RETURNING *
  `;

  try {
    const result = await pool.query(query, values);
    return res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error("INSERT ERROR:", err.message);
    return res.status(500).json({ error: "Failed to insert record: " + err.message });
  }
});

/* ================= DELETE TERMINAL ================= */

app.delete("/api/terminals/:region", async (req, res) => {
  const { region } = req.params;
  const table = allowedTables[region];

  console.log("DELETE request — region:", region, "| body:", req.body);

  if (!table) {
    return res.status(400).json({ error: "Invalid region" });
  }

  const { column, ids } = req.body || {};

  if (!column || !ids || !Array.isArray(ids) || ids.length === 0) {
    console.error("DELETE — missing column or ids:", req.body);
    return res.status(400).json({ error: "column and ids array are required" });
  }

  // Whitelist column name: allow letters, digits, spaces, underscores, hyphens
  if (!/^[a-zA-Z0-9_ \-]+$/.test(column)) {
    console.error("DELETE — invalid column name:", column);
    return res.status(400).json({ error: "Invalid column name: " + column });
  }

  try {
    console.log(`DELETE FROM ${table} WHERE "${column}" IN`, ids);

    // Check actual column type from pg catalog first
    const colInfo = await pool.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );

    const dataType = colInfo.rows[0]?.data_type || 'text';
    const isNumeric = ['integer','bigint','smallint','numeric','real','double precision'].includes(dataType);

    console.log(`Column "${column}" type from DB: ${dataType} — casting as ${isNumeric ? 'numeric' : 'text'}`);

    // Build: DELETE FROM table WHERE "col" IN ($1, $2, $3, ...)
    // Let pg infer type from the actual JS value passed (number vs string)
    const values = isNumeric ? ids.map(Number) : ids.map(String);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `DELETE FROM ${table} WHERE "${column}" IN (${placeholders})`,
      values
    );

    console.log("DELETE success — rows deleted:", result.rowCount);

    return res.json({
      success: true,
      deleted: result.rowCount
    });

  } catch (err) {
    console.error("DELETE SQL ERROR:", err.message);
    return res.status(500).json({ error: "Failed to delete records: " + err.message });
  }
});

/* ================= EDIT TERMINAL (PUT) ================= */

app.put("/api/terminals/:region/:id", async (req, res) => {
  const { region, id } = req.params;
  const table = allowedTables[region];

  if (!table) return res.status(400).json({ error: "Invalid region" });

  const { column, data } = req.body || {};

  if (!column || !data || typeof data !== "object") {
    return res.status(400).json({ error: "column and data are required" });
  }

  if (!/^[a-zA-Z0-9_ \-]+$/.test(column)) {
    return res.status(400).json({ error: "Invalid column name" });
  }

  // Get actual column type for the identifier
  const colInfo = await pool.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );

  const dataType = colInfo.rows[0]?.data_type || "text";
  const isNumeric = ["integer","bigint","smallint","numeric","real","double precision"].includes(dataType);
  const idValue = isNumeric ? Number(id) : String(id);

  // Build SET clause from data, excluding the identifier column
  const entries = Object.entries(data).filter(([k]) => k !== column && /^[a-zA-Z0-9_ \-]+$/.test(k));

  if (entries.length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(", ");
  const values = entries.map(([, v]) => v === "" ? null : v);
  values.push(idValue);

  const query = `UPDATE ${table} SET ${setClauses} WHERE "${column}" = $${values.length} RETURNING *`;

  try {
    console.log("PUT query:", query, values);
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    return res.json({ success: true, row: result.rows[0] });

  } catch (err) {
    console.error("UPDATE ERROR:", err.message);
    return res.status(500).json({ error: "Failed to update record: " + err.message });
  }
});

/* ================= START SERVER ================= */

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});