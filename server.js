const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const multer  = require('multer');

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
  id            SERIAL PRIMARY KEY,
  id_no         CITEXT UNIQUE NOT NULL,
  full_name     CITEXT NOT NULL,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          CITEXT NOT NULL CHECK (LOWER(role) IN ('executive','finance','noc','admin','bidder')),
  photo         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  department VARCHAR(100) DEFAULT 'NOC Department',
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
      return res.json({ success: true, user }); // includes photo field
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ================= TERMINALS TABLE MAP ================= */

/* ================= REGIONS API ================= */

// GET all regions
app.get('/api/regions', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM regions ORDER BY lot_number`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST new region
app.post('/api/regions', async (req, res) => {
  const { region_name } = req.body || {};
  if (!region_name?.trim()) return res.status(400).json({ error: 'region_name is required' });
  try {
    const maxLot = await pool.query(`SELECT COALESCE(MAX(lot_number),0)+1 AS next FROM regions`);
    const next = maxLot.rows[0].next;
    const result = await pool.query(
      `INSERT INTO regions (lot_number, region_name) VALUES ($1, $2) RETURNING *`,
      [next, region_name.trim().toUpperCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Region already exists' });
    res.status(500).json({ error: err.message });
  }
});

/* ================= GET TERMINALS ================= */

app.get('/api/terminals/:region', async (req, res) => {
  const region = decodeURIComponent(req.params.region).toUpperCase();
  try {
    const result = await pool.query(
      `SELECT * FROM site_inventory WHERE UPPER(region_name) = $1 ORDER BY id`,
      [region]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('DB ERROR:', err.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

/* ================= ADD TERMINAL (POST) ================= */

app.post('/api/terminals/:region', async (req, res) => {
  const region = decodeURIComponent(req.params.region).toUpperCase();
  const data   = req.body || {};
  // Always set region_name
  data.region_name = region;
  const filteredEntries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (filteredEntries.length === 0) return res.status(400).json({ error: 'No data provided' });
  const columns      = filteredEntries.map(([k]) => `"${k}"`).join(', ');
  const placeholders = filteredEntries.map((_, i) => `$${i + 1}`).join(', ');
  const values       = filteredEntries.map(([, v]) => v);
  try {
    const result = await pool.query(
      `INSERT INTO site_inventory (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('INSERT ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to insert record: ' + err.message });
  }
});

/* ================= IMPORT TERMINALS (CSV/XLSX upload) ================= */

