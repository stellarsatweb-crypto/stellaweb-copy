const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const multer  = require('multer');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const messagingPresence = new Map();
const messagingTyping = new Map();
const PRESENCE_TTL_MS = 45000;
const TYPING_TTL_MS = 3500;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role']
}));
app.use(express.json({ limit: '5mb' }));
app.options('*', cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  const userId = Number(req.headers['x-user-id']);
  if (Number.isFinite(userId) && userId > 0 && req.path.startsWith('/api/')) {
    const currentPage = String(req.headers['x-current-page'] || '').slice(0, 180) || null;
    pool.query(
      `UPDATE users SET last_active=NOW(), current_page=COALESCE($2, current_page) WHERE id=$1`,
      [userId, currentPage]
    ).catch(() => {});
  }
  next();
});
app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modules', 'finance', 'finance-dashboard.html'));
});
app.get('/finance/files', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modules', 'finance', 'finance-dashboard.html'));
});
app.get('/finance/inventory', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modules', 'finance', 'finance-dashboard.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modules', 'admin', 'admin-dashboard.html'));
});
app.get('/bidder', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modules', 'bidder', 'bidder-dashboard.html'));
});

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

pool.query(`
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (LOWER(role) IN ('executive','finance','noc','admin','bidder'));
`).catch(err => console.error('Users role constraint migration error:', err.message));

pool.query(`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_active TIMESTAMP,
    ADD COLUMN IF NOT EXISTS current_page TEXT
`).catch(err => console.error('Users activity columns error:', err.message));

const createStaffIdsTable = `
CREATE TABLE IF NOT EXISTS staff_ids (
  id SERIAL PRIMARY KEY,
  staff_id CITEXT UNIQUE NOT NULL,
  department TEXT,
  assigned_role CITEXT NOT NULL CHECK (LOWER(assigned_role) IN ('noc','finance','admin','bidder')),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (LOWER(status) IN ('unused','used','disabled')),
  linked_user_id INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_by_admin_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP
);
`;

pool.query(createStaffIdsTable)
  .then(async () => {
    console.log('Staff IDs table ready');
    await pool.query(`ALTER TABLE staff_ids DROP COLUMN IF EXISTS full_name`);
    await pool.query(`ALTER TABLE staff_ids DROP CONSTRAINT IF EXISTS staff_ids_assigned_role_check`);
    await pool.query(`
      ALTER TABLE staff_ids ADD CONSTRAINT staff_ids_assigned_role_check
        CHECK (LOWER(assigned_role) IN ('noc','finance','admin','bidder'))
    `);
    console.log('Staff IDs migrations applied');
  })
  .catch(err => console.error('Staff IDs table error:', err));

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

/* ================= INVENTORY MANAGEMENT ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        serial_no CITEXT UNIQUE NOT NULL,
        category CITEXT NOT NULL,
        item_code CITEXT,
        brand CITEXT,
        model CITEXT,
        description TEXT,
        date_received DATE,
        received_by CITEXT,
        site_id CITEXT,
        site_name CITEXT,
        deployed_at DATE,
        deployed_by CITEXT,
        purchase_date DATE,
        price NUMERIC(12,2),
        supplier CITEXT,
        purchase_order_no CITEXT,
        condition CITEXT DEFAULT 'Good',
        status CITEXT NOT NULL DEFAULT 'In Stock',
        project_name CITEXT,
        project_id CITEXT,
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_activities (
        id SERIAL PRIMARY KEY,
        item_id INT,
        item_label CITEXT NOT NULL,
        action CITEXT NOT NULL,
        site CITEXT,
        actor CITEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items (status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items (category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_created ON inventory_items (created_at DESC)`);
    await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'noc'`);
    await pool.query(`ALTER TABLE inventory_activities ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'noc'`);
    await pool.query(`ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_serial_no_key`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_module_serial ON inventory_items (module, serial_no)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_module ON inventory_items (module)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_activities_module ON inventory_activities (module)`);
    console.log('Inventory tables ready');
  } catch (err) {
    console.error('Inventory setup error:', err.message);
  }
})();

const INVENTORY_FIELDS = [
  'serial_no', 'category', 'item_code', 'brand', 'model', 'description',
  'date_received', 'received_by', 'site_id', 'site_name', 'deployed_at', 'deployed_by',
  'purchase_date', 'price', 'supplier', 'purchase_order_no', 'condition', 'status',
  'project_name', 'project_id', 'created_by'
];

function cleanInventoryPayload(body = {}, isCreate = false) {
  const payload = {};
  for (const field of INVENTORY_FIELDS) {
    if (!(field in body)) continue;
    let value = body[field];
    if (typeof value === 'string') value = value.trim();
    if (value === '') value = null;
    payload[field] = value;
  }
  if (isCreate) {
    payload.status = payload.status || 'In Stock';
    payload.condition = payload.condition || 'Good';
  }
  if (payload.price != null) {
    const n = Number(payload.price);
    payload.price = Number.isFinite(n) ? n : null;
  }
  if (payload.created_by != null) {
    const n = Number(payload.created_by);
    payload.created_by = Number.isFinite(n) ? n : null;
  }
  return payload;
}

async function logInventoryActivity(item, action, actor = null, module = 'noc') {
  if (!item) return;
  const label = item.serial_no || item.item_code || item.model || `Item #${item.id}`;
  await pool.query(
    `INSERT INTO inventory_activities (item_id, item_label, action, site, actor, module)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [item.id || null, label, action, item.site_name || item.site_id || null, actor || null, module]
  );
}

app.get('/api/inventory/items', async (req, res) => {
  try {
    const where = [`module = 'noc'`];
    const params = [];
    const addParam = value => {
      params.push(value);
      return `$${params.length}`;
    };

    const q = String(req.query.q || '').trim();
    if (q) {
      const p = addParam(`%${q}%`);
      where.push(`(
        serial_no ILIKE ${p} OR category ILIKE ${p} OR item_code ILIKE ${p} OR brand ILIKE ${p} OR
        model ILIKE ${p} OR site_name ILIKE ${p} OR project_name ILIKE ${p}
      )`);
    }

    const status = String(req.query.status || '').trim();
    if (status && status.toLowerCase() !== 'all') {
      where.push(`LOWER(status) = LOWER(${addParam(status)})`);
    }

    if (req.query.date_from) where.push(`COALESCE(date_received, created_at::date) >= ${addParam(req.query.date_from)}`);
    if (req.query.date_to) where.push(`COALESCE(date_received, created_at::date) <= ${addParam(req.query.date_to)}`);

    const result = await pool.query(`
      SELECT * FROM inventory_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY updated_at DESC, id DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory/summary', async (req, res) => {
  try {
    const [total, byStatus, byCategory, recent] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM inventory_items WHERE module = 'noc'`),
      pool.query(`SELECT COALESCE(status, 'Unknown') AS status, COUNT(*)::int AS count FROM inventory_items WHERE module = 'noc' GROUP BY status ORDER BY status`),
      pool.query(`SELECT COALESCE(category, 'Uncategorized') AS category, COUNT(*)::int AS count FROM inventory_items WHERE module = 'noc' GROUP BY category ORDER BY count DESC, category LIMIT 8`),
      pool.query(`SELECT * FROM inventory_activities WHERE module = 'noc' ORDER BY created_at DESC, id DESC LIMIT 8`)
    ]);
    res.json({
      totalItems: total.rows[0]?.count || 0,
      byStatus: byStatus.rows,
      byCategory: byCategory.rows,
      recentActivities: recent.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/items', async (req, res) => {
  try {
    const payload = cleanInventoryPayload(req.body || {}, true);
    payload.module = 'noc';
    if (!payload.serial_no) return res.status(400).json({ error: 'Serial number is required' });
    if (!payload.category) return res.status(400).json({ error: 'Category is required' });

    const fields = Object.keys(payload).filter(k => payload[k] !== undefined);
    const values = fields.map(k => payload[k]);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO inventory_items (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    await logInventoryActivity(result.rows[0], 'Added', req.body?.actor_name || null, 'noc');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status = err.code === '23505' ? 409 : 500;
    res.status(status).json({ error: err.code === '23505' ? 'Serial number already exists' : err.message });
  }
});

app.put('/api/inventory/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid item id' });
    const payload = cleanInventoryPayload(req.body || {});
    delete payload.created_by;
    const fields = Object.keys(payload);
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    if ('serial_no' in payload && !payload.serial_no) return res.status(400).json({ error: 'Serial number is required' });
    if ('category' in payload && !payload.category) return res.status(400).json({ error: 'Category is required' });

    const values = fields.map(k => payload[k]);
    const setSql = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
    values.push(id);
    const result = await pool.query(
      `UPDATE inventory_items SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} AND module = 'noc' RETURNING *`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Inventory item not found' });
    await logInventoryActivity(result.rows[0], 'Updated', req.body?.actor_name || null, 'noc');
    res.json(result.rows[0]);
  } catch (err) {
    const status = err.code === '23505' ? 409 : 500;
    res.status(status).json({ error: err.code === '23505' ? 'Serial number already exists' : err.message });
  }
});

app.delete('/api/inventory/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid item id' });
    const existing = await pool.query(`SELECT * FROM inventory_items WHERE id=$1 AND module = 'noc'`, [id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Inventory item not found' });
    await pool.query(`DELETE FROM inventory_items WHERE id=$1 AND module = 'noc'`, [id]);
    await logInventoryActivity(existing.rows[0], 'Deleted', req.query.actor || null, 'noc');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/finance/inventory/items', ensureFinanceAccess, async (req, res) => {
  try {
    const where = [`module = 'finance'`];
    const params = [];
    const addParam = value => {
      params.push(value);
      return `$${params.length}`;
    };

    const q = String(req.query.q || '').trim();
    if (q) {
      const p = addParam(`%${q}%`);
      where.push(`(
        serial_no ILIKE ${p} OR category ILIKE ${p} OR item_code ILIKE ${p} OR brand ILIKE ${p} OR
        model ILIKE ${p} OR site_name ILIKE ${p} OR project_name ILIKE ${p}
      )`);
    }

    const status = String(req.query.status || '').trim();
    if (status && status.toLowerCase() !== 'all') {
      where.push(`LOWER(status) = LOWER(${addParam(status)})`);
    }

    if (req.query.date_from) where.push(`COALESCE(date_received, created_at::date) >= ${addParam(req.query.date_from)}`);
    if (req.query.date_to) where.push(`COALESCE(date_received, created_at::date) <= ${addParam(req.query.date_to)}`);

    const result = await pool.query(`
      SELECT * FROM inventory_items
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC, id DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/finance/inventory/summary', ensureFinanceAccess, async (req, res) => {
  try {
    const [total, byStatus, byCategory, recent] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM inventory_items WHERE module = 'finance'`),
      pool.query(`SELECT COALESCE(status, 'Unknown') AS status, COUNT(*)::int AS count FROM inventory_items WHERE module = 'finance' GROUP BY status ORDER BY status`),
      pool.query(`SELECT COALESCE(category, 'Uncategorized') AS category, COUNT(*)::int AS count FROM inventory_items WHERE module = 'finance' GROUP BY category ORDER BY count DESC, category LIMIT 8`),
      pool.query(`SELECT * FROM inventory_activities WHERE module = 'finance' ORDER BY created_at DESC, id DESC LIMIT 8`)
    ]);
    res.json({
      totalItems: total.rows[0]?.count || 0,
      byStatus: byStatus.rows,
      byCategory: byCategory.rows,
      recentActivities: recent.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/inventory/items', ensureFinanceAccess, async (req, res) => {
  try {
    const payload = cleanInventoryPayload(req.body || {}, true);
    payload.module = 'finance';
    if (!payload.serial_no) return res.status(400).json({ error: 'Serial number is required' });
    if (!payload.category) return res.status(400).json({ error: 'Category is required' });

    const fields = Object.keys(payload).filter(k => payload[k] !== undefined);
    const values = fields.map(k => payload[k]);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO inventory_items (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    await logInventoryActivity(result.rows[0], 'Added', req.body?.actor_name || null, 'finance');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const status = err.code === '23505' ? 409 : 500;
    res.status(status).json({ error: err.code === '23505' ? 'Serial number already exists in Finance inventory' : err.message });
  }
});

app.put('/api/finance/inventory/items/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid item id' });
    const payload = cleanInventoryPayload(req.body || {});
    delete payload.created_by;
    const fields = Object.keys(payload);
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    if ('serial_no' in payload && !payload.serial_no) return res.status(400).json({ error: 'Serial number is required' });
    if ('category' in payload && !payload.category) return res.status(400).json({ error: 'Category is required' });

    const values = fields.map(k => payload[k]);
    const setSql = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
    values.push(id);
    const result = await pool.query(
      `UPDATE inventory_items SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} AND module = 'finance' RETURNING *`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Finance inventory item not found' });
    await logInventoryActivity(result.rows[0], 'Updated', req.body?.actor_name || null, 'finance');
    res.json(result.rows[0]);
  } catch (err) {
    const status = err.code === '23505' ? 409 : 500;
    res.status(status).json({ error: err.code === '23505' ? 'Serial number already exists in Finance inventory' : err.message });
  }
});

app.delete('/api/finance/inventory/items/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid item id' });
    const existing = await pool.query(`SELECT * FROM inventory_items WHERE id=$1 AND module = 'finance'`, [id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Finance inventory item not found' });
    await pool.query(`DELETE FROM inventory_items WHERE id=$1 AND module = 'finance'`, [id]);
    await logInventoryActivity(existing.rows[0], 'Deleted', req.query.actor || null, 'finance');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= IN-APP MESSAGING TABLE ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS in_app_messages (
        id SERIAL PRIMARY KEY,
        sender_id INT REFERENCES users(id) ON DELETE SET NULL,
        recipient_id INT REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted_by_sender BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted_by_recipient BOOLEAN NOT NULL DEFAULT FALSE,
        parent_message_id INT REFERENCES in_app_messages(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_messages_recipient
      ON in_app_messages (recipient_id, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_messages_sender
      ON in_app_messages (sender_id, created_at DESC)
    `);

    await pool.query(`
      ALTER TABLE in_app_messages
      ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP
    `);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS group_id TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS group_name TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS recipient_ids TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS group_photo TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS is_group_seed BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_path TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_in_app_messages_group ON in_app_messages (group_id, created_at DESC)`);

    console.log('In-app messages table ready ✅');

try {
  const usersRes = await pool.query(`SELECT id FROM users ORDER BY id ASC LIMIT 2`);
  if (usersRes.rows.length >= 2) {
    const userA = usersRes.rows[0].id;
    const userB = usersRes.rows[1].id;

    const existingMsg = await pool.query(`SELECT id FROM in_app_messages LIMIT 1`);
    if (!existingMsg.rowCount) {
      await pool.query(
        `
        INSERT INTO in_app_messages (sender_id, recipient_id, subject, body)
        VALUES
          ($1, $2, 'Welcome to In-App Messaging', 'This is a sample inbox message.'),
          ($2, $1, 'Re: Welcome to In-App Messaging', 'Reply message sample for testing.')
        `,
        [userA, userB]
      );
      console.log('Seeded sample in-app messages ✅');
    }
  }
} catch (seedErr) {
  console.error('In-app messages seed error:', seedErr.message);
}
  } catch (err) {
    console.error('In-app messages table setup error:', err.message);
  }
})();

const financeTableStatements = [
  `
    CREATE TABLE IF NOT EXISTS finance_company_income (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      notes TEXT,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS finance_company_expenses (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      notes TEXT,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS finance_project_expenses (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      project_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      notes TEXT,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS finance_collections (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      client_name TEXT NOT NULL,
      project_name TEXT,
      due_date DATE NOT NULL,
      amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS finance_inventory (
      id SERIAL PRIMARY KEY,
      item_name TEXT NOT NULL,
      category TEXT,
      quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
      notes TEXT,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
];

(async () => {
  try {
    for (const sql of financeTableStatements) await pool.query(sql);
    await pool.query(`ALTER TABLE finance_company_income ADD COLUMN IF NOT EXISTS lot TEXT`);
    await pool.query(`ALTER TABLE finance_company_income ADD COLUMN IF NOT EXISTS project_name TEXT`);
    await pool.query(`ALTER TABLE finance_company_income ADD COLUMN IF NOT EXISTS source TEXT`);
    await pool.query(`ALTER TABLE finance_company_income ADD COLUMN IF NOT EXISTS or_number TEXT`);
    await pool.query(`ALTER TABLE finance_company_expenses ADD COLUMN IF NOT EXISTS expense_group TEXT DEFAULT 'expenses'`);
    await pool.query(`ALTER TABLE finance_company_expenses ADD COLUMN IF NOT EXISTS vendor TEXT`);
    await pool.query(`ALTER TABLE finance_project_expenses ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'expenses'`);
    await pool.query(`ALTER TABLE finance_project_expenses ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Materials'`);
    await pool.query(`ALTER TABLE finance_project_expenses ADD COLUMN IF NOT EXISTS vendor TEXT`);
    await pool.query(`ALTER TABLE finance_collections ADD COLUMN IF NOT EXISTS or_number TEXT`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_reimburse_requests (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL,
        role TEXT,
        request_date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Pending',
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_collection_payments (
        id SERIAL PRIMARY KEY,
        collection_id INT NOT NULL REFERENCES finance_collections(id) ON DELETE CASCADE,
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_contributions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        employee_share NUMERIC(12,2) NOT NULL DEFAULT 0,
        employer_share NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Unpaid',
        recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_budget_requests (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL,
        role TEXT,
        request_date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Pending',
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_salary_advances (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL,
        advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_salary_advance_payments (
        id SERIAL PRIMARY KEY,
        advance_id INT NOT NULL REFERENCES employee_salary_advances(id) ON DELETE CASCADE,
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_employee_salaries (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL,
        position TEXT,
        department TEXT,
        current_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        salary_date DATE NOT NULL DEFAULT CURRENT_DATE,
        period_start DATE,
        period_end DATE,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_departments (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_positions (
      id SERIAL PRIMARY KEY,
      title TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_employees (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE,
      position_id INT REFERENCES finance_positions(id) ON DELETE SET NULL,
      department_id INT REFERENCES finance_departments(id) ON DELETE SET NULL,
      hired_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_reimbursements (
      id SERIAL PRIMARY KEY,
      employee_id INT REFERENCES finance_employees(id) ON DELETE CASCADE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      description TEXT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      comments TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_budget_requests (
      id SERIAL PRIMARY KEY,
      employee_id INT REFERENCES finance_employees(id) ON DELETE CASCADE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      description TEXT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      comments TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_salary_advances (
      id SERIAL PRIMARY KEY,
      employee_id INT REFERENCES finance_employees(id) ON DELETE CASCADE,
      amount_borrowed NUMERIC(12,2) NOT NULL DEFAULT 0,
      remaining_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      date_borrowed DATE NOT NULL DEFAULT CURRENT_DATE,
      status TEXT NOT NULL DEFAULT 'Pending',
      remarks TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS finance_salary_advance_payments (
      id SERIAL PRIMARY KEY,
      advance_id INT NOT NULL REFERENCES finance_salary_advances(id) ON DELETE CASCADE,
      amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      status TEXT NOT NULL DEFAULT 'Paid',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await pool.query(`INSERT INTO finance_departments (name)
      VALUES ('Finance'), ('NOC'), ('Operations')
      ON CONFLICT (name) DO NOTHING`);
    await pool.query(`INSERT INTO finance_positions (title)
      VALUES ('Finance Officer'), ('Accountant'), ('NOC Engineer'), ('Staff')
      ON CONFLICT (title) DO NOTHING`);
    await pool.query(`ALTER TABLE finance_employee_salaries ADD COLUMN IF NOT EXISTS employee_id INT REFERENCES finance_employees(id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE finance_employee_salaries ADD COLUMN IF NOT EXISTS date DATE`);
    await pool.query(`UPDATE finance_employee_salaries SET date=COALESCE(date, salary_date, CURRENT_DATE)`);
    await pool.query(`
      INSERT INTO finance_employees (full_name, email, position_id, department_id)
      SELECT full_name::TEXT, email::TEXT,
             (SELECT id FROM finance_positions WHERE title='Staff' LIMIT 1),
             (SELECT id FROM finance_departments WHERE name='Finance' LIMIT 1)
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM finance_employees fe
        WHERE LOWER(COALESCE(fe.email, '')) = LOWER(COALESCE(u.email::TEXT, ''))
      )
      ON CONFLICT (email) DO NOTHING
    `);
    console.log('Finance tables ready âœ…');
  } catch (err) {
    console.error('Finance setup error:', err.message);
  }
})();

const FINANCE_RESOURCES = {
  company_income: {
    table: 'finance_company_income',
    fields: ['date', 'lot', 'project_name', 'source', 'description', 'category', 'amount', 'status', 'or_number', 'notes'],
    required: ['date', 'source', 'description', 'amount', 'status']
  },
  company_expenses: {
    table: 'finance_company_expenses',
    fields: ['date', 'expense_group', 'description', 'category', 'vendor', 'amount', 'status', 'notes'],
    required: ['date', 'expense_group', 'description', 'category', 'amount', 'status']
  },
  project_expenses: {
    table: 'finance_project_expenses',
    fields: ['date', 'project_name', 'type', 'description', 'category', 'vendor', 'amount', 'status', 'notes'],
    required: ['date', 'project_name', 'type', 'description', 'category', 'amount', 'status']
  },
  collections: {
    table: 'finance_collections',
    fields: ['date', 'client_name', 'project_name', 'or_number', 'due_date', 'amount_due', 'amount_collected', 'status', 'notes'],
    required: ['date', 'client_name', 'due_date', 'amount_due', 'amount_collected', 'status']
  }
};

function financeRole(req) {
  return String(req.headers['x-user-role'] || '').trim().toLowerCase();
}

function financeUserId(req) {
  const id = Number(req.headers['x-user-id']);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function ensureFinanceAccess(req, res, next) {
  const role = financeRole(req);
  if (!['finance', 'admin', 'executive'].includes(role)) {
    return res.status(403).json({ error: 'Finance access required' });
  }
  next();
}

function ensureAdminAccess(req, res, next) {
  const role = financeRole(req);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function adminScalar(sql, params = [], fallback = 0) {
  try {
    const result = await pool.query(sql, params);
    const first = result.rows?.[0] || {};
    const value = first.value ?? Object.values(first)[0];
    return Number(value || 0);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return fallback;
    throw err;
  }
}

function getFinanceResource(key) {
  return FINANCE_RESOURCES[key] || null;
}

function sanitizeFinancePayload(resource, body = {}) {
  const payload = {};
  for (const field of resource.fields) {
    const raw = body[field];
    payload[field] = raw === undefined ? null : raw;
  }
  for (const field of resource.required) {
    if (payload[field] === null || payload[field] === '') {
      throw new Error(`${field} is required`);
    }
  }
  return payload;
}

function buildFinanceIncomeDateFilter(period = 'year', from = '', to = '', params = [], dateColumn = 'date') {
  if (from) {
    params.push(from);
    const fromSql = `${dateColumn} >= $${params.length}`;
    if (to) {
      params.push(to);
      return `${fromSql} AND ${dateColumn} <= $${params.length}`;
    }
    return fromSql;
  }
  if (to) {
    params.push(to);
    return `${dateColumn} <= $${params.length}`;
  }
  if (period === 'all') return '';
  if (period === 'day' || period === 'today') return `${dateColumn} = CURRENT_DATE`;
  if (period === 'week') return `${dateColumn} >= date_trunc('week', CURRENT_DATE)::date`;
  if (period === 'month') return `${dateColumn} >= date_trunc('month', CURRENT_DATE)::date`;
  return `EXTRACT(YEAR FROM ${dateColumn}) = EXTRACT(YEAR FROM CURRENT_DATE)`;
}

function normalizeFinanceIncomeStatus(status) {
  const s = String(status || 'received').trim().toLowerCase();
  if (s === 'completed' || s === 'paid') return 'received';
  if (['received', 'pending', 'cancelled'].includes(s)) return s;
  return 'pending';
}

function financeIncomeSelectSql() {
  return `
    SELECT
      id,
      date,
      TO_CHAR(date, 'Mon - DD - YYYY') AS date_formatted,
      COALESCE(project_name, lot) AS project_name,
      COALESCE(project_name, lot) AS lot,
      source,
      description,
      category,
      amount,
      status,
      or_number,
      notes,
      created_at,
      updated_at
    FROM finance_company_income
  `;
}

function normalizeFinanceExpenseType(type) {
  const t = String(type || 'expenses').trim().toLowerCase();
  return ['expenses', 'purchases', 'overhead'].includes(t) ? t : 'expenses';
}

function normalizeFinanceExpenseStatus(status) {
  const s = String(status || 'pending').trim().toLowerCase();
  if (s === 'completed' || s === 'approved') return 'paid';
  if (['paid', 'unpaid', 'pending', 'cancelled'].includes(s)) return s;
  return 'pending';
}

function financeExpenseSelectSql() {
  return `
    SELECT
      id,
      expense_group AS type,
      expense_group,
      date,
      category,
      description,
      vendor,
      amount,
      status,
      notes,
      created_at,
      updated_at
    FROM finance_company_expenses
  `;
}

function normalizeProjectExpenseType(type) {
  const t = String(type || 'expenses').trim().toLowerCase();
  return ['expenses', 'purchases'].includes(t) ? t : 'expenses';
}

function normalizeProjectExpenseStatus(status) {
  const s = String(status || 'pending').trim().toLowerCase();
  if (s === 'completed' || s === 'paid') return 'approved';
  if (['approved', 'pending', 'rejected'].includes(s)) return s;
  return 'pending';
}

function normalizeCollectionStatus(status) {
  const s = String(status || 'Pending').trim().toLowerCase();
  if (s === 'approved' || s === 'paid') return 'Approved';
  if (s === 'decline' || s === 'declined' || s === 'rejected') return 'Decline';
  return 'Pending';
}

function normalizeFinanceInventoryStatus(status) {
  const s = String(status || 'in_stock').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['in_stock', 'low_stock', 'out_of_stock'].includes(s)) return s;
  if (s === 'low') return 'low_stock';
  if (s === 'out') return 'out_of_stock';
  return 'in_stock';
}

function financeInventorySelectSql() {
  return `
    SELECT
      id,
      item_name,
      category,
      quantity,
      unit_price,
      (quantity * unit_price) AS total_value,
      status,
      notes,
      created_at,
      updated_at
    FROM finance_inventory
  `;
}

function financeProjectExpenseSelectSql() {
  return `
    SELECT id, date, project_name, type, description, category, vendor, amount, status, notes, created_at, updated_at
    FROM finance_project_expenses
  `;
}

function financeCollectionsSelectSql() {
  return `
    SELECT
      id,
      date,
      client_name AS client,
      client_name,
      project_name AS project,
      project_name,
      or_number,
      amount_due,
      amount_collected,
      GREATEST(amount_due - amount_collected, 0) AS balance,
      due_date,
      status,
      notes,
      created_at,
      updated_at
    FROM finance_collections
  `;
}

/* ================= AUTH ROUTE ================= */

