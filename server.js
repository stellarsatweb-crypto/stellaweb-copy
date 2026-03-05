const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
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
  .catch(err => { console.error('Database connection error ❌', err); process.exit(1); });

/* ================= CREATE TABLE ================= */

const createTable = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  id_no VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('Executive','Finance','NOC','Admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

pool.query(createTable)
  .then(() => console.log('Users table ready ✅'))
  .catch(err => console.error('Table creation error:', err));

const createProbTable = `
CREATE TABLE IF NOT EXISTS problematic_sites (
  id SERIAL PRIMARY KEY,
  "Sitename" TEXT,
  "Province" TEXT,
  "Municipality" TEXT,
  "Region" TEXT,
  "Status" TEXT,
  "Cause (Assume)" TEXT,
  "Remarks" TEXT,
  "KAD Name" TEXT,
  "KAD Visit Date" DATE,
  "Site Online Date" DATE,
  "Found Problem / Cause in the Site" TEXT,
  "Solution" TEXT
);
`;

(async () => {
  try {
    await pool.query(createProbTable);
    console.log('Problematic sites table ready ✅');

    const migrations = [
      `ALTER TABLE problematic_sites ALTER COLUMN "Sitename" DROP NOT NULL`,
      `ALTER TABLE problematic_sites ADD COLUMN IF NOT EXISTS "Region" TEXT`,
    ];
    for (const sql of migrations) {
      try { await pool.query(sql); } catch(e) { /* already applied */ }
    }
    console.log('Problematic sites migrations applied ✅');
  } catch (err) {
    console.error('Problematic sites setup error:', err.message);
  }
})();

const createTicketTable = `
CREATE TABLE IF NOT EXISTS ticket_information (
  id SERIAL PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  airmac_esn VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

pool.query(createTicketTable)
  .then(() => console.log('Ticket table ready ✅'))
  .catch(err => console.error('Ticket table creation error:', err));

/* ================= AUTH ROUTE ================= */

app.post('/api/auth', async (req, res) => {
  console.log("REQUEST BODY:", req.body);
  const { action, id_no, full_name, email, password, role } = req.body || {};
  try {
    if (!action) return res.status(400).json({ success: false, error: 'Action is required' });

    if (action === 'signup') {
      if (!id_no || !full_name || !email || !password || !role)
        return res.status(400).json({ success: false, error: 'All fields are required' });
      const trimmedId = id_no.trim();
      const trimmedName = full_name.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const existing = await pool.query('SELECT id FROM users WHERE id_no = $1 OR email = $2', [trimmedId, trimmedEmail]);
      if (existing.rows.length > 0) return res.status(409).json({ success: false, error: 'User already exists' });
      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `INSERT INTO users (id_no, full_name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, id_no, full_name, email, role, created_at`,
        [trimmedId, trimmedName, trimmedEmail, hash, role]
      );
      return res.json({ success: true, user: result.rows[0] });
    }

    if (action === 'signin') {
      if (!id_no || !password) return res.status(400).json({ success: false, error: 'ID Number and password are required' });
      const trimmedId = id_no.trim();
      const result = await pool.query('SELECT * FROM users WHERE id_no = $1', [trimmedId]);
      if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid credentials' });
      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(401).json({ success: false, error: 'Invalid credentials' });
      delete user.password_hash;
      return res.json({ success: true, user });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ================= TERMINALS TABLE MAP ================= */

const allowedTables = {
  benguet:    "benguet_inventory",
  ifugao:     "ifugao_inventory",
  ilocos:     "ilocos_inventory",
  kalinga:    "kalinga_inventory",
  pangasinan: "pangasinan_inventory",
  quezon:     "quezon_inventory"
};

/* ================= GET TERMINALS ================= */

app.get("/api/terminals/:region", async (req, res) => {
  const { region } = req.params;
  const table = allowedTables[region];
  if (!table) return res.status(400).json({ error: "Invalid region" });
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
  if (!table) return res.status(400).json({ error: "Invalid region" });
  const data = req.body;
  const filteredEntries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  if (filteredEntries.length === 0) return res.status(400).json({ error: "No data provided" });
  const columns = filteredEntries.map(([k]) => `"${k}"`).join(", ");
  const placeholders = filteredEntries.map((_, i) => `$${i + 1}`).join(", ");
  const values = filteredEntries.map(([, v]) => v);
  try {
    const result = await pool.query(`INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`, values);
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
  if (!table) return res.status(400).json({ error: "Invalid region" });
  const { column, ids } = req.body || {};
  if (!column || !ids || !Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: "column and ids array are required" });
  if (!/^[a-zA-Z0-9_ \-]+$/.test(column))
    return res.status(400).json({ error: "Invalid column name: " + column });
  try {
    const colInfo = await pool.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    const dataType = colInfo.rows[0]?.data_type || 'text';
    const isNumeric = ['integer','bigint','smallint','numeric','real','double precision'].includes(dataType);
    const values = isNumeric ? ids.map(Number) : ids.map(String);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(`DELETE FROM ${table} WHERE "${column}" IN (${placeholders})`, values);
    return res.json({ success: true, deleted: result.rowCount });
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
  if (!column || !data || typeof data !== "object")
    return res.status(400).json({ error: "column and data are required" });
  if (!/^[a-zA-Z0-9_ \-]+$/.test(column))
    return res.status(400).json({ error: "Invalid column name" });
  const colInfo = await pool.query(
    `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  const dataType = colInfo.rows[0]?.data_type || "text";
  const isNumeric = ["integer","bigint","smallint","numeric","real","double precision"].includes(dataType);
  const idValue = isNumeric ? Number(id) : String(id);
  const entries = Object.entries(data).filter(([k]) => k !== column && /^[a-zA-Z0-9_ \-]+$/.test(k));
  if (entries.length === 0) return res.status(400).json({ error: "No valid fields to update" });
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(", ");
  const values = entries.map(([, v]) => v === "" ? null : v);
  values.push(idValue);
  try {
    const result = await pool.query(`UPDATE ${table} SET ${setClauses} WHERE "${column}" = $${values.length} RETURNING *`, values);
    if (result.rowCount === 0) return res.status(404).json({ error: "Record not found" });
    return res.json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error("UPDATE ERROR:", err.message);
    return res.status(500).json({ error: "Failed to update record: " + err.message });
  }
});

