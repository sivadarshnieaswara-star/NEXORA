const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const ARIMA = require('arima');
const multer = require('multer');
const Tesseract = require('tesseract.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

const upload = multer({ dest: 'uploads/' });

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
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
  }
});

// Expenses API
app.get('/api/expenses', (req, res) => {
  db.all('SELECT * FROM expenses', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/expenses', (req, res) => {
  const { id, amount, category, date, note } = req.body;
  db.run(`INSERT INTO expenses (id, amount, category, date, note) VALUES (?, ?, ?, ?, ?)`, 
    [id, amount, category, date, note], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, amount, category, date, note });
    }
  );
});

app.put('/api/expenses/:id', (req, res) => {
  const { amount, category, date, note } = req.body;
  db.run(`UPDATE expenses SET amount = ?, category = ?, date = ?, note = ? WHERE id = ?`,
    [amount, category, date, note, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ changes: this.changes });
    }
  );
});

app.delete('/api/expenses/:id', (req, res) => {
  db.run(`DELETE FROM expenses WHERE id = ?`, req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// Incomes API
app.get('/api/incomes', (req, res) => {
  db.all('SELECT * FROM incomes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/incomes', (req, res) => {
  const { id, amount, category, date, note } = req.body;
  db.run(`INSERT INTO incomes (id, amount, category, date, note) VALUES (?, ?, ?, ?, ?)`, 
    [id, amount, category, date, note], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, amount, category, date, note });
    }
  );
});

app.put('/api/incomes/:id', (req, res) => {
  const { amount, category, date, note } = req.body;
  db.run(`UPDATE incomes SET amount = ?, category = ?, date = ?, note = ? WHERE id = ?`,
    [amount, category, date, note, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ changes: this.changes });
    }
  );
});

app.delete('/api/incomes/:id', (req, res) => {
  db.run(`DELETE FROM incomes WHERE id = ?`, req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// Budgets API
app.get('/api/budgets', (req, res) => {
  db.all('SELECT * FROM budgets', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Default format
    const defaultBudgets = { Food: 0, Transport: 0, Housing: 0, Entertainment: 0, Other: 0 };
    rows.forEach(row => {
      defaultBudgets[row.category] = row.amount;
    });
    res.json(defaultBudgets);
  });
});

app.put('/api/budgets', (req, res) => {
  // req.body is expected to be an object: { Food: 100, Transport: 50, ... }
  const budgets = req.body;
  
  const categories = Object.keys(budgets);
  let completed = 0;
  
  if (categories.length === 0) return res.json({ success: true });
  
  categories.forEach(category => {
    const amount = budgets[category];
    db.run(`INSERT INTO budgets (category, amount) VALUES (?, ?) 
            ON CONFLICT(category) DO UPDATE SET amount = ?`, 
      [category, amount, amount], 
      (err) => {
        if (err) console.error('Error updating budget:', err);
        completed++;
        if (completed === categories.length) {
          res.json({ success: true });
        }
      }
    );
  });
});

// ARIMA Forecasting API
app.get('/api/forecast', (req, res) => {
  db.all('SELECT date, amount FROM expenses ORDER BY date ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (rows.length < 5) {
      return res.status(400).json({ error: "Not enough data for forecasting. Need at least 5 records." });
    }

    // Group by date to get daily totals
    const dailyTotals = {};
    rows.forEach(r => {
      dailyTotals[r.date] = (dailyTotals[r.date] || 0) + r.amount;
    });

    // Create a time series array
    const sortedDates = Object.keys(dailyTotals).sort();
    const tsData = sortedDates.map(date => dailyTotals[date]);

    try {
      const arima = new ARIMA({
        p: 1,
        d: 1,
        q: 1,
        verbose: false
      }).train(tsData);
      
      const [pred, errors] = arima.predict(7); // Predict next 7 days
      
      res.json({
        historical_days: tsData.length,
        forecast: pred,
        message: "Predicted expenses for the next 7 days."
      });
    } catch (modelErr) {
      res.status(500).json({ error: "ARIMA model failed to train.", details: modelErr.message });
    }
  });
});

// Receipt OCR Upload
app.post('/api/upload-receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  
  try {
    const { data: { text } } = await Tesseract.recognize(
      req.file.path,
      'eng',
      { logger: m => console.log(m) }
    );
    
    // Attempt to extract amount
    // Matches something like $ 15.00, Rs 500, or just a decimal number
    const amountMatch = text.match(/(?:\\$|Rs\\.?|₹)?\\s*(\\d+(?:[.,]\\d{2})?)/);
    const parsedAmount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

    // Guess category from keywords
    let guessedCategory = 'Other';
    const lowerText = text.toLowerCase();
    const keywords = {
      Food: ['restaurant', 'cafe', 'coffee', 'mcdonalds', 'starbucks', 'food', 'lunch'],
      Transport: ['uber', 'lyft', 'taxi', 'transit', 'gas', 'fuel', 'petrol'],
      Housing: ['rent', 'electricity', 'water', 'utility'],
      Entertainment: ['movie', 'cinema', 'netflix', 'spotify', 'theatre']
    };
    
    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some(w => lowerText.includes(w))) {
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
        note: "Scanned Receipt"
      }
    });
  } catch (error) {
    res.status(500).json({ error: "OCR processing failed.", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
