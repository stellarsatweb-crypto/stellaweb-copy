// ============================================================
//  STELLAR SAT SOLUTIONS INC — Finance Dashboard
//  Backend: Node.js + Express + PostgreSQL (pg)
//  Run:  node server.js  |  Port: 3000
// ============================================================

require('dotenv').config();

const express  = require('express');
const { Pool } = require('pg');
const path     = require('path');
const multer   = require('multer');
const fs       = require('fs');

const app  = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── File uploads ──────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + '_' + file.originalname),
});
const upload = multer({ storage });

// ── PostgreSQL ────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'postgres',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '12345',
});
pool.connect()
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err.message));

const q = (text, params) => pool.query(text, params);

// ── Date filter helper ────────────────────────────────────────
function buildDateFilter(period, from, to, params) {
  if (from || to) {
    const conds = [];
    if (from) { params.push(from); conds.push(`date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`date <= $${params.length}`); }
    return conds.join(' AND ');
  }
  // Today
  if (period === 'today' || period === 'day')
    return `date = CURRENT_DATE`;
  // Current calendar week (Monday to Sunday)
  if (period === 'week')
    return `date >= DATE_TRUNC('week', CURRENT_DATE) AND date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'`;
  // Current calendar month
  if (period === 'month')
    return `date >= DATE_TRUNC('month', CURRENT_DATE) AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`;
  // All records
  if (period === 'all')
    return '';
  // Current year (default)
  return `EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)`;
}

// ============================================================
//  INCOME
// ============================================================

// GET income sources list (for modal dropdown)
app.get('/api/income/sources', async (req, res) => {
  try {
    const result = await q(`SELECT id, name FROM income_sources ORDER BY name`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all income (used as fallback)
app.get('/api/income', async (req, res) => {
  try {
    const { period = 'year', search = '' } = req.query;
    const params = [];
    const dateF = buildDateFilter(period, '', '', params);
    const conditions = [];
    if (dateF) conditions.push(dateF);
    if (search) { params.push(`%${search}%`); conditions.push(`(s.name ILIKE $${params.length} OR ir.description ILIKE $${params.length})`); }
    // prefix bare date conditions with ir.
    const prefixedConds = conditions.map(c => c.replace(/\bdate\b/g, 'ir.date'));
    const where = prefixedConds.length ? 'WHERE ' + prefixedConds.join(' AND ') : '';
    const result = await q(`
      SELECT ir.id, ir.date, TO_CHAR(ir.date,'Mon - DD - YYYY') AS date_formatted,
             ir.project_name, s.name AS source, ir.description, ir.amount, ir.status, ir.or_number
      FROM income_records ir
      JOIN income_sources s ON s.id = ir.source_id
      ${where} ORDER BY ir.date DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET project income (project_name IS NOT NULL) — with all filters
app.get('/api/income/projects', async (req, res) => {
  try {
    const { period = 'year', search = '', project_name = '', source = '', from = '', to = '' } = req.query;
    const params = [];
    const conditions = ['ir.project_name IS NOT NULL'];
    const dateF = buildDateFilter(period, from, to, params);
    if (dateF) conditions.push(dateF.replace(/\bdate\b/g, 'ir.date'));
    if (project_name) { params.push(`%${project_name}%`); conditions.push(`ir.project_name ILIKE $${params.length}`); }
    if (source)       { params.push(`%${source}%`);       conditions.push(`s.name ILIKE $${params.length}`); }
    if (search) {
      const s = `%${search}%`;
      params.push(s); const i1 = params.length;
      params.push(s); const i2 = params.length;
      params.push(s); const i3 = params.length;
      conditions.push(`(ir.project_name ILIKE $${i1} OR s.name ILIKE $${i2} OR ir.description ILIKE $${i3})`);
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const result = await q(`
      SELECT ir.id, ir.date, TO_CHAR(ir.date,'Mon - DD - YYYY') AS date_formatted,
             ir.project_name, s.name AS source, ir.description, ir.amount, ir.status, ir.or_number
      FROM income_records ir
      JOIN income_sources s ON s.id = ir.source_id
      ${where} ORDER BY ir.date DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: resolve source name → source_id (accepts name string or numeric id)
async function resolveSourceId(source, source_id) {
  if (source_id) return Number(source_id);
  if (!source)   return null;
  const found = await q(`SELECT id FROM income_sources WHERE name ILIKE $1 LIMIT 1`, [source]);
  if (found.rows.length) return found.rows[0].id;
  const inserted = await q(`INSERT INTO income_sources (name) VALUES ($1) RETURNING id`, [source]);
  return inserted.rows[0].id;
}

// POST add general company income (no project)
app.post('/api/income', async (req, res) => {
  try {
    const { date, source, source_id, description, amount, status, or_number } = req.body;
    if (!date || (!source && !source_id) || !amount)
      return res.status(400).json({ error: 'date, source, and amount are required' });
    const sid = await resolveSourceId(source, source_id);
    const result = await q(
      `INSERT INTO income_records (date, source_id, description, amount, status, or_number)
       VALUES ($1,$2,$3,$4,$5::income_status,$6) RETURNING *`,
      [date, sid, description || null, amount, status || 'received', or_number || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ INCOME INSERT ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST add project income (with project_name)
app.post('/api/income/project', async (req, res) => {
  try {
    const { date, project_name, source, source_id, description, amount, status, or_number } = req.body;
    if (!date || (!source && !source_id) || !amount)
      return res.status(400).json({ error: 'date, source, and amount are required' });
    const sid = await resolveSourceId(source, source_id);
    const result = await q(
      `INSERT INTO income_records (date, project_name, source_id, description, amount, status, or_number)
       VALUES ($1,$2,$3,$4,$5,$6::income_status,$7) RETURNING *`,
      [date, project_name || null, sid, description || null, amount, status || 'received', or_number || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ PROJECT INCOME INSERT ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT update income
app.put('/api/income/:id', async (req, res) => {
  try {
    const { date, source, source_id, description, amount, project_name, status, or_number } = req.body;
    const sid = await resolveSourceId(source, source_id);
    const result = await q(
      `UPDATE income_records
       SET date=$1, source_id=$2, description=$3, project_name=$4, amount=$5, status=$6::income_status, or_number=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [date, sid, description || null, project_name || null, amount, status || 'received', or_number || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// DELETE income
app.delete('/api/income/:id', async (req, res) => {
  try {
    await q(`DELETE FROM income_records WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET income KPI totals
app.get('/api/income/kpi', async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateF = buildDateFilter(period, from, to, params);
    const where = dateF ? `WHERE ${dateF}` : '';
    const result = await q(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'received'),  0) AS received_total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'),   0) AS pending_total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'cancelled'), 0) AS cancelled_total,
        COALESCE(SUM(amount), 0)                                      AS total
      FROM income_records ${where}
    `, params);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET monthly income trend (line chart)
app.get('/api/income/monthly', async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateF = buildDateFilter(period, from, to, params);
    const extra = dateF ? `AND ${dateF}` : '';
    const result = await q(`
      SELECT TO_CHAR(DATE_TRUNC('month',date),'Mon') AS month, SUM(amount) AS total
      FROM income_records
      WHERE 1=1 ${extra}
      GROUP BY DATE_TRUNC('month',date)
      ORDER BY DATE_TRUNC('month',date)
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET income by project (bar chart)
app.get('/api/income/by-project', async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateF = buildDateFilter(period, from, to, params);
    const extra = dateF ? `AND ${dateF}` : '';
    const result = await q(`
      SELECT project_name AS label, SUM(amount) AS amount
      FROM income_records
      WHERE project_name IS NOT NULL ${extra}
      GROUP BY project_name ORDER BY project_name
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET distinct project names (for filter dropdowns)
app.get('/api/projects', async (req, res) => {
  try {
    const result = await q(
      `SELECT DISTINCT project_name FROM income_records
       WHERE project_name IS NOT NULL ORDER BY project_name`
    );
    res.json(result.rows.map((r, i) => ({ id: i + 1, project_name: r.project_name })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  COMPANY EXPENSES
// ============================================================

// ── Overview KPIs  GET /api/expenses/kpis?period=year&from=&to= ──
app.get('/api/expenses/kpis', async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateF  = buildDateFilter(period, from, to, params);
    const where  = dateF ? `WHERE ${dateF}` : '';
    const [expResult, conResult] = await Promise.all([
      q(`
        SELECT
          COALESCE(SUM(amount), 0)                                        AS grand_total,
          COALESCE(SUM(amount) FILTER (WHERE type = 'expenses'),  0)      AS expenses_total,
          COALESCE(SUM(amount) FILTER (WHERE type = 'purchases'), 0)      AS purchases_total,
          COALESCE(SUM(amount) FILTER (WHERE type = 'overhead'),  0)      AS overhead_total
        FROM company_expenses ${where}
      `, params),
      q(`SELECT COALESCE(SUM(total), 0) AS contribution_total FROM contributions`),
    ]);
    const row    = expResult.rows[0];
    const conRow = conResult.rows[0];
    res.json({
      grand_total:          Number(row.grand_total),
      expenses_total:       Number(row.expenses_total),
      purchases_total:      Number(row.purchases_total),
      overhead_total:       Number(row.overhead_total),
      contribution_total:   Number(conRow.contribution_total),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Chart data  GET /api/expenses/monthly?period=year&from=&to= ──
app.get('/api/expenses/monthly', async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateF  = buildDateFilter(period, from, to, params);
    const where  = dateF ? `WHERE ${dateF}` : '';

    // For today: group by hour; for week: group by day; otherwise group by month
    let selectExpr, groupExpr, orderExpr;
    if (period === 'today' || period === 'day') {
      selectExpr = `TO_CHAR(DATE_TRUNC('hour', created_at), 'HH12 AM') AS month_label`;
      groupExpr  = `DATE_TRUNC('hour', created_at)`;
      orderExpr  = `DATE_TRUNC('hour', created_at)`;
    } else if (period === 'week') {
      selectExpr = `TO_CHAR(date, 'Dy DD Mon') AS month_label`;
      groupExpr  = `date`;
      orderExpr  = `date`;
    } else {
      selectExpr = `TRIM(TO_CHAR(DATE_TRUNC('month', date), 'Month')) AS month_label`;
      groupExpr  = `DATE_TRUNC('month', date)`;
      orderExpr  = `DATE_TRUNC('month', date)`;
    }

    const result = await q(`
      SELECT ${selectExpr}, SUM(amount) AS total
      FROM company_expenses ${where}
      GROUP BY ${groupExpr}
      ORDER BY ${orderExpr}
    `, params);
    res.json(result.rows.map(r => ({ ...r, total: Number(r.total) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Recent records table (Overview tab)
//    GET /api/expenses/recent?period=year&cat=&status=&search= ─
app.get('/api/expenses/recent', async (req, res) => {
  try {
    const { period = 'year', from = '', to = '', cat = '', status = '', search = '' } = req.query;
    const params = [];
    const dateF  = buildDateFilter(period, from, to, params);
    const conds  = dateF ? [dateF] : [];

    if (cat)    { params.push(cat.toLowerCase());    conds.push(`type = $${params.length}`); }
    if (status) { params.push(status.toLowerCase()); conds.push(`status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(description ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }

    const where  = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    // Show 10 by default; expand to 50 when any filter is actively applied
    const limit = (cat || status || search) ? 50 : 10;
    const result = await q(`
      SELECT id, type, date, category, description, amount, status, vendor
      FROM company_expenses ${where}
      ORDER BY date DESC LIMIT ${limit}
    `, params);
    res.json(result.rows.map(r => ({ ...r, amount: Number(r.amount) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sub-panel KPIs  GET /api/expenses/sub-kpis?type=expenses ─
app.get('/api/expenses/sub-kpis', async (req, res) => {
  try {
    const type   = req.query.type || 'expenses';
    const result = await q(`
      SELECT
        COALESCE(SUM(amount), 0)                                      AS total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'),    0)    AS paid,
        COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'),  0)    AS unpaid,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)    AS pending
      FROM company_expenses WHERE type = $1
    `, [type]);
    const row = result.rows[0];
    res.json({
      total:   Number(row.total),
      paid:    Number(row.paid),
      unpaid:  Number(row.unpaid),
      pending: Number(row.pending),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Sub-panel list  GET /api/expenses/list?type=expenses&cat=&status=&search= ─
app.get('/api/expenses/list', async (req, res) => {
  try {
    const { type = 'expenses', cat = '', status = '', search = '' } = req.query;
    const params = [type];
    const conds  = ['type = $1'];

    if (cat)    { params.push(cat);          conds.push(`category = $${params.length}`); }
    if (status) { params.push(status);       conds.push(`status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(description ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }

    const result = await q(`
      SELECT id, type, date, category, description, vendor, amount, status
      FROM company_expenses WHERE ${conds.join(' AND ')}
      ORDER BY date DESC
    `, params);
    res.json(result.rows.map(r => ({ ...r, amount: Number(r.amount) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Legacy list  GET /api/expenses?search= ───────────────────
app.get('/api/expenses', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const params = search ? [`%${search}%`] : [];
    const where  = search
      ? `WHERE description ILIKE $1 OR category ILIKE $1 OR COALESCE(vendor,'') ILIKE $1`
      : '';
    const result = await q(`SELECT * FROM company_expenses ${where} ORDER BY date DESC`, params);
    res.json(result.rows.map(r => ({ ...r, amount: Number(r.amount) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Add  POST /api/expenses ───────────────────────────────────
app.post('/api/expenses', async (req, res) => {
  try {
    const { date, desc, cat, vendor, amount, status, type } = req.body;
    const result = await q(`
      INSERT INTO company_expenses (type, date, category, description, vendor, amount, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [type || 'expenses', date, cat, desc, vendor || null, amount, status || 'pending']);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Edit  PUT /api/expenses/:id ───────────────────────────────
app.put('/api/expenses/:id', async (req, res) => {
  try {
    const { date, desc, cat, vendor, amount, status, type } = req.body;
    const result = await q(`
      UPDATE company_expenses
      SET type=$1, date=$2, category=$3, description=$4, vendor=$5, amount=$6, status=$7, updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [type || 'expenses', date, cat, desc, vendor || null, amount, status, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Delete  DELETE /api/expenses/:id ─────────────────────────
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await q(`DELETE FROM company_expenses WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ============================================================
//  CONTRIBUTIONS
// ============================================================

// GET /api/contributions/kpis
app.get('/api/contributions/kpis', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM v_contribution_kpis`);
    res.json(result.rows[0] || { grand_total:0, total_paid:0, total_unpaid:0, total_overdue:0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/contributions?type=&status=&search=
app.get('/api/contributions', async (req, res) => {
  try {
    const { type = '', status = '', search = '' } = req.query;
    const params = [];
    const conditions = [];
    if (type)   { params.push(type);           conditions.push(`AND type = $${params.length}::contribution_type`); }
    if (status) { params.push(status);         conditions.push(`AND status = $${params.length}::contribution_status`); }
    if (search) { params.push(`%${search}%`);  conditions.push(`AND name ILIKE $${params.length}`); }
    const result = await q(`
      SELECT id, name, type, employee_share, employer_share, total, due_date, status, created_at
      FROM contributions
      WHERE 1=1 ${conditions.join(' ')}
      ORDER BY due_date DESC, name ASC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/contributions/:id
app.get('/api/contributions/:id', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM contributions WHERE id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/contributions
app.post('/api/contributions', async (req, res) => {
  try {
    const { name, type, employee_share, employer_share, due_date, status } = req.body;
    if (!name || !type || employee_share == null || employer_share == null || !due_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await q(`
      INSERT INTO contributions (name, type, employee_share, employer_share, due_date, status)
      VALUES ($1, $2::contribution_type, $3, $4, $5, $6::contribution_status)
      RETURNING *
    `, [name, type, employee_share, employer_share, due_date, status || 'Unpaid']);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/contributions/:id
app.put('/api/contributions/:id', async (req, res) => {
  try {
    const { name, type, employee_share, employer_share, due_date, status } = req.body;
    const result = await q(`
      UPDATE contributions
      SET name=$1, type=$2::contribution_type, employee_share=$3, employer_share=$4,
          due_date=$5, status=$6::contribution_status, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [name, type, employee_share, employer_share, due_date, status, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/contributions/:id
app.delete('/api/contributions/:id', async (req, res) => {
  try {
    await q(`DELETE FROM contributions WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  PROJECT EXPENSES
// ============================================================

// Helper: build period WHERE clause
function pePeriodClause(period, from, to, alias) {
  const d = alias || 'date';
  if (period === 'today')  return `AND DATE(${d}) = CURRENT_DATE`;
  if (period === 'week')   return `AND DATE(${d}) >= CURRENT_DATE - INTERVAL '7 days'`;
  if (period === 'month')  return `AND DATE_TRUNC('month', ${d}) = DATE_TRUNC('month', CURRENT_DATE)`;
  if (period === 'year')   return `AND EXTRACT(YEAR FROM ${d}) = EXTRACT(YEAR FROM CURRENT_DATE)`;
  if (period === 'custom' && from && to) return `AND ${d} BETWEEN '${from}' AND '${to}'`;
  return '';
}

// GET /api/project-expenses/kpis?type=purchases&period=month
app.get('/api/project-expenses/kpis', async (req, res) => {
  try {
    const { type = 'expenses', period = 'month', from = '', to = '' } = req.query;
    const pc = pePeriodClause(period, from, to);
    const result = await q(`
      SELECT
        COALESCE(SUM(amount),0)                                                  AS total,
        COALESCE(SUM(CASE WHEN status='approved' THEN amount ELSE 0 END),0)      AS approved,
        COALESCE(SUM(CASE WHEN status='pending'  THEN amount ELSE 0 END),0)      AS pending,
        COALESCE(SUM(CASE WHEN status='rejected' THEN amount ELSE 0 END),0)      AS rejected
      FROM project_expenses
      WHERE type=$1 ${pc}
    `, [type]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/project-expenses/chart?period=month
app.get('/api/project-expenses/chart', async (req, res) => {
  try {
    const { period = 'month', from = '', to = '' } = req.query;
    const pc = pePeriodClause(period, from, to);
    const result = await q(`
      SELECT type,
             TO_CHAR(date,'Mon YYYY') AS month_label,
             TO_CHAR(date,'YYYY-MM')  AS month_key,
             SUM(amount)              AS total
      FROM project_expenses
      WHERE 1=1 ${pc}
      GROUP BY type, month_key, month_label
      ORDER BY month_key
    `);
    const purchases = result.rows.filter(r => r.type === 'purchases');
    const expenses  = result.rows.filter(r => r.type === 'expenses');
    res.json({ purchases, expenses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/project-expenses/recent?period=month&search=
app.get('/api/project-expenses/recent', async (req, res) => {
  try {
    const { period = 'month', from = '', to = '', search = '' } = req.query;
    const pc = pePeriodClause(period, from, to);
    const params = [];
    let sc = '';
    if (search) { params.push(`%${search}%`); sc = `AND (pe.project ILIKE $${params.length} OR pe.description ILIKE $${params.length} OR pe.category ILIKE $${params.length})`; }
    const result = await q(`
      SELECT pe.id, pe.date, pe.project AS project_name, pe.type, pe.description, pe.category, pe.vendor, pe.amount, pe.status
      FROM project_expenses pe
      WHERE 1=1 ${pc} ${sc}
      ORDER BY pe.date DESC
      LIMIT 50
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/project-expenses/list?type=purchases&cat=&status=&search=&period=month
app.get('/api/project-expenses/list', async (req, res) => {
  try {
    const { type = 'expenses', cat = '', status = '', search = '', period = 'month', from = '', to = '' } = req.query;
    const pc = pePeriodClause(period, from, to);
    const params = [type];
    const conditions = [];
    if (cat)    { params.push(cat);           conditions.push(`AND pe.category = $${params.length}`); }
    if (status) { params.push(status);        conditions.push(`AND pe.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`AND (pe.project ILIKE $${params.length} OR pe.description ILIKE $${params.length} OR pe.vendor ILIKE $${params.length})`); }
    const result = await q(`
      SELECT pe.id, pe.date, pe.project AS project_name, pe.type, pe.description, pe.category, pe.vendor, pe.amount, pe.status
      FROM project_expenses pe
      WHERE pe.type = $1 ${pc} ${conditions.join(' ')}
      ORDER BY pe.date DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/project-expenses (legacy - kept for financial report)
app.get('/api/project-expenses', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const params = search ? [`%${search}%`] : [];
    const where = search ? `WHERE description ILIKE $1 OR category ILIKE $1 OR vendor ILIKE $1 OR project ILIKE $1` : '';
    const result = await q(`SELECT *, project AS project_name FROM project_expenses ${where} ORDER BY date DESC`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/project-expenses
app.post('/api/project-expenses', async (req, res) => {
  try {
    const { date, project, desc, cat, vendor, amount, status, type } = req.body;
    const result = await q(
      `INSERT INTO project_expenses (date, project, description, category, vendor, amount, status, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [date, project, desc, cat, vendor || null, amount, status || 'pending', type || 'expenses']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/project-expenses/:id
app.put('/api/project-expenses/:id', async (req, res) => {
  try {
    const { date, project, desc, cat, vendor, amount, status, type } = req.body;
    const result = await q(
      `UPDATE project_expenses SET date=$1, project=$2, description=$3, category=$4, vendor=$5,
       amount=$6, status=$7, type=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,
      [date, project, desc, cat, vendor || null, amount, status, type || 'expenses', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/project-expenses/:id
app.delete('/api/project-expenses/:id', async (req, res) => {
  try {
    await q(`DELETE FROM project_expenses WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  EMPLOYEE SALARY (Tab 4)
// ============================================================

app.get('/api/employee/employee-salary', async (req, res) => {
  try {
    const { search = '', period_start = '', period_end = '' } = req.query;
    const params = [];
    const conds = [];
    if (search)       { params.push(`%${search}%`);  conds.push(`e.full_name ILIKE $${params.length}`); }
    if (period_start) { params.push(period_start);   conds.push(`es.period_start = $${params.length}`); }
    if (period_end)   { params.push(period_end);     conds.push(`es.period_end = $${params.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await q(`
      SELECT es.id, e.full_name AS employee_name, p.title AS position,
             d.name AS department, es.current_salary, es.date, es.period_start, es.period_end
      FROM employee_salaries es
      JOIN employees   e ON e.id = es.employee_id
      JOIN positions   p ON p.id = e.position_id
      JOIN departments d ON d.id = e.department_id
      ${where}
      ORDER BY es.date DESC, e.full_name
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/employee-salary/:id', async (req, res) => {
  try {
    const result = await q(`
      SELECT es.*, e.full_name AS employee_name, p.title AS position, d.name AS department
      FROM employee_salaries es
      JOIN employees   e ON e.id = es.employee_id
      JOIN positions   p ON p.id = e.position_id
      JOIN departments d ON d.id = e.department_id
      WHERE es.id=$1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/employee-salary', async (req, res) => {
  try {
    const { employee_id, current_salary, date, period_start, period_end } = req.body;
    const result = await q(`
      INSERT INTO employee_salaries (employee_id, current_salary, date, period_start, period_end)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [employee_id, current_salary, date, period_start||null, period_end||null]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/employee-salary/:id', async (req, res) => {
  try {
    const { employee_id, current_salary, date, period_start, period_end } = req.body;
    const result = await q(`
      UPDATE employee_salaries SET employee_id=$1, current_salary=$2, date=$3,
        period_start=$4, period_end=$5, updated_at=NOW() WHERE id=$6 RETURNING *
    `, [employee_id, current_salary, date, period_start||null, period_end||null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/employee-salary/:id', async (req, res) => {
  try {
    await q(`DELETE FROM employee_salaries WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET employees list (for dropdowns in modals)
app.get('/api/employee/list', async (req, res) => {
  try {
    const result = await q(`
      SELECT e.id, e.full_name, p.title AS position, d.name AS department
      FROM employees e
      JOIN positions   p ON p.id = e.position_id
      JOIN departments d ON d.id = e.department_id
      WHERE e.is_active = TRUE ORDER BY e.full_name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  COLLECTIONS
// ============================================================

// GET /api/collections/kpis — summary totals for KPI cards
app.get('/api/collections/kpis', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM v_collections_summary`);
    res.json(result.rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Collections KPIs
app.get('/api/collections/kpis', async (req, res) => {
  try {
    const { from = '', to = '', status = '' } = req.query;
    const params = []; const conds = [];
    if (from)   { params.push(from);   conds.push(`date >= $${params.length}`); }
    if (to)     { params.push(to);     conds.push(`date <= $${params.length}`); }
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const r = await q(`
      SELECT COUNT(*) AS total_records,
             COALESCE(SUM(amount_due),0) AS total_due,
             COALESCE(SUM(amount_collected),0) AS total_collected,
             COALESCE(SUM(amount_due-amount_collected),0) AS total_balance
      FROM collections ${where}
    `, params);
    const row = r.rows[0];
    res.json({ total_records: Number(row.total_records), total_due: Number(row.total_due),
               total_collected: Number(row.total_collected), total_balance: Number(row.total_balance) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Collections chart data (bar: due/collected per project, pie: status counts)
app.get('/api/collections/chart-data', async (req, res) => {
  try {
    const { from = '', to = '', status = '' } = req.query;
    const params = []; const conds = [];
    if (from)   { params.push(from);   conds.push(`date >= $${params.length}`); }
    if (to)     { params.push(to);     conds.push(`date <= $${params.length}`); }
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [projRes, statusRes] = await Promise.all([
      q(`SELECT COALESCE(project,'General') AS project,
                SUM(amount_due) AS total_due,
                SUM(amount_collected) AS total_collected
         FROM collections ${where}
         GROUP BY project ORDER BY project`, params),
      q(`SELECT status, COUNT(*) AS cnt FROM collections ${where} GROUP BY status`, params)
    ]);

    const statusMap = { Approved: 0, Pending: 0, Decline: 0 };
    statusRes.rows.forEach(r => { statusMap[r.status] = Number(r.cnt); });

    res.json({
      projects: projRes.rows.map(r => ({ project: r.project, total_due: Number(r.total_due), total_collected: Number(r.total_collected) })),
      status: statusMap
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/collections', async (req, res) => {
  try {
    const { search = '', from = '', to = '', status = '' } = req.query;
    const params = [];
    const conds  = [];

    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conds.push(`(client ILIKE $${n} OR COALESCE(project,'') ILIKE $${n} OR COALESCE(or_number,'') ILIKE $${n})`);
    }
    if (from)   { params.push(from);   conds.push(`date >= $${params.length}`); }
    if (to)     { params.push(to);     conds.push(`date <= $${params.length}`); }
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }

    const where  = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await q(`
      SELECT *,
        (amount_due - amount_collected) AS balance
      FROM collections ${where}
      ORDER BY date DESC, id DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/collections', async (req, res) => {
  try {
    const { date, client, project, or_number, due, collected, status } = req.body;
    const amtCollected = parseFloat(collected) || 0;
    const amtDue       = parseFloat(due);
    if (!date || !client || isNaN(amtDue) || amtDue < 0)
      return res.status(400).json({ error: 'date, client, and amount_due are required' });
    const result = await q(`
      INSERT INTO collections (date, client, project, or_number, amount_due, amount_collected, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7::collection_status) RETURNING *,
        (amount_due - amount_collected) AS balance
    `, [date, client, project||null, or_number||null, amtDue, amtCollected, status||'Pending']);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/collections/:id', async (req, res) => {
  try {
    const { date, client, project, or_number, due, status } = req.body;
    const amtDue = parseFloat(due);
    const result = await q(`
      UPDATE collections
      SET date=$1, client=$2, project=$3, or_number=$4,
          amount_due=$5, status=$6::collection_status, updated_at=NOW()
      WHERE id=$7 RETURNING *,
        (amount_due - amount_collected) AS balance
    `, [date, client, project||null, or_number||null, amtDue, status||'Pending', req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/collections/:id', async (req, res) => {
  try {
    await q(`DELETE FROM collections WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Collection Payments ───────────────────────────────────────
// Each payment adds to amount_collected and reduces balance in real-time.

app.get('/api/collections/:id/payments', async (req, res) => {
  try {
    const result = await q(
      `SELECT id, collection_id, amount_paid, date, status
       FROM collection_payments
       WHERE collection_id = $1
       ORDER BY date ASC, id ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/collections/:id/payments', async (req, res) => {
  try {
    const { amount_paid, date, status } = req.body;
    if (!amount_paid || isNaN(amount_paid) || amount_paid <= 0)
      return res.status(400).json({ error: 'amount_paid must be a positive number' });

    const result = await q(
      `INSERT INTO collection_payments (collection_id, amount_paid, date, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, amount_paid, date, status || 'Pending']
    );
    // Update amount_collected on the parent collection
    await q(
      `UPDATE collections
       SET amount_collected = amount_collected + $1, updated_at = NOW()
       WHERE id = $2`,
      [amount_paid, req.params.id]
    );
    // Return updated collection row so frontend can refresh immediately
    const col = await q(
      `SELECT *, (amount_due - amount_collected) AS balance FROM collections WHERE id = $1`,
      [req.params.id]
    );
    res.json({ payment: result.rows[0], collection: col.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/collections/payments/:id', async (req, res) => {
  try {
    const row = await q(
      `SELECT collection_id, amount_paid FROM collection_payments WHERE id = $1`,
      [req.params.id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Payment not found' });
    const { collection_id, amount_paid } = row.rows[0];

    await q(`DELETE FROM collection_payments WHERE id = $1`, [req.params.id]);
    // Restore amount_collected on parent collection
    await q(
      `UPDATE collections
       SET amount_collected = GREATEST(amount_collected - $1, 0), updated_at = NOW()
       WHERE id = $2`,
      [amount_paid, collection_id]
    );
    const col = await q(
      `SELECT *, (amount_due - amount_collected) AS balance FROM collections WHERE id = $1`,
      [collection_id]
    );
    res.json({ success: true, collection: col.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  LETTERS
// ============================================================

app.get('/api/letters', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM letters ORDER BY uploaded_at DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/letters', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const fileType = file.originalname.split('.').pop().toUpperCase();
    const fileSize = file.size < 1048576 ? (file.size/1024).toFixed(1)+' KB' : (file.size/1048576).toFixed(1)+' MB';
    const result = await q(`INSERT INTO letters (file_name,file_type,file_size,file_path) VALUES ($1,$2,$3,$4) RETURNING *`, [file.originalname, fileType, fileSize, '/uploads/'+file.filename]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/letters/:id', async (req, res) => {
  try {
    const row = await q(`SELECT file_path FROM letters WHERE id=$1`, [req.params.id]);
    if (row.rows[0]) {
      const fp = path.join(__dirname, 'public', row.rows[0].file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await q(`DELETE FROM letters WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  FINANCIAL REPORT
// ============================================================

app.get('/api/report/monthly', async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || null;
    const level = month ? 'day' : 'month';
    const fmt   = month ? "'Mon DD'" : "'FMMonth YYYY'";
    const yc = `EXTRACT(YEAR FROM date) = ${year}`;
    const mc = month ? `AND EXTRACT(MONTH FROM date) = ${month}` : '';
    const result = await q(
      `SELECT
        m.period,
        TO_CHAR(m.period, ${fmt}) AS month_label,
        COALESCE(i.ti,  0) AS total_income,
        COALESCE(ce.tc, 0) AS total_comp_expenses,
        COALESCE(pe.tp, 0) AS total_proj_expenses,
        COALESCE(ce.tc,0) + COALESCE(pe.tp,0) AS total_expenses,
        COALESCE(col.tk,0) AS total_collections,
        COALESCE(i.ti,0) - COALESCE(ce.tc,0) - COALESCE(pe.tp,0) AS net_income
       FROM (
         SELECT DISTINCT DATE_TRUNC('${level}',date) AS period FROM income_records   WHERE ${yc} ${mc}
         UNION SELECT DISTINCT DATE_TRUNC('${level}',date) FROM company_expenses WHERE ${yc} ${mc}
         UNION SELECT DISTINCT DATE_TRUNC('${level}',date) FROM project_expenses WHERE ${yc} ${mc}
         UNION SELECT DISTINCT DATE_TRUNC('${level}',date) FROM collections      WHERE ${yc} ${mc}
       ) m
       LEFT JOIN (SELECT DATE_TRUNC('${level}',date) p, SUM(amount) ti           FROM income_records   WHERE ${yc} ${mc} GROUP BY 1) i   ON i.p   = m.period
       LEFT JOIN (SELECT DATE_TRUNC('${level}',date) p, SUM(amount) tc           FROM company_expenses WHERE ${yc} ${mc} GROUP BY 1) ce  ON ce.p  = m.period
       LEFT JOIN (SELECT DATE_TRUNC('${level}',date) p, SUM(amount) tp           FROM project_expenses WHERE ${yc} ${mc} GROUP BY 1) pe  ON pe.p  = m.period
       LEFT JOIN (SELECT DATE_TRUNC('${level}',date) p, SUM(amount_collected) tk FROM collections     WHERE ${yc} ${mc} GROUP BY 1) col ON col.p = m.period
       ORDER BY m.period`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/report/kpis', async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || null;
    const yc = (t) => `EXTRACT(YEAR FROM ${t}.date) = ${year}`;
    const mc = (t) => month ? `AND EXTRACT(MONTH FROM ${t}.date) = ${month}` : '';
    const result = await q(
      `SELECT
        (SELECT COALESCE(SUM(amount),0)           FROM income_records   ir WHERE ${yc('ir')} ${mc('ir')}) AS total_income,
        (SELECT COALESCE(SUM(amount),0)           FROM company_expenses ce WHERE ${yc('ce')} ${mc('ce')}) AS comp_expenses,
        (SELECT COALESCE(SUM(amount),0)           FROM project_expenses pe WHERE ${yc('pe')} ${mc('pe')}) AS proj_expenses,
        (SELECT COALESCE(SUM(amount_collected),0) FROM collections      co WHERE ${yc('co')} ${mc('co')}) AS total_collections`
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  EMPLOYEE
// ============================================================

function empSearchWhere(search, fields, params) {
  if (!search) return '';
  params.push(`%${search}%`);
  const n = params.length;
  return `AND (${fields.map(f => `${f} ILIKE $${n}`).join(' OR ')})`;
}

// ── REIMBURSE ─────────────────────────────────────────────────
// Table: reimburse (id, name, role, date, description, amount, status, comments, created_at, updated_at)

app.get('/api/employee/reimburse', async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const params = [];
    const conditions = [];
    if (search) { params.push(`%${search}%`); conditions.push(`AND (e.full_name ILIKE $${params.length} OR r.description ILIKE $${params.length})`); }
    if (status) { params.push(status); conditions.push(`AND r.status = $${params.length}::request_status`); }
    const result = await q(`
      SELECT r.id, e.full_name AS name, e.full_name AS employee_name, p.title AS role, p.title AS roles,
             r.date, r.description, r.amount, r.status, r.comments
      FROM reimbursements r
      JOIN employees e ON e.id = r.employee_id
      JOIN positions  p ON p.id = e.position_id
      WHERE 1=1 ${conditions.join(' ')}
      ORDER BY r.date DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Keep old alias for compatibility
app.get('/api/employee/reimbursements', async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const params = [];
    const conditions = [];
    if (search) { params.push(`%${search}%`); conditions.push(`AND (e.full_name ILIKE $${params.length} OR r.description ILIKE $${params.length})`); }
    if (status) { params.push(status); conditions.push(`AND r.status = $${params.length}::request_status`); }
    const result = await q(`
      SELECT r.id, e.full_name AS name, e.full_name AS employee_name, p.title AS role, p.title AS roles,
             r.date, r.description, r.amount, r.status, r.comments
      FROM reimbursements r
      JOIN employees e ON e.id = r.employee_id
      JOIN positions  p ON p.id = e.position_id
      WHERE 1=1 ${conditions.join(' ')}
      ORDER BY r.date DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/reimbursements/:id', async (req, res) => {
  try {
    const result = await q(`
      SELECT r.*, e.full_name AS employee_name, p.title AS role
      FROM reimbursements r
      JOIN employees e ON e.id = r.employee_id
      JOIN positions  p ON p.id = e.position_id
      WHERE r.id=$1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/reimbursements/:id', async (req, res) => {
  try {
    const { employee_id, date, description, amount, status, comments } = req.body;

    const result = await q(
      `UPDATE reimbursements 
       SET employee_id=$1, date=$2, description=$3, amount=$4,
           status=$5, comments=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [
        employee_id,
        date,
        description,
        amount,
        status,
        comments || null,
        req.params.id   // ✅ THIS IS $7
      ]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/employee/reimbursements', async (req, res) => {
  try {
    const { employee_id, date, description, amount, status, comments } = req.body;

    const result = await q(
      `INSERT INTO reimbursements 
       (employee_id, date, description, amount, status, comments)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        employee_id,
        date,
        description,
        amount,
        status || 'Pending',
        comments || null
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve / Decline + optional comment
app.put('/api/employee/reimbursements/:id', async (req, res) => {
  try {
    const { employee_id, date, description, amount, status, comments } = req.body;

    const result = await q(
      `UPDATE reimbursements 
       SET employee_id=$1,
           date=$2,
           description=$3,
           amount=$4,
           status=$5,
           comments=$6,
           updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [
        employee_id,
        date,
        description,
        amount,
        status,
        comments || null,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/employee/reimburse/:id/action', async (req, res) => {
  try {
    const { status, comments } = req.body;
    const sets = [], params = [];
    if (status   !== undefined) { params.push(status);   sets.push(`status=$${params.length}::request_status`); }
    if (comments !== undefined) { params.push(comments); sets.push(`comments=$${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await q(
      `UPDATE reimbursements SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/employee/reimbursements/:id/action', async (req, res) => {
  try {
    const { status, comments } = req.body;

    const sets = [];
    const params = [];

    if (status !== undefined) {
      params.push(status);
      sets.push(`status=$${params.length}`);
    }

    if (comments !== undefined) {
      params.push(comments);
      sets.push(`comments=$${params.length}`);
    }

    if (!sets.length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(req.params.id);

    const result = await q(
      `UPDATE reimbursements 
       SET ${sets.join(', ')}, updated_at=NOW()
       WHERE id=$${params.length}
       RETURNING *`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/employee/reimbursements/:id', async (req, res) => {
  try {
    await q(`DELETE FROM reimbursements WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BUDGET REQUESTS ───────────────────────────────────────────
// Table: budget_requests (id, name, roles, date, description, amount, status, comments, created_at, updated_at)

app.get('/api/employee/budget', async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const params = [];
    const conditions = [];
    if (search) { params.push(`%${search}%`); conditions.push(`AND (e.full_name ILIKE $${params.length} OR br.description ILIKE $${params.length})`); }
    if (status) { params.push(status); conditions.push(`AND br.status = $${params.length}::request_status`); }
    const result = await q(`
      SELECT br.id, e.full_name AS name, e.full_name AS employee_name, p.title AS role, p.title AS roles,
             br.date, br.description, br.amount, br.status, br.comments
      FROM budget_requests br
      JOIN employees e ON e.id = br.employee_id
      JOIN positions  p ON p.id = e.position_id
      WHERE 1=1 ${conditions.join(' ')}
      ORDER BY br.date DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/budget/:id', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM budget_requests WHERE id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/budget', async (req, res) => {
  try {
    const { employee_id, date, description, amount, status, comments } = req.body;
    const result = await q(`
      INSERT INTO budget_requests (employee_id, date, description, amount, status, comments)
      VALUES ($1,$2,$3,$4,$5::request_status,$6) RETURNING *
    `, [employee_id, date, description, amount, status || 'Pending', comments || null]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/budget/:id', async (req, res) => {
  try {
    const { employee_id, date, description, amount, status, comments } = req.body;
    const result = await q(`
      UPDATE budget_requests SET employee_id=$1, date=$2, description=$3, amount=$4,
        status=$5::request_status, comments=$6, updated_at=NOW() WHERE id=$7 RETURNING *
    `, [employee_id, date, description, amount, status, comments || null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve / Decline + optional comment
app.patch('/api/employee/budget/:id/action', async (req, res) => {
  try {
    const { status, comments } = req.body;
    const sets = [], params = [];
    if (status   !== undefined) { params.push(status);   sets.push(`status=$${params.length}`); }
    if (comments !== undefined) { params.push(comments); sets.push(`comments=$${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await q(
      `UPDATE budget_requests SET ${sets.join(',').replace('status=$', 'status=$').replace(/status=\$(\d+)/, 'status=\$$1::request_status')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/budget/:id', async (req, res) => {
  try {
    await q(`DELETE FROM budget_requests WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SALARY ADVANCES ───────────────────────────────────────────
// Table: salary_advances (id, name, amount, balance, date, status, created_at, updated_at)
// Sub-table: salary_payments (id, salary_advance_id, amount_paid, date, status, created_at)

app.get('/api/employee/salary-advances', async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const params = [];
    const conditions = [];
    if (search) { params.push(`%${search}%`); conditions.push(`AND e.full_name ILIKE $${params.length}`); }
    if (status) { params.push(status); conditions.push(`AND sa.status = $${params.length}::advance_status`); }
    const result = await q(`
      SELECT sa.id, e.full_name AS employee_name,
             sa.amount_borrowed AS advance_amount,
             sa.remaining_balance AS balance,
             sa.date_borrowed AS advance_date,
             sa.status, sa.remarks
      FROM salary_advances sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE 1=1 ${conditions.join(' ')}
      ORDER BY sa.date_borrowed DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Salary Advance action (Approve / Decline + optional comment saved as remarks)
app.patch('/api/employee/salary-advances/:id/action', async (req, res) => {
  try {
    const { status, comments } = req.body;
    const sets = [], params = [];
    if (status   !== undefined) { params.push(status);   sets.push(`status=$${params.length}::advance_status`); }
    if (comments !== undefined) { params.push(comments); sets.push(`remarks=$${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const result = await q(
      `UPDATE salary_advances SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alias used by JS
app.get('/api/employee/salary', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const params = [];
    const sw = search
      ? (params.push(`%${search}%`), `AND e.full_name ILIKE $${params.length}`)
      : '';
    const result = await q(`
      SELECT sa.id, e.full_name AS employee_name,
             sa.amount_borrowed AS advance_amount,
             sa.remaining_balance AS balance,
             sa.date_borrowed AS advance_date,
             sa.status, sa.remarks
      FROM salary_advances sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE 1=1 ${sw}
      ORDER BY sa.date_borrowed DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-advances/:id', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM salary_advances WHERE id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/salary-advances', async (req, res) => {
  try {
    // Accept either employee_id (number) or full_name (string) — look up id when name is given
    let { employee_id, full_name, amount_borrowed, remaining_balance, date_borrowed, status } = req.body;

    if (!employee_id && full_name) {
      const emp = await q(
        `SELECT id FROM employees WHERE LOWER(full_name) = LOWER($1) LIMIT 1`,
        [full_name.trim()]
      );
      if (!emp.rows.length) {
        return res.status(400).json({ error: `Employee "${full_name}" not found. Please select a valid employee.` });
      }
      employee_id = emp.rows[0].id;
    }

    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id or full_name is required.' });
    }

    const borrowed = parseFloat(amount_borrowed);
    const balance  = remaining_balance !== undefined && remaining_balance !== null && remaining_balance !== ''
                     ? parseFloat(remaining_balance)
                     : borrowed;

    const result = await q(`
      INSERT INTO salary_advances (employee_id, amount_borrowed, remaining_balance, date_borrowed, status)
      VALUES ($1,$2,$3,$4,$5::advance_status) RETURNING *
    `, [employee_id, borrowed, balance, date_borrowed, status || 'Pending']);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/salary-advances/:id', async (req, res) => {
  try {
    let { employee_id, full_name, amount_borrowed, remaining_balance, date_borrowed, status } = req.body;

    // If full_name given without employee_id, resolve it
    if (!employee_id && full_name) {
      const emp = await q(
        `SELECT id FROM employees WHERE LOWER(full_name) = LOWER($1) LIMIT 1`,
        [full_name.trim()]
      );
      if (!emp.rows.length) {
        return res.status(400).json({ error: `Employee "${full_name}" not found.` });
      }
      employee_id = emp.rows[0].id;
    }

    const borrowed = parseFloat(amount_borrowed);
    const balance  = remaining_balance !== undefined && remaining_balance !== null && remaining_balance !== ''
                     ? parseFloat(remaining_balance)
                     : 0;

    // Build query — update employee_id only if provided
    let sql, params;
    if (employee_id) {
      sql    = `UPDATE salary_advances SET employee_id=$1, amount_borrowed=$2, remaining_balance=$3,
                  date_borrowed=$4, status=$5::advance_status, updated_at=NOW()
                WHERE id=$6 RETURNING *`;
      params = [employee_id, borrowed, balance, date_borrowed, status, req.params.id];
    } else {
      sql    = `UPDATE salary_advances SET amount_borrowed=$1, remaining_balance=$2,
                  date_borrowed=$3, status=$4::advance_status, updated_at=NOW()
                WHERE id=$5 RETURNING *`;
      params = [borrowed, balance, date_borrowed, status, req.params.id];
    }

    const result = await q(sql, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/salary-advances/:id', async (req, res) => {
  try {
    await q(`DELETE FROM salary_advance_payments WHERE advance_id=$1`, [req.params.id]);
    await q(`DELETE FROM salary_advances WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Salary Payments (dropdown rows per advance)
app.get('/api/employee/salary-advances/:id/payments', async (req, res) => {
  try {
    const result = await q(`
      SELECT id, advance_id, amount_paid, date, status
      FROM salary_advance_payments WHERE advance_id=$1 ORDER BY date DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/salary-advances/:id/payments', async (req, res) => {
  try {
    const { amount_paid, date, status } = req.body;
    const result = await q(`
      INSERT INTO salary_advance_payments (advance_id, amount_paid, date, status)
      VALUES ($1,$2,$3,$4::payment_status) RETURNING *
    `, [req.params.id, amount_paid, date, status || 'Pending']);
    // Recalculate remaining balance
    await q(`
      UPDATE salary_advances SET remaining_balance = remaining_balance - $1, updated_at=NOW() WHERE id=$2
    `, [amount_paid, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/salary-payments/:id', async (req, res) => {
  try {
    const { amount_paid, date, status } = req.body;
    const result = await q(
      `UPDATE salary_payments SET amount_paid=$1, date=$2, status=$3 WHERE id=$4 RETURNING *`,
      [amount_paid, date, status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/salary-payments/:id', async (req, res) => {
  try {
    // Restore balance before deleting
    const row = await q(`SELECT salary_advance_id, amount_paid FROM salary_payments WHERE id=$1`, [req.params.id]);
    if (row.rows.length) {
      const { salary_advance_id, amount_paid } = row.rows[0];
      await q(`UPDATE salary_advances SET balance = balance + $1, updated_at=NOW() WHERE id=$2`, [amount_paid, salary_advance_id]);
    }
    await q(`DELETE FROM salary_payments WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── EMPLOYEE SALARY (payroll info) ────────────────────────────
// Table: employee_salary (id, employee_name, position, department, current_salary, date, created_at, updated_at)

app.get('/api/employee/employee-salary', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const params = [];
    const sw = empSearchWhere(search, ['employee_name', 'position', 'department'], params);
    const result = await q(
      `SELECT id, employee_name, position, department, current_salary, date
       FROM employee_salary WHERE 1=1 ${sw} ORDER BY date DESC`, params
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/employee-salary/:id', async (req, res) => {
  try {
    const result = await q(`SELECT * FROM employee_salary WHERE id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/employee-salary', async (req, res) => {
  try {
    const { employee_name, position, department, current_salary, date } = req.body;
    const result = await q(
      `INSERT INTO employee_salary (employee_name, position, department, current_salary, date)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [employee_name, position || null, department || null, current_salary, date]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/employee-salary/:id', async (req, res) => {
  try {
    const { employee_name, position, department, current_salary, date } = req.body;
    const result = await q(
      `UPDATE employee_salary SET employee_name=$1, position=$2, department=$3,
       current_salary=$4, date=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [employee_name, position || null, department || null, current_salary, date, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/employee-salary/:id', async (req, res) => {
  try {
    await q(`DELETE FROM employee_salary WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  START
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Finance Dashboard running at http://localhost:${PORT}`);
});