/* ================= PROBLEMATIC SITES — GET ================= */

app.get("/api/problematic-sites", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM problematic_sites ORDER BY id DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error("GET problematic-sites error:", err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

/* ================= PROBLEMATIC SITES — POST ================= */

app.post("/api/problematic-sites", async (req, res) => {
  console.log("POST problematic-sites body:", JSON.stringify(req.body));
  const allowed = ["Sitename","Province","Municipality","Region","Status","Cause (Assume)","Remarks",
    "KAD Name","KAD Visit Date","Site Online Date","Found Problem / Cause in the Site","Solution"];

  const body = req.body || {};
  const entries = allowed
    .map(k => [k, body[k]])
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

  console.log("Entries to insert:", entries.length, entries.map(([k])=>k));

  try {
    let result;
    if (entries.length === 0) {
      result = await pool.query(`INSERT INTO problematic_sites ("Sitename") VALUES (NULL) RETURNING *`);
    } else {
      const cols = entries.map(([k]) => `"${k}"`).join(", ");
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
      const values = entries.map(([, v]) => String(v).trim() === "" ? null : v);
      result = await pool.query(
        `INSERT INTO problematic_sites (${cols}) VALUES (${placeholders}) RETURNING *`,
        values
      );
    }
    console.log("INSERT success, id:", result.rows[0]?.id);
    res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error("POST problematic-sites error:", err.message);
    res.status(500).json({ error: "Failed to insert: " + err.message });
  }
});

/* ================= PROBLEMATIC SITES — EXPORT EXCEL ================= */

app.get("/api/problematic-sites/export-excel", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM problematic_sites ORDER BY "Region", "Sitename"`);
    const rows = result.rows;

    const regions = ["Benguet","Ifugao","Ilocos","Kalinga","Pangasinan","Quezon"];
    const grouped = {};
    regions.forEach(r => grouped[r] = []);
    rows.forEach(row => {
      const r   = row["Region"] || "";
      const key = regions.find(k => k.toLowerCase() === r.toLowerCase());
      if (key) grouped[key].push(row);
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "NOC Dashboard";
    wb.created = new Date();

    const columns = [
      "Sitename","Province","Municipality","Region","Status",
      "Cause (Assume)","Remarks","KAD Name","KAD Visit Date",
      "Site Online Date","Found Problem / Cause in the Site","Solution"
    ];

    const statusColors = {
      "Online":         { bg: "D5F5E3", fg: "1E8449" },
      "Offline":        { bg: "FADBD8", fg: "922B21" },
      "In Progress":    { bg: "FEF9E7", fg: "9A7D0A" },
      "For Monitoring": { bg: "D6EAF8", fg: "1A5276" },
    };

    const thin = (c) => ({ style: "thin", color: { argb: c } });
    const hair = (c) => ({ style: "hair", color: { argb: c } });

    for (const region of regions) {
      const data = grouped[region];
      const ws   = wb.addWorksheet(region, {
        properties: { tabColor: { argb: "FF2F4B85" } }
      });

      ws.addRow(columns);
      const headerRow = ws.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell(cell => {
        cell.font      = { name: "Cambria", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F4B85" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border    = { top: thin("FFFFFFFF"), bottom: thin("FFFFFFFF"), left: thin("FFFFFFFF"), right: thin("FFFFFFFF") };
      });

      if (data.length === 0) {
        ws.addRow(["No records for this region."]);
        ws.mergeCells(2, 1, 2, columns.length);
        const emptyCell     = ws.getCell("A2");
        emptyCell.font      = { name: "Cambria", size: 11, italic: true, color: { argb: "FF8899BB" } };
        emptyCell.alignment = { horizontal: "center", vertical: "middle" };
        emptyCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FA" } };
      } else {
        data.forEach((row, i) => {
          const rowData = columns.map(col => {
            const val = row[col];
            if (val instanceof Date) return val.toISOString().split("T")[0];
            return val ?? "";
          });
          const wsRow  = ws.addRow(rowData);
          wsRow.height = 20;
          const sc     = statusColors[row["Status"] || ""];
          const isEven = i % 2 === 1;

          wsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.alignment = { vertical: "middle", wrapText: true };
            cell.border    = { top: hair("FFCDD8EE"), bottom: hair("FFCDD8EE"), left: hair("FFCDD8EE"), right: hair("FFCDD8EE") };
            if (columns[colNum - 1] === "Status" && sc) {
              cell.font = { name: "Cambria", size: 11, bold: true, color: { argb: "FF" + sc.fg } };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + sc.bg } };
            } else {
              cell.font = { name: "Cambria", size: 11 };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? "FFE8EEF8" : "FFFFFFFF" } };
            }
          });
        });
      }

      const widths = [22, 16, 18, 14, 16, 22, 30, 18, 16, 16, 35, 35];
      columns.forEach((_, i) => { ws.getColumn(i + 1).width = widths[i] || 20; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="problematic_sites_${Date.now()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel export error:", err.message);
    res.status(500).json({ error: "Failed to export: " + err.message });
  }
});

/* ================= PROBLEMATIC SITES — PUT ================= */

app.put("/api/problematic-sites/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const allowed = ["Sitename","Province","Municipality","Region","Status","Cause (Assume)","Remarks",
    "KAD Name","KAD Visit Date","Site Online Date","Found Problem / Cause in the Site","Solution"];
  const entries = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return res.status(400).json({ error: "No valid fields to update" });
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(", ");
  const values = entries.map(([, v]) => v === "" ? null : v);
  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE problematic_sites SET ${setClauses} WHERE id = $${values.length} RETURNING *`, values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Record not found" });
    res.json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error("PUT problematic-sites error:", err.message);
    res.status(500).json({ error: "Failed to update: " + err.message });
  }
});