app.post('/api/auth/validate-staff-id', async (req, res) => {
  try {
    const staffId = String(req.body?.staff_id || req.body?.id_no || '').trim();
    if (!staffId) return res.status(400).json({ valid: false, error: 'Staff ID is required' });
    const result = await pool.query(
      `SELECT id, staff_id, department, assigned_role, status, linked_user_id
       FROM staff_ids
       WHERE staff_id = $1`,
      [staffId]
    );
    if (!result.rowCount) return res.status(404).json({ valid: false, error: 'Staff ID is not registered by Admin' });
    const row = result.rows[0];
    if (String(row.status).toLowerCase() === 'disabled') return res.status(403).json({ valid: false, error: 'Staff ID is disabled' });
    if (String(row.status).toLowerCase() === 'used' || row.linked_user_id) return res.status(409).json({ valid: false, error: 'Staff ID has already been used' });
    res.json({ valid: true, staff: row });
  } catch (err) {
    console.error('POST /api/auth/validate-staff-id error:', err.message);
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

app.post('/api/auth', async (req, res) => {
  console.log("REQUEST BODY:", req.body);
  const { action, id_no, full_name, email, password, role } = req.body || {};
  try {
    if (!action) return res.status(400).json({ success: false, error: 'Action is required' });

    if (action === 'signup') {
      if (!id_no || !full_name || !email || !password)
        return res.status(400).json({ success: false, error: 'All fields are required' });
      const trimmedId = id_no.trim();
        const trimmedName = full_name.trim();
        const trimmedEmail = email.trim().toLowerCase();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const staffResult = await client.query(
          `SELECT * FROM staff_ids WHERE staff_id = $1 FOR UPDATE`,
          [trimmedId]
        );
        if (!staffResult.rowCount) {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Staff ID is not registered by Admin' });
        }
        const staff = staffResult.rows[0];
        if (String(staff.status).toLowerCase() === 'disabled') {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: 'Staff ID is disabled' });
        }
        if (String(staff.status).toLowerCase() !== 'unused' || staff.linked_user_id) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: 'Staff ID has already been used' });
        }
        const existing = await client.query('SELECT id FROM users WHERE id_no = $1 OR email = $2', [trimmedId, trimmedEmail]);
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: 'User already exists' });
        }
        const hash = await bcrypt.hash(password, 10);
        const assignedRole = String(staff.assigned_role || '').trim().toLowerCase();
        const result = await client.query(
          `INSERT INTO users (id_no, full_name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, id_no, full_name, email, role, created_at`,
          [trimmedId, trimmedName, trimmedEmail, hash, assignedRole]
        );
        await client.query(
          `UPDATE staff_ids SET status='used', linked_user_id=$1, used_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [result.rows[0].id, staff.id]
        );
        await client.query('COMMIT');
        return res.json({ success: true, user: result.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (action === 'signin') {
      if (!id_no || !password) return res.status(400).json({ success: false, error: 'ID Number and password are required' });
      const trimmedId = id_no.trim();
      const result = await pool.query('SELECT * FROM users WHERE id_no = $1', [trimmedId]);
      if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid credentials' });
      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(401).json({ success: false, error: 'Invalid credentials' });
      await pool.query(`UPDATE users SET last_active=NOW(), current_page=$2 WHERE id=$1`, [user.id, 'Signed in']);
      user.last_active = new Date();
      user.current_page = 'Signed in';
      delete user.password_hash;
      return res.json({ success: true, user }); // includes photo field
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/activity', async (req, res) => {
  try {
    const userId = Number(req.body?.user_id || req.headers['x-user-id']);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' });
    const currentPage = String(req.body?.current_page || req.headers['x-current-page'] || '').slice(0, 180) || null;
    await pool.query(`UPDATE users SET last_active=NOW(), current_page=COALESCE($2, current_page) WHERE id=$1`, [userId, currentPage]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ADMIN ROUTES ================= */

app.get('/api/admin/staff-ids', ensureAdminAccess, async (req, res) => {
  try {
    const search = `%${String(req.query.search || '').trim()}%`;
    const status = String(req.query.status || '').trim().toLowerCase();
    const params = [search];
    const conditions = [`(s.staff_id ILIKE $1 OR COALESCE(s.department,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(u.full_name,'') ILIKE $1)`];
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`LOWER(s.status) = $${params.length}`);
    }
    const result = await pool.query(`
      SELECT
        s.id,
        s.staff_id,
        s.department,
        s.assigned_role,
        s.status,
        s.linked_user_id,
        s.created_by_admin_id,
        s.created_at,
        s.used_at,
        u.email AS linked_user_email,
        u.full_name AS linked_user_name
      FROM staff_ids s
      LEFT JOIN users u ON u.id = s.linked_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.created_at DESC, s.id DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/admin/staff-ids error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/staff-ids', ensureAdminAccess, async (req, res) => {
  try {
    const staffId = String(req.body?.staff_id || '').trim();
    const department = String(req.body?.department || '').trim();
    const assignedRole = String(req.body?.assigned_role || '').trim().toLowerCase();
    if (!staffId || !assignedRole) {
      return res.status(400).json({ error: 'Staff ID and assigned role are required' });
    }
    if (!['noc', 'finance', 'admin', 'bidder'].includes(assignedRole)) {
      return res.status(400).json({ error: 'Assigned role must be NOC, Finance, Admin, or Bidder' });
    }
    const createdBy = financeUserId(req);
    const result = await pool.query(`
      INSERT INTO staff_ids (staff_id, department, assigned_role, status, created_by_admin_id)
      VALUES ($1,$2,$3,'unused',$4)
      RETURNING *
    `, [staffId, department || null, assignedRole, createdBy]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Staff ID already exists' });
    console.error('POST /api/admin/staff-ids error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/staff-ids/:id/disable', ensureAdminAccess, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE staff_ids SET status='disabled' WHERE id=$1 AND LOWER(status) = 'unused' RETURNING *`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Unused Staff ID not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /api/admin/staff-ids/:id/disable error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/overview', ensureAdminAccess, async (req, res) => {
  try {
    const [
      nocTickets,
      nocRegions,
      nocProblematicSites,
      nocAcceptanceSites,
      nocInventoryItems,
      financeInventoryItems,
      financeIncome,
      financeCompanyExpenses,
      financeProjectExpenses,
      financeCollections,
      files,
      employees,
      pendingReimbursements,
      pendingBudgetRequests,
      pendingFilesRequests
    ] = await Promise.all([
      adminScalar(`SELECT COUNT(*)::int AS value FROM ticket_information`),
      adminScalar(`SELECT COUNT(DISTINCT region_name)::int AS value FROM site_inventory WHERE region_name IS NOT NULL AND BTRIM(region_name) <> ''`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM problematic_sites`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM project_sites`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM inventory_items WHERE module = 'noc'`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM inventory_items WHERE module = 'finance'`),
      adminScalar(`SELECT COALESCE(SUM(amount), 0)::numeric AS value FROM finance_company_income`),
      adminScalar(`SELECT COALESCE(SUM(amount), 0)::numeric AS value FROM finance_company_expenses`),
      adminScalar(`SELECT COALESCE(SUM(amount), 0)::numeric AS value FROM finance_project_expenses`),
      adminScalar(`SELECT COALESCE(SUM(amount_collected), 0)::numeric AS value FROM finance_collections`),
      adminScalar(`
        SELECT
          (SELECT COUNT(*) FROM files) +
          (SELECT COUNT(*) FROM project_files) +
          (SELECT COUNT(*) FROM project_images) +
          (SELECT COUNT(*) FROM project_videos) AS value
      `),
      adminScalar(`SELECT COUNT(*)::int AS value FROM finance_employees`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM employee_reimburse_requests WHERE LOWER(COALESCE(status, 'pending')) = 'pending'`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM employee_budget_requests WHERE LOWER(COALESCE(status, 'pending')) = 'pending'`),
      adminScalar(`SELECT COUNT(*)::int AS value FROM files_requests WHERE LOWER(COALESCE(status, 'pending')) = 'pending'`)
    ]);

    res.json({
      noc: {
        tickets: nocTickets,
        regions: nocRegions,
        problematic_sites: nocProblematicSites,
        acceptance_sites: nocAcceptanceSites
      },
      finance: {
        total_income: financeIncome,
        total_expenses: financeCompanyExpenses + financeProjectExpenses,
        total_collections: financeCollections
      },
      inventory: {
        noc_items: nocInventoryItems,
        finance_items: financeInventoryItems,
        total_items: nocInventoryItems + financeInventoryItems
      },
      files: {
        total_files: files
      },
      employees: {
        total: employees
      },
      requests: {
        pending: pendingReimbursements + pendingBudgetRequests + pendingFilesRequests
      }
    });
  } catch (err) {
    console.error('GET /api/admin/overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/accounts-monitoring', ensureAdminAccess, async (req, res) => {
  try {
    const search = `%${String(req.query.search || '').trim()}%`;
    const result = await pool.query(`
      SELECT id, id_no, full_name, email, role, last_active, current_page, created_at,
             CASE
               WHEN last_active >= NOW() - INTERVAL '2 minutes' THEN 'Online'
               WHEN last_active >= NOW() - INTERVAL '15 minutes' THEN 'Idle'
               ELSE 'Offline'
             END AS activity_status
      FROM users
      WHERE id_no ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1
      ORDER BY
        CASE
          WHEN last_active >= NOW() - INTERVAL '2 minutes' THEN 1
          WHEN last_active >= NOW() - INTERVAL '15 minutes' THEN 2
          ELSE 3
        END,
        last_active DESC NULLS LAST,
        full_name ASC
    `, [search]);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/admin/accounts-monitoring error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function adminRequestTableMeta(type) {
  return {
    leave: { table: 'leave_requests', statusCol: 'status', ownerCol: 'employee_id', label: 'Leave Request' },
    id: { table: 'id_requests', statusCol: 'status', ownerCol: 'requested_by', label: 'ID Request' },
    salary: { table: 'salary_increase_requests', statusCol: 'status', ownerCol: 'requested_by', label: 'Salary Increase Request' },
    files: { table: 'files_requests', statusCol: 'status', ownerCol: 'requested_by', label: 'Files Request' },
    reimbursement: { table: 'reimbursement_requests', statusCol: 'status', ownerCol: 'requested_by', label: 'Reimbursement Request' },
    budget: { table: 'budget_requests', statusCol: 'status', ownerCol: 'requested_by', label: 'Budget Request' },
    salary_advance: { table: 'salary_advance_requests', statusCol: 'status', ownerCol: 'requested_by', label: 'Salary Advance Request' }
  }[String(type || '').trim().toLowerCase()] || null;
}

app.get('/api/admin/user-requests', ensureAdminAccess, async (req, res) => {
  const role = String(req.query.role || 'all').trim().toLowerCase();
  const status = String(req.query.status || 'all').trim().toLowerCase();
  const search = `%${String(req.query.search || '').trim()}%`;
  const baseParams = [search];
  const roleSql = role && role !== 'all' ? ` AND LOWER(COALESCE(u.role, '')) = $2` : '';
  const statusSql = status && status !== 'all' ? ` AND LOWER(COALESCE(req_status, 'pending')) = $${roleSql ? 3 : 2}` : '';
  const paramsFor = () => {
    const params = [...baseParams];
    if (roleSql) params.push(role);
    if (statusSql) params.push(status);
    return params;
  };
  const safeQuery = async (sql) => {
    try {
      const result = await pool.query(sql, paramsFor());
      return result.rows;
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') return [];
      throw err;
    }
  };

  try {
    const commonWhere = `
      WHERE (COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(u.role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
      ${roleSql}
      ${statusSql}
    `;
    const queries = [
      safeQuery(`
        SELECT * FROM (
          SELECT lr.id, 'leave' AS request_key, 'Leave Request' AS req_type, lr.submitted_at AS requested_at,
                 lr.status AS req_status, lr.reason AS summary, u.full_name, u.email, u.role, lr.handled_by_name AS handled_by, lr.handled_at
          FROM leave_requests lr LEFT JOIN users u ON u.id=lr.employee_id
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `),
      safeQuery(`
        SELECT * FROM (
          SELECT ir.id, 'id' AS request_key, 'ID Request' AS req_type, ir.created_at AS requested_at,
                 ir.status AS req_status, ir.purpose AS summary, u.full_name, u.email, u.role, ir.handled_by_name AS handled_by, ir.handled_at
          FROM id_requests ir LEFT JOIN users u ON u.id=ir.requested_by
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `),
      safeQuery(`
        SELECT * FROM (
          SELECT sr.id, 'salary' AS request_key, 'Salary Increase Request' AS req_type, sr.created_at AS requested_at,
                 sr.status AS req_status, sr.justification AS summary, u.full_name, u.email, u.role, sr.handled_by_name AS handled_by, sr.handled_at
          FROM salary_increase_requests sr LEFT JOIN users u ON u.id=sr.requested_by
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `),
      safeQuery(`
        SELECT * FROM (
          SELECT fr.id, 'files' AS request_key, 'Files Request' AS req_type, fr.created_at AS requested_at,
                 fr.status AS req_status, fr.purpose AS summary, u.full_name, u.email, u.role, fr.handled_by_name AS handled_by, fr.handled_at
          FROM files_requests fr LEFT JOIN users u ON u.id=fr.requested_by
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `),
      safeQuery(`
        SELECT * FROM (
          SELECT rr.id, 'reimbursement' AS request_key, 'Reimbursement Request' AS req_type, rr.created_at AS requested_at,
                 rr.status AS req_status, rr.purpose AS summary, u.full_name, u.email, u.role, rr.handled_by_name AS handled_by, rr.handled_at
          FROM reimbursement_requests rr LEFT JOIN users u ON u.id=rr.requested_by
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `),
      safeQuery(`
        SELECT * FROM (
          SELECT br.id, 'budget' AS request_key, 'Budget Request' AS req_type, br.created_at AS requested_at,
                 br.status AS req_status, br.justification AS summary, u.full_name, u.email, u.role, br.handled_by_name AS handled_by, br.handled_at
          FROM budget_requests br LEFT JOIN users u ON u.id=br.requested_by
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `),
      safeQuery(`
        SELECT * FROM (
          SELECT ar.id, 'salary_advance' AS request_key, 'Salary Advance Request' AS req_type, ar.created_at AS requested_at,
                 ar.status AS req_status, ar.reason AS summary, u.full_name, u.email, u.role, ar.handled_by_name AS handled_by, ar.handled_at
          FROM salary_advance_requests ar LEFT JOIN users u ON u.id=ar.requested_by
        ) q
        WHERE (COALESCE(full_name,'') ILIKE $1 OR COALESCE(email,'') ILIKE $1 OR COALESCE(role,'') ILIKE $1 OR COALESCE(req_type,'') ILIKE $1)
        ${roleSql.replaceAll('u.', '')}
        ${statusSql}
      `)
    ];
    const rows = (await Promise.all(queries)).flat()
      .map(row => ({
        id: row.id,
        request_key: row.request_key,
        request_id: `${row.request_key}-${row.id}`,
        full_name: row.full_name || 'Unknown',
        email: row.email || '',
        role: row.role || 'other',
        request_type: row.req_type,
        requested_at: row.requested_at,
        status: row.req_status || 'Pending',
        summary: row.summary || '',
        handled_by: row.handled_by || '',
        handled_at: row.handled_at || null
      }))
      .sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0));
    res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/user-requests error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/user-requests/:type/:id', ensureAdminAccess, async (req, res) => {
  try {
    const meta = adminRequestTableMeta(req.params.type);
    if (!meta) return res.status(400).json({ error: 'Invalid request type' });
    const result = await pool.query(`
      SELECT r.*,
             u.full_name,
             u.email,
             u.role,
             COALESCE(r.handled_by_name, h.full_name) AS handled_by_name
      FROM ${meta.table} r
      LEFT JOIN users u ON u.id = r.${meta.ownerCol}
      LEFT JOIN users h ON h.id = r.handled_by_id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
    const row = result.rows[0];
    res.json({
      ...row,
      request_key: String(req.params.type),
      request_id: `${req.params.type}-${row.id}`,
      request_type: meta.label,
      handled_by: row.handled_by_name || ''
    });
  } catch (err) {
    console.error('GET /api/admin/user-requests/:type/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/user-requests/:type/:id/status', ensureAdminAccess, async (req, res) => {
  try {
    const meta = adminRequestTableMeta(req.params.type);
    if (!meta) return res.status(400).json({ error: 'Invalid request type' });
    const status = String(req.body?.status || '').trim();
    const allowed = new Set(['Pending', 'Approved', 'Rejected', 'Cancelled', 'Released', 'Returned']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
    const handledById = Number(req.headers['x-user-id'] || req.body?.handledById || 0) || null;
    let handledByName = '';
    if (handledById) {
      const userResult = await pool.query(`SELECT full_name FROM users WHERE id=$1`, [handledById]);
      handledByName = userResult.rows[0]?.full_name || '';
    }
    handledByName = handledByName || String(req.body?.handledByName || '').trim() || 'Admin';
    const result = await pool.query(
      `UPDATE ${meta.table}
         SET ${meta.statusCol}=$1,
             updated_at=NOW(),
             handled_by_id=$3,
             handled_by_name=$4,
             handled_at=NOW()
       WHERE id=$2
       RETURNING *`,
      [status, req.params.id, handledById, handledByName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /api/admin/user-requests/:type/:id/status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= FINANCE ROUTES ================= */

app.get('/api/income/sources', ensureFinanceAccess, async (req, res) => {
  try {
    const defaults = ['Service Fee', 'Installation Fee', 'Subscription', 'Maintenance', 'Client Payment', 'Other'];
    const result = await pool.query(`
      SELECT DISTINCT source AS name
      FROM finance_company_income
      WHERE source IS NOT NULL AND BTRIM(source) <> ''
      ORDER BY source
    `);
    const names = Array.from(new Set([...defaults, ...result.rows.map(r => r.name).filter(Boolean)]));
    res.json(names.map((name, idx) => ({ id: idx + 1, name })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/income', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', search = '', project_name = '', lot = '', source = '', from = '', to = '' } = req.query;
    const params = [];
    const conditions = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    if (dateFilter) conditions.push(dateFilter);
    const projectFilter = project_name || lot;
    if (projectFilter) {
      params.push(`%${projectFilter}%`);
      conditions.push(`COALESCE(project_name, lot, '') ILIKE $${params.length}`);
    }
    if (source) {
      params.push(`%${source}%`);
      conditions.push(`COALESCE(source, '') ILIKE $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(
        COALESCE(project_name, lot, '') ILIKE $${n}
        OR COALESCE(source, '') ILIKE $${n}
        OR COALESCE(description, '') ILIKE $${n}
        OR COALESCE(or_number, '') ILIKE $${n}
      )`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`${financeIncomeSelectSql()} ${where} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/income/projects', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', search = '', project_name = '', lot = '', source = '', from = '', to = '' } = req.query;
    const params = [];
    const conditions = [`COALESCE(project_name, lot, '') <> ''`];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    if (dateFilter) conditions.push(dateFilter);
    const projectFilter = project_name || lot;
    if (projectFilter) {
      params.push(`%${projectFilter}%`);
      conditions.push(`COALESCE(project_name, lot, '') ILIKE $${params.length}`);
    }
    if (source) {
      params.push(`%${source}%`);
      conditions.push(`COALESCE(source, '') ILIKE $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(
        COALESCE(project_name, lot, '') ILIKE $${n}
        OR COALESCE(source, '') ILIKE $${n}
        OR COALESCE(description, '') ILIKE $${n}
        OR COALESCE(or_number, '') ILIKE $${n}
      )`);
    }
    const result = await pool.query(`${financeIncomeSelectSql()} WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/income/project', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, project_name, lot, source, description, amount, status, or_number, category, notes } = req.body || {};
    if (!date || !source?.trim() || !amount) return res.status(400).json({ error: 'date, source, and amount are required' });
    const projectName = project_name || lot || null;
    const result = await pool.query(`
      INSERT INTO finance_company_income (date, project_name, lot, source, description, category, amount, status, or_number, notes, created_by)
      VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      date,
      projectName,
      source.trim(),
      description || null,
      category || source.trim(),
      Number(amount || 0),
      normalizeFinanceIncomeStatus(status),
      or_number || null,
      notes || null,
      financeUserId(req)
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/income', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, source, description, amount, status, or_number, category, notes } = req.body || {};
    if (!date || !source?.trim() || !amount) return res.status(400).json({ error: 'date, source, and amount are required' });
    const result = await pool.query(`
      INSERT INTO finance_company_income (date, project_name, lot, source, description, category, amount, status, or_number, notes, created_by)
      VALUES ($1,NULL,NULL,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      date,
      source.trim(),
      description || null,
      category || source.trim(),
      Number(amount || 0),
      normalizeFinanceIncomeStatus(status),
      or_number || null,
      notes || null,
      financeUserId(req)
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/income/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, project_name, lot, source, description, amount, status, or_number, category, notes } = req.body || {};
    if (!date || !source?.trim() || !amount) return res.status(400).json({ error: 'date, source, and amount are required' });
    const projectName = project_name || lot || null;
    const result = await pool.query(`
      UPDATE finance_company_income
      SET date=$1, project_name=$2, lot=$2, source=$3, description=$4, category=$5, amount=$6, status=$7, or_number=$8, notes=$9, updated_at=NOW()
      WHERE id=$10
      RETURNING *
    `, [
      date,
      projectName,
      source.trim(),
      description || null,
      category || source.trim(),
      Number(amount || 0),
      normalizeFinanceIncomeStatus(status),
      or_number || null,
      notes || null,
      req.params.id
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Income record not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/income/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_company_income WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Income record not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/income/kpi', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    const where = dateFilter ? `WHERE ${dateFilter}` : '';
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status) IN ('received','completed','paid')), 0) AS received_total,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status) = 'pending'), 0) AS pending_total,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status) = 'cancelled'), 0) AS cancelled_total,
        COALESCE(SUM(amount), 0) AS total
      FROM finance_company_income ${where}
    `, params);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/income/monthly', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    const where = dateFilter ? `WHERE ${dateFilter}` : '';
    const result = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon') AS month, SUM(amount) AS total
      FROM finance_company_income
      ${where}
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date)
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/income/by-project', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    const extra = dateFilter ? `AND ${dateFilter}` : '';
    const result = await pool.query(`
      SELECT COALESCE(project_name, lot, 'General') AS label, SUM(amount) AS amount
      FROM finance_company_income
      WHERE COALESCE(project_name, lot, '') <> '' ${extra}
      GROUP BY COALESCE(project_name, lot, 'General')
      ORDER BY COALESCE(project_name, lot, 'General')
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/projects', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT COALESCE(project_name, lot) AS project_name
      FROM finance_company_income
      WHERE COALESCE(project_name, lot, '') <> ''
      ORDER BY project_name
    `);
    res.json(result.rows.map((r, idx) => ({ id: idx + 1, project_name: r.project_name })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    const where = dateFilter ? `WHERE ${dateFilter}` : '';
    const [expenseResult, contributionResult] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS grand_total,
          COALESCE(SUM(amount) FILTER (WHERE expense_group = 'expenses'), 0) AS expenses_total,
          COALESCE(SUM(amount) FILTER (WHERE expense_group = 'purchases'), 0) AS purchases_total,
          COALESCE(SUM(amount) FILTER (WHERE expense_group = 'overhead'), 0) AS overhead_total
        FROM finance_company_expenses ${where}
      `, params),
      pool.query(`SELECT COALESCE(SUM(employee_share + employer_share), 0) AS contribution_total FROM finance_contributions`)
    ]);
    const row = expenseResult.rows[0] || {};
    res.json({
      grand_total: Number(row.grand_total || 0),
      expenses_total: Number(row.expenses_total || 0),
      purchases_total: Number(row.purchases_total || 0),
      overhead_total: Number(row.overhead_total || 0),
      contribution_total: Number(contributionResult.rows[0]?.contribution_total || 0)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/monthly', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', from = '', to = '' } = req.query;
    const params = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    const where = dateFilter ? `WHERE ${dateFilter}` : '';
    const result = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon') AS month_label, SUM(amount) AS total
      FROM finance_company_expenses
      ${where}
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date)
    `, params);
    res.json(result.rows.map(r => ({ ...r, total: Number(r.total || 0) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/recent', ensureFinanceAccess, async (req, res) => {
  try {
    const { period = 'year', from = '', to = '', cat = '', status = '', search = '' } = req.query;
    const params = [];
    const conditions = [];
    const dateFilter = buildFinanceIncomeDateFilter(period, from, to, params, 'date');
    if (dateFilter) conditions.push(dateFilter);
    if (cat) {
      params.push(normalizeFinanceExpenseType(cat));
      conditions.push(`expense_group = $${params.length}`);
    }
    if (status) {
      params.push(normalizeFinanceExpenseStatus(status));
      conditions.push(`LOWER(status) = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(description ILIKE $${n} OR category ILIKE $${n} OR COALESCE(vendor, '') ILIKE $${n})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`${financeExpenseSelectSql()} ${where} ORDER BY date DESC, id DESC LIMIT 50`, params);
    res.json(result.rows.map(r => ({ ...r, amount: Number(r.amount || 0) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/sub-kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const type = normalizeFinanceExpenseType(req.query.type);
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status) = 'paid'), 0) AS paid,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status) = 'unpaid'), 0) AS unpaid,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status) = 'pending'), 0) AS pending
      FROM finance_company_expenses
      WHERE expense_group = $1
    `, [type]);
    const row = result.rows[0] || {};
    res.json({ total: Number(row.total || 0), paid: Number(row.paid || 0), unpaid: Number(row.unpaid || 0), pending: Number(row.pending || 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/list', ensureFinanceAccess, async (req, res) => {
  try {
    const { type = 'expenses', cat = '', status = '', search = '' } = req.query;
    const params = [normalizeFinanceExpenseType(type)];
    const conditions = ['expense_group = $1'];
    if (cat) {
      params.push(cat);
      conditions.push(`category = $${params.length}`);
    }
    if (status) {
      params.push(normalizeFinanceExpenseStatus(status));
      conditions.push(`LOWER(status) = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(description ILIKE $${n} OR category ILIKE $${n} OR COALESCE(vendor, '') ILIKE $${n})`);
    }
    const result = await pool.query(`${financeExpenseSelectSql()} WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows.map(r => ({ ...r, amount: Number(r.amount || 0) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses', ensureFinanceAccess, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [];
    const where = search
      ? `WHERE description ILIKE $1 OR category ILIKE $1 OR COALESCE(vendor, '') ILIKE $1`
      : '';
    if (search) params.push(`%${search}%`);
    const result = await pool.query(`${financeExpenseSelectSql()} ${where} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows.map(r => ({ ...r, amount: Number(r.amount || 0) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, desc, description, cat, category, vendor, amount, status, type, expense_group, notes } = req.body || {};
    const group = normalizeFinanceExpenseType(type || expense_group);
    const cleanDescription = description || desc;
    const cleanCategory = category || cat;
    if (!date || !cleanDescription?.trim() || !cleanCategory?.trim() || !amount) {
      return res.status(400).json({ error: 'date, category, description, and amount are required' });
    }
    const result = await pool.query(`
      INSERT INTO finance_company_expenses (expense_group, date, category, description, vendor, amount, status, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [group, date, cleanCategory.trim(), cleanDescription.trim(), vendor || null, Number(amount || 0), normalizeFinanceExpenseStatus(status), notes || null, financeUserId(req)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/expenses/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, desc, description, cat, category, vendor, amount, status, type, expense_group, notes } = req.body || {};
    const group = normalizeFinanceExpenseType(type || expense_group);
    const cleanDescription = description || desc;
    const cleanCategory = category || cat;
    if (!date || !cleanDescription?.trim() || !cleanCategory?.trim() || !amount) {
      return res.status(400).json({ error: 'date, category, description, and amount are required' });
    }
    const result = await pool.query(`
      UPDATE finance_company_expenses
      SET expense_group=$1, date=$2, category=$3, description=$4, vendor=$5, amount=$6, status=$7, notes=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [group, date, cleanCategory.trim(), cleanDescription.trim(), vendor || null, Number(amount || 0), normalizeFinanceExpenseStatus(status), notes || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Expense record not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_company_expenses WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Expense record not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contributions/kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(employee_share + employer_share), 0) AS grand_total,
        COALESCE(SUM(employee_share + employer_share) FILTER (WHERE status = 'Paid'), 0) AS total_paid,
        COALESCE(SUM(employee_share + employer_share) FILTER (WHERE status = 'Unpaid'), 0) AS total_unpaid,
        COALESCE(SUM(employee_share + employer_share) FILTER (WHERE status = 'Overdue'), 0) AS total_overdue
      FROM finance_contributions
    `);
    res.json(result.rows[0] || { grand_total: 0, total_paid: 0, total_unpaid: 0, total_overdue: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contributions', ensureFinanceAccess, async (req, res) => {
  try {
    const { type = '', status = '', search = '' } = req.query;
    const params = [];
    const conditions = [];
    if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`name ILIKE $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`
      SELECT id, name, type, employee_share, employer_share, (employee_share + employer_share) AS total, due_date, status, created_at
      FROM finance_contributions
      ${where}
      ORDER BY due_date DESC, name ASC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contributions', ensureFinanceAccess, async (req, res) => {
  try {
    const { name, type, employee_share, employer_share, due_date, status } = req.body || {};
    if (!name?.trim() || !type?.trim() || employee_share == null || employer_share == null || !due_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await pool.query(`
      INSERT INTO finance_contributions (name, type, employee_share, employer_share, due_date, status, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [name.trim(), type.trim(), Number(employee_share || 0), Number(employer_share || 0), due_date, status || 'Unpaid', financeUserId(req)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/contributions/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { name, type, employee_share, employer_share, due_date, status } = req.body || {};
    if (!name?.trim() || !type?.trim() || employee_share == null || employer_share == null || !due_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await pool.query(`
      UPDATE finance_contributions
      SET name=$1, type=$2, employee_share=$3, employer_share=$4, due_date=$5, status=$6, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [name.trim(), type.trim(), Number(employee_share || 0), Number(employer_share || 0), due_date, status || 'Unpaid', req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Contribution not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/contributions/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_contributions WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Contribution not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/project-expenses/kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const type = normalizeProjectExpenseType(req.query.type);
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(amount),0) AS total,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status)='approved'),0) AS approved,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status)='pending'),0) AS pending,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(status)='rejected'),0) AS rejected
      FROM finance_project_expenses
      WHERE type=$1
    `, [type]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/project-expenses/chart', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT type, TO_CHAR(date_trunc('month', date), 'Mon YYYY') AS month_label, TO_CHAR(date_trunc('month', date), 'YYYY-MM') AS month_key, SUM(amount) AS total
      FROM finance_project_expenses
      GROUP BY type, date_trunc('month', date)
      ORDER BY month_key
    `);
    res.json({
      purchases: result.rows.filter(r => r.type === 'purchases'),
      expenses: result.rows.filter(r => r.type === 'expenses')
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/project-expenses/recent', ensureFinanceAccess, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [];
    const where = search ? `WHERE project_name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1 OR COALESCE(vendor,'') ILIKE $1` : '';
    if (search) params.push(`%${search}%`);
    const result = await pool.query(`${financeProjectExpenseSelectSql()} ${where} ORDER BY date DESC, id DESC LIMIT 50`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/project-expenses/list', ensureFinanceAccess, async (req, res) => {
  try {
    const { type = 'expenses', cat = '', status = '', search = '' } = req.query;
    const params = [normalizeProjectExpenseType(type)];
    const conditions = ['type=$1'];
    if (cat) { params.push(cat); conditions.push(`category=$${params.length}`); }
    if (status) { params.push(normalizeProjectExpenseStatus(status)); conditions.push(`LOWER(status)=$${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(project_name ILIKE $${params.length} OR description ILIKE $${params.length} OR COALESCE(vendor,'') ILIKE $${params.length})`); }
    const result = await pool.query(`${financeProjectExpenseSelectSql()} WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/project-expenses', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`${financeProjectExpenseSelectSql()} ORDER BY date DESC, id DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/project-expenses', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, project, project_name, desc, description, cat, category, vendor, amount, status, type, notes } = req.body || {};
    const cleanProject = project_name || project;
    const cleanDescription = description || desc;
    const cleanCategory = category || cat || 'Materials';
    if (!date || !cleanProject?.trim() || !cleanDescription?.trim() || !amount) return res.status(400).json({ error: 'date, project, description, and amount are required' });
    const result = await pool.query(`
      INSERT INTO finance_project_expenses (date, project_name, type, description, category, vendor, amount, status, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [date, cleanProject.trim(), normalizeProjectExpenseType(type), cleanDescription.trim(), cleanCategory, vendor || null, Number(amount || 0), normalizeProjectExpenseStatus(status), notes || null, financeUserId(req)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/project-expenses/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, project, project_name, desc, description, cat, category, vendor, amount, status, type, notes } = req.body || {};
    const cleanProject = project_name || project;
    const cleanDescription = description || desc;
    const cleanCategory = category || cat || 'Materials';
    if (!date || !cleanProject?.trim() || !cleanDescription?.trim() || !amount) return res.status(400).json({ error: 'date, project, description, and amount are required' });
    const result = await pool.query(`
      UPDATE finance_project_expenses
      SET date=$1, project_name=$2, type=$3, description=$4, category=$5, vendor=$6, amount=$7, status=$8, notes=$9, updated_at=NOW()
      WHERE id=$10
      RETURNING *
    `, [date, cleanProject.trim(), normalizeProjectExpenseType(type), cleanDescription.trim(), cleanCategory, vendor || null, Number(amount || 0), normalizeProjectExpenseStatus(status), notes || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Project expense not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/project-expenses/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_project_expenses WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Project expense not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/collections/kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total_records,
             COALESCE(SUM(amount_due),0) AS total_due,
             COALESCE(SUM(amount_collected),0) AS total_collected,
             COALESCE(SUM(GREATEST(amount_due - amount_collected,0)),0) AS total_balance
      FROM finance_collections
    `);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/collections/chart-data', ensureFinanceAccess, async (req, res) => {
  try {
    const [projects, status] = await Promise.all([
      pool.query(`SELECT COALESCE(project_name,'General') AS project, SUM(amount_due) AS total_due, SUM(amount_collected) AS total_collected FROM finance_collections GROUP BY project_name ORDER BY project`),
      pool.query(`SELECT status, COUNT(*) AS cnt FROM finance_collections GROUP BY status`)
    ]);
    const statusMap = { Approved: 0, Pending: 0, Decline: 0 };
    status.rows.forEach(r => { statusMap[normalizeCollectionStatus(r.status)] = Number(r.cnt || 0); });
    res.json({ projects: projects.rows, status: statusMap });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/collections', ensureFinanceAccess, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [];
    const where = search ? `WHERE client_name ILIKE $1 OR COALESCE(project_name,'') ILIKE $1 OR COALESCE(or_number,'') ILIKE $1` : '';
    if (search) params.push(`%${search}%`);
    const result = await pool.query(`${financeCollectionsSelectSql()} ${where} ORDER BY date DESC, id DESC`, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/collections', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, client, client_name, project, project_name, or_number, due, amount_due, collected, amount_collected, status, notes } = req.body || {};
    const cleanClient = client_name || client;
    const dueAmount = Number(amount_due ?? due ?? 0);
    const collectedAmount = Number(amount_collected ?? collected ?? 0);
    if (!date || !cleanClient?.trim() || dueAmount < 0) return res.status(400).json({ error: 'date, client, and amount_due are required' });
    const result = await pool.query(`
      INSERT INTO finance_collections (date, client_name, project_name, or_number, due_date, amount_due, amount_collected, status, notes, created_by)
      VALUES ($1,$2,$3,$4,$1,$5,$6,$7,$8,$9)
      RETURNING *
    `, [date, cleanClient.trim(), project_name || project || null, or_number || null, dueAmount, collectedAmount, normalizeCollectionStatus(status), notes || null, financeUserId(req)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/collections/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { date, client, client_name, project, project_name, or_number, due, amount_due, collected, amount_collected, status, notes } = req.body || {};
    const cleanClient = client_name || client;
    const dueAmount = Number(amount_due ?? due ?? 0);
    const collectedAmount = amount_collected ?? collected;
    if (!date || !cleanClient?.trim() || dueAmount < 0) return res.status(400).json({ error: 'date, client, and amount_due are required' });
    const result = await pool.query(`
      UPDATE finance_collections
      SET date=$1, client_name=$2, project_name=$3, or_number=$4, due_date=$1, amount_due=$5,
          amount_collected=COALESCE($6, amount_collected), status=$7, notes=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [date, cleanClient.trim(), project_name || project || null, or_number || null, dueAmount, collectedAmount == null ? null : Number(collectedAmount), normalizeCollectionStatus(status), notes || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Collection not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/collections/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_collections WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Collection not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/finance-inventory/kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_items,
        COALESCE(SUM(quantity * unit_price), 0) AS total_value,
        COUNT(*) FILTER (WHERE status = 'low_stock')::int AS low_stock_items,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS recently_added
      FROM finance_inventory
    `);
    const row = result.rows[0] || {};
    res.json({
      total_items: Number(row.total_items || 0),
      total_value: Number(row.total_value || 0),
      low_stock_items: Number(row.low_stock_items || 0),
      recently_added: Number(row.recently_added || 0)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/finance-inventory', ensureFinanceAccess, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [];
    const where = search ? `WHERE item_name ILIKE $1 OR COALESCE(category,'') ILIKE $1 OR COALESCE(notes,'') ILIKE $1` : '';
    if (search) params.push(`%${search}%`);
    const result = await pool.query(`${financeInventorySelectSql()} ${where} ORDER BY created_at DESC, id DESC`, params);
    res.json(result.rows.map(r => ({
      ...r,
      quantity: Number(r.quantity || 0),
      unit_price: Number(r.unit_price || 0),
      total_value: Number(r.total_value || 0)
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finance-inventory', ensureFinanceAccess, async (req, res) => {
  try {
    const { item_name, itemName, category, quantity, unit_price, unitPrice, status, notes } = req.body || {};
    const cleanName = item_name || itemName;
    const qty = Number(quantity ?? 0);
    const price = Number(unit_price ?? unitPrice ?? 0);
    if (!cleanName?.trim() || qty < 0 || price < 0) {
      return res.status(400).json({ error: 'item_name, quantity, and unit_price are required' });
    }
    const result = await pool.query(`
      INSERT INTO finance_inventory (item_name, category, quantity, unit_price, status, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [cleanName.trim(), category || null, qty, price, normalizeFinanceInventoryStatus(status), notes || null, financeUserId(req)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/finance-inventory/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { item_name, itemName, category, quantity, unit_price, unitPrice, status, notes } = req.body || {};
    const cleanName = item_name || itemName;
    const qty = Number(quantity ?? 0);
    const price = Number(unit_price ?? unitPrice ?? 0);
    if (!cleanName?.trim() || qty < 0 || price < 0) {
      return res.status(400).json({ error: 'item_name, quantity, and unit_price are required' });
    }
    const result = await pool.query(`
      UPDATE finance_inventory
      SET item_name=$1, category=$2, quantity=$3, unit_price=$4, status=$5, notes=$6, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [cleanName.trim(), category || null, qty, price, normalizeFinanceInventoryStatus(status), notes || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Inventory item not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/finance-inventory/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_inventory WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/collections/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, collection_id, amount_paid, date, status FROM finance_collection_payments WHERE collection_id=$1 ORDER BY date ASC, id ASC`, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/collections/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const amount = Number(req.body?.amount_paid || 0);
    if (amount <= 0) return res.status(400).json({ error: 'amount_paid must be positive' });
    const payment = await pool.query(`INSERT INTO finance_collection_payments (collection_id, amount_paid, date, status) VALUES ($1,$2,$3,$4) RETURNING *`, [req.params.id, amount, req.body?.date || new Date().toISOString().slice(0,10), req.body?.status || 'Pending']);
    await pool.query(`UPDATE finance_collections SET amount_collected = amount_collected + $1, updated_at=NOW() WHERE id=$2`, [amount, req.params.id]);
    const col = await pool.query(`${financeCollectionsSelectSql()} WHERE id=$1`, [req.params.id]);
    res.json({ payment: payment.rows[0], collection: col.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/collections/payments/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const existing = await pool.query(`SELECT collection_id, amount_paid FROM finance_collection_payments WHERE id=$1`, [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Payment not found' });
    const row = existing.rows[0];
    await pool.query(`DELETE FROM finance_collection_payments WHERE id=$1`, [req.params.id]);
    await pool.query(`UPDATE finance_collections SET amount_collected=GREATEST(amount_collected - $1, 0), updated_at=NOW() WHERE id=$2`, [row.amount_paid, row.collection_id]);
    const col = await pool.query(`${financeCollectionsSelectSql()} WHERE id=$1`, [row.collection_id]);
    res.json({ success: true, collection: col.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/finance/summary', ensureFinanceAccess, async (req, res) => {
  try {
    const [income, companyExpenses, projectExpenses, collections, recentTx, recentCollections] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_company_income WHERE LOWER(status) <> 'cancelled'`),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_company_expenses WHERE LOWER(status) <> 'cancelled'`),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_project_expenses WHERE LOWER(status) <> 'cancelled'`),
      pool.query(`
        SELECT
          COALESCE(SUM(amount_collected),0) AS collected,
          COALESCE(SUM(GREATEST(amount_due - amount_collected, 0)),0) AS outstanding
        FROM finance_collections
        WHERE LOWER(status) <> 'cancelled'
      `),
      pool.query(`
        SELECT * FROM (
          SELECT id, date, description, category, amount, status, 'income' AS record_type FROM finance_company_income
          UNION ALL
          SELECT id, date, description, category, amount, status, 'company_expense' AS record_type FROM finance_company_expenses
          UNION ALL
          SELECT id, date, description, project_name AS category, amount, status, 'project_expense' AS record_type FROM finance_project_expenses
        ) t
        ORDER BY date DESC, id DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT id, date, client_name, project_name, due_date, amount_due, amount_collected, status
        FROM finance_collections
        ORDER BY due_date ASC, id DESC
        LIMIT 8
      `)
    ]);

    const totalIncome = Number(income.rows[0]?.total || 0);
    const companyTotal = Number(companyExpenses.rows[0]?.total || 0);
    const projectTotal = Number(projectExpenses.rows[0]?.total || 0);
    const collectionsTotal = Number(collections.rows[0]?.collected || 0);
    const outstandingTotal = Number(collections.rows[0]?.outstanding || 0);

    res.json({
      total_income: totalIncome,
      company_expenses: companyTotal,
      project_expenses: projectTotal,
      total_collections: collectionsTotal,
      outstanding_collections: outstandingTotal,
      net_cashflow: totalIncome - companyTotal - projectTotal + collectionsTotal,
      recent_transactions: recentTx.rows,
      collection_rows: recentCollections.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getFinanceReportData(req) {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  const bucket = month ? 'day' : 'month';
  const labelFmt = month ? 'Mon DD' : 'Mon YYYY';
  const params = [year];
  const monthClause = month ? `AND EXTRACT(MONTH FROM date) = $2` : '';
  if (month) params.push(month);
  const dateWhere = `EXTRACT(YEAR FROM date) = $1 ${monthClause}`;

  const totalsPromise = pool.query(`
    SELECT
      (SELECT COALESCE(SUM(amount),0) FROM finance_company_income WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}) AS total_income,
      (SELECT COALESCE(SUM(amount),0) FROM finance_company_expenses WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}) AS company_expenses,
      (SELECT COALESCE(SUM(amount),0) FROM finance_project_expenses WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}) AS project_expenses,
      (SELECT COALESCE(SUM(amount_collected),0) FROM finance_collections WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}) AS total_collections,
      (SELECT COALESCE(SUM(GREATEST(amount_due - amount_collected, 0)),0) FROM finance_collections WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}) AS outstanding_collections
  `, params);

  const monthlyPromise = pool.query(`
    WITH monthly AS (
      SELECT date_trunc('${bucket}', date)::date AS month_bucket, SUM(amount) AS amount, 'income' AS kind
      FROM finance_company_income
      WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('${bucket}', date)::date AS month_bucket, SUM(amount) AS amount, 'company_expenses' AS kind
      FROM finance_company_expenses
      WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('${bucket}', date)::date AS month_bucket, SUM(amount) AS amount, 'project_expenses' AS kind
      FROM finance_project_expenses
      WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}
      GROUP BY 1
      UNION ALL
      SELECT date_trunc('${bucket}', date)::date AS month_bucket, SUM(amount_collected) AS amount, 'collections' AS kind
      FROM finance_collections
      WHERE LOWER(status) <> 'cancelled' AND ${dateWhere}
      GROUP BY 1
    )
    SELECT
      month_bucket,
      TO_CHAR(month_bucket, $${params.length + 1}) AS month_label,
      COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS income,
      COALESCE(SUM(CASE WHEN kind='company_expenses' THEN amount END),0) AS company_expenses,
      COALESCE(SUM(CASE WHEN kind='project_expenses' THEN amount END),0) AS project_expenses,
      COALESCE(SUM(CASE WHEN kind='collections' THEN amount END),0) AS collections
    FROM monthly
    GROUP BY month_bucket
    ORDER BY month_bucket DESC
    LIMIT 31
  `, [...params, labelFmt]);

  const [totalsRes, monthlyRes] = await Promise.all([totalsPromise, monthlyPromise]);
  const totals = totalsRes.rows[0] || {};
  const monthly = monthlyRes.rows.map(row => ({
    ...row,
    income: Number(row.income || 0),
    company_expenses: Number(row.company_expenses || 0),
    project_expenses: Number(row.project_expenses || 0),
    collections: Number(row.collections || 0),
    total_expenses: Number(row.company_expenses || 0) + Number(row.project_expenses || 0),
    net: Number(row.income || 0) - Number(row.company_expenses || 0) - Number(row.project_expenses || 0)
  }));

  return {
    year,
    month,
    totals: {
      total_income: Number(totals.total_income || 0),
      company_expenses: Number(totals.company_expenses || 0),
      project_expenses: Number(totals.project_expenses || 0),
      total_collections: Number(totals.total_collections || 0),
      outstanding_collections: Number(totals.outstanding_collections || 0),
      net_income: Number(totals.total_income || 0) - Number(totals.company_expenses || 0) - Number(totals.project_expenses || 0)
    },
    monthly
  };
}

app.get('/api/finance/report', ensureFinanceAccess, async (req, res) => {
  try {
    res.json(await getFinanceReportData(req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/report/kpis', ensureFinanceAccess, async (req, res) => {
  try {
    const report = await getFinanceReportData(req);
    res.json({
      total_income: report.totals.total_income,
      comp_expenses: report.totals.company_expenses,
      proj_expenses: report.totals.project_expenses,
      total_collections: report.totals.total_collections,
      net_income: report.totals.net_income
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/report/monthly', ensureFinanceAccess, async (req, res) => {
  try {
    const report = await getFinanceReportData(req);
    res.json(report.monthly.map(row => ({
      period: row.month_bucket,
      month_label: row.month_label,
      total_income: row.income,
      total_comp_expenses: row.company_expenses,
      total_proj_expenses: row.project_expenses,
      total_expenses: row.total_expenses,
      total_collections: row.collections,
      net_income: row.net
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/finance/employees', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, id_no, full_name, email, role, created_at
      FROM users
      ORDER BY full_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/employee/list', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, full_name, email, role AS position, role AS department
      FROM users
      WHERE LOWER(COALESCE(role, '')) <> 'finance'
      ORDER BY full_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/finance/records/:resource', ensureFinanceAccess, async (req, res) => {
  const resource = getFinanceResource(req.params.resource);
  if (!resource) return res.status(404).json({ error: 'Finance resource not found' });
  try {
    const result = await pool.query(`SELECT * FROM ${resource.table} ORDER BY date DESC, id DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/records/:resource', ensureFinanceAccess, async (req, res) => {
  const resource = getFinanceResource(req.params.resource);
  if (!resource) return res.status(404).json({ error: 'Finance resource not found' });
  try {
    const payload = sanitizeFinancePayload(resource, req.body || {});
    const fields = [...resource.fields, 'created_by'];
    const values = [...resource.fields.map(field => payload[field]), financeUserId(req)];
    const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO ${resource.table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/finance/records/:resource/:id', ensureFinanceAccess, async (req, res) => {
  const resource = getFinanceResource(req.params.resource);
  if (!resource) return res.status(404).json({ error: 'Finance resource not found' });
  try {
    const payload = sanitizeFinancePayload(resource, req.body || {});
    const setClause = [...resource.fields.map((field, idx) => `${field}=$${idx + 1}`), `updated_at=NOW()`].join(', ');
    const values = [...resource.fields.map(field => payload[field]), req.params.id];
    const result = await pool.query(
      `UPDATE ${resource.table} SET ${setClause} WHERE id=$${resource.fields.length + 1} RETURNING *`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/finance/records/:resource/:id', ensureFinanceAccess, async (req, res) => {
  const resource = getFinanceResource(req.params.resource);
  if (!resource) return res.status(404).json({ error: 'Finance resource not found' });
  try {
    const result = await pool.query(`DELETE FROM ${resource.table} WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function financeResolveEmployeeId({ employee_id, full_name, role }) {
  if (employee_id) return Number(employee_id);
  const name = String(full_name || '').trim();
  if (!name) return null;
  const found = await pool.query(`SELECT id FROM finance_employees WHERE LOWER(full_name)=LOWER($1) LIMIT 1`, [name]);
  if (found.rowCount) return found.rows[0].id;
  const pos = await pool.query(`SELECT id FROM finance_positions WHERE LOWER(title)=LOWER($1) LIMIT 1`, [String(role || 'Staff')]);
  const dept = await pool.query(`SELECT id FROM finance_departments WHERE name='Finance' LIMIT 1`);
  const inserted = await pool.query(`
    INSERT INTO finance_employees (full_name, position_id, department_id)
    VALUES ($1,$2,$3)
    RETURNING id
  `, [name, pos.rows[0]?.id || null, dept.rows[0]?.id || null]);
  return inserted.rows[0].id;
}

app.get('/api/employees', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.full_name, e.email, e.hired_date,
             p.title AS position, d.name AS department
      FROM finance_employees e
      LEFT JOIN finance_positions p ON p.id=e.position_id
      LEFT JOIN finance_departments d ON d.id=e.department_id
      ORDER BY e.full_name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/reimburse', ensureFinanceAccess, async (req, res) => {
  try {
    const params = [`%${String(req.query.search || '').trim()}%`];
    const status = String(req.query.status || '').trim();
    const statusSql = status ? ` AND r.status=$2` : '';
    if (status) params.push(status);
    const result = await pool.query(`
      SELECT r.id, r.requested_by,
             COALESCE(u.full_name, u.email, 'Unknown') AS name,
             COALESCE(u.full_name, u.email, 'Unknown') AS employee_name,
             u.role AS role, u.role AS roles,
             'Reimbursement Request' AS request_type,
             r.request_date AS date,
             r.purpose AS description,
             r.amount, r.status, r.remarks AS comments,
             r.category, r.department, r.expense_date, r.receipt_path, r.receipt_name,
             r.created_at, r.updated_at
      FROM reimbursement_requests r
      LEFT JOIN users u ON u.id=r.requested_by
      WHERE (COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(r.category,'') ILIKE $1 OR COALESCE(r.purpose,'') ILIKE $1)
      ${statusSql}
      ORDER BY r.created_at DESC, r.id DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/reimburse/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, COALESCE(u.full_name, u.email, 'Unknown') AS employee_name, u.role
      FROM reimbursement_requests r
      LEFT JOIN users u ON u.id=r.requested_by
      WHERE r.id=$1
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Reimbursement request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/reimburse', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, full_name, role, date, description, amount, status, comments } = req.body || {};
    const resolvedId = await financeResolveEmployeeId({ employee_id, full_name, role });
    if (!resolvedId) return res.status(400).json({ error: 'employee is required' });
    const result = await pool.query(`
      INSERT INTO finance_reimbursements (employee_id, date, description, amount, status, comments)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [resolvedId, date || new Date().toISOString().slice(0, 10), description || '', Number(amount || 0), status || 'Pending', comments || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/reimburse/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, full_name, role, date, description, amount, status, comments } = req.body || {};
    const resolvedId = await financeResolveEmployeeId({ employee_id, full_name, role });
    if (!resolvedId) return res.status(400).json({ error: 'employee is required' });
    const result = await pool.query(`
      UPDATE finance_reimbursements
      SET employee_id=$1, date=$2, description=$3, amount=$4, status=$5, comments=$6, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [resolvedId, date, description || '', Number(amount || 0), status || 'Pending', comments || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/budget', ensureFinanceAccess, async (req, res) => {
  try {
    const params = [`%${String(req.query.search || '').trim()}%`];
    const status = String(req.query.status || '').trim();
    const statusSql = status ? ` AND br.status=$2` : '';
    if (status) params.push(status);
    const result = await pool.query(`
      SELECT br.id, br.requested_by,
             COALESCE(u.full_name, u.email, 'Unknown') AS name,
             COALESCE(u.full_name, u.email, 'Unknown') AS employee_name,
             u.role AS role, u.role AS roles,
             'Budget Request' AS request_type,
             br.request_date AS date,
             br.justification AS description,
             br.requested_amount AS amount, br.status, br.remarks AS comments,
             br.title, br.department_project, br.date_needed, br.supporting_file, br.supporting_file_name,
             br.created_at, br.updated_at
      FROM budget_requests br
      LEFT JOIN users u ON u.id=br.requested_by
      WHERE (COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(br.title,'') ILIKE $1 OR COALESCE(br.justification,'') ILIKE $1)
      ${statusSql}
      ORDER BY br.created_at DESC, br.id DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/budget/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT br.*, COALESCE(u.full_name, u.email, 'Unknown') AS employee_name, u.role
      FROM budget_requests br
      LEFT JOIN users u ON u.id=br.requested_by
      WHERE br.id=$1
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Budget request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/budget', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, full_name, role, date, description, amount, status, comments } = req.body || {};
    const resolvedId = await financeResolveEmployeeId({ employee_id, full_name, role });
    if (!resolvedId) return res.status(400).json({ error: 'employee is required' });
    const result = await pool.query(`
      INSERT INTO finance_budget_requests (employee_id, date, description, amount, status, comments)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [resolvedId, date || new Date().toISOString().slice(0, 10), description || '', Number(amount || 0), status || 'Pending', comments || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/budget/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, full_name, role, date, description, amount, status, comments } = req.body || {};
    const resolvedId = await financeResolveEmployeeId({ employee_id, full_name, role });
    if (!resolvedId) return res.status(400).json({ error: 'employee is required' });
    const result = await pool.query(`
      UPDATE finance_budget_requests
      SET employee_id=$1, date=$2, description=$3, amount=$4, status=$5, comments=$6, updated_at=NOW()
      WHERE id=$7
      RETURNING *
    `, [resolvedId, date, description || '', Number(amount || 0), status || 'Pending', comments || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/employee/:type/:id/action', ensureFinanceAccess, async (req, res) => {
  const table = req.params.type === 'reimburse'
    ? 'reimbursement_requests'
    : req.params.type === 'budget'
      ? 'budget_requests'
      : req.params.type === 'salary' || req.params.type === 'salary-advances'
        ? 'salary_advance_requests'
        : req.params.type === 'salary-increase'
          ? 'salary_increase_requests'
          : null;
  if (!table) return res.status(404).json({ error: 'Employee request type not found' });
  try {
    const { status, comment, comments } = req.body || {};
    const normalizedStatus = status === 'Decline' ? 'Rejected' : status;
    const allowedStatuses = new Set(['Pending', 'Approved', 'Rejected', 'Cancelled']);
    if (normalizedStatus && !allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (!normalizedStatus && comment === undefined && comments === undefined) {
      return res.status(400).json({ error: 'status or comments is required' });
    }
    const nextComment = comment !== undefined ? comment : comments;
    const setParts = [];
    const values = [];
    if (normalizedStatus) {
      values.push(normalizedStatus);
      setParts.push(`status=$${values.length}`);
    }
    if (nextComment !== undefined) {
      values.push(String(nextComment || '').trim() || null);
      setParts.push(`remarks=$${values.length}`);
    }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE ${table} SET ${setParts.join(', ')}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-increase-requests', ensureFinanceAccess, async (req, res) => {
  try {
    const q = `%${String(req.query.search || '').trim()}%`;
    const status = String(req.query.status || '').trim();
    const params = [q];
    const statusSql = status ? ` AND sir.status=$2` : '';
    if (status) params.push(status);
    const result = await pool.query(`
      SELECT sir.id, sir.requested_by, COALESCE(u.full_name, u.email, 'Unknown') AS employee_name,
             sir.department, sir.current_salary, sir.requested_salary, sir.effective_date,
             sir.justification, sir.request_date, sir.status, sir.remarks, sir.created_at, sir.updated_at
      FROM salary_increase_requests sir
      LEFT JOIN users u ON u.id=sir.requested_by
      WHERE (COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(sir.justification,'') ILIKE $1)
      ${statusSql}
      ORDER BY sir.created_at DESC, sir.id DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-increase-requests/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sir.*, COALESCE(u.full_name, u.email, 'Unknown') AS employee_name
      FROM salary_increase_requests sir
      LEFT JOIN users u ON u.id=sir.requested_by
      WHERE sir.id=$1
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary increase request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-advances', ensureFinanceAccess, async (req, res) => {
  try {
    const params = [`%${String(req.query.search || '').trim()}%`];
    const status = String(req.query.status || '').trim();
    const statusSql = status ? ` AND sa.status=$2` : '';
    if (status) params.push(status);
    const result = await pool.query(`
      SELECT sa.id, sa.requested_by,
             COALESCE(u.full_name, u.email, 'Unknown') AS name,
             COALESCE(u.full_name, u.email, 'Unknown') AS employee_name,
             u.role AS role, u.role AS roles,
             'Salary Advance Request' AS request_type,
             sa.request_date AS date,
             sa.reason AS description,
             sa.requested_amount AS amount,
             sa.requested_amount AS amount_borrowed,
             sa.status, sa.remarks,
             sa.deduction_start_date, sa.deduction_terms, sa.supporting_file, sa.supporting_file_name,
             sa.created_at, sa.updated_at
      FROM salary_advance_requests sa
      LEFT JOIN users u ON u.id=sa.requested_by
      WHERE (COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(sa.reason,'') ILIKE $1)
      ${statusSql}
      ORDER BY sa.created_at DESC, sa.id DESC
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-advances/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sa.*, COALESCE(u.full_name, u.email, 'Unknown') AS employee_name, u.role
      FROM salary_advance_requests sa
      LEFT JOIN users u ON u.id=sa.requested_by
      WHERE sa.id=$1
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary advance request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/salary-advances', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, full_name, amount_borrowed, remaining_balance, date_borrowed, status } = req.body || {};
    const resolvedId = await financeResolveEmployeeId({ employee_id, full_name });
    if (!resolvedId) return res.status(400).json({ error: 'employee is required' });
    const borrowed = Number(amount_borrowed || 0);
    const result = await pool.query(`
      INSERT INTO finance_salary_advances (employee_id, amount_borrowed, remaining_balance, date_borrowed, status)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [resolvedId, borrowed, Number(remaining_balance || borrowed), date_borrowed || new Date().toISOString().slice(0, 10), status || 'Pending']);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/salary-advances/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, full_name, amount_borrowed, remaining_balance, date_borrowed, status } = req.body || {};
    const resolvedId = await financeResolveEmployeeId({ employee_id, full_name });
    if (!resolvedId) return res.status(400).json({ error: 'employee is required' });
    const result = await pool.query(`
      UPDATE finance_salary_advances
      SET employee_id=$1, amount_borrowed=$2, remaining_balance=$3, date_borrowed=$4, status=$5, updated_at=NOW()
      WHERE id=$6
      RETURNING *
    `, [resolvedId, Number(amount_borrowed || 0), Number(remaining_balance || 0), date_borrowed, status || 'Pending', req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary advance not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/salary-advances/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_salary_advances WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary advance not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-advances/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, advance_id, amount_paid, date, status
      FROM finance_salary_advance_payments
      WHERE advance_id=$1
      ORDER BY date DESC, id DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/salary-advances/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const amount = Number(req.body?.amount_paid || 0);
    if (amount <= 0) return res.status(400).json({ error: 'amount_paid must be positive' });
    const result = await pool.query(`
      INSERT INTO finance_salary_advance_payments (advance_id, amount_paid, date, status)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `, [req.params.id, amount, req.body?.date || new Date().toISOString().slice(0, 10), req.body?.status || 'Paid']);
    await pool.query(`UPDATE finance_salary_advances SET remaining_balance=GREATEST(remaining_balance - $1, 0) WHERE id=$2`, [amount, req.params.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/salary-payments/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const existing = await pool.query(`SELECT advance_id, amount_paid FROM finance_salary_advance_payments WHERE id=$1`, [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Salary payment not found' });
    await pool.query(`DELETE FROM finance_salary_advance_payments WHERE id=$1`, [req.params.id]);
    await pool.query(`UPDATE finance_salary_advances SET remaining_balance=remaining_balance + $1 WHERE id=$2`, [existing.rows[0].amount_paid, existing.rows[0].advance_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/employee-salary', ensureFinanceAccess, async (req, res) => {
  try {
    const q = `%${String(req.query.search || '').trim()}%`;
    const result = await pool.query(`
      SELECT es.id, es.employee_id, e.full_name AS employee_name,
             p.title AS position, d.name AS department,
             es.current_salary, es.date, es.period_start, es.period_end
      FROM finance_employee_salaries es
      JOIN finance_employees e ON e.id=es.employee_id
      LEFT JOIN finance_positions p ON p.id=e.position_id
      LEFT JOIN finance_departments d ON d.id=e.department_id
      WHERE e.full_name ILIKE $1 OR COALESCE(p.title,'') ILIKE $1 OR COALESCE(d.name,'') ILIKE $1
      ORDER BY es.date DESC, es.id DESC
    `, [q]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/employee-salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM finance_employee_salaries WHERE id=$1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Employee salary not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/employee-salary', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, current_salary, date, period_start, period_end } = req.body || {};
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    const employee = await pool.query(`
      SELECT e.full_name, p.title AS position, d.name AS department
      FROM finance_employees e
      LEFT JOIN finance_positions p ON p.id=e.position_id
      LEFT JOIN finance_departments d ON d.id=e.department_id
      WHERE e.id=$1
    `, [employee_id]);
    if (!employee.rowCount) return res.status(404).json({ error: 'Employee not found' });
    const emp = employee.rows[0];
    const result = await pool.query(`
      INSERT INTO finance_employee_salaries (employee_id, employee_name, position, department, current_salary, salary_date, date, period_start, period_end)
      VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)
      RETURNING *
    `, [employee_id, emp.full_name, emp.position || null, emp.department || null, Number(current_salary || 0), date || new Date().toISOString().slice(0, 10), period_start || null, period_end || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/employee-salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_id, current_salary, date, period_start, period_end } = req.body || {};
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    const employee = await pool.query(`
      SELECT e.full_name, p.title AS position, d.name AS department
      FROM finance_employees e
      LEFT JOIN finance_positions p ON p.id=e.position_id
      LEFT JOIN finance_departments d ON d.id=e.department_id
      WHERE e.id=$1
    `, [employee_id]);
    if (!employee.rowCount) return res.status(404).json({ error: 'Employee not found' });
    const emp = employee.rows[0];
    const result = await pool.query(`
      UPDATE finance_employee_salaries
      SET employee_id=$1, employee_name=$2, position=$3, department=$4, current_salary=$5, salary_date=$6, date=$6, period_start=$7, period_end=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [employee_id, emp.full_name, emp.position || null, emp.department || null, Number(current_salary || 0), date, period_start || null, period_end || null, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Employee salary not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/employee-salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_employee_salaries WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Employee salary not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/reimburse', ensureFinanceAccess, async (req, res) => {
  try {
    const q = `%${String(req.query.search || '').trim()}%`;
    const result = await pool.query(`
      SELECT id, employee_name, role, request_date, description, amount, status, comment
      FROM employee_reimburse_requests
      WHERE employee_name ILIKE $1 OR role ILIKE $1 OR description ILIKE $1
      ORDER BY request_date DESC, id DESC
    `, [q]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/budget', ensureFinanceAccess, async (req, res) => {
  try {
    const q = `%${String(req.query.search || '').trim()}%`;
    const result = await pool.query(`
      SELECT id, employee_name, role, request_date, description, amount, status, comment
      FROM employee_budget_requests
      WHERE employee_name ILIKE $1 OR role ILIKE $1 OR description ILIKE $1
      ORDER BY request_date DESC, id DESC
    `, [q]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/employee/:type/:id/action', ensureFinanceAccess, async (req, res) => {
  const table = req.params.type === 'reimburse'
    ? 'employee_reimburse_requests'
    : req.params.type === 'budget'
      ? 'employee_budget_requests'
      : null;
  if (!table) return res.status(404).json({ error: 'Employee request type not found' });
  try {
    const { status, comment } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });
    const result = await pool.query(
      `UPDATE ${table} SET status=$1, comment=$2 WHERE id=$3 RETURNING *`,
      [status, comment || null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary', ensureFinanceAccess, async (req, res) => {
  try {
    const q = `%${String(req.query.search || '').trim()}%`;
    const result = await pool.query(`
      SELECT id, employee_name, advance_amount, balance, advance_date, status
      FROM employee_salary_advances
      WHERE employee_name ILIKE $1
      ORDER BY advance_date DESC, id DESC
    `, [q]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM employee_salary_advances WHERE id=$1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary advance not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/salary', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_name, advance_amount, balance, advance_date, status } = req.body || {};
    if (!employee_name?.trim()) return res.status(400).json({ error: 'employee_name is required' });
    const result = await pool.query(`
      INSERT INTO employee_salary_advances (employee_name, advance_amount, balance, advance_date, status)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [
      employee_name.trim(),
      Number(advance_amount || 0),
      Number(balance || 0),
      advance_date || new Date().toISOString().slice(0, 10),
      status || 'Pending'
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_name, advance_amount, balance, advance_date, status } = req.body || {};
    if (!employee_name?.trim()) return res.status(400).json({ error: 'employee_name is required' });
    const result = await pool.query(`
      UPDATE employee_salary_advances
      SET employee_name=$1, advance_amount=$2, balance=$3, advance_date=$4, status=$5
      WHERE id=$6
      RETURNING *
    `, [
      employee_name.trim(),
      Number(advance_amount || 0),
      Number(balance || 0),
      advance_date || new Date().toISOString().slice(0, 10),
      status || 'Pending',
      req.params.id
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary advance not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM employee_salary_advances WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Salary advance not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, advance_id, amount_paid, date, status
      FROM employee_salary_advance_payments
      WHERE advance_id=$1
      ORDER BY date DESC, id DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/salary/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const amount = Number(req.body?.amount_paid || 0);
    if (amount <= 0) return res.status(400).json({ error: 'amount_paid must be positive' });
    const result = await pool.query(`
      INSERT INTO employee_salary_advance_payments (advance_id, amount_paid, date, status)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `, [req.params.id, amount, req.body?.date || new Date().toISOString().slice(0, 10), req.body?.status || 'Pending']);
    await pool.query(`
      UPDATE employee_salary_advances
      SET balance=GREATEST(balance - $1, 0)
      WHERE id=$2
    `, [amount, req.params.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/salary/payments/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const existing = await pool.query(`SELECT advance_id, amount_paid FROM employee_salary_advance_payments WHERE id=$1`, [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Salary payment not found' });
    const row = existing.rows[0];
    await pool.query(`DELETE FROM employee_salary_advance_payments WHERE id=$1`, [req.params.id]);
    await pool.query(`UPDATE employee_salary_advances SET balance=balance + $1 WHERE id=$2`, [row.amount_paid, row.advance_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/salary-advances/:id/payments', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, advance_id, amount_paid, date, status
      FROM employee_salary_advance_payments
      WHERE advance_id=$1
      ORDER BY date DESC, id DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/employee-salary', ensureFinanceAccess, async (req, res) => {
  try {
    const q = `%${String(req.query.search || '').trim()}%`;
    const result = await pool.query(`
      SELECT id, employee_name, position, department, current_salary, salary_date, period_start, period_end, status
      FROM finance_employee_salaries
      WHERE employee_name ILIKE $1 OR COALESCE(position, '') ILIKE $1 OR COALESCE(department, '') ILIKE $1
      ORDER BY salary_date DESC, id DESC
    `, [q]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/employee-salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM finance_employee_salaries WHERE id=$1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Employee salary not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/employee-salary', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_name, position, department, current_salary, salary_date, period_start, period_end, status } = req.body || {};
    if (!employee_name?.trim()) return res.status(400).json({ error: 'employee_name is required' });
    const result = await pool.query(`
      INSERT INTO finance_employee_salaries (employee_name, position, department, current_salary, salary_date, period_start, period_end, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      employee_name.trim(),
      position || null,
      department || null,
      Number(current_salary || 0),
      salary_date || new Date().toISOString().slice(0, 10),
      period_start || null,
      period_end || null,
      status || 'Active'
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/employee-salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const { employee_name, position, department, current_salary, salary_date, period_start, period_end, status } = req.body || {};
    if (!employee_name?.trim()) return res.status(400).json({ error: 'employee_name is required' });
    const result = await pool.query(`
      UPDATE finance_employee_salaries
      SET employee_name=$1, position=$2, department=$3, current_salary=$4, salary_date=$5, period_start=$6, period_end=$7, status=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING *
    `, [
      employee_name.trim(),
      position || null,
      department || null,
      Number(current_salary || 0),
      salary_date || new Date().toISOString().slice(0, 10),
      period_start || null,
      period_end || null,
      status || 'Active',
      req.params.id
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Employee salary not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/employee-salary/:id', ensureFinanceAccess, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM finance_employee_salaries WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Employee salary not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
function getLettersModule(req) {
  const raw = String(req.query?.module || req.body?.module || '').toLowerCase();
  return raw === 'finance' ? 'finance' : 'noc';
}

function getLettersUploadDir(moduleName) {
  return require('path').join(__dirname, 'public', 'uploads', moduleName, 'files');
}

function getLettersRelativePath(moduleName, fileName) {
  return `/uploads/${moduleName}/files/${fileName}`;
}

const lettersUpload = multer ? multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = getLettersUploadDir(getLettersModule(req));
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

/* ── Create download_history table ── */
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS download_history (
        id            SERIAL PRIMARY KEY,
        file_id       INTEGER,
        file_name     TEXT NOT NULL,
        downloaded_by TEXT NOT NULL,
        module        TEXT NOT NULL DEFAULT 'noc',
        downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE IF EXISTS folders ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'noc'`);
    await pool.query(`ALTER TABLE IF EXISTS files ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'noc'`);
    await pool.query(`ALTER TABLE IF EXISTS download_history ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'noc'`);
    console.log('download_history table ready ✅');
  } catch (err) {
    console.error('download_history table error:', err.message);
  }
})();

/* ── GET /api/letters/download-history ── */
app.get('/api/letters/download-history', async (req, res) => {
  const moduleName = getLettersModule(req);
  try {
    const { rows } = await pool.query(
      `SELECT id, file_id, file_name, downloaded_by, downloaded_at
         FROM download_history
        WHERE module = $1
        ORDER BY downloaded_at DESC
        LIMIT 500`,
      [moduleName]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET download-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/letters/download-history ── */
app.post('/api/letters/download-history', async (req, res) => {
  const { file_id, file_name, downloaded_by } = req.body || {};
  const moduleName = getLettersModule(req);
  if (!file_name || !downloaded_by) return res.status(400).json({ error: 'file_name and downloaded_by are required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO download_history (file_id, file_name, downloaded_by, module)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [file_id || null, file_name, downloaded_by, moduleName]
    );
    res.status(201).json({ success: true, row: rows[0] });
  } catch (err) {
    console.error('POST download-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/folders ── */
app.get('/api/letters/folders', async (req, res) => {
  try {
    const moduleName = getLettersModule(req);
    const rawParent = req.query.parent_id;
    const parentId  = (rawParent !== undefined && rawParent !== '') ? parseInt(rawParent) : null;
    if (parentId !== null && isNaN(parentId)) return res.status(400).json({ error: 'Invalid parent_id' });

    let result;
    if (parentId !== null) {
      result = await pool.query(`
        SELECT f.id, f.folder_name, f.parent_id, f.created_at,
               (SELECT COUNT(*)::int FROM files fi WHERE fi.folder_id = f.id AND fi.module = f.module) +
               (SELECT COUNT(*)::int FROM folders sf WHERE sf.parent_id = f.id AND sf.module = f.module) AS file_count
          FROM folders f
         WHERE f.parent_id = $1
           AND f.id != $1
           AND f.module = $2
         ORDER BY f.folder_name
      `, [parentId, moduleName]);
    } else {
      result = await pool.query(`
        SELECT f.id, f.folder_name, f.parent_id, f.created_at,
               (SELECT COUNT(*)::int FROM files fi WHERE fi.folder_id = f.id AND fi.module = f.module) +
               (SELECT COUNT(*)::int FROM folders sf WHERE sf.parent_id = f.id AND sf.module = f.module) AS file_count
          FROM folders f
         WHERE f.parent_id IS NULL
           AND f.module = $1
         ORDER BY f.folder_name
      `, [moduleName]);
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
  const moduleName = getLettersModule(req);
  if (!folder_name?.trim()) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO folders (folder_name, parent_id, module) VALUES ($1, $2, $3) RETURNING *`,
      [folder_name.trim(), parent_id, moduleName]
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
  const moduleName = getLettersModule(req);
  if (!folder_name?.trim()) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `UPDATE folders SET folder_name = $1 WHERE id = $2 AND module = $3 RETURNING *`,
      [folder_name.trim(), id, moduleName]
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
  const moduleName = getLettersModule(req);
  try {
    const result = await pool.query(`DELETE FROM folders WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/folders/:id/files ── */
app.get('/api/letters/folders/:id/files', async (req, res) => {
  const id = parseInt(req.params.id);
  const moduleName = getLettersModule(req);
  const q  = req.query.q ? `%${req.query.q}%` : null;
  try {
    const result = await pool.query(
      `SELECT * FROM files
        WHERE folder_id = $1 AND module = $2 ${q ? 'AND file_name ILIKE $3' : ''}
        ORDER BY created_at DESC`,
      q ? [id, moduleName, q] : [id, moduleName]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/uploaders ── */
app.get('/api/letters/uploaders', async (req, res) => {
  const moduleName = getLettersModule(req);
  try {
    const result = await pool.query(
      `SELECT DISTINCT uploader_name FROM files WHERE module = $1 AND uploader_name IS NOT NULL ORDER BY uploader_name`,
      [moduleName]
    );
    res.json(result.rows.map(r => r.uploader_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/letters/files/recent ── */
app.get('/api/letters/files/recent', async (req, res) => {
  const moduleName = getLettersModule(req);
  try {
    const result = await pool.query(`SELECT * FROM files WHERE module = $1 ORDER BY created_at DESC LIMIT 8`, [moduleName]);
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
    const moduleName = getLettersModule(req);
    if (!folder_id) return res.status(400).json({ error: 'folder_id is required' });
    if (!req.file)  return res.status(400).json({ error: 'No file received' });
    const file_path = getLettersRelativePath(moduleName, req.file.filename);
    const file_size = req.file.size;
    const file_name = req.file.originalname;
    const ext = require('path').extname(file_name).toLowerCase().replace('.', '');
    const mimeMap = { pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', txt: 'text', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', zip: 'archive', rar: 'archive', mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video' };
    const file_type = mimeMap[ext] || ext || req.file.mimetype.split('/')[1]?.slice(0, 50) || 'file';
    try {
      const folderCheck = await pool.query(`SELECT id FROM folders WHERE id = $1 AND module = $2`, [parseInt(folder_id), moduleName]);
      if (!folderCheck.rowCount) return res.status(404).json({ error: 'Folder not found' });
      const result = await pool.query(
        `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, module, last_access)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
        [parseInt(folder_id), uploader_name || null, file_name, file_path, file_size, file_type, moduleName]
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
  const moduleName = getLettersModule(req);
  if (!file_name?.trim()) return res.status(400).json({ error: 'file_name is required' });
  try {
    const result = await pool.query(
      `UPDATE files SET file_name = $1 WHERE id = $2 AND module = $3 RETURNING *`,
      [file_name.trim(), id, moduleName]
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
  const moduleName = getLettersModule(req);
  try {
    const { rows } = await pool.query(`SELECT file_path FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    await pool.query(`DELETE FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
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
  const moduleName = getLettersModule(req);
  const downloadedBy = req.query.user || 'Unknown';
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const f        = rows[0];
    const filePath = require('path').join(__dirname, 'public', f.file_path);
    await pool.query(`UPDATE files SET last_access = NOW() WHERE id = $1 AND module = $2`, [id, moduleName]);
    // Log download history (fire-and-forget)
    pool.query(
      `INSERT INTO download_history (file_id, file_name, downloaded_by, module) VALUES ($1, $2, $3, $4)`,
      [id, f.file_name, downloadedBy, moduleName]
    ).catch(() => {});
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
  const moduleName = getLettersModule(req);
  if (!target_folder_id) return res.status(400).json({ error: 'target_folder_id is required' });
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const folderCheck = await pool.query(`SELECT id FROM folders WHERE id = $1 AND module = $2`, [parseInt(target_folder_id), moduleName]);
    if (!folderCheck.rowCount) return res.status(404).json({ error: 'Target folder not found' });
    const f = rows[0];
    const fs   = require('fs');
    const path = require('path');
    const ext  = path.extname(f.file_name);
    const base = path.basename(f.file_name, ext).replace(/\s*\(copy.*\)$/, '').trimEnd();
    const newFileName = `${base} (copy)${ext}`;
    const oldPath = path.join(__dirname, 'public', f.file_path);
    const newFile = `${Date.now()}_${path.basename(f.file_path)}`;
    const newRelPath = getLettersRelativePath(moduleName, newFile);
    const newAbsPath = path.join(__dirname, 'public', newRelPath);
    fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
    fs.copyFileSync(oldPath, newAbsPath);
    const result = await pool.query(
      `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, module)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [parseInt(target_folder_id), f.uploader_name, newFileName, newRelPath, f.file_size, f.file_type, moduleName]
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
  const moduleName = getLettersModule(req);
  if (!target_parent_id) return res.status(400).json({ error: 'target_parent_id is required' });
  try {
    const { rows: folderRows } = await pool.query(`SELECT * FROM folders WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });
    const targetCheck = await pool.query(`SELECT id FROM folders WHERE id = $1 AND module = $2`, [parseInt(target_parent_id), moduleName]);
    if (!targetCheck.rowCount) return res.status(404).json({ error: 'Target folder not found' });
    const srcFolder = folderRows[0];
    const newName = srcFolder.folder_name + ' (copy)';
    const { rows: newFolderRows } = await pool.query(
      `INSERT INTO folders (folder_name, parent_id, module) VALUES ($1, $2, $3) RETURNING *`,
      [newName, parseInt(target_parent_id), moduleName]
    );
    const newFolderId = newFolderRows[0].id;
    const { rows: files } = await pool.query(`SELECT * FROM files WHERE folder_id = $1 AND module = $2`, [id, moduleName]);
    const fs   = require('fs');
    const path = require('path');
    for (const f of files) {
      try {
        const newFile    = `${Date.now()}_${path.basename(f.file_path)}`;
        const newRelPath = getLettersRelativePath(moduleName, newFile);
        const newAbsPath = path.join(__dirname, 'public', newRelPath);
        const oldAbsPath = path.join(__dirname, 'public', f.file_path);
        fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
        fs.copyFileSync(oldAbsPath, newAbsPath);
        await pool.query(
          `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, module)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newFolderId, f.uploader_name, f.file_name, newRelPath, f.file_size, f.file_type, moduleName]
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
  const moduleName = getLettersModule(req);
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
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


/* ================= FINANCE FILES API =================
   Finance-specific route surface for the Files module.
   Data is restricted to module = 'finance'.
*/
/* ── GET /api/finance/files/download-history ── */
app.get('/api/finance/files/download-history', async (req, res) => {
  const moduleName = 'finance';
  try {
    const { rows } = await pool.query(
      `SELECT id, file_id, file_name, downloaded_by, downloaded_at
         FROM download_history
        WHERE module = $1
        ORDER BY downloaded_at DESC
        LIMIT 500`,
      [moduleName]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET download-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/finance/files/download-history ── */
app.post('/api/finance/files/download-history', async (req, res) => {
  const { file_id, file_name, downloaded_by } = req.body || {};
  const moduleName = 'finance';
  if (!file_name || !downloaded_by) return res.status(400).json({ error: 'file_name and downloaded_by are required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO download_history (file_id, file_name, downloaded_by, module)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [file_id || null, file_name, downloaded_by, moduleName]
    );
    res.status(201).json({ success: true, row: rows[0] });
  } catch (err) {
    console.error('POST download-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/finance/files/folders ── */
app.get('/api/finance/files/folders', async (req, res) => {
  try {
    const moduleName = 'finance';
    const rawParent = req.query.parent_id;
    const parentId  = (rawParent !== undefined && rawParent !== '') ? parseInt(rawParent) : null;
    if (parentId !== null && isNaN(parentId)) return res.status(400).json({ error: 'Invalid parent_id' });

    let result;
    if (parentId !== null) {
      result = await pool.query(`
        SELECT f.id, f.folder_name, f.parent_id, f.created_at,
               (SELECT COUNT(*)::int FROM files fi WHERE fi.folder_id = f.id AND fi.module = f.module) +
               (SELECT COUNT(*)::int FROM folders sf WHERE sf.parent_id = f.id AND sf.module = f.module) AS file_count
          FROM folders f
         WHERE f.parent_id = $1
           AND f.id != $1
           AND f.module = $2
         ORDER BY f.folder_name
      `, [parentId, moduleName]);
    } else {
      result = await pool.query(`
        SELECT f.id, f.folder_name, f.parent_id, f.created_at,
               (SELECT COUNT(*)::int FROM files fi WHERE fi.folder_id = f.id AND fi.module = f.module) +
               (SELECT COUNT(*)::int FROM folders sf WHERE sf.parent_id = f.id AND sf.module = f.module) AS file_count
          FROM folders f
         WHERE f.parent_id IS NULL
           AND f.module = $1
         ORDER BY f.folder_name
      `, [moduleName]);
    }
    res.json(result.rows);
  } catch (err) {
    console.error('GET folders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/finance/files/folders ── */
app.post('/api/finance/files/folders', async (req, res) => {
  const { folder_name, parent_id = null } = req.body || {};
  const moduleName = 'finance';
  if (!folder_name?.trim()) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO folders (folder_name, parent_id, module) VALUES ($1, $2, $3) RETURNING *`,
      [folder_name.trim(), parent_id, moduleName]
    );
    res.status(201).json({ success: true, folder: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists' });
    console.error('POST folders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /api/finance/files/folders/:id ── */
app.put('/api/finance/files/folders/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { folder_name } = req.body || {};
  const moduleName = 'finance';
  if (!folder_name?.trim()) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `UPDATE folders SET folder_name = $1 WHERE id = $2 AND module = $3 RETURNING *`,
      [folder_name.trim(), id, moduleName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, folder: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists' });
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /api/finance/files/folders/:id ── */
app.delete('/api/finance/files/folders/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const moduleName = 'finance';
  try {
    const result = await pool.query(`DELETE FROM folders WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/finance/files/folders/:id/files ── */
app.get('/api/finance/files/folders/:id/files', async (req, res) => {
  const id = parseInt(req.params.id);
  const moduleName = 'finance';
  const q  = req.query.q ? `%${req.query.q}%` : null;
  try {
    const result = await pool.query(
      `SELECT * FROM files
        WHERE folder_id = $1 AND module = $2 ${q ? 'AND file_name ILIKE $3' : ''}
        ORDER BY created_at DESC`,
      q ? [id, moduleName, q] : [id, moduleName]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/finance/files/uploaders ── */
app.get('/api/finance/files/uploaders', async (req, res) => {
  const moduleName = 'finance';
  try {
    const result = await pool.query(
      `SELECT DISTINCT uploader_name FROM files WHERE module = $1 AND uploader_name IS NOT NULL ORDER BY uploader_name`,
      [moduleName]
    );
    res.json(result.rows.map(r => r.uploader_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/finance/files/files/recent ── */
app.get('/api/finance/files/files/recent', async (req, res) => {
  const moduleName = 'finance';
  try {
    const result = await pool.query(`SELECT * FROM files WHERE module = $1 ORDER BY created_at DESC LIMIT 8`, [moduleName]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/finance/files/files  (multipart upload) ── */
app.post('/api/finance/files/files', (req, res, next) => {
  if (!lettersUpload) return res.status(500).json({ error: 'multer not installed — run: npm install multer' });
  lettersUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { folder_id, uploader_name } = req.body || {};
    const moduleName = 'finance';
    if (!folder_id) return res.status(400).json({ error: 'folder_id is required' });
    if (!req.file)  return res.status(400).json({ error: 'No file received' });
    const file_path = getLettersRelativePath(moduleName, req.file.filename);
    const file_size = req.file.size;
    const file_name = req.file.originalname;
    const ext = require('path').extname(file_name).toLowerCase().replace('.', '');
    const mimeMap = { pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', txt: 'text', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', zip: 'archive', rar: 'archive', mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video' };
    const file_type = mimeMap[ext] || ext || req.file.mimetype.split('/')[1]?.slice(0, 50) || 'file';
    try {
      const folderCheck = await pool.query(`SELECT id FROM folders WHERE id = $1 AND module = $2`, [parseInt(folder_id), moduleName]);
      if (!folderCheck.rowCount) return res.status(404).json({ error: 'Folder not found' });
      const result = await pool.query(
        `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, module, last_access)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
        [parseInt(folder_id), uploader_name || null, file_name, file_path, file_size, file_type, moduleName]
      );
      res.status(201).json({ success: true, file: result.rows[0] });
    } catch (dbErr) {
      res.status(500).json({ error: dbErr.message });
    }
  });
});

/* ── PUT /api/finance/files/files/:id ── */
app.put('/api/finance/files/files/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { file_name } = req.body || {};
  const moduleName = 'finance';
  if (!file_name?.trim()) return res.status(400).json({ error: 'file_name is required' });
  try {
    const result = await pool.query(
      `UPDATE files SET file_name = $1 WHERE id = $2 AND module = $3 RETURNING *`,
      [file_name.trim(), id, moduleName]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true, file: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /api/finance/files/files/:id ── */
app.delete('/api/finance/files/files/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const moduleName = 'finance';
  try {
    const { rows } = await pool.query(`SELECT file_path FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    await pool.query(`DELETE FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
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

/* ── GET /api/finance/files/files/:id/download ── */
app.get('/api/finance/files/files/:id/download', async (req, res) => {
  const id = parseInt(req.params.id);
  const moduleName = 'finance';
  const downloadedBy = req.query.user || 'Unknown';
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const f        = rows[0];
    const filePath = require('path').join(__dirname, 'public', f.file_path);
    await pool.query(`UPDATE files SET last_access = NOW() WHERE id = $1 AND module = $2`, [id, moduleName]);
    // Log download history (fire-and-forget)
    pool.query(
      `INSERT INTO download_history (file_id, file_name, downloaded_by, module) VALUES ($1, $2, $3, $4)`,
      [id, f.file_name, downloadedBy, moduleName]
    ).catch(() => {});
    res.download(filePath, f.file_name, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found on disk' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/finance/files/files/:id/copy ── */
app.post('/api/finance/files/files/:id/copy', async (req, res) => {
  const id = parseInt(req.params.id);
  const { target_folder_id } = req.body || {};
  const moduleName = 'finance';
  if (!target_folder_id) return res.status(400).json({ error: 'target_folder_id is required' });
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const folderCheck = await pool.query(`SELECT id FROM folders WHERE id = $1 AND module = $2`, [parseInt(target_folder_id), moduleName]);
    if (!folderCheck.rowCount) return res.status(404).json({ error: 'Target folder not found' });
    const f = rows[0];
    const fs   = require('fs');
    const path = require('path');
    const ext  = path.extname(f.file_name);
    const base = path.basename(f.file_name, ext).replace(/\s*\(copy.*\)$/, '').trimEnd();
    const newFileName = `${base} (copy)${ext}`;
    const oldPath = path.join(__dirname, 'public', f.file_path);
    const newFile = `${Date.now()}_${path.basename(f.file_path)}`;
    const newRelPath = getLettersRelativePath(moduleName, newFile);
    const newAbsPath = path.join(__dirname, 'public', newRelPath);
    fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
    fs.copyFileSync(oldPath, newAbsPath);
    const result = await pool.query(
      `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, module)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [parseInt(target_folder_id), f.uploader_name, newFileName, newRelPath, f.file_size, f.file_type, moduleName]
    );
    res.status(201).json({ success: true, file: result.rows[0] });
  } catch (err) {
    console.error('Copy file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/finance/files/folders/:id/copy ── */
app.post('/api/finance/files/folders/:id/copy', async (req, res) => {
  const id = parseInt(req.params.id);
  const { target_parent_id } = req.body || {};
  const moduleName = 'finance';
  if (!target_parent_id) return res.status(400).json({ error: 'target_parent_id is required' });
  try {
    const { rows: folderRows } = await pool.query(`SELECT * FROM folders WHERE id = $1 AND module = $2`, [id, moduleName]);
    if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });
    const targetCheck = await pool.query(`SELECT id FROM folders WHERE id = $1 AND module = $2`, [parseInt(target_parent_id), moduleName]);
    if (!targetCheck.rowCount) return res.status(404).json({ error: 'Target folder not found' });
    const srcFolder = folderRows[0];
    const newName = srcFolder.folder_name + ' (copy)';
    const { rows: newFolderRows } = await pool.query(
      `INSERT INTO folders (folder_name, parent_id, module) VALUES ($1, $2, $3) RETURNING *`,
      [newName, parseInt(target_parent_id), moduleName]
    );
    const newFolderId = newFolderRows[0].id;
    const { rows: files } = await pool.query(`SELECT * FROM files WHERE folder_id = $1 AND module = $2`, [id, moduleName]);
    const fs   = require('fs');
    const path = require('path');
    for (const f of files) {
      try {
        const newFile    = `${Date.now()}_${path.basename(f.file_path)}`;
        const newRelPath = getLettersRelativePath(moduleName, newFile);
        const newAbsPath = path.join(__dirname, 'public', newRelPath);
        const oldAbsPath = path.join(__dirname, 'public', f.file_path);
        fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
        fs.copyFileSync(oldAbsPath, newAbsPath);
        await pool.query(
          `INSERT INTO files (folder_id, uploader_name, file_name, file_path, file_size, file_type, module)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newFolderId, f.uploader_name, f.file_name, newRelPath, f.file_size, f.file_type, moduleName]
        );
      } catch { /* skip files that can't be copied */ }
    }
    res.status(201).json({ success: true, folder_id: newFolderId, folder_name: newName });
  } catch (err) {
    console.error('Copy folder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/finance/files/files/:id/preview ── */
app.get('/api/finance/files/files/:id/preview', async (req, res) => {
  const id = parseInt(req.params.id);
  const moduleName = 'finance';
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id = $1 AND module = $2`, [id, moduleName]);
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
        extra_data  JSONB,
        created_by  INT REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_projects (
        id         SERIAL PRIMARY KEY,
        name       CITEXT NOT NULL UNIQUE,
        columns    JSONB  NOT NULL DEFAULT '[{"key":"mir","label":"MIR","enabled":true},{"key":"ticket","label":"Ticket","enabled":true},{"key":"sla","label":"SLA","enabled":true}]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS regional_progress_reports (
        id          SERIAL PRIMARY KEY,
        region      CITEXT NOT NULL,
        date_start  DATE,
        date_end    DATE,
        project_id  INT REFERENCES report_projects(id) ON DELETE CASCADE,
        report_id   INT REFERENCES other_data(id) ON DELETE CASCADE
      )
    `);

    const safeAlter = [
      `ALTER TABLE other_data ADD COLUMN IF NOT EXISTS extra_data JSONB`,
      `ALTER TABLE regional_progress_reports ADD COLUMN IF NOT EXISTS date_start DATE`,
      `ALTER TABLE regional_progress_reports ADD COLUMN IF NOT EXISTS date_end DATE`,
      `ALTER TABLE regional_progress_reports ADD COLUMN IF NOT EXISTS project_id INT REFERENCES report_projects(id) ON DELETE CASCADE`,
      `ALTER TABLE regional_progress_reports DROP COLUMN IF EXISTS deadline`,
    ];
    for (const sql of safeAlter) {
      try { await pool.query(sql); } catch(e) {}
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_history (
        id            SERIAL PRIMARY KEY,
        region_id     INT REFERENCES regional_progress_reports(id) ON DELETE CASCADE,
        other_data_id INT REFERENCES other_data(id) ON DELETE CASCADE,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`DROP VIEW IF EXISTS regional_progress_view CASCADE`);
    await pool.query(`
      CREATE VIEW regional_progress_view AS
      SELECT r.id, r.region, r.date_start, r.date_end, r.project_id,
             p.name AS project_name, p.columns AS project_columns,
             o.mir, o.ticket, o.sla, o.extra_data,
             ((COALESCE(o.mir,0)+COALESCE(o.ticket,0)+COALESCE(o.sla,0))/3.0)::NUMERIC(5,2) AS progress,
             u.full_name AS created_by, o.date
      FROM regional_progress_reports r
      LEFT JOIN report_projects p ON r.project_id = p.id
      LEFT JOIN other_data o      ON r.report_id  = o.id
      LEFT JOIN users u           ON o.created_by = u.id
    `);

    console.log('Reports schema ready ✅');
  } catch (err) {
    console.error('Reports schema error:', err.message);
  }
})();

// GET all projects
app.get('/api/reports/projects', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM report_projects ORDER BY id ASC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create project
app.post('/api/reports/projects', async (req, res) => {
  const { name, columns } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const defaultCols = [
      { key: 'mir',    label: 'MIR',    enabled: true },
      { key: 'ticket', label: 'Ticket', enabled: true },
      { key: 'sla',    label: 'SLA',    enabled: true },
    ];
    const result = await pool.query(
      `INSERT INTO report_projects (name, columns) VALUES ($1, $2) RETURNING *`,
      [name.trim(), JSON.stringify(columns || defaultCols)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update project
app.put('/api/reports/projects/:id', async (req, res) => {
  const { name, columns } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await pool.query(
      `UPDATE report_projects SET name=$1, columns=$2 WHERE id=$3 RETURNING *`,
      [name.trim(), JSON.stringify(columns || []), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE project
app.delete('/api/reports/projects/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM report_projects WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all reports (filtered by project_id if provided)
app.get('/api/reports', async (req, res) => {
  try {
    const projectId = req.query.project_id ? parseInt(req.query.project_id) : null;
    const params    = projectId ? [projectId] : [];
    const where     = projectId ? 'WHERE r.project_id = $1' : '';
    const result = await pool.query(`
      SELECT r.id, r.region, r.date_start, r.date_end, r.project_id, r.report_id,
             o.mir, o.ticket, o.sla, o.extra_data,
             ((COALESCE(o.mir,0)+COALESCE(o.ticket,0)+COALESCE(o.sla,0))/3.0)::NUMERIC(5,2) AS progress,
             u.full_name AS created_by, o.date AS last_updated
      FROM regional_progress_reports r
      LEFT JOIN other_data o ON r.report_id = o.id
      LEFT JOIN users u      ON o.created_by = u.id
      ${where}
      ORDER BY r.id
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET history for a region
app.get('/api/reports/:regionId/history', async (req, res) => {
  try {
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
  } catch { res.json([]); }
});

// GET reminders (kept for backward compatibility)
app.get('/api/reports/:regionId/reminders', async (req, res) => {
  try {
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
  } catch { res.json([]); }
});

// POST new region
app.post('/api/reports', async (req, res) => {
  const { region, date_start, date_end, project_id } = req.body || {};
  if (!region?.trim()) return res.status(400).json({ error: 'region is required' });
  try {
    const result = await pool.query(
      `INSERT INTO regional_progress_reports (region, date_start, date_end, project_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [region.trim(), date_start || null, date_end || null, project_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update region
app.put('/api/reports/:id', async (req, res) => {
  const { region, date_start, date_end } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE regional_progress_reports SET region=$1, date_start=$2, date_end=$3 WHERE id=$4 RETURNING *`,
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

// POST new update (other_data) — supports dynamic columns via extra_data
app.post('/api/reminders', async (req, res) => {
  const { report_id, created_by, mir, ticket, sla, ...rest } = req.body || {};
  if (!report_id) return res.status(400).json({ error: 'report_id is required' });
  const extraData = Object.keys(rest).length ? rest : null;
  try {
    const odResult = await pool.query(
      `INSERT INTO other_data (mir, ticket, sla, extra_data, created_by, date)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [
        mir    != null ? mir    : null,
        ticket != null ? ticket : null,
        sla    != null ? sla    : null,
        extraData ? JSON.stringify(extraData) : null,
        created_by || null,
      ]
    );
    const newOd = odResult.rows[0];

    await pool.query(
      `INSERT INTO report_history (region_id, other_data_id) VALUES ($1, $2)`,
      [report_id, newOd.id]
    ).catch(() => {});

    await pool.query(
      `UPDATE regional_progress_reports SET report_id=$1 WHERE id=$2`,
      [newOd.id, report_id]
    );

    res.status(201).json(newOd);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── User Settings ────────────────────────────────────────────────────────────

// Safe migration: in-app messaging tables
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS in_app_messages (
        id SERIAL PRIMARY KEY,
        sender_id INT REFERENCES users(id) ON DELETE SET NULL,
        recipient_id INT REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted_by_sender BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted_by_recipient BOOLEAN NOT NULL DEFAULT FALSE,
        parent_message_id INT REFERENCES in_app_messages(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_messages_recipient
      ON in_app_messages (recipient_id, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_in_app_messages_sender
      ON in_app_messages (sender_id, created_at DESC)
    `);

    await pool.query(`
      ALTER TABLE in_app_messages
      ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP
    `);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS group_id TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS group_name TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS recipient_ids TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS group_photo TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS is_group_seed BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_path TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
    await pool.query(`ALTER TABLE in_app_messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_in_app_messages_group ON in_app_messages (group_id, created_at DESC)`);

    console.log('In-app messaging table ready ✅');
  } catch (e) {
    console.error('in-app messaging migration:', e.message);
  }
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

// GET users list (for recipient picker)

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

/* ================= IN-APP MESSAGING ================= */

function getMessagingPresence(userId) {
  const rec = messagingPresence.get(String(userId));
  const lastSeen = rec?.lastSeen || null;
  const isOnline = Boolean(rec?.isOnline && rec.lastSeen && Date.now() - rec.lastSeen.getTime() < PRESENCE_TTL_MS);
  return { user_id: Number(userId), isOnline, lastSeen };
}

// Lightweight polling-backed presence for Messenger-style chat.
app.post('/api/messages/presence', (req, res) => {
  const userId = Number(req.body?.user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });
  messagingPresence.set(String(userId), { isOnline: req.body?.is_online !== false, lastSeen: new Date() });
  res.json(getMessagingPresence(userId));
});

app.post('/api/messages/typing', (req, res) => {
  const senderId = Number(req.body?.sender_id);
  const recipientId = Number(req.body?.recipient_id);
  const isTyping = Boolean(req.body?.is_typing);
  if (!senderId || !recipientId) return res.status(400).json({ error: 'sender_id and recipient_id are required' });

  const key = `${senderId}:${recipientId}`;
  if (isTyping) messagingTyping.set(key, { isTyping: true, updatedAt: new Date() });
  else messagingTyping.delete(key);
  res.json({ isTyping });
});

app.get('/api/messages/realtime', (req, res) => {
  const userId = Number(req.query.user_id);
  const peerId = Number(req.query.peer_id);
  if (!userId || !peerId) return res.status(400).json({ error: 'user_id and peer_id are required' });

  const typingKey = `${peerId}:${userId}`;
  const typing = messagingTyping.get(typingKey);
  const isTyping = Boolean(typing?.isTyping && Date.now() - typing.updatedAt.getTime() < TYPING_TTL_MS);
  if (!isTyping) messagingTyping.delete(typingKey);

  res.json({
    presence: getMessagingPresence(peerId),
    typing: { isTyping, typingUserId: isTyping ? String(peerId) : null }
  });
});

// GET inbox / sent folders
app.get('/api/messages', async (req, res) => {
  const userId = Number(req.query.user_id);
  const folder = String(req.query.folder || 'inbox').trim().toLowerCase();

  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  try {
    let query = '';
    let params = [userId];

    if (folder === 'sent') {
      query = `
        SELECT
          m.id,
          m.subject,
          m.body,
          m.is_read,
          m.parent_message_id,
          m.created_at,
          sender.id AS sender_id,
          sender.full_name AS sender_name,
          sender.email AS sender_email,
          recipient.id AS recipient_id,
          recipient.full_name AS recipient_name,
          recipient.email AS recipient_email
        FROM in_app_messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN users recipient ON recipient.id = m.recipient_id
        WHERE m.sender_id = $1
          AND COALESCE(m.is_deleted_by_sender, FALSE) = FALSE
        ORDER BY m.created_at DESC, m.id DESC
      `;
    } else {
      query = `
        SELECT
          m.id,
          m.subject,
          m.body,
          m.is_read,
          m.parent_message_id,
          m.created_at,
          sender.id AS sender_id,
          sender.full_name AS sender_name,
          sender.email AS sender_email,
          recipient.id AS recipient_id,
          recipient.full_name AS recipient_name,
          recipient.email AS recipient_email
        FROM in_app_messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN users recipient ON recipient.id = m.recipient_id
        WHERE m.recipient_id = $1
          AND COALESCE(m.is_deleted_by_recipient, FALSE) = FALSE
        ORDER BY m.created_at DESC, m.id DESC
      `;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single message
app.get('/api/messages/:id', async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  try {
    const result = await pool.query(
      `
      SELECT
        m.*,
        sender.full_name AS sender_name,
        sender.email AS sender_email,
        recipient.full_name AS recipient_name,
        recipient.email AS recipient_email
      FROM in_app_messages m
      LEFT JOIN users sender ON sender.id = m.sender_id
      LEFT JOIN users recipient ON recipient.id = m.recipient_id
      WHERE m.id = $1
        AND (
          (m.sender_id = $2 AND COALESCE(m.is_deleted_by_sender, FALSE) = FALSE)
          OR
          (m.recipient_id = $2 AND COALESCE(m.is_deleted_by_recipient, FALSE) = FALSE)
        )
      `,
      [req.params.id, userId]
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Message not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/system — sends a self-notification (request submission confirmation)
// Allows sender_id === recipient_id specifically for system/request notifications.
app.post('/api/messages/system', async (req, res) => {
  const { sender_id, recipient_id, subject, body, parent_message_id } = req.body || {};
  const senderIdNum    = Number(sender_id);
  const recipientIdNum = Number(recipient_id);

  if (!senderIdNum || !recipientIdNum || !String(subject || '').trim() || !String(body || '').trim()) {
    return res.status(400).json({ error: 'sender_id, recipient_id, subject, and body are required' });
  }

  try {
    const userCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [senderIdNum]);
    if (!userCheck.rowCount) return res.status(400).json({ error: 'User does not exist.' });

    const result = await pool.query(
      `INSERT INTO in_app_messages (sender_id, recipient_id, subject, body, parent_message_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        senderIdNum,
        recipientIdNum,
        String(subject).trim(),
        String(body).trim(),
        parent_message_id ? Number(parent_message_id) : null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const messageAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'messages');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = String(file.originalname || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, Date.now() + '_' + safe);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.post('/api/messages/with-attachment', messageAttachmentUpload.single('attachment'), async (req, res) => {
  const body = {
    ...req.body,
    body: String(req.body?.body || '').trim() || (req.file ? 'Attachment' : '')
  };
  const senderIdNum = Number(body.sender_id);
  let parsedRecipientIds = [];
  try {
    parsedRecipientIds = body.recipient_ids ? JSON.parse(body.recipient_ids) : [];
  } catch {
    parsedRecipientIds = String(body.recipient_ids || '').split(',');
  }
  const recipientIdList = Array.from(new Set(
    (Array.isArray(parsedRecipientIds) && parsedRecipientIds.length ? parsedRecipientIds : [body.recipient_id])
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0 && id !== senderIdNum)
  ));
  const isGroup = recipientIdList.length > 1 || Boolean(body.group_id);
  if (!senderIdNum || !recipientIdList.length || !req.file) {
    return res.status(400).json({ error: 'sender_id, recipient_id, and attachment are required' });
  }
  try {
    const participantIds = [senderIdNum, ...recipientIdList].sort((a, b) => a - b);
    const filePath = '/uploads/messages/' + req.file.filename;
    const createdAt = new Date();
    const resolvedGroupId = isGroup ? String(body.group_id || `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) : null;
    const resolvedGroupName = isGroup ? String(body.group_name || body.subject || 'Group chat').trim() : null;
    const inserted = [];
    for (const recipientIdNum of recipientIdList) {
      const result = await pool.query(
        `
        INSERT INTO in_app_messages (
          sender_id, recipient_id, subject, body, parent_message_id, group_id, group_name, recipient_ids, group_photo, attachment_name, attachment_path, attachment_type, attachment_size, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        RETURNING *
        `,
        [
          senderIdNum,
          recipientIdNum,
          String(body.subject || 'Chat').trim(),
          body.body,
          body.parent_message_id ? Number(body.parent_message_id) : null,
          resolvedGroupId,
          resolvedGroupName,
          isGroup ? JSON.stringify(participantIds) : null,
          isGroup ? (body.group_photo || null) : null,
          req.file.originalname,
          filePath,
          req.file.mimetype || '',
          req.file.size || null,
          createdAt
        ]
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json(isGroup ? { ...inserted[0], messages: inserted } : inserted[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/groups', async (req, res) => {
  const { creator_id, group_name, member_ids, group_photo } = req.body || {};
  const creatorId = Number(creator_id);
  const memberIds = Array.from(new Set(
    (Array.isArray(member_ids) ? member_ids : [])
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0 && id !== creatorId)
  ));
  const name = String(group_name || '').trim();

  if (!creatorId) return res.status(400).json({ error: 'creator_id is required' });
  if (!name) return res.status(400).json({ error: 'Group name is required' });
  if (memberIds.length < 2) return res.status(400).json({ error: 'Select at least 2 members' });

  try {
    const participantIds = [creatorId, ...memberIds].sort((a, b) => a - b);
    const usersCheck = await pool.query(
      `SELECT id, full_name, email FROM users WHERE id = ANY($1::int[])`,
      [participantIds]
    );
    if (usersCheck.rowCount < participantIds.length) {
      return res.status(400).json({ error: 'One or more group members do not exist.' });
    }

    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date();
    const inserted = [];
    for (const recipientId of memberIds) {
      const result = await pool.query(
        `
        INSERT INTO in_app_messages (
          sender_id, recipient_id, subject, body, group_id, group_name, recipient_ids, group_photo, is_group_seed, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9)
        RETURNING *
        `,
        [
          creatorId,
          recipientId,
          name,
          '',
          groupId,
          name,
          JSON.stringify(participantIds),
          group_photo || null,
          createdAt
        ]
      );
      inserted.push(result.rows[0]);
    }

    const participantRows = usersCheck.rows.map(u => ({
      id: u.id,
      name: u.full_name || u.email || 'Unknown',
      email: u.email
    }));

    res.status(201).json({
      group_id: groupId,
      group_name: name,
      group_photo: group_photo || null,
      recipient_ids: participantIds,
      participants: participantRows,
      created_at: inserted[0]?.created_at || createdAt.toISOString(),
      messages: [],
      raw: inserted[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send message
app.post('/api/messages', async (req, res) => {
  const {
    sender_id,
    recipient_id,
    recipient_ids,
    group_id,
    group_name,
    group_photo,
    subject,
    body,
    parent_message_id
  } = req.body || {};

  const senderIdNum = Number(sender_id);
  const recipientIdList = Array.from(new Set(
    (Array.isArray(recipient_ids) ? recipient_ids : [recipient_id])
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0 && id !== senderIdNum)
  ));
  const isGroup = recipientIdList.length > 1 || Boolean(group_id);
  const resolvedGroupId = isGroup ? String(group_id || `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) : null;
  const resolvedGroupName = isGroup
    ? String(group_name || '').trim() || `Group chat (${recipientIdList.length + 1})`
    : null;

  if (!senderIdNum || !recipientIdList.length || !String(subject || '').trim() || !String(body || '').trim()) {
    return res.status(400).json({ error: 'sender_id, recipient_id(s), subject, and body are required' });
  }

  if (!recipientIdList.length) {
    return res.status(400).json({ error: 'Choose at least one other recipient.' });
  }

  try {
    const usersCheck = await pool.query(
      `SELECT id FROM users WHERE id = ANY($1::int[])`,
      [[senderIdNum, ...recipientIdList]]
    );

    if (usersCheck.rowCount < recipientIdList.length + 1) {
      return res.status(400).json({ error: 'Sender or one or more recipients do not exist.' });
    }

    const participantIds = [senderIdNum, ...recipientIdList].sort((a, b) => a - b);
    const createdAt = new Date();
    const inserted = [];
    for (const recipientIdNum of recipientIdList) {
      const result = await pool.query(
        `
        INSERT INTO in_app_messages (
          sender_id, recipient_id, subject, body, parent_message_id, group_id, group_name, recipient_ids, group_photo, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        RETURNING *
        `,
        [
        senderIdNum,
        recipientIdNum,
        String(subject).trim(),
        String(body).trim(),
        parent_message_id ? Number(parent_message_id) : null,
        resolvedGroupId,
        resolvedGroupName,
        isGroup ? JSON.stringify(participantIds) : null,
        isGroup ? (group_photo || null) : null,
        createdAt
        ]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json(isGroup ? { ...inserted[0], group_id: resolvedGroupId, group_name: resolvedGroupName, group_photo: group_photo || null, recipient_ids: participantIds, messages: inserted } : inserted[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT mark read/unread
app.put('/api/messages/:id/read', async (req, res) => {
  const { user_id, is_read } = req.body || {};
  if (!user_id || typeof is_read !== 'boolean') {
    return res.status(400).json({ error: 'user_id and is_read are required' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE in_app_messages
      SET is_read = $1,
          seen_at = CASE WHEN $1 THEN COALESCE(seen_at, NOW()) ELSE NULL END,
          updated_at = NOW()
      WHERE id = $2 AND recipient_id = $3
      RETURNING *
      `,
      [is_read, req.params.id, Number(user_id)]
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Message not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE soft delete message
app.delete('/api/messages/:id', async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  try {
    const existing = await pool.query(
      `SELECT sender_id, recipient_id, group_id FROM in_app_messages WHERE id = $1`,
      [req.params.id]
    );

    if (!existing.rowCount) return res.status(404).json({ error: 'Message not found' });

    const row = existing.rows[0];
    const targetClause = row.group_id ? `group_id = $1` : `id = $1`;

    if (row.group_id) {
      await pool.query(
        `
        UPDATE in_app_messages
        SET is_deleted_by_sender = CASE WHEN sender_id = $2 THEN TRUE ELSE is_deleted_by_sender END,
            is_deleted_by_recipient = CASE WHEN recipient_id = $2 THEN TRUE ELSE is_deleted_by_recipient END,
            updated_at = NOW()
        WHERE group_id = $1 AND (sender_id = $2 OR recipient_id = $2)
        `,
        [row.group_id, userId]
      );
      return res.json({ success: true });
    }

    const otherUserId = Number(row.sender_id) === userId ? Number(row.recipient_id) : Number(row.sender_id);
    await pool.query(
      `
      UPDATE in_app_messages
      SET is_deleted_by_sender = CASE WHEN sender_id = $1 THEN TRUE ELSE is_deleted_by_sender END,
          is_deleted_by_recipient = CASE WHEN recipient_id = $1 THEN TRUE ELSE is_deleted_by_recipient END,
          updated_at = NOW()
      WHERE (
        (sender_id = $1 AND recipient_id = $2)
        OR (sender_id = $2 AND recipient_id = $1)
      )
      `,
      [userId, otherUserId]
    );
    return res.json({ success: true });

    if (Number(row.sender_id) === userId) {
      await pool.query(
        `
        UPDATE in_app_messages
        SET is_deleted_by_sender = TRUE, updated_at = NOW()
        WHERE ${targetClause} AND sender_id = $2
        `,
        [row.group_id || req.params.id, userId]
      );
    } else if (Number(row.recipient_id) === userId) {
      await pool.query(
        `
        UPDATE in_app_messages
        SET is_deleted_by_recipient = TRUE, updated_at = NOW()
        WHERE ${targetClause} AND recipient_id = $2
        `,
        [row.group_id || req.params.id, userId]
      );
    } else {
      return res.status(403).json({ error: 'Not allowed' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT change password
// GET users list (for messaging recipient picker)
app.get('/api/users', async (req, res) => {
  try {
    const currentUserId = Number(req.query.exclude || 0);

    const result = await pool.query(
      `
      SELECT id, full_name, email, role
      FROM users
      WHERE ($1 = 0 OR id <> $1)
      ORDER BY full_name ASC, email ASC
      `,
      [currentUserId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

        await pool.query(`
      CREATE TABLE IF NOT EXISTS id_requests (
        id            SERIAL PRIMARY KEY,
        requested_by  INT REFERENCES users(id) ON DELETE SET NULL,
        request_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        department    CITEXT,
        id_type       CITEXT NOT NULL CHECK (
                        LOWER(id_type) IN ('company id','access card','visitor id','temporary id','other')
                      ),
        purpose       TEXT NOT NULL,
        status        CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                        LOWER(status) IN ('pending','approved','processing','released','rejected','cancelled')
                      ),
        remarks       TEXT,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS salary_increase_requests (
        id               SERIAL PRIMARY KEY,
        requested_by     INT REFERENCES users(id) ON DELETE SET NULL,
        request_date     DATE NOT NULL DEFAULT CURRENT_DATE,
        department       CITEXT,
        current_salary   NUMERIC(12,2),
        requested_salary NUMERIC(12,2) NOT NULL,
        effective_date   DATE NOT NULL,
        justification    TEXT NOT NULL,
        status           CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                           LOWER(status) IN ('pending','approved','rejected','cancelled')
                         ),
        remarks          TEXT,
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      )
    `);

await pool.query(`
  CREATE TABLE IF NOT EXISTS files_requests (
    id               SERIAL PRIMARY KEY,
    requested_by     INT REFERENCES users(id) ON DELETE SET NULL,
    request_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    department       CITEXT,
    document_name    TEXT NOT NULL,
    purpose          TEXT NOT NULL,
    request_action   CITEXT NOT NULL CHECK (
                       LOWER(request_action) IN ('pickup','return')
                     ),
    copy_type        CITEXT NOT NULL CHECK (
                       LOWER(copy_type) IN ('original','copy')
                     ),
    proof_of_return  TEXT,
    status           CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                       LOWER(status) IN ('pending','approved','released','returned','rejected','cancelled')
                     ),
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
  )
`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reimbursement_requests (
        id             SERIAL PRIMARY KEY,
        requested_by   INT REFERENCES users(id) ON DELETE SET NULL,
        request_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        department     CITEXT,
        category       CITEXT NOT NULL,
        amount         NUMERIC(12,2) NOT NULL,
        expense_date   DATE NOT NULL,
        purpose        TEXT NOT NULL,
        receipt_path   TEXT NOT NULL,
        receipt_name   TEXT,
        status         CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                         LOWER(status) IN ('pending','approved','rejected','cancelled')
                       ),
        remarks        TEXT,
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS budget_requests (
        id              SERIAL PRIMARY KEY,
        requested_by    INT REFERENCES users(id) ON DELETE SET NULL,
        request_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        title           TEXT NOT NULL,
        department_project TEXT,
        requested_amount NUMERIC(12,2) NOT NULL,
        date_needed     DATE NOT NULL,
        justification   TEXT NOT NULL,
        supporting_file TEXT,
        supporting_file_name TEXT,
        status          CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                          LOWER(status) IN ('pending','approved','rejected','cancelled')
                        ),
        remarks         TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS salary_advance_requests (
        id              SERIAL PRIMARY KEY,
        requested_by    INT REFERENCES users(id) ON DELETE SET NULL,
        request_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        requested_amount NUMERIC(12,2) NOT NULL,
        reason          TEXT NOT NULL,
        deduction_start_date DATE NOT NULL,
        deduction_terms TEXT NOT NULL,
        supporting_file TEXT,
        supporting_file_name TEXT,
        status          CITEXT NOT NULL DEFAULT 'Pending' CHECK (
                          LOWER(status) IN ('pending','approved','rejected','cancelled')
                        ),
        remarks         TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    for (const table of [
      'leave_requests',
      'id_requests',
      'salary_increase_requests',
      'files_requests',
      'reimbursement_requests',
      'budget_requests',
      'salary_advance_requests'
    ]) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS handled_by_id INT REFERENCES users(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS handled_by_name TEXT`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS handled_at TIMESTAMP`);
    }

    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_touch_request_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at := NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await pool.query(`DROP TRIGGER IF EXISTS trg_touch_id_requests ON id_requests`);
    await pool.query(`
      CREATE TRIGGER trg_touch_id_requests
      BEFORE UPDATE ON id_requests
      FOR EACH ROW EXECUTE FUNCTION fn_touch_request_updated_at()
    `);

    await pool.query(`DROP TRIGGER IF EXISTS trg_touch_salary_increase_requests ON salary_increase_requests`);
await pool.query(`
  CREATE TRIGGER trg_touch_salary_increase_requests
  BEFORE UPDATE ON salary_increase_requests
  FOR EACH ROW EXECUTE FUNCTION fn_touch_request_updated_at()
`);

await pool.query(`DROP TRIGGER IF EXISTS trg_touch_files_requests ON files_requests`);
await pool.query(`
  CREATE TRIGGER trg_touch_files_requests
  BEFORE UPDATE ON files_requests
  FOR EACH ROW EXECUTE FUNCTION fn_touch_request_updated_at()
`);

await pool.query(`DROP TRIGGER IF EXISTS trg_touch_reimbursement_requests ON reimbursement_requests`);
await pool.query(`
  CREATE TRIGGER trg_touch_reimbursement_requests
  BEFORE UPDATE ON reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION fn_touch_request_updated_at()
`);

await pool.query(`DROP TRIGGER IF EXISTS trg_touch_budget_requests ON budget_requests`);
await pool.query(`
  CREATE TRIGGER trg_touch_budget_requests
  BEFORE UPDATE ON budget_requests
  FOR EACH ROW EXECUTE FUNCTION fn_touch_request_updated_at()
`);

await pool.query(`DROP TRIGGER IF EXISTS trg_touch_salary_advance_requests ON salary_advance_requests`);
await pool.query(`
  CREATE TRIGGER trg_touch_salary_advance_requests
  BEFORE UPDATE ON salary_advance_requests
  FOR EACH ROW EXECUTE FUNCTION fn_touch_request_updated_at()
`);

    console.log('leave_requests + extra request schemas ready ✅');
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

app.post('/api/users/:id/id-requests', async (req, res) => {
  const employeeId = Number(req.params.id);
  const {
    request_date,
    department,
    id_type,
    purpose,
    remarks
  } = req.body || {};

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!request_date) {
    return res.status(400).json({ error: 'request_date is required' });
  }
  if (!String(id_type || '').trim()) {
    return res.status(400).json({ error: 'id_type is required' });
  }
  if (!String(purpose || '').trim()) {
    return res.status(400).json({ error: 'purpose is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO id_requests
       (requested_by, request_date, department, id_type, purpose, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        employeeId,
        request_date,
        department || null,
        String(id_type).trim().toLowerCase(),
        String(purpose).trim(),
        String(remarks || '').trim() || null
      ]
    );

    res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('POST /api/users/:id/id-requests error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:id/salary-increase-requests', async (req, res) => {
  const employeeId = Number(req.params.id);
  const {
    request_date,
    department,
    current_salary,
    requested_salary,
    effective_date,
    justification,
    remarks
  } = req.body || {};

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!request_date) {
    return res.status(400).json({ error: 'request_date is required' });
  }
  if (requested_salary === undefined || requested_salary === null || requested_salary === '') {
    return res.status(400).json({ error: 'requested_salary is required' });
  }
  if (!effective_date) {
    return res.status(400).json({ error: 'effective_date is required' });
  }
  if (!String(justification || '').trim()) {
    return res.status(400).json({ error: 'justification is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO salary_increase_requests
       (requested_by, request_date, department, current_salary, requested_salary, effective_date, justification, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        employeeId,
        request_date,
        department || null,
        current_salary === '' || current_salary == null ? null : Number(current_salary),
        Number(requested_salary),
        effective_date,
        String(justification).trim(),
        String(remarks || '').trim() || null
      ]
    );

    res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('POST /api/users/:id/salary-increase-requests error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const filesRequestProofUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, path.join(__dirname, 'public', 'uploads', 'files-requests'));
    },
    filename: function (req, file, cb) {
      const safe = String(file.originalname || 'proof')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '');
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/users/:id/files-requests', filesRequestProofUpload.single('proof_of_return'), async (req, res) => {
  const employeeId = Number(req.params.id);
  const {
    request_date,
    department,
    document_name,
    purpose,
    request_action,
    copy_type
  } = req.body || {};

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!request_date) {
    return res.status(400).json({ error: 'request_date is required' });
  }
  if (!String(document_name || '').trim()) {
    return res.status(400).json({ error: 'document_name is required' });
  }
  if (!String(purpose || '').trim()) {
    return res.status(400).json({ error: 'purpose is required' });
  }
  if (!String(request_action || '').trim()) {
    return res.status(400).json({ error: 'request_action is required' });
  }
  if (!String(copy_type || '').trim()) {
    return res.status(400).json({ error: 'copy_type is required' });
  }

  const normalizedAction = String(request_action).trim().toLowerCase();
  const normalizedCopyType = String(copy_type).trim().toLowerCase();

  if (!['pickup', 'return'].includes(normalizedAction)) {
    return res.status(400).json({ error: 'Invalid request_action' });
  }
  if (!['original', 'copy'].includes(normalizedCopyType)) {
    return res.status(400).json({ error: 'Invalid copy_type' });
  }
  if (normalizedAction === 'return' && !req.file) {
    return res.status(400).json({ error: 'proof_of_return is required for return action' });
  }

  try {
    const proofPath = req.file ? `/uploads/files-requests/${req.file.filename}` : null;

    const result = await pool.query(
      `INSERT INTO files_requests
       (requested_by, request_date, department, document_name, purpose, request_action, copy_type, proof_of_return)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        employeeId,
        request_date,
        department || null,
        String(document_name).trim(),
        String(purpose).trim(),
        normalizedAction,
        normalizedCopyType,
        proofPath
      ]
    );

    res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('POST /api/users/:id/files-requests error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── My Requests — unified view for a single user ────────────────────────────
// GET /api/users/:id/my-requests
// Returns all leave, id, salary-increase, and files requests for the user,
// merged into one array sorted by created_at DESC.
const reimbursementReceiptUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, 'public', 'uploads', 'reimbursements');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      const safe = String(file.originalname || 'receipt')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '');
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || name.endsWith('.pdf');
    cb(ok ? null : new Error('Receipt/proof must be an image or PDF file'), ok);
  }
});

app.post('/api/users/:id/reimbursement-requests', (req, res) => {
  reimbursementReceiptUpload.single('receipt')(req, res, async (uploadErr) => {
  if (uploadErr) {
    return res.status(400).json({ error: uploadErr.message || 'Invalid receipt/proof file' });
  }
  const employeeId = Number(req.params.id);
  const {
    request_date,
    department,
    category,
    amount,
    expense_date,
    purpose,
    remarks
  } = req.body || {};

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!request_date) {
    return res.status(400).json({ error: 'request_date is required' });
  }
  if (!String(category || '').trim()) {
    return res.status(400).json({ error: 'category is required' });
  }
  if (amount === undefined || amount === null || amount === '' || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount is required' });
  }
  if (!expense_date) {
    return res.status(400).json({ error: 'expense_date is required' });
  }
  if (!String(purpose || '').trim()) {
    return res.status(400).json({ error: 'purpose is required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'receipt/proof is required' });
  }

  try {
    const receiptPath = `/uploads/reimbursements/${req.file.filename}`;
    const result = await pool.query(
      `INSERT INTO reimbursement_requests
       (requested_by, request_date, department, category, amount, expense_date, purpose, receipt_path, receipt_name, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        employeeId,
        request_date,
        department || null,
        String(category).trim(),
        Number(amount),
        expense_date,
        String(purpose).trim(),
        receiptPath,
        req.file.originalname || null,
        String(remarks || '').trim() || null
      ]
    );

    res.status(201).json({ success: true, row: result.rows[0] });
  } catch (err) {
    console.error('POST /api/users/:id/reimbursement-requests error:', err.message);
    res.status(500).json({ error: err.message });
  }
  });
});

const requestSupportUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, 'public', 'uploads', 'request-support');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      const safe = String(file.originalname || 'supporting-file')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '');
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/users/:id/budget-requests', (req, res) => {
  requestSupportUpload.single('supporting_file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message || 'Invalid supporting file' });
    const employeeId = Number(req.params.id);
    const { request_date, title, department_project, requested_amount, date_needed, justification, remarks } = req.body || {};

    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'Invalid user id' });
    if (!request_date) return res.status(400).json({ error: 'request_date is required' });
    if (!String(title || '').trim()) return res.status(400).json({ error: 'title is required' });
    if (requested_amount === undefined || requested_amount === null || requested_amount === '' || Number(requested_amount) <= 0) {
      return res.status(400).json({ error: 'requested_amount is required' });
    }
    if (!date_needed) return res.status(400).json({ error: 'date_needed is required' });
    if (!String(justification || '').trim()) return res.status(400).json({ error: 'justification is required' });

    try {
      const filePath = req.file ? `/uploads/request-support/${req.file.filename}` : null;
      const result = await pool.query(
        `INSERT INTO budget_requests
         (requested_by, request_date, title, department_project, requested_amount, date_needed, justification, supporting_file, supporting_file_name, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          employeeId,
          request_date,
          String(title).trim(),
          String(department_project || '').trim() || null,
          Number(requested_amount),
          date_needed,
          String(justification).trim(),
          filePath,
          req.file?.originalname || null,
          String(remarks || '').trim() || null
        ]
      );
      res.status(201).json({ success: true, row: result.rows[0] });
    } catch (err) {
      console.error('POST /api/users/:id/budget-requests error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
});

app.post('/api/users/:id/salary-advance-requests', (req, res) => {
  requestSupportUpload.single('supporting_file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message || 'Invalid supporting file' });
    const employeeId = Number(req.params.id);
    const { request_date, requested_amount, reason, deduction_start_date, deduction_terms, remarks } = req.body || {};

    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'Invalid user id' });
    if (!request_date) return res.status(400).json({ error: 'request_date is required' });
    if (requested_amount === undefined || requested_amount === null || requested_amount === '' || Number(requested_amount) <= 0) {
      return res.status(400).json({ error: 'requested_amount is required' });
    }
    if (!String(reason || '').trim()) return res.status(400).json({ error: 'reason is required' });
    if (!deduction_start_date) return res.status(400).json({ error: 'deduction_start_date is required' });
    if (!String(deduction_terms || '').trim()) return res.status(400).json({ error: 'deduction_terms is required' });

    try {
      const filePath = req.file ? `/uploads/request-support/${req.file.filename}` : null;
      const result = await pool.query(
        `INSERT INTO salary_advance_requests
         (requested_by, request_date, requested_amount, reason, deduction_start_date, deduction_terms, supporting_file, supporting_file_name, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          employeeId,
          request_date,
          Number(requested_amount),
          String(reason).trim(),
          deduction_start_date,
          String(deduction_terms).trim(),
          filePath,
          req.file?.originalname || null,
          String(remarks || '').trim() || null
        ]
      );
      res.status(201).json({ success: true, row: result.rows[0] });
    } catch (err) {
      console.error('POST /api/users/:id/salary-advance-requests error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('/api/users/:id/my-requests', async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  try {
    const [leaves, idReqs, salaryReqs, filesReqs, reimbursementReqs, budgetReqs, salaryAdvanceReqs] = await Promise.all([
      pool.query(
        `SELECT id, 'leave' AS type, leave_type AS subtype,
                reason AS summary,
                status, submitted_at AS created_at, updated_at
         FROM leave_requests
         WHERE employee_id = $1
         ORDER BY submitted_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, 'id' AS type, id_type AS subtype,
                purpose AS summary,
                status, created_at, updated_at
         FROM id_requests
         WHERE requested_by = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, 'salary' AS type, 'salary increase' AS subtype,
                justification AS summary,
                status, created_at, updated_at
         FROM salary_increase_requests
         WHERE requested_by = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, 'files' AS type, document_name AS subtype,
                purpose AS summary,
                status, created_at, updated_at
         FROM files_requests
         WHERE requested_by = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, 'reimbursement' AS type, category AS subtype,
                purpose AS summary,
                status, created_at, updated_at
         FROM reimbursement_requests
         WHERE requested_by = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, 'budget' AS type, title AS subtype,
                justification AS summary,
                status, created_at, updated_at
         FROM budget_requests
         WHERE requested_by = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, 'salary_advance' AS type, 'salary advance' AS subtype,
                reason AS summary,
                status, created_at, updated_at
         FROM salary_advance_requests
         WHERE requested_by = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
    ]);

    const all = [
      ...leaves.rows,
      ...idReqs.rows,
      ...salaryReqs.rows,
      ...filesReqs.rows,
      ...reimbursementReqs.rows,
      ...budgetReqs.rows,
      ...salaryAdvanceReqs.rows,
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id/my-requests/:type/:requestId/cancel
// Cancels a pending request of a given type owned by the user.
app.put('/api/users/:id/my-requests/:type/:requestId/cancel', async (req, res) => {
  const userId     = Number(req.params.id);
  const requestId  = Number(req.params.requestId);
  const type       = String(req.params.type || '').trim().toLowerCase();

  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid user or request id' });
  }

  const tableMap = {
    leave:  { table: 'leave_requests',           ownerCol: 'employee_id'  },
    id:     { table: 'id_requests',              ownerCol: 'requested_by' },
    salary: { table: 'salary_increase_requests', ownerCol: 'requested_by' },
    files:  { table: 'files_requests',           ownerCol: 'requested_by' },
    reimbursement: { table: 'reimbursement_requests', ownerCol: 'requested_by' },
    budget: { table: 'budget_requests', ownerCol: 'requested_by' },
    salary_advance: { table: 'salary_advance_requests', ownerCol: 'requested_by' },
  };

  const meta = tableMap[type];
  if (!meta) return res.status(400).json({ error: 'Invalid request type' });

  try {
    const check = await pool.query(
      `SELECT id, status FROM ${meta.table} WHERE id = $1 AND ${meta.ownerCol} = $2`,
      [requestId, userId]
    );
    if (!check.rowCount) return res.status(404).json({ error: 'Request not found' });
    if (check.rows[0].status.toLowerCase() !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    await pool.query(
      `UPDATE ${meta.table} SET status = 'Cancelled', updated_at = NOW() WHERE id = $1`,
      [requestId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Unified Threads — merged inbox + requests view ──────────────────────────
// GET /api/users/:id/threads?filter=all|requests|messages&status=all|pending|approved|rejected&search=...
// Returns all messages and requests as unified thread objects, sorted by created_at DESC.
app.get('/api/users/:id/threads', async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const filter = String(req.query.filter || 'all').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
  const search = String(req.query.search || '').trim().toLowerCase();

  try {
    const results = [];

    // ── Fetch messages (inbox + sent) ──────────────────────────────────────
    if (filter === 'all' || filter === 'messages') {
      const msgRes = await pool.query(`
        SELECT
          m.id, m.subject, m.body, m.is_read, m.seen_at, m.parent_message_id,
          COALESCE(m.is_group_seed, FALSE) AS is_group_seed,
          m.attachment_name, m.attachment_path, m.attachment_type, m.attachment_size,
          m.group_id, m.group_name, m.recipient_ids, m.group_photo,
          m.created_at, m.updated_at,
          sender.id AS sender_id, sender.full_name AS sender_name, sender.email AS sender_email,
          recipient.id AS recipient_id, recipient.full_name AS recipient_name, recipient.email AS recipient_email
        FROM in_app_messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN users recipient ON recipient.id = m.recipient_id
        WHERE (m.recipient_id = $1 AND COALESCE(m.is_deleted_by_recipient, FALSE) = FALSE)
           OR (m.sender_id = $1 AND COALESCE(m.is_deleted_by_sender, FALSE) = FALSE)
        ORDER BY m.created_at DESC
      `, [userId]);

      for (const m of msgRes.rows) {
        const isSender = Number(m.sender_id) === userId;
        const thread = {
          thread_id: m.group_id ? `grp_${m.group_id}` : `msg_${m.id}`,
          type: 'message',
          status: null,
          title: m.group_name || m.subject || '(No subject)',
          summary: m.group_id && m.is_group_seed ? '' : String(m.body || '').replace(/\s+/g, ' ').trim().slice(0, 120),
          sender_name: isSender ? 'You' : (m.sender_name || m.sender_email || 'System'),
          sender_id: m.sender_id,
          recipient_id: m.recipient_id,
          recipient_name: m.recipient_name || m.recipient_email || 'Unknown',
          group_id: m.group_id,
          group_name: m.group_name,
          group_photo: m.group_photo,
          recipient_ids: m.recipient_ids,
          attachment_name: m.attachment_name,
          attachment_path: m.attachment_path,
          attachment_type: m.attachment_type,
          attachment_size: m.attachment_size,
          is_read: isSender ? true : m.is_read,  // sent messages are always "read" by sender
          created_at: m.created_at,
          updated_at: m.updated_at || m.created_at,
          raw: m,
        };
        if (search && !thread.title.toLowerCase().includes(search) && !thread.summary.toLowerCase().includes(search)) continue;
        results.push(thread);
      }
    }

    // ── Fetch requests ──────────────────────────────────────────────────────
    if (filter === 'all' || filter === 'requests') {
      const [leaves, idReqs, salaryReqs, filesReqs, reimbursementReqs, budgetReqs, salaryAdvanceReqs] = await Promise.all([
        pool.query(
          `SELECT id, 'leave' AS req_type, leave_type AS subtype, reason AS summary,
                  status, submitted_at AS created_at, updated_at, employee_id AS owner_id
           FROM leave_requests WHERE employee_id = $1 ORDER BY submitted_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT id, 'id' AS req_type, id_type AS subtype, purpose AS summary,
                  status, created_at, updated_at, requested_by AS owner_id
           FROM id_requests WHERE requested_by = $1 ORDER BY created_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT id, 'salary' AS req_type, 'salary increase' AS subtype, justification AS summary,
                  status, created_at, updated_at, requested_by AS owner_id
           FROM salary_increase_requests WHERE requested_by = $1 ORDER BY created_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT id, 'files' AS req_type, document_name AS subtype, purpose AS summary,
                  status, created_at, updated_at, requested_by AS owner_id
           FROM files_requests WHERE requested_by = $1 ORDER BY created_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT id, 'reimbursement' AS req_type, category AS subtype, purpose AS summary,
                  status, created_at, updated_at, requested_by AS owner_id
           FROM reimbursement_requests WHERE requested_by = $1 ORDER BY created_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT id, 'budget' AS req_type, title AS subtype, justification AS summary,
                  status, created_at, updated_at, requested_by AS owner_id
           FROM budget_requests WHERE requested_by = $1 ORDER BY created_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT id, 'salary_advance' AS req_type, 'salary advance' AS subtype, reason AS summary,
                  status, created_at, updated_at, requested_by AS owner_id
           FROM salary_advance_requests WHERE requested_by = $1 ORDER BY created_at DESC`,
          [userId]
        ),
      ]);

      const typeLabels = { leave: 'Leave Request', id: 'ID Request', salary: 'Salary Increase', files: 'Files Request', reimbursement: 'Reimbursement Request', budget: 'Budget Request', salary_advance: 'Salary Advance Request' };
      const allReqs = [...leaves.rows, ...idReqs.rows, ...salaryReqs.rows, ...filesReqs.rows, ...reimbursementReqs.rows, ...budgetReqs.rows, ...salaryAdvanceReqs.rows];

      for (const r of allReqs) {
        const statusLower = (r.status || 'pending').toLowerCase();
        if (statusFilter !== 'all' && statusLower !== statusFilter) continue;

        const label = typeLabels[r.req_type] || r.req_type;
        const title = `[${label}]${r.subtype ? ` — ${r.subtype}` : ''}`;
        const summary = String(r.summary || '').slice(0, 120);

        if (search && !title.toLowerCase().includes(search) && !summary.toLowerCase().includes(search)) continue;

        results.push({
          thread_id: `req_${r.req_type}_${r.id}`,
          type: 'request',
          req_type: r.req_type,
          status: r.status || 'Pending',
          title,
          summary,
          sender_name: 'You',
          sender_id: userId,
          is_read: true,
          created_at: r.created_at,
          updated_at: r.updated_at || r.created_at,
          raw: r,
        });
      }
    }

    // Sort by created_at DESC and collapse group rows to one conversation.
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const seenThreadIds = new Set();
    const collapsed = [];
    for (const thread of results) {
      if (seenThreadIds.has(thread.thread_id)) continue;
      seenThreadIds.add(thread.thread_id);
      collapsed.push(thread);
    }
    res.json(collapsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/threads/:threadId — fetch thread messages for a request or message
app.get('/api/users/:id/threads/:threadId', async (req, res) => {
  const userId = Number(req.params.id);
  const threadId = String(req.params.threadId || '');

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  try {
    if (threadId.startsWith('grp_')) {
      const groupId = threadId.replace('grp_', '');
      const rootRes = await pool.query(`
        SELECT m.*
        FROM in_app_messages m
        WHERE m.group_id = $1 AND (m.recipient_id = $2 OR m.sender_id = $2)
        ORDER BY m.created_at DESC
        LIMIT 1
      `, [groupId, userId]);
      if (!rootRes.rowCount) return res.status(404).json({ error: 'Thread not found' });
      const root = rootRes.rows[0];
      const conversation = await pool.query(`
        SELECT DISTINCT ON (m.sender_id, m.body, m.created_at) m.*,
          sender.full_name AS sender_name, sender.email AS sender_email,
          recipient.full_name AS recipient_name, recipient.email AS recipient_email
        FROM in_app_messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN users recipient ON recipient.id = m.recipient_id
        WHERE m.group_id = $1
          AND (
            (m.sender_id = $2 AND COALESCE(m.is_deleted_by_sender, FALSE) = FALSE)
          OR (m.recipient_id = $2 AND COALESCE(m.is_deleted_by_recipient, FALSE) = FALSE)
          )
          AND COALESCE(m.is_group_seed, FALSE) = FALSE
        ORDER BY m.sender_id, m.body, m.created_at, m.id ASC
      `, [groupId, userId]);
      let storedParticipantIds = [];
      try {
        storedParticipantIds = root.recipient_ids ? JSON.parse(root.recipient_ids) : [];
      } catch {}
      const participantIds = Array.from(new Set(
        (storedParticipantIds.length ? storedParticipantIds : conversation.rows.flatMap(r => [Number(r.sender_id), Number(r.recipient_id)])).map(Number).filter(Boolean)
      ));
      const usersRes = participantIds.length
        ? await pool.query(`SELECT id, full_name, email FROM users WHERE id = ANY($1::int[])`, [participantIds])
        : { rows: [] };
      const participants = usersRes.rows.map(u => ({ id: u.id, name: u.full_name || u.email || 'Unknown', email: u.email }));
      return res.json({
        thread_id: threadId,
        type: 'message',
        title: root.group_name || root.subject || 'Group chat',
        group_id: groupId,
        group_name: root.group_name || 'Group chat',
        group_photo: root.group_photo || null,
        participants,
        messages: conversation.rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(r => ({
          id: r.id,
          sender_id: r.sender_id,
          sender_name: r.sender_name || r.sender_email || 'Unknown',
          sender_email: r.sender_email,
          recipient_id: r.recipient_id,
          recipient_name: r.recipient_name || r.recipient_email || 'Unknown',
          recipient_email: r.recipient_email,
          subject: r.subject,
          body: r.body,
          attachment_name: r.attachment_name,
          attachment_path: r.attachment_path,
          attachment_type: r.attachment_type,
          attachment_size: r.attachment_size,
          is_read: r.is_read,
          seen: Boolean(r.is_read),
          seen_at: r.seen_at,
          seenAt: r.seen_at,
          parent_message_id: r.parent_message_id,
          group_id: r.group_id,
          group_name: r.group_name,
          group_photo: r.group_photo || null,
          created_at: r.created_at,
          updated_at: r.updated_at,
          is_system: false
        })),
        raw: root,
      });
    }
    // ── Message thread ─────────────────────────────────────────────────────
    if (threadId.startsWith('msg_')) {
      const msgId = Number(threadId.replace('msg_', ''));
      const result = await pool.query(`
        SELECT m.*,
          sender.full_name AS sender_name, sender.email AS sender_email,
          recipient.full_name AS recipient_name, recipient.email AS recipient_email
        FROM in_app_messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN users recipient ON recipient.id = m.recipient_id
        WHERE m.id = $1 AND (m.recipient_id = $2 OR m.sender_id = $2)
      `, [msgId, userId]);

      if (!result.rowCount) return res.status(404).json({ error: 'Thread not found' });
      const root = result.rows[0];

      const otherUserId = Number(root.sender_id) === userId
        ? Number(root.recipient_id)
        : Number(root.sender_id);

      // Fetch the full chat history between these two users.
      const conversation = await pool.query(`
        SELECT m.*,
          sender.full_name AS sender_name, sender.email AS sender_email,
          recipient.full_name AS recipient_name, recipient.email AS recipient_email
        FROM in_app_messages m
        LEFT JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN users recipient ON recipient.id = m.recipient_id
        WHERE (
          m.sender_id = $1
          AND m.recipient_id = $2
          AND COALESCE(m.is_deleted_by_sender, FALSE) = FALSE
        ) OR (
          m.sender_id = $2
          AND m.recipient_id = $1
          AND COALESCE(m.is_deleted_by_recipient, FALSE) = FALSE
        )
        ORDER BY m.created_at ASC
      `, [userId, otherUserId]);

      return res.json({
        thread_id: threadId,
        type: 'message',
        title: root.subject || '(No subject)',
        messages: conversation.rows.map(r => ({
          id: r.id,
          sender_id: r.sender_id,
          sender_name: r.sender_name || r.sender_email || 'Unknown',
          sender_email: r.sender_email,
          recipient_id: r.recipient_id,
          recipient_name: r.recipient_name || r.recipient_email || 'Unknown',
          recipient_email: r.recipient_email,
          subject: r.subject,
          body: r.body,
          attachment_name: r.attachment_name,
          attachment_path: r.attachment_path,
          attachment_type: r.attachment_type,
          attachment_size: r.attachment_size,
          is_read: r.is_read,
          seen: Boolean(r.is_read),
          seen_at: r.seen_at,
          seenAt: r.seen_at,
          parent_message_id: r.parent_message_id,
          created_at: r.created_at,
          updated_at: r.updated_at,
          is_system: false
        })),
        raw: root,
      });
    }

    // ── Request thread ─────────────────────────────────────────────────────
    if (threadId.startsWith('req_')) {
      const parts = threadId.replace('req_', '').split('_');
      const reqId = Number(parts.pop());
      const reqType = parts.join('_');

      const tableMap = {
        leave:  { table: 'leave_requests',           ownerCol: 'employee_id',  label: 'Leave Request'    },
        id:     { table: 'id_requests',              ownerCol: 'requested_by', label: 'ID Request'       },
        salary: { table: 'salary_increase_requests', ownerCol: 'requested_by', label: 'Salary Increase'  },
        files:  { table: 'files_requests',           ownerCol: 'requested_by', label: 'Files Request'    },
        reimbursement: { table: 'reimbursement_requests', ownerCol: 'requested_by', label: 'Reimbursement Request' },
        budget: { table: 'budget_requests', ownerCol: 'requested_by', label: 'Budget Request' },
        salary_advance: { table: 'salary_advance_requests', ownerCol: 'requested_by', label: 'Salary Advance Request' },
      };
      const meta = tableMap[reqType];
      if (!meta) return res.status(400).json({ error: 'Invalid request type' });

      const result = await pool.query(
        `SELECT * FROM ${meta.table} WHERE id = $1 AND ${meta.ownerCol} = $2`,
        [reqId, userId]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
      const req_row = result.rows[0];

      // Build synthetic thread messages
      const messages = [];
      const summary = req_row.justification || req_row.reason || req_row.purpose || req_row.document_name || '';
      const details = Object.entries(req_row)
        .filter(([k]) => !['id', 'updated_at', 'created_at', 'employee_id', 'requested_by', 'owner_id'].includes(k))
        .map(([k, v]) => v != null ? `${k.replace(/_/g,' ')}: ${v}` : null)
        .filter(Boolean)
        .join('\n');

      messages.push({
        id: `init_${req_row.id}`,
        sender_name: 'You',
        body: `${meta.label} submitted.\n\n${details}`,
        created_at: req_row.created_at || req_row.submitted_at,
        is_system: false,
      });
      messages.push({
        id: `status_${req_row.id}`,
        sender_name: 'System',
        body: `Status: ${req_row.status || 'Pending'}`,
        created_at: req_row.created_at || req_row.submitted_at,
        is_system: true,
        status: req_row.status,
      });
      if (req_row.remarks) {
        messages.push({
          id: `remark_${req_row.id}`,
          sender_name: 'Admin',
          body: req_row.remarks,
          created_at: req_row.updated_at || req_row.created_at,
          is_system: false,
        });
      }
      if (req_row.status && req_row.status.toLowerCase() !== 'pending') {
        messages.push({
          id: `resolved_${req_row.id}`,
          sender_name: 'System',
          body: `Status changed to: ${req_row.status}`,
          created_at: req_row.updated_at || req_row.created_at,
          is_system: true,
          status: req_row.status,
        });
      }

      const subtype = req_row.leave_type || req_row.id_type || req_row.document_name || req_row.category || req_row.title || '';
      return res.json({
        thread_id: threadId,
        type: 'request',
        req_type: reqType,
        status: req_row.status || 'Pending',
        title: `[${meta.label}]${subtype ? ` — ${subtype}` : ''}`,
        messages,
        raw: req_row,
      });
    }

    return res.status(400).json({ error: 'Invalid thread id' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// network_sites + network_devices migration
(async () => {
  try {
    // network_sites columns
    const siteAlters = [
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS project_name TEXT DEFAULT 'DICT438'`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS modem        TEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS transceiver  TEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS dish         TEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS province     CITEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS created_by_name  TEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS installed_by     TEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS repaired_by      TEXT`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS date_installed   DATE`,
      `ALTER TABLE network_sites ADD COLUMN IF NOT EXISTS acceptance_date  DATE`,
    ];
    for (const sql of siteAlters) { try { await pool.query(sql); } catch(e) {} }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS network_site_history (
        id SERIAL PRIMARY KEY,
        site_name CITEXT NOT NULL,
        action_type TEXT NOT NULL,
        actor_name TEXT,
        notes TEXT,
        action_date TIMESTAMP DEFAULT NOW()
      )
    `);

    // network_devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS network_devices (
        id            SERIAL PRIMARY KEY,
        site_id       INT REFERENCES network_sites(id) ON DELETE CASCADE,
        site_name     CITEXT,
        device_name   CITEXT NOT NULL,
        device_type   CITEXT,
        serial_number CITEXT,
        mac_address   CITEXT,
        model         CITEXT,
        license_due   DATE,
        is_active     BOOLEAN DEFAULT TRUE,
        province      CITEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const devAlters = [
      `ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS device_type CITEXT`,
      `ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE network_devices ADD COLUMN IF NOT EXISTS license_due DATE`,
    ];
    for (const sql of devAlters) { try { await pool.query(sql); } catch(e) {} }

    console.log('network_sites + network_devices ready ✅');
  } catch(e) { console.error('Map migration error:', e.message); }
})();

async function logNetworkSiteHistory(siteName, actionType, actorName = null, notes = null) {
  try {
    await pool.query(
      `INSERT INTO network_site_history (site_name, action_type, actor_name, notes)
       VALUES ($1, $2, $3, $4)`,
      [siteName, actionType, actorName, notes]
    );
  } catch (err) {
    console.error('Map history log error:', err.message);
  }
}

// GET all network_sites with full details + joined devices + terminal row
app.get('/api/map/sites', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ns.id, ns.site_name, ns.municipality, ns.province,
        ns.lat, ns.long, ns.ip, ns.mac, ns.contacts, ns.email,
        ns.is_active, ns.project_name,
        ns.modem, ns.transceiver, ns.dish,
        ns.created_by_name, ns.installed_by, ns.repaired_by, ns.date_installed, ns.acceptance_date,
        COALESCE(
          json_agg(
            json_build_object(
              'id',          nd.id,
              'device_name', nd.device_name,
              'device_type', nd.device_type,
              'model',       nd.model,
              'serial',      nd.serial_number,
              'serial_number', nd.serial_number,
              'mac_address', nd.mac_address,
              'license_due', nd.license_due,
              'is_active',   nd.is_active
            )
            ORDER BY nd.device_name
          ) FILTER (WHERE nd.id IS NOT NULL), '[]'
        ) AS devices
      FROM network_sites ns
      LEFT JOIN network_devices nd ON nd.site_id = ns.id
      GROUP BY ns.id
      ORDER BY ns.province, ns.site_name
    `);

    const historyResult = await pool.query(`
      SELECT site_name, action_type, actor_name, notes, action_date
      FROM network_site_history
      ORDER BY action_date DESC
    `);
    const historyMap = new Map();
    for (const row of historyResult.rows) {
      const key = String(row.site_name || '').toLowerCase();
      if (!historyMap.has(key)) historyMap.set(key, []);
      if (historyMap.get(key).length < 12) historyMap.get(key).push(row);
    }

    // For each site, fetch its matching terminal row from site_inventory
    // Try both the raw site_name and with the VSTG2- prefix stripped
    const siteNames = result.rows.map(r => r.site_name);
    const strippedNames = result.rows.map(r => r.site_name.replace(/^VSTG2-/i, ''));
    const allLookups = [...new Set([...siteNames, ...strippedNames])];
    let terminalMap = {};
    if (allLookups.length) {
      const tResult = await pool.query(
        `SELECT * FROM site_inventory WHERE LOWER("SITENAME") = ANY($1::text[])`,
        [allLookups.map(s => s.toLowerCase())]
      );
      for (const row of tResult.rows) {
        if (row['SITENAME']) {
          terminalMap[row['SITENAME']] = row;
          terminalMap[row['SITENAME'].toLowerCase()] = row;
        }
      }
    }

    const rows = result.rows.map(r => {
      const key = r.site_name.toLowerCase();
      const strippedKey = r.site_name.replace(/^VSTG2-/i, '').toLowerCase();
      const terminal = terminalMap[key] || terminalMap[strippedKey] || null;
      return { ...r, terminal, history: historyMap.get(key) || historyMap.get(strippedKey) || [] };
    });

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/map/sites', async (req, res) => {
  const {
    site_name, municipality, province, lat, long: lng, ip, mac, contacts, email,
    is_active, project_name, modem, transceiver, dish,
    created_by_name, installed_by, repaired_by, date_installed, acceptance_date
  } = req.body || {};

  if (!String(site_name || '').trim()) {
    return res.status(400).json({ error: 'site_name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO network_sites
        (site_name, municipality, province, lat, long, ip, mac, contacts, email, is_active, project_name, modem, transceiver, dish,
         created_by_name, installed_by, repaired_by, date_installed, acceptance_date)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        String(site_name).trim(),
        municipality || null,
        province || null,
        lat ?? null,
        lng ?? null,
        ip || null,
        mac || null,
        contacts || null,
        email || null,
        typeof is_active === 'boolean' ? is_active : false,
        project_name || 'DICT438',
        modem || null,
        transceiver || null,
        dish || null,
        created_by_name || null,
        installed_by || null,
        repaired_by || null,
        date_installed || null,
        acceptance_date || null
      ]
    );
    await logNetworkSiteHistory(
      String(site_name).trim(),
      'created',
      created_by_name || installed_by || null,
      `Project: ${project_name || 'DICT438'}`
    );
    res.status(201).json({ ...result.rows[0], devices: [], history: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/map/sites/import', async (req, res) => {
  const sites = Array.isArray(req.body?.sites) ? req.body.sites : [];
  if (!sites.length) return res.status(400).json({ error: 'No sites provided' });

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const raw of sites) {
    const siteName = String(raw.site_name || '').trim();
    if (!siteName) {
      skipped++;
      errors.push('A row was skipped because site_name is missing.');
      continue;
    }

    try {
      const exists = await pool.query(`SELECT 1 FROM network_sites WHERE LOWER(site_name)=LOWER($1)`, [siteName]);
      if (exists.rowCount) {
        skipped++;
        continue;
      }

      await pool.query(
        `INSERT INTO network_sites
          (site_name, municipality, province, lat, long, ip, mac, contacts, email, is_active, project_name, modem, transceiver, dish,
           created_by_name, installed_by, repaired_by, date_installed, acceptance_date)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          siteName,
          raw.municipality || null,
          raw.province || null,
          raw.lat ? Number(raw.lat) : null,
          raw.long ? Number(raw.long) : null,
          raw.ip || null,
          raw.mac || null,
          raw.contacts || null,
          raw.email || null,
          String(raw.is_active || '').toLowerCase() === 'true' || raw.is_active === true,
          raw.project_name || 'DICT438',
          raw.modem || null,
          raw.transceiver || null,
          raw.dish || null,
          raw.created_by_name || null,
          raw.installed_by || null,
          raw.repaired_by || null,
          raw.date_installed || null,
          raw.acceptance_date || null
        ]
      );
      await logNetworkSiteHistory(siteName, 'imported', raw.created_by_name || raw.installed_by || null, 'Imported from bulk upload');
      inserted++;
    } catch (err) {
      skipped++;
      errors.push(`${siteName}: ${err.message}`);
    }
  }

  res.json({ inserted, skipped, errors: errors.slice(0, 10) });
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
    await logNetworkSiteHistory(req.params.siteName, is_active ? 'activated' : 'deactivated', null, null);
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
  const {
    ip, mac, lat, long: lng, contacts, email, modem, transceiver, dish,
    municipality, province, project_name, created_by_name, installed_by, repaired_by, date_installed, acceptance_date
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE network_sites
       SET ip=$1, mac=$2, lat=$3, long=$4, contacts=$5, email=$6, modem=$7, transceiver=$8, dish=$9,
           municipality=$10, province=$11, project_name=$12, created_by_name=$13, installed_by=$14, repaired_by=$15, date_installed=$16, acceptance_date=$17
       WHERE site_name=$18 RETURNING *`,
      [
        ip||null, mac||null, lat||null, lng||null, contacts||null, email||null, modem||null, transceiver||null, dish||null,
        municipality || null, province || null, project_name || 'DICT438', created_by_name || null, installed_by || null, repaired_by || null, date_installed || null, acceptance_date || null,
        req.params.siteName
      ]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Site not found' });
    await logNetworkSiteHistory(req.params.siteName, 'updated', repaired_by || created_by_name || null, 'Site details updated');
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT bulk activate/deactivate filtered sites
app.put('/api/map/sites/bulk-status', async (req, res) => {
  const { site_names, is_active } = req.body;
  if (!Array.isArray(site_names) || !site_names.length)
    return res.status(400).json({ error: 'site_names array required' });
  try {
    const placeholders = site_names.map((_, i) => `$${i + 2}`).join(',');
    const result = await pool.query(
      `UPDATE network_sites SET is_active=$1 WHERE site_name IN (${placeholders}) RETURNING site_name, is_active`,
      [is_active, ...site_names]
    );
    res.json({ updated: result.rowCount, rows: result.rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT update device status
app.put('/api/map/devices/:id/status', async (req, res) => {
  const { is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE network_devices SET is_active=$1 WHERE id=$2 RETURNING *`,
      [is_active, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Device not found' });
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT edit device details
app.put('/api/map/devices/:id/edit', async (req, res) => {
  const { device_name, device_type, serial_number, mac_address, model, license_due } = req.body;
  try {
    const result = await pool.query(
      `UPDATE network_devices
       SET device_name=$1, device_type=$2, serial_number=$3,
           mac_address=$4, model=$5, license_due=$6
       WHERE id=$7 RETURNING *`,
      [device_name||null, device_type||null, serial_number||null,
       mac_address||null, model||null, license_due||null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Device not found' });
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
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


/* ================= ACCEPTANCE ================= */

const acceptanceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const type = req.path.includes('images') ? 'images'
                 : req.path.includes('videos') ? 'videos' : 'files';
      const dir = require('path').join(__dirname, 'public', 'uploads', 'acceptance', type);
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext  = require('path').extname(file.originalname);
      const base = require('path').basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = require('path').extname(file.originalname).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    const docExts   = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip', '.rar'];

    if (req.path.includes('/images')) {
      if (mime.startsWith('image/') || imageExts.includes(ext)) return cb(null, true);
      return cb(new Error('Invalid file type'));
    }

    if (req.path.includes('/videos')) {
      if (mime.startsWith('video/') || videoExts.includes(ext)) return cb(null, true);
      return cb(new Error('Invalid file type'));
    }

    if (docExts.includes(ext)) return cb(null, true);
    return cb(new Error('Invalid file type'));
  }
});

// Setup tables
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_sites (
        id          SERIAL PRIMARY KEY,
        site_name   CITEXT NOT NULL,
        status      CITEXT NOT NULL DEFAULT 'Pending' CHECK (LOWER(status) IN ('pending','done')),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_files (
        id          SERIAL PRIMARY KEY,
        site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
        file_name   CITEXT NOT NULL,
        file_path   TEXT NOT NULL,
        file_size   NUMERIC(10,2),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_images (
        id          SERIAL PRIMARY KEY,
        site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
        image_name  CITEXT NOT NULL,
        image_path  TEXT NOT NULL,
        file_size   NUMERIC(10,2),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_videos (
        id          SERIAL PRIMARY KEY,
        site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
        video_name  CITEXT NOT NULL,
        video_path  TEXT NOT NULL,
        file_size   NUMERIC(10,2),
        duration    VARCHAR(20),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_progress (
        id           SERIAL PRIMARY KEY,
        project_name CITEXT NOT NULL UNIQUE,
        progress     NUMERIC(5,2) DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Acceptance tables ready ✅');
  } catch(e) { console.error('Acceptance setup error:', e.message); }
})();

// GET all projects with progress
app.get('/api/acceptance/projects', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pp.project_name,
        pp.progress,
        COUNT(ps.id) AS total_sites,
        COUNT(ps.id) FILTER (WHERE LOWER(ps.status)='done')    AS done_sites,
        COUNT(ps.id) FILTER (WHERE LOWER(ps.status)='pending') AS pending_sites
      FROM project_progress pp
      LEFT JOIN project_sites ps ON ps.project_name = pp.project_name
      GROUP BY pp.project_name, pp.progress, pp.updated_at
      ORDER BY pp.project_name
    `);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET sites for a project
app.get('/api/acceptance/sites', async (req, res) => {
  const { project, q } = req.query;
  try {
    let query = `
      SELECT ps.*, u.full_name AS uploader_name,
        (SELECT COUNT(*) FROM project_files  WHERE site_id=ps.id) AS file_count,
        (SELECT COUNT(*) FROM project_images WHERE site_id=ps.id) AS image_count,
        (SELECT COUNT(*) FROM project_videos WHERE site_id=ps.id) AS video_count
      FROM project_sites ps
      LEFT JOIN users u ON u.id = ps.uploaded_by
    `;
    const params = [];
    const where = [];
    if (project) { params.push(project); where.push(`ps.project_name = $${params.length}`); }
    if (q)       { params.push(`%${q}%`); where.push(`ps.site_name ILIKE $${params.length}`); }
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY ps.site_name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST add site
app.post('/api/acceptance/sites', async (req, res) => {
  const { site_name, status, uploaded_by, project_name, installer_name } = req.body || {};
  if (!site_name?.trim())    return res.status(400).json({ error: 'site_name required' });
  if (!project_name?.trim()) return res.status(400).json({ error: 'project_name required' });
  try {
    const result = await pool.query(
      `INSERT INTO project_sites (project_name, site_name, status, uploaded_by, installer_name, acceptance_date)
 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
[
  project_name.trim(),
  site_name.trim(),
  status || 'Pending',
  uploaded_by || null,
  installer_name || null,
  null
]
    );
    // Ensure project_progress entry exists
    await pool.query(
      `INSERT INTO project_progress (project_name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [project_name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT update site status
app.put('/api/acceptance/sites/:id', async (req, res) => {
  const { status, installer_name } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE project_sites
       SET status=$1,
           installer_name=COALESCE($2, installer_name),
           acceptance_date=$3,
           updated_at=NOW()
       WHERE id=$4
       RETURNING *`,
      [
  status,
  installer_name || null,
  ((status || '').toLowerCase() === 'done' ? new Date().toISOString().slice(0, 10) : null),
  req.params.id
]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/acceptance/sites/import-json', async (req, res) => {
  const projectName = String(req.body?.project_name || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const uploadedBy = req.body?.uploaded_by || null;

  if (!projectName) return res.status(400).json({ error: 'project_name required' });
  if (!rows.length) return res.status(400).json({ error: 'No rows provided' });

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const siteName = String(row.site_name || '').trim();
    if (!siteName) {
      skipped++;
      errors.push('A row was skipped because site_name is missing.');
      continue;
    }
    try {
      const exists = await pool.query(
        `SELECT 1 FROM project_sites WHERE project_name = $1 AND LOWER(site_name) = LOWER($2)`,
        [projectName, siteName]
      );
      if (exists.rowCount) {
        skipped++;
        continue;
      }

      const normalizedStatus = String(row.status || 'Pending').toLowerCase() === 'done' ? 'Done' : 'Pending';
      await pool.query(
        `INSERT INTO project_sites (project_name, site_name, status, uploaded_by, installer_name, acceptance_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          projectName,
          siteName,
          normalizedStatus,
          uploadedBy,
          row.installer_name || null,
          row.acceptance_date || (normalizedStatus === 'Done' ? new Date().toISOString().slice(0, 10) : null)
        ]
      );
      inserted++;
    } catch (err) {
      skipped++;
      errors.push(`${siteName}: ${err.message}`);
    }
  }

  await pool.query(
    `INSERT INTO project_progress (project_name) VALUES ($1) ON CONFLICT DO NOTHING`,
    [projectName]
  );

  res.json({ inserted, skipped, errors: errors.slice(0, 10) });
});

app.delete('/api/acceptance/sites/bulk-delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  try {
    const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(',');
    const result = await pool.query(`DELETE FROM project_sites WHERE id IN (${placeholders})`, ids);
    res.json({ deleted: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE site
app.delete('/api/acceptance/sites/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM project_sites WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET media for a site
app.get('/api/acceptance/sites/:id/media', async (req, res) => {
  try {
    const [files, images, videos] = await Promise.all([
      pool.query(`SELECT f.*, u.full_name AS uploader_name FROM project_files f LEFT JOIN users u ON u.id=f.uploaded_by WHERE f.site_id=$1 ORDER BY f.uploaded_at DESC`, [req.params.id]),
      pool.query(`SELECT i.*, u.full_name AS uploader_name FROM project_images i LEFT JOIN users u ON u.id=i.uploaded_by WHERE i.site_id=$1 ORDER BY i.uploaded_at DESC`, [req.params.id]),
      pool.query(`SELECT v.*, u.full_name AS uploader_name FROM project_videos v LEFT JOIN users u ON u.id=v.uploaded_by WHERE v.site_id=$1 ORDER BY v.uploaded_at DESC`, [req.params.id]),
    ]);
    res.json({ files: files.rows, images: images.rows, videos: videos.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST upload file
app.post('/api/acceptance/sites/:id/files', (req, res) => {
  acceptanceUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Invalid file type' });
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const { uploaded_by } = req.body || {};
    try {
      const result = await pool.query(
        `INSERT INTO project_files (site_id, file_name, file_path, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, req.file.originalname, '/uploads/acceptance/files/'+req.file.filename,
         (req.file.size/1024).toFixed(2), uploaded_by||null]
      );
      res.status(201).json(result.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// POST upload image
app.post('/api/acceptance/sites/:id/images', (req, res) => {
  acceptanceUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Invalid file type' });
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const { uploaded_by } = req.body || {};
    try {
      const result = await pool.query(
        `INSERT INTO project_images (site_id, image_name, image_path, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, req.file.originalname, '/uploads/acceptance/images/'+req.file.filename,
         (req.file.size/1024).toFixed(2), uploaded_by||null]
      );
      res.status(201).json(result.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// POST upload video
app.post('/api/acceptance/sites/:id/videos', (req, res) => {
  acceptanceUpload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Invalid file type' });
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const { uploaded_by } = req.body || {};
    try {
      const result = await pool.query(
        `INSERT INTO project_videos (site_id, video_name, video_path, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, req.file.originalname, '/uploads/acceptance/videos/'+req.file.filename,
         (req.file.size/1024).toFixed(2), uploaded_by||null]
      );
      res.status(201).json(result.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// DELETE media
app.delete('/api/acceptance/files/:id',  async (req, res) => { try { await pool.query(`DELETE FROM project_files  WHERE id=$1`, [req.params.id]); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/acceptance/images/:id', async (req, res) => { try { await pool.query(`DELETE FROM project_images WHERE id=$1`, [req.params.id]); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/acceptance/videos/:id', async (req, res) => { try { await pool.query(`DELETE FROM project_videos WHERE id=$1`, [req.params.id]); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });

app.delete('/api/acceptance/media/bulk-delete', async (req, res) => {
  const type = String(req.body?.type || '').trim().toLowerCase();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];

  if (!ids.length) return res.status(400).json({ error: 'ids required' });

  const tableMap = {
    files: 'project_files',
    images: 'project_images',
    videos: 'project_videos'
  };

  const table = tableMap[type];
  if (!table) return res.status(400).json({ error: 'Invalid media type' });

  try {
    const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(',');
    const result = await pool.query(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);
    res.json({ success: true, deleted: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all project_progress for progress view
app.get('/api/acceptance/progress', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM project_progress ORDER BY project_name`);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST create/update project
app.post('/api/acceptance/projects', async (req, res) => {
  const { project_name } = req.body || {};
  if (!project_name?.trim()) return res.status(400).json({ error: 'project_name required' });
  try {
    const result = await pool.query(
      `INSERT INTO project_progress (project_name) VALUES ($1)
       ON CONFLICT (project_name) DO UPDATE SET updated_at=NOW() RETURNING *`,
      [project_name.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ================= ACCEPTANCE ================= */

const multerAcc = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = require('path').join(__dirname, 'public', 'uploads', 'acceptance');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Auto-create acceptance tables
(async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_sites (
        id          SERIAL PRIMARY KEY,
        site_name   CITEXT NOT NULL,
        status      CITEXT NOT NULL DEFAULT 'Pending' CHECK (LOWER(status) IN ('pending','done')),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_files (
        id          SERIAL PRIMARY KEY,
        site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
        file_name   CITEXT NOT NULL,
        file_path   TEXT NOT NULL,
        file_size   NUMERIC(10,2),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_images (
        id          SERIAL PRIMARY KEY,
        site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
        image_name  CITEXT NOT NULL,
        image_path  TEXT NOT NULL,
        file_size   NUMERIC(10,2),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_videos (
        id          SERIAL PRIMARY KEY,
        site_id     INT NOT NULL REFERENCES project_sites(id) ON DELETE CASCADE,
        video_name  CITEXT NOT NULL,
        video_path  TEXT NOT NULL,
        file_size   NUMERIC(10,2),
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_progress (
        id           SERIAL PRIMARY KEY,
        project_name CITEXT NOT NULL UNIQUE,
        progress     NUMERIC(5,2) DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW()
      )`);
    console.log('Acceptance tables ready ✅');
  } catch(e) { console.error('Acceptance setup error:', e.message); }
})();

// (duplicate routes removed — canonical versions defined above)

(async () => {
  try {
    await pool.query(`ALTER TABLE project_sites ADD COLUMN IF NOT EXISTS installer_name TEXT`);
    await pool.query(`ALTER TABLE project_sites ADD COLUMN IF NOT EXISTS acceptance_date DATE`);
  } catch (e) {
    console.error('Acceptance column migration error:', e.message);
  }
})();

// POST upload file
app.post('/api/acceptance/files', multerAcc.array('file'), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No file' });

  const { site_id, uploaded_by } = req.body;

  try {
    const inserted = [];
    for (const file of files) {
      const result = await pool.query(
        `INSERT INTO project_files (site_id, file_name, file_path, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          site_id,
          file.originalname,
          '/uploads/acceptance/' + file.filename,
          (file.size / 1024).toFixed(2),
          uploaded_by || null
        ]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ uploaded: inserted.length, items: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload image
app.post('/api/acceptance/images', multerAcc.array('image'), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No file' });

  const { site_id, uploaded_by } = req.body;

  try {
    const inserted = [];
    for (const file of files) {
      const result = await pool.query(
        `INSERT INTO project_images (site_id, image_name, image_path, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          site_id,
          file.originalname,
          '/uploads/acceptance/' + file.filename,
          (file.size / 1024).toFixed(2),
          uploaded_by || null
        ]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ uploaded: inserted.length, items: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload video
app.post('/api/acceptance/videos', multerAcc.array('video'), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No file' });

  const { site_id, uploaded_by } = req.body;

  try {
    const inserted = [];
    for (const file of files) {
      const result = await pool.query(
        `INSERT INTO project_videos (site_id, video_name, video_path, file_size, uploaded_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          site_id,
          file.originalname,
          '/uploads/acceptance/' + file.filename,
          (file.size / 1024).toFixed(2),
          uploaded_by || null
        ]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ uploaded: inserted.length, items: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET files for a site
app.get('/api/acceptance/sites/:id/files', async (req, res) => {
  try {
    const [files, images, videos] = await Promise.all([
      pool.query(`SELECT *, 'file' AS type FROM project_files WHERE site_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
      pool.query(`SELECT *, 'image' AS type FROM project_images WHERE site_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
      pool.query(`SELECT *, 'video' AS type FROM project_videos WHERE site_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
    ]);
    res.json({ files: files.rows, images: images.rows, videos: videos.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const HOST = '0.0.0.0';


/* ================= BIDDER MODULE ROUTES: BIDDING + ELIGIBILITY ================= */
/* ================= BIDDING DOCUMENTS ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bidding_documents (
        id          SERIAL PRIMARY KEY,
        bidder_id   INTEGER       NOT NULL,
        file_name   TEXT          NOT NULL,
        file_url    TEXT,
        doc_type    TEXT,
        file_size   BIGINT        DEFAULT 0,
        status      TEXT          NOT NULL CHECK (status IN ('awarded','rejected')),
        description TEXT,
        date        DATE          DEFAULT CURRENT_DATE,
        created_at  TIMESTAMPTZ   DEFAULT NOW(),
        updated_at  TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bidding_bidder_id ON bidding_documents(bidder_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bidding_status    ON bidding_documents(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bidding_date      ON bidding_documents(date DESC)`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`DROP TRIGGER IF EXISTS bidding_documents_updated_at ON bidding_documents`);
    await pool.query(`
      CREATE TRIGGER bidding_documents_updated_at
        BEFORE UPDATE ON bidding_documents
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
    console.log('Bidding documents table ready ✅');
  } catch (e) {
    console.error('Bidding documents setup error:', e.message);
  }
})();

const multerBidding = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'bidding');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, ZIP'));
  }
});

function getBidderId(req) {
  const id = Number(req.headers['x-user-id'] || req.query.user_id || req.body?.user_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/* GET /api/bidder/bidding/:id/preview */
app.get('/api/bidder/bidding/:id/preview', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM bidding_documents WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM bidding_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const f        = rows[0];
    const filePath = path.join(__dirname, 'public', f.file_url);
    const fs       = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk.' });
    const ext = path.extname(f.file_name).toLowerCase();
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
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${f.file_name}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('GET /api/bidder/bidding/:id/preview:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/bidder/bidding/:id/download */
app.get('/api/bidder/bidding/:id/download', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM bidding_documents WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM bidding_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const f        = rows[0];
    const filePath = path.join(__dirname, 'public', f.file_url);
    res.download(filePath, f.file_name, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found on disk.' });
    });
  } catch (e) {
    console.error('GET /api/bidder/bidding/:id/download:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/bidder/bidding?status=awarded|rejected */
app.get('/api/bidder/bidding', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required (x-user-id header)' });
  const { status } = req.query;
  if (!status || !['awarded', 'rejected'].includes(status))
    return res.status(400).json({ error: 'status must be awarded or rejected' });
  try {
    const result = await pool.query(
      `SELECT * FROM bidding_documents WHERE bidder_id=$1 AND status=$2 ORDER BY date DESC, created_at DESC`,
      [bidderId, status]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('GET /api/bidder/bidding error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/bidder/bidding — Add Files modal */
app.post('/api/bidder/bidding', multerBidding.single('file'), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required (x-user-id header)' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const { doc_type, date, status, description } = req.body || {};
  if (!status || !['awarded', 'rejected'].includes(status))
    return res.status(400).json({ error: 'status must be awarded or rejected' });
  try {
    const result = await pool.query(
      `INSERT INTO bidding_documents (bidder_id, file_name, file_url, doc_type, file_size, status, description, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        bidderId,
        file.originalname,
        '/uploads/bidding/' + file.filename,
        doc_type    || null,
        file.size   || 0,
        status,
        description || null,
        date        || new Date().toISOString().slice(0, 10)
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('POST /api/bidder/bidding error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/bidder/bidding/upload — drag-and-drop quick upload */
app.post('/api/bidder/bidding/upload', multerBidding.single('file'), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required (x-user-id header)' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const status = ['awarded', 'rejected'].includes(req.body.status) ? req.body.status : 'awarded';
  try {
    const result = await pool.query(
      `INSERT INTO bidding_documents (bidder_id, file_name, file_url, file_size, status, date)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE) RETURNING *`,
      [bidderId, file.originalname, '/uploads/bidding/' + file.filename, file.size || 0, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('POST /api/bidder/bidding/upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* PUT /api/bidder/bidding/:id — Edit document metadata */
app.put('/api/bidder/bidding/:id', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const { doc_type, date, status, description } = req.body || {};
  if (status && !['awarded', 'rejected'].includes(status))
    return res.status(400).json({ error: 'status must be awarded or rejected' });
  try {
    const result = await pool.query(
      `UPDATE bidding_documents
       SET doc_type    = COALESCE($1, doc_type),
           date        = COALESCE($2::date, date),
           status      = COALESCE($3, status),
           description = COALESCE($4, description),
           updated_at  = NOW()
       WHERE id = $5 AND bidder_id = $6
       RETURNING *`,
      [
        doc_type    || null,
        date        || null,
        status      || null,
        description !== undefined ? description : null,
        req.params.id,
        bidderId
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error('PUT /api/bidder/bidding error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/bidder/bidding/:id */
app.delete('/api/bidder/bidding/:id', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  try {
    const existing = await pool.query(
      `SELECT file_url FROM bidding_documents WHERE id=$1 AND bidder_id=$2`,
      [req.params.id, bidderId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Document not found' });
    const filePath = existing.rows[0].file_url;
    if (filePath) require('fs').unlink(path.join(__dirname, 'public', filePath), () => {});
    await pool.query(`DELETE FROM bidding_documents WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/bidder/bidding error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* Multer error handler for bidding routes */
app.use((err, req, res, next) => {
  if (err && req.path.startsWith('/api/bidder/bidding'))
    return res.status(400).json({ error: err.message });
  next(err);
});

/* ================= END BIDDING DOCUMENTS ================= */

/* ================= ELIGIBILITY DOCUMENTS ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eligibility_documents (
        id           SERIAL PRIMARY KEY,
        bidder_id    INTEGER      NOT NULL,
        file_name    TEXT         NOT NULL,
        file_url     TEXT,
        doc_name     TEXT,
        category     TEXT,
        file_size    BIGINT       DEFAULT 0,
        issued_date  DATE,
        expiry_date  DATE         NOT NULL,
        result       TEXT         CHECK (result IN ('win','loss')),
        notes        TEXT,
        created_at   TIMESTAMPTZ  DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    /* migrate existing tables that may not have result column yet */
    await pool.query(`ALTER TABLE eligibility_documents ADD COLUMN IF NOT EXISTS result TEXT CHECK (result IN ('win','loss'))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_elig_bidder_id  ON eligibility_documents(bidder_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_elig_expiry     ON eligibility_documents(expiry_date)`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`DROP TRIGGER IF EXISTS eligibility_documents_updated_at ON eligibility_documents`);
    await pool.query(`
      CREATE TRIGGER eligibility_documents_updated_at
        BEFORE UPDATE ON eligibility_documents
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
    console.log('Eligibility documents table ready ✅');
  } catch (e) {
    console.error('Eligibility documents setup error:', e.message);
  }
})();

const multerElig = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'eligibility');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.doc','.docx','.xls','.xlsx','.jpg','.jpeg','.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
  }
});

/* GET /api/bidder/eligibility — returns all docs for this bidder */
app.get('/api/bidder/eligibility', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  try {
    const result = await pool.query(
      `SELECT * FROM eligibility_documents WHERE bidder_id=$1 ORDER BY expiry_date ASC`,
      [bidderId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('GET /api/bidder/eligibility error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/bidder/eligibility — upload new document */
app.post('/api/bidder/eligibility', multerElig.single('file'), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const { doc_name, category, issued_date, expiry_date, result, notes } = req.body || {};
  if (!expiry_date) return res.status(400).json({ error: 'expiry_date is required' });
  const safeResult = ['win','loss'].includes(result) ? result : null;
  try {
    const dbResult = await pool.query(
      `INSERT INTO eligibility_documents
         (bidder_id, file_name, file_url, doc_name, category, file_size, issued_date, expiry_date, result, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        bidderId,
        file.originalname,
        '/uploads/eligibility/' + file.filename,
        doc_name    || file.originalname,
        category    || null,
        file.size   || 0,
        issued_date || null,
        expiry_date,
        safeResult,
        notes       || null
      ]
    );
    res.status(201).json(dbResult.rows[0]);
  } catch (e) {
    console.error('POST /api/bidder/eligibility error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/bidder/eligibility/:id */
app.delete('/api/bidder/eligibility/:id', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  try {
    const existing = await pool.query(
      `SELECT file_url FROM eligibility_documents WHERE id=$1 AND bidder_id=$2`,
      [req.params.id, bidderId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Document not found' });
    const { file_url } = existing.rows[0];
    if (file_url) require('fs').unlink(path.join(__dirname, 'public', file_url), () => {});
    await pool.query(`DELETE FROM eligibility_documents WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/bidder/eligibility error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* PUT /api/bidder/eligibility/:id — edit metadata (no file re-upload) */
app.put('/api/bidder/eligibility/:id', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const { doc_name, category, issued_date, expiry_date, result, notes } = req.body || {};
  if (!expiry_date) return res.status(400).json({ error: 'expiry_date is required' });
  const safeResult = ['win','loss'].includes(result) ? result : null;
  try {
    const existing = await pool.query(
      `SELECT id FROM eligibility_documents WHERE id=$1 AND bidder_id=$2`,
      [req.params.id, bidderId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Document not found' });
    const updated = await pool.query(
      `UPDATE eligibility_documents
       SET doc_name=$1, category=$2, issued_date=$3, expiry_date=$4, result=$5, notes=$6
       WHERE id=$7 AND bidder_id=$8 RETURNING *`,
      [doc_name||null, category||null, issued_date||null, expiry_date, safeResult, notes||null, req.params.id, bidderId]
    );
    res.json(updated.rows[0]);
  } catch (e) {
    console.error('PUT /api/bidder/eligibility error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/bidder/eligibility/:id/preview */
app.get('/api/bidder/eligibility/:id/preview', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM eligibility_documents WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM eligibility_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const f        = rows[0];
    const filePath = path.join(__dirname, 'public', f.file_url);
    if (!require('fs').existsSync(filePath))
      return res.status(404).json({ error: 'File not found on disk.' });
    const mimeTypes = {
      '.pdf':  'application/pdf',
      '.png':  'image/png',
      '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',  '.webp': 'image/webp',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc':  'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls':  'application/vnd.ms-excel',
      '.mp4':  'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    };
    const ext = path.extname(f.file_name).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${f.file_name}"`);
    require('fs').createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('GET /api/bidder/eligibility/:id/preview:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/bidder/eligibility/:id/download */
app.get('/api/bidder/eligibility/:id/download', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM eligibility_documents WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM eligibility_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const f        = rows[0];
    const filePath = path.join(__dirname, 'public', f.file_url);
    res.download(filePath, f.file_name, err => {
      if (err && !res.headersSent)
        res.status(404).json({ error: 'File not found on disk.' });
    });
  } catch (e) {
    console.error('GET /api/bidder/eligibility/:id/download:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ================= END ELIGIBILITY DOCUMENTS ================= */
/* ================= END BIDDER MODULE ROUTES: BIDDING + ELIGIBILITY ================= */

/* ================= BIDDER JOINT VENTURE DOCUMENTS ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS joint_venture_documents (
        id SERIAL PRIMARY KEY,
        bidder_id INTEGER NOT NULL,
        doc_section TEXT NOT NULL CHECK (doc_section IN ('eligibility','noa','contract','ntp','acceptance')),
        doc_name TEXT,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_type TEXT,
        category TEXT,
        file_size BIGINT DEFAULT 0,
        status TEXT DEFAULT 'valid',
        folder_year INTEGER,
        document_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS joint_venture_year_folders (
        id SERIAL PRIMARY KEY,
        bidder_id INTEGER NOT NULL,
        folder_year INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (bidder_id, folder_year)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_jv_docs_bidder_section ON joint_venture_documents(bidder_id, doc_section)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_jv_docs_year ON joint_venture_documents(bidder_id, folder_year)`);
    console.log('Joint venture documents tables ready ✅');
  } catch (e) {
    console.error('Joint venture documents setup error:', e.message);
  }
})();

const JV_SECTIONS = ['eligibility', 'noa', 'contract', 'ntp', 'acceptance'];
const JV_STATUSES = ['valid', 'issued', 'signed', 'attached', 'contract', 'bond', 'completed'];

const multerJointVenture = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'joint-venture');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
  }
});

function jointVentureMimeType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.zip': 'application/zip'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

app.get('/api/bidder/joint-venture', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const section = String(req.query.section || '').toLowerCase();
  if (!JV_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const year = req.query.year ? Number(req.query.year) : null;
  try {
    const params = [bidderId, section];
    let where = 'WHERE bidder_id = $1 AND doc_section = $2';
    if (Number.isInteger(year)) {
      params.push(year);
      where += ` AND folder_year = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM joint_venture_documents ${where} ORDER BY document_date DESC, created_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/bidder/joint-venture error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/joint-venture/years', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  try {
    const { rows } = await pool.query(
      `WITH years AS (
         SELECT folder_year AS year, created_at
           FROM joint_venture_year_folders
          WHERE bidder_id = $1
         UNION
         SELECT folder_year AS year, MIN(created_at) AS created_at
           FROM joint_venture_documents
          WHERE bidder_id = $1 AND doc_section = 'acceptance' AND folder_year IS NOT NULL
          GROUP BY folder_year
       )
       SELECT y.year, MIN(y.created_at) AS created_at, COUNT(d.id)::int AS file_count
         FROM years y
         LEFT JOIN joint_venture_documents d
           ON d.bidder_id = $1
          AND d.doc_section = 'acceptance'
          AND d.folder_year = y.year
        GROUP BY y.year
        ORDER BY y.year DESC`,
      [bidderId]
    );
    res.json(rows.filter(r => r.year));
  } catch (e) {
    console.error('GET /api/bidder/joint-venture/years error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/joint-venture/years', express.json(), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const year = Number(req.body?.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    return res.status(400).json({ error: 'Valid year is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO joint_venture_year_folders (bidder_id, folder_year)
       VALUES ($1, $2)
       ON CONFLICT (bidder_id, folder_year) DO UPDATE SET folder_year = EXCLUDED.folder_year
       RETURNING folder_year AS year, created_at`,
      [bidderId, year]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/bidder/joint-venture/years error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/joint-venture', multerJointVenture.single('file'), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const section = String(req.body?.section || '').toLowerCase();
  if (!JV_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const status = JV_STATUSES.includes(req.body?.status) ? req.body.status : (section === 'acceptance' ? 'completed' : 'valid');
  const folderYear = req.body?.folder_year ? Number(req.body.folder_year) : null;
  if (section === 'acceptance' && (!Number.isInteger(folderYear) || folderYear < 1900 || folderYear > 2200))
    return res.status(400).json({ error: 'Acceptance uploads require a valid folder_year' });
  try {
    if (section === 'acceptance') {
      await pool.query(
        `INSERT INTO joint_venture_year_folders (bidder_id, folder_year)
         VALUES ($1, $2)
         ON CONFLICT (bidder_id, folder_year) DO NOTHING`,
        [bidderId, folderYear]
      );
    }
    const { rows } = await pool.query(
      `INSERT INTO joint_venture_documents
        (bidder_id, doc_section, doc_name, file_name, file_url, file_type, category, file_size, status, folder_year, document_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        bidderId,
        section,
        req.body?.doc_name || file.originalname,
        file.originalname,
        '/uploads/joint-venture/' + file.filename,
        path.extname(file.originalname).replace('.', '').toLowerCase(),
        req.body?.category || null,
        file.size || 0,
        status,
        section === 'acceptance' ? folderYear : null,
        req.body?.document_date || new Date().toISOString().slice(0, 10)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/bidder/joint-venture error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/joint-venture/:id/preview', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM joint_venture_documents WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM joint_venture_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const filePath = path.join(__dirname, 'public', rows[0].file_url);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk.' });
    res.setHeader('Content-Type', jointVentureMimeType(rows[0].file_name));
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].file_name}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('GET /api/bidder/joint-venture/:id/preview:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/joint-venture/:id/download', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM joint_venture_documents WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM joint_venture_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const filePath = path.join(__dirname, 'public', rows[0].file_url);
    res.download(filePath, rows[0].file_name, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found on disk.' });
    });
  } catch (e) {
    console.error('GET /api/bidder/joint-venture/:id/download:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.use((err, req, res, next) => {
  if (err && req.path.startsWith('/api/bidder/joint-venture'))
    return res.status(400).json({ error: err.message });
  next(err);
});

/* ================= END BIDDER JOINT VENTURE DOCUMENTS ================= */

/* ================= BIDDER FINISHED PROJECT ARCHIVES ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finished_project_archive_folders (
        id SERIAL PRIMARY KEY,
        bidder_id INTEGER NOT NULL,
        archive_year INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (bidder_id, archive_year)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finished_project_archive_files (
        id SERIAL PRIMARY KEY,
        bidder_id INTEGER NOT NULL,
        folder_id INTEGER REFERENCES finished_project_archive_folders(id) ON DELETE CASCADE,
        archive_year INTEGER NOT NULL,
        title TEXT,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_type TEXT,
        category TEXT,
        file_size BIGINT DEFAULT 0,
        status TEXT DEFAULT 'completed',
        archived_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_finished_archive_folders_bidder ON finished_project_archive_folders(bidder_id, archive_year)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_finished_archive_files_bidder_year ON finished_project_archive_files(bidder_id, archive_year)`);
    console.log('Finished project archive tables ready ✅');
  } catch (e) {
    console.error('Finished project archive setup error:', e.message);
  }
})();

const multerFinishedArchive = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'finished-projects');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
  }
});

function finishedArchiveMimeType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ({
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.zip': 'application/zip'
  })[ext] || 'application/octet-stream';
}

app.get('/api/bidder/finished-projects/folders', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  try {
    const { rows } = await pool.query(
      `SELECT f.id, f.archive_year AS year, f.created_at, COUNT(d.id)::int AS project_count
         FROM finished_project_archive_folders f
         LEFT JOIN finished_project_archive_files d
           ON d.folder_id = f.id AND d.bidder_id = f.bidder_id
        WHERE f.bidder_id = $1
        GROUP BY f.id
        ORDER BY f.archive_year DESC`,
      [bidderId]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/bidder/finished-projects/folders error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/finished-projects/folders', express.json(), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const year = Number(req.body?.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    return res.status(400).json({ error: 'Valid year is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO finished_project_archive_folders (bidder_id, archive_year)
       VALUES ($1, $2)
       RETURNING id, archive_year AS year, created_at, 0::int AS project_count`,
      [bidderId, year]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Archive folder already exists for this year' });
    console.error('POST /api/bidder/finished-projects/folders error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/finished-projects/files', async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const year = Number(req.query.year);
  if (!Number.isInteger(year)) return res.status(400).json({ error: 'Valid year is required' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM finished_project_archive_files
        WHERE bidder_id = $1 AND archive_year = $2
        ORDER BY archived_date DESC, created_at DESC`,
      [bidderId, year]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/bidder/finished-projects/files error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/finished-projects/files', multerFinishedArchive.single('file'), async (req, res) => {
  const bidderId = getBidderId(req);
  if (!bidderId) return res.status(401).json({ error: 'User ID required' });
  const year = Number(req.body?.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    return res.status(400).json({ error: 'Valid year is required' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const folder = await pool.query(
      `INSERT INTO finished_project_archive_folders (bidder_id, archive_year)
       VALUES ($1, $2)
       ON CONFLICT (bidder_id, archive_year) DO UPDATE SET archive_year = EXCLUDED.archive_year
       RETURNING id`,
      [bidderId, year]
    );
    const { rows } = await pool.query(
      `INSERT INTO finished_project_archive_files
        (bidder_id, folder_id, archive_year, title, file_name, file_url, file_type, category, file_size, status, archived_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10)
       RETURNING *`,
      [
        bidderId,
        folder.rows[0].id,
        year,
        req.body?.title || req.file.originalname,
        req.file.originalname,
        '/uploads/finished-projects/' + req.file.filename,
        path.extname(req.file.originalname).replace('.', '').toLowerCase(),
        req.body?.category || 'Project Completion Documents',
        req.file.size || 0,
        req.body?.archived_date || new Date().toISOString().slice(0, 10)
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/bidder/finished-projects/files error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/finished-projects/files/:id/preview', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM finished_project_archive_files WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM finished_project_archive_files WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    const fs = require('fs');
    const filePath = path.join(__dirname, 'public', rows[0].file_url);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk.' });
    res.setHeader('Content-Type', finishedArchiveMimeType(rows[0].file_name));
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].file_name}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('GET /api/bidder/finished-projects/files/:id/preview:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/finished-projects/files/:id/download', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const { rows } = bidderId
      ? await pool.query('SELECT * FROM finished_project_archive_files WHERE id = $1 AND bidder_id = $2', [req.params.id, bidderId])
      : await pool.query('SELECT * FROM finished_project_archive_files WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.download(path.join(__dirname, 'public', rows[0].file_url), rows[0].file_name, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found on disk.' });
    });
  } catch (e) {
    console.error('GET /api/bidder/finished-projects/files/:id/download:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.use((err, req, res, next) => {
  if (err && req.path.startsWith('/api/bidder/finished-projects'))
    return res.status(400).json({ error: err.message });
  next(err);
});

/* ================= END BIDDER FINISHED PROJECT ARCHIVES ================= */

/* ================= BIDDER ACCEPTANCE DOCUMENTS ================= */

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS acceptance_doc_folders (
        id SERIAL PRIMARY KEY,
        bidder_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        folder_name VARCHAR(150) NOT NULL,
        parent_id INTEGER REFERENCES acceptance_doc_folders(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (bidder_id, folder_name, parent_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS acceptance_doc_files (
        id SERIAL PRIMARY KEY,
        folder_id INTEGER NOT NULL REFERENCES acceptance_doc_folders(id) ON DELETE CASCADE,
        bidder_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT DEFAULT 0,
        file_type VARCHAR(50),
        project_name TEXT,
        acceptance_type TEXT,
        issued_by TEXT,
        issued_date DATE,
        expiry_date DATE,
        status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','archived')),
        notes TEXT,
        uploader_name TEXT,
        last_access TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`DROP TRIGGER IF EXISTS acc_doc_folders_updated_at ON acceptance_doc_folders`);
    await pool.query(`
      CREATE TRIGGER acc_doc_folders_updated_at
        BEFORE UPDATE ON acceptance_doc_folders
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
    await pool.query(`DROP TRIGGER IF EXISTS acc_doc_files_updated_at ON acceptance_doc_files`);
    await pool.query(`
      CREATE TRIGGER acc_doc_files_updated_at
        BEFORE UPDATE ON acceptance_doc_files
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acc_doc_folders_bidder ON acceptance_doc_folders(bidder_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acc_doc_folders_parent ON acceptance_doc_folders(parent_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acc_doc_files_folder ON acceptance_doc_files(folder_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acc_doc_files_bidder ON acceptance_doc_files(bidder_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acc_doc_files_status ON acceptance_doc_files(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acc_doc_files_expiry ON acceptance_doc_files(expiry_date)`);
    console.log('Bidder acceptance document tables ready');
  } catch (e) {
    console.error('Bidder acceptance setup error:', e.message);
  }
})();

const bidderAcceptanceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'bidder-acceptance');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      const base = path.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}_${base}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }
});

function bidderFileType(filename = '') {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const map = {
    pdf: 'pdf',
    doc: 'word',
    docx: 'word',
    xls: 'excel',
    xlsx: 'excel',
    txt: 'text',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    mp4: 'video',
    webm: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video'
  };
  return map[ext] || ext || 'file';
}

function bidderMimeType(filename = '') {
  return ({
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska'
  })[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function requireBidderId(req, res) {
  const bidderId = getBidderId(req);
  if (!bidderId) {
    res.status(401).json({ error: 'User ID required' });
    return null;
  }
  return bidderId;
}

app.get('/api/bidder/acceptance/folders', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  try {
    const rawParent = req.query.parent_id;
    const parentId = rawParent !== undefined && rawParent !== '' ? Number(rawParent) : null;
    const result = parentId !== null
      ? await pool.query(`
          SELECT f.id, f.folder_name, f.parent_id, f.created_at,
                 (SELECT COUNT(*)::int FROM acceptance_doc_files fi WHERE fi.folder_id = f.id AND fi.bidder_id = $1) +
                 (SELECT COUNT(*)::int FROM acceptance_doc_folders sf WHERE sf.parent_id = f.id AND sf.bidder_id = $1) AS file_count
          FROM acceptance_doc_folders f
          WHERE f.bidder_id = $1 AND f.parent_id = $2 AND f.id != $2
          ORDER BY f.folder_name
        `, [bidderId, parentId])
      : await pool.query(`
          SELECT f.id, f.folder_name, f.parent_id, f.created_at,
                 (SELECT COUNT(*)::int FROM acceptance_doc_files fi WHERE fi.folder_id = f.id AND fi.bidder_id = $1) +
                 (SELECT COUNT(*)::int FROM acceptance_doc_folders sf WHERE sf.parent_id = f.id AND sf.bidder_id = $1) AS file_count
          FROM acceptance_doc_folders f
          WHERE f.bidder_id = $1 AND f.parent_id IS NULL
          ORDER BY f.folder_name
        `, [bidderId]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/acceptance/folders', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const folderName = String(req.body?.folder_name || '').trim();
  const parentId = req.body?.parent_id || null;
  if (!folderName) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO acceptance_doc_folders (bidder_id, folder_name, parent_id) VALUES ($1,$2,$3) RETURNING *`,
      [bidderId, folderName, parentId]
    );
    res.status(201).json({ success: true, folder: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/bidder/acceptance/folders/:id', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const folderName = String(req.body?.folder_name || '').trim();
  if (!folderName) return res.status(400).json({ error: 'folder_name is required' });
  try {
    const result = await pool.query(
      `UPDATE acceptance_doc_folders SET folder_name=$1 WHERE id=$2 AND bidder_id=$3 RETURNING *`,
      [folderName, req.params.id, bidderId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true, folder: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bidder/acceptance/folders/:id', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  try {
    const result = await pool.query(`DELETE FROM acceptance_doc_folders WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Folder not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/acceptance/folders/:id/files', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const q = req.query.q ? `%${req.query.q}%` : null;
  try {
    const result = await pool.query(
      `SELECT * FROM acceptance_doc_files WHERE bidder_id=$1 AND folder_id=$2 ${q ? 'AND file_name ILIKE $3' : ''} ORDER BY created_at DESC`,
      q ? [bidderId, req.params.id, q] : [bidderId, req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/acceptance/files/recent', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  try {
    const result = await pool.query(`SELECT * FROM acceptance_doc_files WHERE bidder_id=$1 ORDER BY created_at DESC LIMIT 8`, [bidderId]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/acceptance/files/search', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const q = req.query.q ? `%${req.query.q}%` : '%';
  try {
    const result = await pool.query(
      `SELECT * FROM acceptance_doc_files WHERE bidder_id=$1 AND file_name ILIKE $2 ORDER BY created_at DESC LIMIT 50`,
      [bidderId, q]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/acceptance/uploaders', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  try {
    const result = await pool.query(
      `SELECT DISTINCT uploader_name FROM acceptance_doc_files WHERE bidder_id=$1 AND uploader_name IS NOT NULL ORDER BY uploader_name`,
      [bidderId]
    );
    res.json(result.rows.map(row => row.uploader_name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/acceptance/files', (req, res) => {
  bidderAcceptanceUpload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    const bidderId = getBidderId(req);
    if (!bidderId) return res.status(401).json({ error: 'User ID required' });
    const folderId = req.body?.folder_id;
    if (!folderId) return res.status(400).json({ error: 'folder_id is required' });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const filePath = `/uploads/bidder-acceptance/${req.file.filename}`;
    try {
      const result = await pool.query(
        `INSERT INTO acceptance_doc_files
         (folder_id, bidder_id, uploader_name, file_name, file_path, file_size, file_type, last_access)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
        [
          folderId,
          bidderId,
          req.body?.uploader_name || null,
          req.file.originalname,
          filePath,
          req.file.size || 0,
          bidderFileType(req.file.originalname)
        ]
      );
      res.status(201).json({ success: true, file: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

app.put('/api/bidder/acceptance/files/:id', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const fileName = String(req.body?.file_name || '').trim();
  if (!fileName) return res.status(400).json({ error: 'file_name is required' });
  try {
    const result = await pool.query(
      `UPDATE acceptance_doc_files SET file_name=$1 WHERE id=$2 AND bidder_id=$3 RETURNING *`,
      [fileName, req.params.id, bidderId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true, file: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bidder/acceptance/files/:id', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  try {
    const existing = await pool.query(`SELECT file_path FROM acceptance_doc_files WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    if (!existing.rowCount) return res.status(404).json({ error: 'File not found' });
    await pool.query(`DELETE FROM acceptance_doc_files WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    const absolutePath = path.join(__dirname, 'public', existing.rows[0].file_path);
    fs.unlink(absolutePath, () => {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/acceptance/files/:id/download', async (req, res) => {
  const bidderId = getBidderId(req);
  try {
    const result = bidderId
      ? await pool.query(`SELECT * FROM acceptance_doc_files WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId])
      : await pool.query(`SELECT * FROM acceptance_doc_files WHERE id=$1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    if (bidderId) {
      await pool.query(`UPDATE acceptance_doc_files SET last_access=NOW() WHERE id=$1 AND bidder_id=$2`, [file.id, bidderId]);
    }
    res.download(path.join(__dirname, 'public', file.file_path), file.file_name, err => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found on disk' });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bidder/acceptance/files/:id/preview', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  try {
    const result = await pool.query(`SELECT * FROM acceptance_doc_files WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    if (!result.rowCount) return res.status(404).json({ error: 'File not found' });
    const file = result.rows[0];
    const absolutePath = path.join(__dirname, 'public', file.file_path);
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.setHeader('Content-Type', bidderMimeType(file.file_name));
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(absolutePath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/acceptance/files/:id/copy', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const targetFolderId = req.body?.target_folder_id;
  if (!targetFolderId) return res.status(400).json({ error: 'target_folder_id is required' });
  try {
    const existing = await pool.query(`SELECT * FROM acceptance_doc_files WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    if (!existing.rowCount) return res.status(404).json({ error: 'File not found' });
    const file = existing.rows[0];
    const ext = path.extname(file.file_name);
    const base = path.basename(file.file_name, ext).replace(/\s*\(copy.*\)$/, '').trimEnd();
    const copiedName = `${base} (copy)${ext}`;
    const copiedPath = `/uploads/bidder-acceptance/${Date.now()}_${path.basename(file.file_path)}`;
    fs.mkdirSync(path.dirname(path.join(__dirname, 'public', copiedPath)), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'public', file.file_path), path.join(__dirname, 'public', copiedPath));
    const result = await pool.query(
      `INSERT INTO acceptance_doc_files (folder_id, bidder_id, uploader_name, file_name, file_path, file_size, file_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [targetFolderId, bidderId, file.uploader_name, copiedName, copiedPath, file.file_size, file.file_type]
    );
    res.status(201).json({ success: true, file: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bidder/acceptance/folders/:id/copy', async (req, res) => {
  const bidderId = await requireBidderId(req, res);
  if (!bidderId) return;
  const targetParentId = req.body?.target_parent_id;
  if (!targetParentId) return res.status(400).json({ error: 'target_parent_id is required' });
  try {
    const sourceFolder = await pool.query(`SELECT * FROM acceptance_doc_folders WHERE id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    if (!sourceFolder.rowCount) return res.status(404).json({ error: 'Folder not found' });
    const inserted = await pool.query(
      `INSERT INTO acceptance_doc_folders (bidder_id, folder_name, parent_id) VALUES ($1,$2,$3) RETURNING *`,
      [bidderId, `${sourceFolder.rows[0].folder_name} (copy)`, targetParentId]
    );
    const newFolderId = inserted.rows[0].id;
    const files = await pool.query(`SELECT * FROM acceptance_doc_files WHERE folder_id=$1 AND bidder_id=$2`, [req.params.id, bidderId]);
    for (const file of files.rows) {
      try {
        const copiedPath = `/uploads/bidder-acceptance/${Date.now()}_${path.basename(file.file_path)}`;
        fs.mkdirSync(path.dirname(path.join(__dirname, 'public', copiedPath)), { recursive: true });
        fs.copyFileSync(path.join(__dirname, 'public', file.file_path), path.join(__dirname, 'public', copiedPath));
        await pool.query(
          `INSERT INTO acceptance_doc_files (folder_id, bidder_id, uploader_name, file_name, file_path, file_size, file_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newFolderId, bidderId, file.uploader_name, file.file_name, copiedPath, file.file_size, file.file_type]
        );
      } catch {
        // Skip individual files that cannot be copied.
      }
    }
    res.status(201).json({ success: true, folder_id: newFolderId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= END BIDDER ACCEPTANCE DOCUMENTS ================= */

const server = app.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│           Server is now running!             │');
  console.log('├─────────────────────────────────────────────┤');
  console.log(`│  Local:    http://localhost:${PORT}             │`);
  console.log(`│  Network:  http://${localIP}:${PORT}         │`);
  console.log('├─────────────────────────────────────────────┤');
  console.log('│  Share the Network URL with LAN devices      │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} is already in use. Free it or change PORT in your environment.`);
  else console.error('Server error:', err);
  process.exit(1);
});
