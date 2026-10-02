const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
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

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log(`Connected to SQLite at ${dbPath}`);
  }
});

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function initDb() {
  await runSql('PRAGMA busy_timeout = 5000');
  await runSql('PRAGMA journal_mode = WAL');
  await runSql(`CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount REAL,
    category TEXT,
    date TEXT,
    note TEXT
  )`);
  await runSql(`CREATE TABLE IF NOT EXISTS incomes (
    id TEXT PRIMARY KEY,
    amount REAL,
    category TEXT,
    date TEXT,
    note TEXT
  )`);
  await runSql(`CREATE TABLE IF NOT EXISTS budgets (
    category TEXT PRIMARY KEY,
    amount REAL
  )`);
}

let dbReady = initDb().catch((err) => {
  console.error('Database init failed', err);
  throw err;
});

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

app.get('/health', withDb(async (req, res) => {
  await new Promise((resolve, reject) => {
    db.get('SELECT 1 AS ok', (err) => (err ? reject(err) : resolve()));
  });
  res.json({ status: 'ok' });
}));

// Expenses API
app.get('/api/expenses', withDb(async (req, res) => {
  db.all('SELECT * FROM expenses', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}));

app.post('/api/expenses', withDb(async (req, res) => {
  const { id, amount, category, date, note } = req.body;
  db.run(
    `INSERT INTO expenses (id, amount, category, date, note) VALUES (?, ?, ?, ?, ?)`,
    [id, amount, category, date, note],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, amount, category, date, note });
    }
  );
}));

app.put('/api/expenses/:id', withDb(async (req, res) => {
  const { amount, category, date, note } = req.body;
  db.run(
    `UPDATE expenses SET amount = ?, category = ?, date = ?, note = ? WHERE id = ?`,
    [amount, category, date, note, req.params.id],
    function onUpdate(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ changes: this.changes });
    }
  );
}));

app.delete('/api/expenses/:id', withDb(async (req, res) => {
  db.run(`DELETE FROM expenses WHERE id = ?`, req.params.id, function onDelete(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
}));

// Incomes API
app.get('/api/incomes', withDb(async (req, res) => {
  db.all('SELECT * FROM incomes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}));

app.post('/api/incomes', withDb(async (req, res) => {
  const { id, amount, category, date, note } = req.body;
  db.run(
    `INSERT INTO incomes (id, amount, category, date, note) VALUES (?, ?, ?, ?, ?)`,
    [id, amount, category, date, note],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, amount, category, date, note });
    }
  );
}));

app.put('/api/incomes/:id', withDb(async (req, res) => {
  const { amount, category, date, note } = req.body;
  db.run(
    `UPDATE incomes SET amount = ?, category = ?, date = ?, note = ? WHERE id = ?`,
    [amount, category, date, note, req.params.id],
    function onUpdate(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ changes: this.changes });
    }
  );
}));

app.delete('/api/incomes/:id', withDb(async (req, res) => {
  db.run(`DELETE FROM incomes WHERE id = ?`, req.params.id, function onDelete(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
}));

// Budgets API
app.get('/api/budgets', withDb(async (req, res) => {
  db.all('SELECT * FROM budgets', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const defaultBudgets = { Food: 0, Transport: 0, Housing: 0, Entertainment: 0, Other: 0 };
    rows.forEach((row) => {
      defaultBudgets[row.category] = row.amount;
    });
    res.json(defaultBudgets);
  });
}));

app.put('/api/budgets', withDb(async (req, res) => {
  const budgets = req.body;
  const categories = Object.keys(budgets);

  if (categories.length === 0) return res.json({ success: true });

  let completed = 0;
  let failed = false;

  categories.forEach((category) => {
    const amount = budgets[category];
    db.run(
      `INSERT INTO budgets (category, amount) VALUES (?, ?)
              ON CONFLICT(category) DO UPDATE SET amount = ?`,
      [category, amount, amount],
      (err) => {
        if (err && !failed) {
          failed = true;
          return res.status(500).json({ error: err.message });
        }
        completed++;
        if (!failed && completed === categories.length) {
          res.json({ success: true });
        }
      }
    );
  });
}));

// ARIMA Forecasting API
app.get('/api/forecast', withDb(async (req, res) => {
  db.all('SELECT date, amount FROM expenses ORDER BY date ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

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
  });
}));

// Receipt OCR Upload
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

app.use((err, req, res, next) => {
  if (!err) return next();
  const status = err instanceof multer.MulterError ? 400 : (err.status || 400);
  res.status(status).json({ error: err.message || 'Request failed' });
});

function startServer() {
  const server = app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}, shutting down`);
    server.close(() => {
      db.close(() => process.exit(0));
    });
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