/* ================= PROBLEMATIC SITES — DELETE ================= */

app.delete("/api/problematic-sites", async (req, res) => {
  const { ids } = req.body || {};
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: "ids array is required" });
  const numIds = ids.map(Number).filter(n => !isNaN(n));
  if (numIds.length === 0) return res.status(400).json({ error: "No valid IDs provided" });
  try {
    const result = await pool.query(
      `DELETE FROM problematic_sites WHERE id = ANY($1::integer[])`, [numIds]
    );
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error("DELETE problematic-sites error:", err.message);
    res.status(500).json({ error: "Failed to delete: " + err.message });
  }
});

/* ================= TICKETS — GET ================= */

app.get("/api/tickets", async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = "SELECT * FROM ticket_information";
    const params = [];
    const conditions = [];

    if (status && status !== "all") {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(subject ILIKE $${params.length} OR CAST(id AS TEXT) ILIKE $${params.length})`);
    }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY id DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/tickets error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= TICKETS — POST ================= */

app.post("/api/tickets", async (req, res) => {
  const { subject, description, airmac_esn, status } = req.body || {};
  if (!subject?.trim())      return res.status(400).json({ error: "Subject is required" });
  if (!description?.trim())  return res.status(400).json({ error: "Description is required" });
  try {
    const result = await pool.query(
      `INSERT INTO ticket_information (subject, description, airmac_esn, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [subject.trim(), description.trim(), airmac_esn?.trim() || null, status || "Open"]
    );
    res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error("POST /api/tickets error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= TICKETS — PUT ================= */

app.put("/api/tickets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const { subject, description, airmac_esn, status } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE ticket_information
       SET subject     = COALESCE($1, subject),
           description = COALESCE($2, description),
           airmac_esn  = COALESCE($3, airmac_esn),
           status      = COALESCE($4, status)
       WHERE id = $5
       RETURNING *`,
      [subject || null, description || null, airmac_esn ?? null, status || null, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Ticket not found" });
    res.json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error("PUT /api/tickets/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= TICKETS — DELETE ================= */

app.delete("/api/tickets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const result = await pool.query(
      "DELETE FROM ticket_information WHERE id = $1 RETURNING id", [id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Ticket not found" });
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error("DELETE /api/tickets/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= LETTERS — SETUP ================= */

let multer;
try {
  multer = require('multer');
} catch(e) {
  console.warn('multer not installed — file uploads will fail. Run: npm install multer');
}

const lettersUpload = multer ? multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = require('path').join(__dirname, 'public', 'uploads', 'letters');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext  = require('path').extname(file.originalname);
      const base = require('path').basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }
}) : null;

/* ── GET /api/letters/folders ── */
app.get('/api/letters/folders', async (req, res) => {
  try {
    const rawParent = req.query.parent_id;
    const parentId  = (rawParent !== undefined && rawParent !== '') ? parseInt(rawParent) : null;
    if (parentId !== null && isNaN(parentId)) return res.status(400).json({ error: 'Invalid parent_id' });

    let result;
    if (parentId !== null) {
      result = await pool.query(`
        SELECT f.id, f.folder_name, f.parent_id, f.created_at,
               (SELECT COUNT(*)::int FROM files fi WHERE fi.folder_id = f.id) +
               (SELECT COUNT(*)::int FROM folders sf WHERE sf.parent_id = f.id) AS file_count
          FROM folders f
         WHERE f.parent_id = $1
           AND f.id != $1
         ORDER BY f.folder_name
      `, [parentId]);
    } else {
      result = await pool.query(`
        SELECT f.id, f.folder_name, f.parent_id, f.created_at,
               (SELECT COUNT(*)::int FROM files fi WHERE fi.folder_id = f.id) +
               (SELECT COUNT(*)::int FROM folders sf WHERE sf.parent_id = f.id) AS file_count
          FROM folders f
         WHERE f.parent_id IS NULL
         ORDER BY f.folder_name
      `);
    }
    res.json(result.rows);
  } catch (err) {
    console.error('GET folders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/letters/folders ── */
app.post('/api/letters/folders', async (req, res) => {
  const { folder_name, parent_id = null } = req.body || {};
  if (!folder_name?.trim()) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO folders (folder_name, parent_id) VALUES ($1, $2) RETURNING *`,
      [folder_name.trim(), parent_id]
    );
    res.status(201).json({ success: true, folder: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists' });
    console.error('POST folders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /api/letters/folders/:id ── */
app.put('/api/letters/folders/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { folder_name } = req.body || {};
  if (!folder_name?.trim()) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `UPDATE folders SET folder_name = $1 WHERE id = $2 RETURNING *`,
      [folder_name.trim(), id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, folder: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists' });
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /api/letters/folders/:id ── */
app.delete('/api/letters/folders/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query(`DELETE FROM folders WHERE id = $1`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/folders/:id/files ── */
app.get('/api/letters/folders/:id/files', async (req, res) => {
  const id = parseInt(req.params.id);
  const q  = req.query.q ? `%${req.query.q}%` : null;
  try {
    const result = await pool.query(
      `SELECT * FROM files
        WHERE folder_id = $1 ${q ? 'AND file_name ILIKE $2' : ''}
        ORDER BY created_at DESC`,
      q ? [id, q] : [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/uploaders ── */
app.get('/api/letters/uploaders', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT uploader_name FROM files WHERE uploader_name IS NOT NULL ORDER BY uploader_name`
    );
    res.json(result.rows.map(r => r.uploader_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/files/recent ── */
app.get('/api/letters/files/recent', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM files ORDER BY created_at DESC LIMIT 8`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/letters/files  (multipart upload) ── */
app.post('/api/letters/files', (req, res, next) => {
  if (!lettersUpload) return res.status(500).json({ error: 'multer not installed — run: npm install multer' });
  lettersUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { folder_id, uploader_name } = req.body || {};
    if (!folder_id) return res.status(400).json({ error: 'folder_id is required' });
    if (!req.file)  return res.status(400).json({ error: 'No file received' });
    const file_path = '/uploads/letters/' + req.file.filename;
    const file_size = req.file.size;
    const file_name = req.file.originalname;
    const ext = require('path').extname(file_name).toLowerCase().replace('.', '');
    const mimeMap = { pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', txt: 'text', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video' };
    const file_type = mimeMap[ext] || ext || req.file.mimetype.split('/')[1]?.slice(0, 50) || 'file';
    try {
      const result = await pool.query(
        `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, last_access)
         VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *`,
        [parseInt(folder_id), uploader_name || null, file_name, file_path, file_size, file_type]
      );
      res.status(201).json({ success: true, file: result.rows[0] });
    } catch (dbErr) {
      res.status(500).json({ error: dbErr.message });
    }
  });
});

/* ── PUT /api/letters/files/:id ── */
app.put('/api/letters/files/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { file_name } = req.body || {};
  if (!file_name?.trim()) return res.status(400).json({ error: 'file_name is required' });
  try {
    const result = await pool.query(
      `UPDATE files SET file_name = $1 WHERE id = $2 RETURNING *`,
      [file_name.trim(), id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true, file: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /api/letters/files/:id ── */
app.delete('/api/letters/files/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(`SELECT file_path FROM files WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    await pool.query(`DELETE FROM files WHERE id = $1`, [id]);
    try {
      const fs       = require('fs');
      const filePath = require('path').join(__dirname, 'public', rows[0].file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* file already gone */ }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/files/:id/download ── */
app.get('/api/letters/files/:id/download', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const f        = rows[0];
    const filePath = require('path').join(__dirname, 'public', f.file_path);
    await pool.query(`UPDATE files SET last_access = NOW() WHERE id = $1`, [id]);
    res.download(filePath, f.file_name, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found on disk' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/letters/files/:id/copy ── */
app.post('/api/letters/files/:id/copy', async (req, res) => {
  const id = parseInt(req.params.id);
  const { target_folder_id } = req.body || {};
  if (!target_folder_id) return res.status(400).json({ error: 'target_folder_id is required' });
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const f = rows[0];
    const fs   = require('fs');
    const path = require('path');
    const ext  = path.extname(f.file_name);
    const base = path.basename(f.file_name, ext).replace(/\s*\(copy.*\)$/, '').trimEnd();
    const newFileName = `${base} (copy)${ext}`;
    const oldPath = path.join(__dirname, 'public', f.file_path);
    const newFile = `${Date.now()}_${path.basename(f.file_path)}`;
    const newRelPath = '/uploads/letters/' + newFile;
    const newAbsPath = path.join(__dirname, 'public', newRelPath);
    fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
    fs.copyFileSync(oldPath, newAbsPath);
    const result = await pool.query(
      `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [parseInt(target_folder_id), f.uploader_name, newFileName, newRelPath, f.file_size, f.file_type]
    );
    res.status(201).json({ success: true, file: result.rows[0] });
  } catch (err) {
    console.error('Copy file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/letters/folders/:id/copy ── */
app.post('/api/letters/folders/:id/copy', async (req, res) => {
  const id = parseInt(req.params.id);
  const { target_parent_id } = req.body || {};
  if (!target_parent_id) return res.status(400).json({ error: 'target_parent_id is required' });
  try {
    const { rows: folderRows } = await pool.query(`SELECT * FROM folders WHERE id = $1`, [id]);
    if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });
    const srcFolder = folderRows[0];
    const newName = srcFolder.folder_name + ' (copy)';
    const { rows: newFolderRows } = await pool.query(
      `INSERT INTO folders (folder_name, parent_id) VALUES ($1, $2) RETURNING *`,
      [newName, parseInt(target_parent_id)]
    );
    const newFolderId = newFolderRows[0].id;
    const { rows: files } = await pool.query(`SELECT * FROM files WHERE folder_id = $1`, [id]);
    const fs   = require('fs');
    const path = require('path');
    for (const f of files) {
      try {
        const newFile    = `${Date.now()}_${path.basename(f.file_path)}`;
        const newRelPath = '/uploads/letters/' + newFile;
        const newAbsPath = path.join(__dirname, 'public', newRelPath);
        const oldAbsPath = path.join(__dirname, 'public', f.file_path);
        fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
        fs.copyFileSync(oldAbsPath, newAbsPath);
        await pool.query(
          `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newFolderId, f.uploader_name, f.file_name, newRelPath, f.file_size, f.file_type]
        );
      } catch { /* skip files that can't be copied */ }
    }
    res.status(201).json({ success: true, folder_id: newFolderId, folder_name: newName });
  } catch (err) {
    console.error('Copy folder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/files/:id/preview ── */
app.get('/api/letters/files/:id/preview', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const f        = rows[0];
    const filePath = require('path').join(__dirname, 'public', f.file_path);
    const fs       = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    const ext = require('path').extname(f.file_name).toLowerCase();
    const mimeTypes = {
      '.pdf':  'application/pdf',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.webp': 'image/webp',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc':  'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls':  'application/vnd.ms-excel',
      '.mp4':  'video/mp4',
      '.webm': 'video/webm',
      '.mov':  'video/quicktime',
      '.avi':  'video/x-msvideo',
      '.mkv':  'video/x-matroska',
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${f.file_name}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= START SERVER ================= */

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use.`);
  else console.error('Server error:', err);
  process.exit(1);
});

