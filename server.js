const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const ARIMA = require('arima');
const multer = require('multer');
const Tesseract = require('tesseract.js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isVercel = process.env.VERCEL === '1';
const isProd = process.env.NODE_ENV === 'production' || isVercel;

const dataDir = process.env.DATA_DIR
  || (isVercel ? '/tmp' : path.join(__dirname, 'data'));
fs.mkdirSync(dataDir, { recursive: true });

const uploadDir = process.env.UPLOAD_DIR || path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const legacyDbPath = path.join(__dirname, 'database.sqlite');
const dbPath = process.env.DATABASE_PATH
  || (isVercel
    ? path.join(dataDir, 'database.sqlite')
    : (fs.existsSync(legacyDbPath) ? legacyDbPath : path.join(dataDir, 'database.sqlite')));

const PRIVATE_FILES = new Set([
  'server.js',
  'package.json',
  'package-lock.json',
  'render.yaml',
  'vercel.json',
  '.gitignore',
  '.npmrc',
  'test.js'
]);

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const base = path.basename(req.path);
  if (PRIVATE_FILES.has(base) || req.path.startsWith('/node_modules') || req.path.startsWith('/data')) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname, {
  index: 'index.html',
  dotfiles: 'ignore',
  extensions: ['html']
}));

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'));
    }
  }
});

// ── sql.js Database Layer ──────────────────────────────────────────────────
let db;

function saveDb() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('Error saving database:', e);
  }
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { changes: db.getRowsModified() };
}