app.post('/api/terminals/:region/import', multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }).single('file'), async (req, res) => {
  const region = decodeURIComponent(req.params.region).toUpperCase();
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let raw = [];

    // ── Fetch valid DB columns first (used for header detection too) ─────────
    const colsRes   = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'site_inventory' AND column_name NOT IN ('id','region_name')`
    );
    const validCols = colsRes.rows.map(r => r.column_name);

    // ── resolveHeader: map any file header string → exact DB column name ─────
    // Handles: column reordering, embedded newlines, extra spaces, case differences
    const normWS = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
    const resolveHeader = (fileHeader) => {
      const raw = String(fileHeader);
      const t   = raw.trim();
      const n   = normWS(raw);
      if (!t) return null;
      // 1. Exact match
      if (validCols.includes(t))                              return t;
      // 2. Normalized whitespace (collapses \n, \t, multiple spaces)
      const nm = validCols.find(c => normWS(c) === n);
      if (nm)                                                 return nm;
      // 3. Case-insensitive exact
      const ci = validCols.find(c => c.toLowerCase() === t.toLowerCase());
      if (ci)                                                 return ci;
      // 4. Trim trailing/leading spaces then case-insensitive (e.g. "SPARE MODEM USED ")
      const ts = validCols.find(c => c.trim().toLowerCase() === t.toLowerCase());
      if (ts)                                                 return ts;
      return null;
    };

    // ── Helper: extract plain string from ExcelJS cell value ─────────────────
    const cellStr = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        if (Array.isArray(val.richText)) return val.richText.map(r => r.text ?? '').join('').trim();
        if (val.result !== undefined)    return String(val.result).trim();
        if (val instanceof Date)         return val.toISOString().slice(0, 10);
        if (val.text !== undefined)      return String(val.text).trim();
      }
      return String(val).trim();
    };

    // ── Helper: score a row as a header candidate ─────────────────────────────
    // Normalizes all whitespace before matching so "PHASE 1\n ORIGINAL AIRMAC" matches "PHASE 1 ORIGINAL AIRMAC"
    const normWS2 = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const scoreAsHeader = (cells) => {
      let score = 0;
      for (const c of cells) {
        if (!c.trim()) continue;
        if (validCols.some(v => normWS2(v) === normWS2(c))) score++;
      }
      return score;
    };

    if (ext === 'csv') {
      // Full RFC-4180 CSV parser — handles quoted fields with embedded newlines and commas
      const text   = req.file.buffer.toString('utf8');
      const fields = [];
      let cur = '', inQ = false, i = 0;
      while (i < text.length) {
        const ch = text[i], nx = text[i + 1];
        if (ch === '"' && inQ && nx === '"') { cur += '"'; i += 2; continue; }
        if (ch === '"') { inQ = !inQ; i++; continue; }
        if (ch === ',' && !inQ) { fields.push(cur); cur = ''; i++; continue; }
        if ((ch === '\n' || ch === '\r') && !inQ) {
          // end of record
          if (ch === '\r' && nx === '\n') i++;
          fields.push(cur); cur = '';
          i++;
          // mark end of record with a sentinel
          fields.push('\x00ROW\x00');
          continue;
        }
        cur += ch; i++;
      }
      if (cur !== '') fields.push(cur);

      // Split fields back into rows using sentinel
      const allRows = [];
      let rowBuf = [];
      for (const f of fields) {
        if (f === '\x00ROW\x00') { if (rowBuf.length) { allRows.push(rowBuf); rowBuf = []; } }
        else rowBuf.push(f.trim());
      }
      if (rowBuf.length) allRows.push(rowBuf);

      // Find header row by DB-column match score (checks normalized headers)
      let headerIdx = 0, bestScore = -1;
      for (let r = 0; r < Math.min(15, allRows.length); r++) {
        const score = scoreAsHeader(allRows[r]);
        if (score > bestScore) { bestScore = score; headerIdx = r; }
      }

      const headers = allRows[headerIdx];
      raw = allRows.slice(headerIdx + 1)
        .filter(row => row.some(v => v))
        .map(vals => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
          return obj;
        });

    } else if (ext === 'xlsx') {
      const ExcelJS = require('exceljs');
      const wb      = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);

      const ws = wb.worksheets.find(s => s.rowCount > 0) || wb.worksheets[0];
      if (!ws) return res.status(400).json({ error: 'No worksheet found in file' });

      // Scan first 15 rows — pick the one with the HIGHEST DB-column match score
      let headerRowNum = 1, bestScore = -1;
      for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
        const cells = [];
        ws.getRow(r).eachCell({ includeEmpty: false }, cell => cells.push(cellStr(cell.value)));
        const score = scoreAsHeader(cells);
        if (score > bestScore) { bestScore = score; headerRowNum = r; }
      }

      // Build colIndex map: DB column name → file column index (1-based)
      // This is what makes order-independent mapping work:
      // instead of assuming col 1 = first DB col, we match each header by name
      const headerRow = ws.getRow(headerRowNum);
      const colIndexMap = {}; // dbColName → excelColNum (1-based)
      headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const raw = cellStr(cell.value);
        if (!raw) return;
        const dbCol = resolveHeader(raw);
        if (dbCol) colIndexMap[dbCol] = colNum;
      });

      // Collect data rows — read each cell by its mapped column index, not position
      ws.eachRow((row, rowNum) => {
        if (rowNum <= headerRowNum) return;
        const obj = {};
        let hasValue = false;
        for (const [dbCol, colNum] of Object.entries(colIndexMap)) {
          const v = cellStr(row.getCell(colNum).value);
          obj[dbCol] = v;
          if (v) hasValue = true;
        }
        if (hasValue) raw.push(obj);
      });

    } else {
      return res.status(400).json({ error: 'Only .csv and .xlsx files are supported. Please convert .xls files to .xlsx first.' });
    }

    if (!raw.length) return res.status(400).json({ error: 'File has no data rows' });

    // ── For CSV: raw rows use original file header strings as keys
    //    For XLSX: raw rows already use resolved DB column names as keys
    //    We normalise both paths here into DB column name → value
    // ── Header → DB column resolver (used by both CSV and XLSX paths) ─────────
    // (resolveHeader is defined above in the XLSX block; re-expose for CSV path)
    const fileHeaders = Object.keys(raw[0]);

    // Check if raw rows already have DB col names as keys (XLSX path sets this directly)
    // For CSV path, keys are still the raw file header strings — map them now
    const firstKey = fileHeaders[0];
    const alreadyMapped = validCols.includes(firstKey) || firstKey === 'region_name';

    let headerMap = {}; // fileHeader → dbCol  (only used for CSV path)
    if (!alreadyMapped) {
      for (const fh of fileHeaders) {
        if (!fh.trim()) continue;
        const dbCol = resolveHeader(fh);
        if (dbCol) headerMap[fh] = dbCol;
      }
    }

    const mappedCount = alreadyMapped
      ? Object.keys(raw[0]).filter(k => validCols.includes(k)).length
      : Object.keys(headerMap).length;

    if (mappedCount === 0) {
      return res.status(400).json({
        error: `No columns matched the database schema. File headers found: ${fileHeaders.slice(0, 6).join(', ')}`
      });
    }

    // ── Report unmapped file headers back to client ───────────────────────────
    const unmapped = alreadyMapped ? [] : fileHeaders.filter(fh => fh.trim() && !headerMap[fh]);

    // ── Insert rows ───────────────────────────────────────────────────────────
    let inserted = 0, skipped = 0;
    const errors = [];

    for (const row of raw) {
      const colNames = ['region_name'];
      const vals     = [region];

      if (alreadyMapped) {
        // XLSX path: keys are already DB col names
        for (const [dbCol, v] of Object.entries(row)) {
          if (dbCol === 'region_name' || dbCol === 'id') continue;
          if (!validCols.includes(dbCol)) continue;
          colNames.push(dbCol);
          vals.push((v === '' || v === null || v === undefined) ? null : String(v).trim());
        }
      } else {
        // CSV path: map via headerMap
        for (const [fh, dbCol] of Object.entries(headerMap)) {
          const v = row[fh];
          colNames.push(dbCol);
          vals.push((v === '' || v === null || v === undefined) ? null : String(v).trim());
        }
      }

      if (vals.slice(1).every(v => v === null || v === '')) { skipped++; continue; }

      const quotedCols   = colNames.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

      try {
        await pool.query(`INSERT INTO site_inventory (${quotedCols}) VALUES (${placeholders})`, vals);
        inserted++;
      } catch (rowErr) {
        skipped++;
        if (errors.length < 5) errors.push(rowErr.message);
      }
    }

    res.json({ success: true, inserted, skipped, total: raw.length, mappedColumns: mappedCount, unmappedColumns: unmapped, errors });

  } catch (err) {
    console.error('IMPORT ERROR:', err.message, err.stack);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});


/* ================= DELETE TERMINAL ================= */

app.delete('/api/terminals/:region', async (req, res) => {
  const region = decodeURIComponent(req.params.region).toUpperCase();
  const { ids } = req.body || {};
  if (!ids || !Array.isArray(ids) || !ids.length)
    return res.status(400).json({ error: 'ids array is required' });
  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(`DELETE FROM site_inventory WHERE id IN (${placeholders})`, ids.map(Number));
    return res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('DELETE SQL ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to delete records: ' + err.message });
  }
});

/* ================= EDIT TERMINAL (PUT) ================= */

app.put('/api/terminals/:region/:id', async (req, res) => {
  const id   = parseInt(req.params.id);
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data is required' });
  const entries = Object.entries(data).filter(([k]) => k !== 'id' && /^[a-zA-Z0-9_ \-"]+$/.test(k));
  if (!entries.length) return res.status(400).json({ error: 'No valid fields to update' });
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ');
  const values     = entries.map(([, v]) => v === '' ? null : v);
  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE site_inventory SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Record not found' });
    return res.json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('UPDATE ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to update record: ' + err.message });
  }
});


/* ================= PROBLEMATIC SITES — GET ================= */

app.get("/api/problematic-sites", async (req, res) => {
  try {
    const region = req.query.region;
    let result;
    if (region) {
      result = await pool.query(
        `SELECT * FROM problematic_sites WHERE UPPER("Region") = UPPER($1) ORDER BY id DESC`,
        [region]
      );
    } else {
      result = await pool.query(`SELECT * FROM problematic_sites ORDER BY id DESC`);
    }
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
  const { subject, description, airmac_esn, status, department } = req.body || {};
  if (!subject?.trim())      return res.status(400).json({ error: "Subject is required" });
  if (!description?.trim())  return res.status(400).json({ error: "Description is required" });
  try {
    const result = await pool.query(
      `INSERT INTO ticket_information (subject, description, airmac_esn, status, department)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [subject.trim(), description.trim(), airmac_esn?.trim() || null, status || "Open", department || "NOC Department"]
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
  const { subject, description, airmac_esn, status, department } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE ticket_information
       SET subject     = COALESCE($1, subject),
           description = COALESCE($2, description),
           airmac_esn  = COALESCE($3, airmac_esn),
           status      = COALESCE($4, status),
           department  = COALESCE($5, department)
       WHERE id = $6
       RETURNING *`,
      [subject || null, description || null, airmac_esn ?? null, status || null, department || null, id]
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

// multer required at top of file

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


/* Safe migration: add department column if it does not exist */
pool.query(`ALTER TABLE ticket_information ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'NOC Department'`).catch(() => {});

/* ================= MAP API ================= */

// GET all sites with lat/long for map plotting
app.get('/api/terminals/all-sites', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT region_name, "SITENAME", "NO.", "PROVINCE", "REGION",
             "LAT", "LONG", "PHASE 1 LAT", "PHASE 1 LONG"
      FROM site_inventory
      WHERE ("LAT" IS NOT NULL AND "LAT" != '')
         OR ("PHASE 1 LAT" IS NOT NULL AND "PHASE 1 LAT" != '')
      ORDER BY region_name, "SITENAME"
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ================= REPORTS API ================= */

const reportEvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = require('path').join(__dirname, 'public', 'uploads', 'evidence');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext  = require('path').extname(file.originalname);
      const name = `evidence_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ── Regional Progress Reports ───────────────────────────────────────────────

(async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS other_data (
        id          SERIAL PRIMARY KEY,
        date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        mir         NUMERIC(5,2),
        ticket      NUMERIC(5,2),
        sla         NUMERIC(5,2),
        created_by  INT REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS regional_progress_reports (
        id          SERIAL PRIMARY KEY,
        region      CITEXT NOT NULL,
        deadline    DATE,
        date_start  DATE,
        date_end    DATE,
        report_id   INT REFERENCES other_data(id) ON DELETE CASCADE
      )
    `);

    // Safe migrations for existing DBs
    const safeAlter = [
      `ALTER TABLE other_data DROP COLUMN IF EXISTS site_name`,
      `ALTER TABLE regional_progress_reports ADD COLUMN IF NOT EXISTS date_start DATE`,
      `ALTER TABLE regional_progress_reports ADD COLUMN IF NOT EXISTS date_end DATE`,
      `ALTER TABLE regional_progress_reports DROP COLUMN IF EXISTS deadline`,
    ];
    for (const sql of safeAlter) {
      try { await pool.query(sql); } catch(e) {}
    }

    // Recreate view matching new schema
    await pool.query(`DROP VIEW IF EXISTS regional_progress_view CASCADE`);
    await pool.query(`
      CREATE VIEW regional_progress_view AS
      SELECT
        r.id,
        r.region,
        r.date_start,
        r.date_end,
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
      LEFT JOIN other_data o ON r.report_id = o.id
      LEFT JOIN users u ON o.created_by = u.id
    `);

    // report_history table for update log
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_history (
        id            SERIAL PRIMARY KEY,
        region_id     INT REFERENCES regional_progress_reports(id) ON DELETE CASCADE,
        other_data_id INT REFERENCES other_data(id) ON DELETE CASCADE,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Reports schema ready ✅');
  } catch (err) {
    console.error('Reports schema error:', err.message);
  }
})();

// GET all reports
app.get('/api/reports', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        r.id,
        r.region,
        r.date_start,
        r.date_end,
        r.report_id,
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
        o.date AS last_updated
      FROM regional_progress_reports r
      LEFT JOIN other_data o ON r.report_id = o.id
      LEFT JOIN users u ON o.created_by = u.id
      ORDER BY r.id
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all other_data (history) for a region
app.get('/api/reports/:regionId/reminders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, u.full_name AS created_by_name
      FROM other_data o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id IN (
        SELECT unnest(ARRAY(
          SELECT od.id FROM other_data od
          WHERE od.id = (SELECT report_id FROM regional_progress_reports WHERE id = $1)
          UNION
          SELECT od2.id FROM other_data od2
          WHERE od2.id IN (
            SELECT h.other_data_id FROM report_history h WHERE h.region_id = $1
          )
        ))
      )
      ORDER BY o.date DESC
    `, [req.params.regionId]);
    res.json(result.rows);
  } catch {
    // Fallback: just return the single linked record
    try {
      const r2 = await pool.query(`
        SELECT o.*, u.full_name AS created_by_name
        FROM other_data o
        LEFT JOIN users u ON o.created_by = u.id
        WHERE o.id = (SELECT report_id FROM regional_progress_reports WHERE id = $1)
      `, [req.params.regionId]);
      res.json(r2.rows);
    } catch(e2) { res.json([]); }
  }
});