const dbReady = initSqlJs().then((SQL) => {
  // Try to load existing database file
  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log(`Loaded existing SQLite database from ${dbPath}`);
    } else {
      db = new SQL.Database();
      console.log('Created new in-memory SQLite database');
    }
  } catch (e) {
    console.warn('Could not load existing database, creating new one:', e.message);
    db = new SQL.Database();
  }

  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount REAL,
    category TEXT,
    date TEXT,
    note TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS incomes (
    id TEXT PRIMARY KEY,
    amount REAL,
    category TEXT,
    date TEXT,
    note TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS budgets (
    category TEXT PRIMARY KEY,
    amount REAL
  )`);

  saveDb();
  console.log('Database tables initialized');
}).catch((err) => {
  console.error('Database init failed', err);
  throw err;
});

// ── Middleware to ensure DB is ready ────────────────────────────────────────
function withDb(handler) {
  return async (req, res) => {
    try {
      await dbReady;
      await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
      }
    }
  };
}

// ── Health Check ───────────────────────────────────────────────────────────
app.get('/health', withDb(async (req, res) => {
  const rows = dbAll('SELECT 1 AS ok');
  res.json({ status: 'ok' });
}));

// ── Expenses API ───────────────────────────────────────────────────────────
app.get('/api/expenses', withDb(async (req, res) => {
  const rows = dbAll('SELECT * FROM expenses');
  res.json(rows);
}));

app.post('/api/expenses', withDb(async (req, res) => {
  const { id, amount, category, date, note } = req.body;
  dbRun(
    `INSERT INTO expenses (id, amount, category, date, note) VALUES (?, ?, ?, ?, ?)`,
    [id, amount, category, date, note]
  );
  res.json({ id, amount, category, date, note });
}));

app.put('/api/expenses/:id', withDb(async (req, res) => {
  const { amount, category, date, note } = req.body;
  const result = dbRun(
    `UPDATE expenses SET amount = ?, category = ?, date = ?, note = ? WHERE id = ?`,
    [amount, category, date, note, req.params.id]
  );
  res.json({ changes: result.changes });
}));

app.delete('/api/expenses/:id', withDb(async (req, res) => {
  const result = dbRun(`DELETE FROM expenses WHERE id = ?`, [req.params.id]);
  res.json({ changes: result.changes });
}));

// ── Incomes API ────────────────────────────────────────────────────────────
app.get('/api/incomes', withDb(async (req, res) => {
  const rows = dbAll('SELECT * FROM incomes');
  res.json(rows);
}));

app.post('/api/incomes', withDb(async (req, res) => {
  const { id, amount, category, date, note } = req.body;
  dbRun(
    `INSERT INTO incomes (id, amount, category, date, note) VALUES (?, ?, ?, ?, ?)`,
    [id, amount, category, date, note]
  );
  res.json({ id, amount, category, date, note });
}));

app.put('/api/incomes/:id', withDb(async (req, res) => {
  const { amount, category, date, note } = req.body;
  const result = dbRun(
    `UPDATE incomes SET amount = ?, category = ?, date = ?, note = ? WHERE id = ?`,
    [amount, category, date, note, req.params.id]
  );
  res.json({ changes: result.changes });
}));

app.delete('/api/incomes/:id', withDb(async (req, res) => {
  const result = dbRun(`DELETE FROM incomes WHERE id = ?`, [req.params.id]);
  res.json({ changes: result.changes });
}));

// ── Budgets API ────────────────────────────────────────────────────────────
app.get('/api/budgets', withDb(async (req, res) => {
  const rows = dbAll('SELECT * FROM budgets');
  const defaultBudgets = { Food: 0, Transport: 0, Housing: 0, Entertainment: 0, Other: 0 };
  rows.forEach((row) => {
    defaultBudgets[row.category] = row.amount;
  });
  res.json(defaultBudgets);
}));

app.put('/api/budgets', withDb(async (req, res) => {
  const budgets = req.body;
  const categories = Object.keys(budgets);

  if (categories.length === 0) return res.json({ success: true });

  categories.forEach((category) => {
    const amount = budgets[category];
    dbRun(
      `INSERT INTO budgets (category, amount) VALUES (?, ?)
              ON CONFLICT(category) DO UPDATE SET amount = ?`,
      [category, amount, amount]
    );
  });
  res.json({ success: true });
}));

// ── ARIMA Forecasting API ──────────────────────────────────────────────────
app.get('/api/forecast', withDb(async (req, res) => {
  const rows = dbAll('SELECT date, amount FROM expenses ORDER BY date ASC');

  if (rows.length < 5) {
    return res.status(400).json({ error: 'Not enough data for forecasting. Need at least 5 records.' });
  }

  const dailyTotals = {};
  rows.forEach((r) => {
    dailyTotals[r.date] = (dailyTotals[r.date] || 0) + r.amount;
  });

  const sortedDates = Object.keys(dailyTotals).sort();
  const tsData = sortedDates.map((date) => dailyTotals[date]);

  try {
    const arima = new ARIMA({
      p: 1,
      d: 1,
      q: 1,
      verbose: false
    }).train(tsData);

    const [pred] = arima.predict(7);

    res.json({
      historical_days: tsData.length,
      forecast: pred,
      message: 'Predicted expenses for the next 7 days.'
    });
  } catch (modelErr) {
    res.status(500).json({ error: 'ARIMA model failed to train.', details: modelErr.message });
  }
}));

// ── Receipt OCR Upload ─────────────────────────────────────────────────────
app.post('/api/upload-receipt', upload.single('receipt'), withDb(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    const { data: { text } } = await Tesseract.recognize(
      req.file.path,
      'eng',
      { logger: (m) => console.log(m) }
    );

    const amountMatch = text.match(/(?:\$|Rs\.?|₹)?\s*(\d+(?:[.,]\d{2})?)/);
    const parsedAmount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

    let guessedCategory = 'Other';
    const lowerText = text.toLowerCase();
    const keywords = {
      Food: ['restaurant', 'cafe', 'coffee', 'mcdonalds', 'starbucks', 'food', 'lunch'],
      Transport: ['uber', 'lyft', 'taxi', 'transit', 'gas', 'fuel', 'petrol'],
      Housing: ['rent', 'electricity', 'water', 'utility'],
      Entertainment: ['movie', 'cinema', 'netflix', 'spotify', 'theatre']
    };

    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some((w) => lowerText.includes(w))) {
        guessedCategory = cat;
        break;
      }
    }

    res.json({
      success: true,
      extractedText: text,
      suggestedData: {
        amount: parsedAmount,
        category: guessedCategory,
        note: 'Scanned Receipt'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'OCR processing failed.', details: isProd ? undefined : error.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
}));

// ── Error Handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (!err) return next();
  const status = err instanceof multer.MulterError ? 400 : (err.status || 400);
  res.status(status).json({ error: err.message || 'Request failed' });
});

// ── Start Server (non-Vercel) ──────────────────────────────────────────────
function startServer() {
  const server = app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (!isVercel) {
  dbReady.then(startServer).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = app;