// GET history for a region (all other_data records ever linked)
app.get('/api/reports/:regionId/history', async (req, res) => {
  try {
    // Use report_history if it exists, otherwise fallback to single record
    const result = await pool.query(`
      SELECT o.*, u.full_name AS created_by_name
      FROM other_data o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id IN (
        SELECT other_data_id FROM report_history WHERE region_id = $1
        UNION
        SELECT report_id FROM regional_progress_reports WHERE id = $1
      )
      ORDER BY o.date DESC
    `, [req.params.regionId]);
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

// POST new region
app.post('/api/reports', async (req, res) => {
  const { region, date_start, date_end } = req.body;
  if (!region?.trim()) return res.status(400).json({ error: 'region is required' });
  try {
    const result = await pool.query(
      `INSERT INTO regional_progress_reports (region, date_start, date_end)
       VALUES ($1, $2, $3) RETURNING *`,
      [region.trim(), date_start || null, date_end || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update region
app.put('/api/reports/:id', async (req, res) => {
  const { region, date_start, date_end } = req.body;
  try {
    const result = await pool.query(
      `UPDATE regional_progress_reports
       SET region=$1, date_start=$2, date_end=$3
       WHERE id=$4 RETURNING *`,
      [region, date_start || null, date_end || null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE region
app.delete('/api/reports/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM regional_progress_reports WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST new update (other_data record) and link it as the latest for the region
app.post('/api/reminders', async (req, res) => {
  const { report_id, mir, ticket, sla, created_by } = req.body;
  if (!report_id) return res.status(400).json({ error: 'report_id is required' });
  try {
    // 1. Insert into other_data (no site_name)
    const odResult = await pool.query(
      `INSERT INTO other_data (mir, ticket, sla, created_by, date)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [mir || null, ticket || null, sla || null, created_by || null]
    );
    const newOd = odResult.rows[0];

    // 2. Log to report_history
    await pool.query(
      `INSERT INTO report_history (region_id, other_data_id) VALUES ($1, $2)`,
      [report_id, newOd.id]
    ).catch(() => {});

    // 3. Update region's report_id to this latest record
    await pool.query(
      `UPDATE regional_progress_reports SET report_id=$1 WHERE id=$2`,
      [newOd.id, report_id]
    );

    res.status(201).json(newOd);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── User Settings ────────────────────────────────────────────────────────────

// Safe migration: add photo column to users table
(async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT`);
    console.log('users.photo column ready ✅');
  } catch(e) { console.error('photo migration:', e.message); }
})();

// Multer for profile photos
const profilePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = require('path').join(__dirname, 'public', 'uploads', 'photos');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = require('path').extname(file.originalname).toLowerCase();
    cb(null, `user_${req.params.id}_${Date.now()}${ext}`);
  }
});
const profilePhotoUpload = multer({
  storage: profilePhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// POST upload profile photo
app.post('/api/users/:id/photo', profilePhotoUpload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const relPath = '/uploads/photos/' + req.file.filename;
  try {
    // Delete old photo file if exists
    const old = await pool.query(`SELECT photo FROM users WHERE id=$1`, [req.params.id]);
    if (old.rows[0]?.photo) {
      const oldPath = require('path').join(__dirname, 'public', old.rows[0].photo);
      require('fs').unlink(oldPath, () => {});
    }
    const result = await pool.query(
      `UPDATE users SET photo=$1 WHERE id=$2 RETURNING id, photo`,
      [relPath, req.params.id]
    );
    res.json({ success: true, photo: relPath, user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET user by id
app.get('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, id_no, full_name, email, role, created_at FROM users WHERE id=$1`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update profile (full_name, email)
app.put('/api/users/:id', async (req, res) => {
  const { full_name, email } = req.body;
  if (!full_name?.trim() || !email?.trim())
    return res.status(400).json({ error: 'full_name and email are required' });
  try {
    const result = await pool.query(
      `UPDATE users SET full_name=$1, email=$2 WHERE id=$3
       RETURNING id, id_no, full_name, email, role`,
      [full_name.trim(), email.trim(), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT change password
app.put('/api/users/:id/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Both passwords are required' });
  try {
    const userRes = await pool.query(`SELECT password_hash FROM users WHERE id=$1`, [req.params.id]);
    if (!userRes.rowCount) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Leave Requests ───────────────────────────────────────────────────────────

(async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id             SERIAL PRIMARY KEY,
        employee_id    INT REFERENCES users(id) ON DELETE SET NULL,
        department     CITEXT,
        position       CITEXT,
        leave_type     CITEXT NOT NULL DEFAULT 'vacation' CHECK (
                         LOWER(leave_type) IN ('vacation','sick','emergency','maternity','paternity','others')
                       ),
        start_date     DATE NOT NULL,
        end_date       DATE NOT NULL,
        number_of_days NUMERIC(5,1),
        reason         CITEXT,
        attachment     TEXT,
        status         CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                         LOWER(status) IN ('pending','approved','rejected','cancelled')
                       ),
        remarks        TEXT,
        submitted_at   TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests_history (
        history_id     SERIAL PRIMARY KEY,
        request_id     INT,
        employee_name  CITEXT,
        employee_id_no CITEXT,
        department     CITEXT,
        position       CITEXT,
        leave_type     CITEXT,
        start_date     DATE,
        end_date       DATE,
        number_of_days NUMERIC(5,1),
        reason         CITEXT,
        attachment     TEXT,
        status         CITEXT,
        remarks        TEXT,
        submitted_at   TIMESTAMP,
        updated_at     TIMESTAMP,
        change_type    VARCHAR(10) CHECK (change_type IN ('INSERT','UPDATE')),
        saved_at       TIMESTAMP DEFAULT NOW()
      )
    `);

    // Recreate view
    await pool.query(`DROP VIEW IF EXISTS leave_requests_full CASCADE`);
    await pool.query(`
      CREATE VIEW leave_requests_full AS
      SELECT
        lr.id,
        e.full_name       AS employee_name,
        e.id_no           AS employee_id_no,
        lr.department,
        lr.position,
        lr.leave_type,
        lr.start_date,
        lr.end_date,
        lr.number_of_days,
        lr.reason,
        lr.attachment,
        lr.status,
        lr.remarks,
        lr.submitted_at,
        lr.updated_at
      FROM leave_requests lr
      LEFT JOIN users e ON lr.employee_id = e.id
      ORDER BY lr.submitted_at DESC
    `);

    // Auto-calculate days + updated_at trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_calculate_leave_days()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.number_of_days IS NULL THEN
          NEW.number_of_days := (NEW.end_date - NEW.start_date) + 1;
        END IF;
        NEW.updated_at := NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`DROP TRIGGER IF EXISTS trg_calculate_leave_days ON leave_requests`);
    await pool.query(`
      CREATE TRIGGER trg_calculate_leave_days
      BEFORE INSERT OR UPDATE ON leave_requests
      FOR EACH ROW EXECUTE FUNCTION fn_calculate_leave_days()
    `);

    // History trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_save_leave_history()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO leave_requests_history (
          request_id, employee_name, employee_id_no,
          department, position, leave_type,
          start_date, end_date, number_of_days,
          reason, attachment, status,
          remarks, submitted_at, updated_at, change_type
        )
        SELECT
          v.id, v.employee_name, v.employee_id_no,
          v.department, v.position, v.leave_type,
          v.start_date, v.end_date, v.number_of_days,
          v.reason, v.attachment, v.status,
          v.remarks, v.submitted_at, v.updated_at, TG_OP
        FROM leave_requests_full v
        WHERE v.id = NEW.id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`DROP TRIGGER IF EXISTS trg_leave_requests_history ON leave_requests`);
    await pool.query(`
      CREATE TRIGGER trg_leave_requests_history
      AFTER INSERT OR UPDATE ON leave_requests
      FOR EACH ROW EXECUTE FUNCTION fn_save_leave_history()
    `);

    console.log('leave_requests schema ready ✅');
  } catch(e) { console.error('leave_requests error:', e.message); }
})();

// Multer for leave attachments
const leaveAttachStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = require('path').join(__dirname, 'public', 'uploads', 'leaves');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = require('path').extname(file.originalname).toLowerCase();
    cb(null, `leave_${req.params.id}_${Date.now()}${ext}`);
  }
});
const leaveUpload = multer({ storage: leaveAttachStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET all leave requests for a user (via view)
app.get('/api/users/:id/leaves', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM leave_requests_full WHERE employee_id_no =
        (SELECT id_no FROM users WHERE id = $1)
       ORDER BY submitted_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all leave requests (admin view)
app.get('/api/leaves', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? `WHERE LOWER(status) = '${status.toLowerCase()}'` : '';
    const result = await pool.query(`SELECT * FROM leave_requests_full ${where}`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST new leave request
app.post('/api/users/:id/leaves', leaveUpload.single('attachment'), async (req, res) => {
  const { department, position, leave_type, start_date, end_date, number_of_days, reason } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end date are required' });
  if (!leave_type)              return res.status(400).json({ error: 'Leave type is required' });
  const attachPath = req.file ? '/uploads/leaves/' + req.file.filename : null;
  try {
    const result = await pool.query(
      `INSERT INTO leave_requests
         (employee_id, department, position, leave_type, start_date, end_date, number_of_days, reason, attachment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, department||null, position||null,
       leave_type.toLowerCase(), start_date, end_date,
       number_of_days||null, reason||null, attachPath]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update leave status (admin)
app.put('/api/leaves/:id/status', async (req, res) => {
  const { status, remarks } = req.body;
  const allowed = ['pending','approved','rejected','cancelled'];
  if (!allowed.includes(status?.toLowerCase()))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    const result = await pool.query(
      `UPDATE leave_requests SET status=$1, remarks=$2 WHERE id=$3 RETURNING *`,
      [status, remarks||null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE / cancel a leave request
app.delete('/api/leaves/:id', async (req, res) => {
  try {
    await pool.query(
      `UPDATE leave_requests SET status='cancelled' WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Dashboard Stats ─────────────────────────────────────────────────────────

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [sites, active, prob, tickets, openTickets, recentTickets, probByStatus, sitesByRegion] = await Promise.all([
      // Total terminals (sum across all region tables)
      pool.query(`
        SELECT COALESCE(SUM(row_count),0) AS total FROM (
          SELECT COUNT(*) AS row_count FROM terminals
        ) t
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // Active sites (is_active = true in terminals)
      pool.query(`SELECT COUNT(*) AS total FROM terminals WHERE is_active = true`)
        .catch(() => ({ rows: [{ total: 0 }] })),

      // Problematic sites count
      pool.query(`SELECT COUNT(*) AS total FROM problematic_sites`)
        .catch(() => ({ rows: [{ total: 0 }] })),

      // Total tickets
      pool.query(`SELECT COUNT(*) AS total FROM ticket_information`)
        .catch(() => ({ rows: [{ total: 0 }] })),

      // Open tickets
      pool.query(`SELECT COUNT(*) AS total FROM ticket_information WHERE LOWER(status) = 'open'`)
        .catch(() => ({ rows: [{ total: 0 }] })),

      // Recent 5 tickets
      pool.query(`
        SELECT id, subject, status, department, created_at
        FROM ticket_information
        ORDER BY created_at DESC LIMIT 5
      `).catch(() => ({ rows: [] })),

      // Problematic sites by status
      pool.query(`
        SELECT "Status" AS status, COUNT(*) AS count
        FROM problematic_sites
        GROUP BY "Status"
        ORDER BY count DESC
      `).catch(() => ({ rows: [] })),

      // Sites per region (from regions table)
      pool.query(`
        SELECT region_name, COUNT(*) AS count
        FROM regions
        GROUP BY region_name
        ORDER BY region_name
      `).catch(() => ({ rows: [] })),
    ]);

    res.json({
      totalSites:       parseInt(sites.rows[0]?.total) || 0,
      activeSites:      parseInt(active.rows[0]?.total) || 0,
      problematicSites: parseInt(prob.rows[0]?.total) || 0,
      totalTickets:     parseInt(tickets.rows[0]?.total) || 0,
      openTickets:      parseInt(openTickets.rows[0]?.total) || 0,
      recentTickets:    recentTickets.rows,
      probByStatus:     probByStatus.rows,
      sitesByRegion:    sitesByRegion.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Map / Network Sites ─────────────────────────────────────────────────────

// Ensure is_active column exists on network_sites
(async () => {
  try {
    await pool.query(`ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS project_name TEXT DEFAULT 'DICT438'`);
    await pool.query(`ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS modem TEXT`);
    await pool.query(`ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS transceiver TEXT`);
    await pool.query(`ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS dish TEXT`);
    console.log('network_sites columns ready ✅');
  } catch(e) { console.error('network_sites migration:', e.message); }
})();

// GET all network_sites with full details + joined devices
app.get('/api/map/sites', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ns.id, ns.site_name, ns.municipality, ns.province,
        ns.lat, ns.long, ns.ip, ns.mac, ns.contacts, ns.email,
        ns.is_active, ns.project_name,
        ns.modem, ns.transceiver, ns.dish,
        COALESCE(
          json_agg(
            json_build_object(
              'device_name', nd.device_name,
              'model',       nd.model,
              'serial',      nd.serial_number,
              'mac',         nd.mac_address,
              'license_due', nd.license_due
            )
          ) FILTER (WHERE nd.id IS NOT NULL), '[]'
        ) AS devices
      FROM network_sites ns
      LEFT JOIN network_devices nd ON nd.site_id = ns.id
      GROUP BY ns.id
      ORDER BY ns.province, ns.site_name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT activate/deactivate a site
app.put('/api/map/sites/:siteName/status', async (req, res) => {
  const { is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE network_sites SET is_active=$1 WHERE site_name=$2 RETURNING *`,
      [is_active, req.params.siteName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Site not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update lat/long for a site
app.put('/api/map/sites/:siteName/coords', async (req, res) => {
  const { lat, long } = req.body;
  if (lat == null || long == null) return res.status(400).json({ error: 'lat and long are required' });
  try {
    const result = await pool.query(
      `UPDATE network_sites SET lat=$1, long=$2 WHERE site_name=$3 RETURNING *`,
      [parseFloat(lat), parseFloat(long), req.params.siteName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Site not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT edit site details
app.put('/api/map/sites/:siteName/edit', async (req, res) => {
  const { ip, mac, lat, long: lng, contacts, email } = req.body;
  try {
    const result = await pool.query(
      `UPDATE network_sites SET ip=$1, mac=$2, lat=$3, long=$4, contacts=$5, email=$6
       WHERE site_name=$7 RETURNING *`,
      [ip||null, mac||null, lat||null, lng||null, contacts||null, email||null, req.params.siteName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Site not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Ticket Replies ──────────────────────────────────────────────────────────

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_replies (
        id         SERIAL PRIMARY KEY,
        ticket_id  INT NOT NULL REFERENCES ticket_information(id) ON DELETE CASCADE,
        user_id    INT REFERENCES users(id) ON DELETE SET NULL,
        message    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('ticket_replies table ready ✅');
  } catch (err) {
    console.error('ticket_replies error:', err.message);
  }
})();

// GET replies for a ticket
app.get('/api/tickets/:ticketId/replies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.full_name
      FROM ticket_replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.ticket_id = $1
      ORDER BY r.created_at ASC
    `, [req.params.ticketId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST new reply
app.post('/api/tickets/:ticketId/replies', async (req, res) => {
  const { message, user_id } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
  try {
    const result = await pool.query(`
      INSERT INTO ticket_replies (ticket_id, user_id, message)
      VALUES ($1, $2, $3) RETURNING *
    `, [req.params.ticketId, user_id || null, message.trim()]);
    const row = result.rows[0];
    if (row.user_id) {
      const u = await pool.query('SELECT full_name FROM users WHERE id=$1', [row.user_id]);
      if (u.rows[0]) Object.assign(row, u.rows[0]);
    }
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT edit a reply
app.put('/api/replies/:id', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
  try {
    const result = await pool.query(
      `UPDATE ticket_replies SET message=$1 WHERE id=$2 RETURNING *`,
      [message.trim(), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE a reply
app.delete('/api/replies/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM ticket_replies WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE other_data record
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM other_data WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use.`);
  else console.error('Server error:', err);
  process.exit(1);
});