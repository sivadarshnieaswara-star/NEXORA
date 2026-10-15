/* ================================================
   EXPENSE TRACKER — insights.js
   Five AI-insight engines:
   1. Investment Readiness
   2. Financial Health Score (/100)
   3. Future Expense Forecasting
   4. Unusual Expense Detection
   5. Spending Pattern Detection
   Dynamic, reactive to transactions, no hardcoded demo data.
   ================================================ */

'use strict';

const Insights = (() => {

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getExpenses = () => window.expenses || [];
  const getIncomes  = () => window.incomes  || [];
  const getBudgets  = () => window.budgets  || {};

  /** Format currency */
  const $$ = n => `₹${Math.abs(Number(n) || 0).toFixed(2)}`;

  /** Mean of numeric array */
  function mean(arr) {
    if (!arr || !arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /** Standard deviation */
  function stdDev(arr) {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /** Aggregate expenses by category */
  function byCategory(list) {
    const map = {};
    (list || []).forEach(e => {
      map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0);
    });
    return map;
  }

  /** Get monthly history for last N months (including past and current) */
  function getMonthlyHistory(n = 6) {
    const exps = getExpenses();
    const now = new Date();
    const list = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const mExps = exps.filter(e => {
        const ed = new Date(e.date);
        return ed.getMonth() === m && ed.getFullYear() === y;
      });
      list.push({
        label: d.toLocaleString('default', { month: 'short' }),
        month: m,
        year: y,
        isCurrent: (m === now.getMonth() && y === now.getFullYear()),
        expenses: mExps,
        total: mExps.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      });
    }
    return list;
  }

  /** Color token for score */
  function scoreColor(s) {
    if (s >= 80) return 'var(--success)';
    if (s >= 60) return 'var(--blue)';
    if (s >= 40) return 'var(--warning)';
    return 'var(--danger)';
  }

  /** Score letter grade */
  function grade(s) {
    if (s >= 92) return 'A+';
    if (s >= 85) return 'A';
    if (s >= 75) return 'B';
    if (s >= 65) return 'C';
    if (s >= 50) return 'D';
    return 'F';
  }

  /** Build animated SVG Score Ring */
  function buildRing(score, label, subLabel = '/100') {
    const R = 54;
    const C = 2 * Math.PI * R;
    const validScore = Math.max(0, Math.min(100, Math.round(score)));
    const dash = (validScore / 100) * C;
    const color = scoreColor(validScore);

    return `
      <div class="score-ring-wrap">
        <svg class="score-ring-svg" width="130" height="130" viewBox="0 0 140 140">
          <circle class="score-ring-track" cx="70" cy="70" r="${R}"/>
          <circle class="score-ring-fill" cx="70" cy="70" r="${R}"
            stroke="${color}"
            stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}"
            stroke-dashoffset="0"/>
          <text class="score-ring-label" x="70" y="68" text-anchor="middle" dominant-baseline="middle">${validScore}</text>
          <text class="score-ring-sub" x="70" y="88" text-anchor="middle">${subLabel}</text>
        </svg>
        <div style="text-align:center;">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);">${label}</div>
        </div>
      </div>
    `;
  }

  function emptyCardState(title, subtitle) {
    return `
      <div class="needs-data">
        <div class="needs-data-icon">💡</div>
        <div class="needs-data-title">${title}</div>
        <div class="needs-data-sub">${subtitle}</div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. FINANCIAL HEALTH SCORE (/100)
  // Factors: savings rate, expense ratio, budget adherence, recurring expenses, financial consistency
  // ═══════════════════════════════════════════════════════════════════════════
  function computeHealthScore() {
    const exps = getExpenses();
    const incs = getIncomes();
    const bdg  = getBudgets();

    const totalIncome   = incs.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalExpenses = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // 1. Savings Rate (25 pts max)
    // Savings rate >= 20% gets full 25 pts.
    let savingsRate = 0;
    if (totalIncome > 0) {
      savingsRate = Math.max(0, (totalIncome - totalExpenses) / totalIncome);
    }
    const savingsScore = Math.min(25, (savingsRate / 0.20) * 25);

    // 2. Expense Ratio (20 pts max)
    // Ideal expense ratio <= 60% of income. 100% or more gets 0.
    let expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) : (totalExpenses > 0 ? 1 : 0);
    let expenseScore = 20;
    if (totalIncome > 0) {
      if (expenseRatio <= 0.60) {
        expenseScore = 20;
      } else if (expenseRatio <= 1.0) {
        expenseScore = 20 * (1 - (expenseRatio - 0.60) / 0.40);
      } else {
        expenseScore = 0;
      }
    } else {
      expenseScore = totalExpenses > 0 ? 5 : 10;
    }

    // 3. Budget Adherence (20 pts max)
    const cats = ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'];
    const activeBudgets = cats.filter(c => (Number(bdg[c]) || 0) > 0);
    let budgetScore = 20;
    let budgetNote = 'No active budgets set';

    if (activeBudgets.length > 0) {
      const now = new Date();
      const currentExps = exps.filter(e => {
        const ed = new Date(e.date);
        return ed.getMonth() === now.getMonth() && ed.getFullYear() === now.getFullYear();
      });
      const catSpent = byCategory(currentExps);
      const adherent = activeBudgets.filter(c => (catSpent[c] || 0) <= bdg[c]);
      budgetScore = (adherent.length / activeBudgets.length) * 20;
      budgetNote = `${adherent.length}/${activeBudgets.length} categories on budget`;
    }

    // 4. Recurring Expenses Impact (15 pts max)
    // Recurring expenses ratio relative to total spending (<= 35% gets full points)
    const recurringExps = exps.filter(e => {
      const note = (e.note || '').toLowerCase();
      return note.includes('recurr') || note.includes('sub') || note.includes('rent') || note.includes('bill') || note.includes('monthly');
    });
    const recurringTotal = recurringExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const recurringRatio = totalExpenses > 0 ? (recurringTotal / totalExpenses) : 0;
    let recurringScore = 15;
    if (recurringRatio <= 0.35) {
      recurringScore = 15;
    } else if (recurringRatio <= 0.70) {
      recurringScore = 15 * (1 - (recurringRatio - 0.35) / 0.35);
    } else {
      recurringScore = 3;
    }
    const recurringNote = recurringTotal > 0
      ? `${$$(recurringTotal)} (${(recurringRatio * 100).toFixed(0)}% of expenses)`
      : 'No fixed recurring items';

    // 5. Financial Consistency (20 pts max)
    // Measured via coefficient of variation of spending amounts or intervals
    let consistencyScore = 18;
    let consistencyNote = 'Stable spending baseline';
    if (exps.length >= 3) {
      const amounts = exps.map(e => Number(e.amount) || 0);
      const m = mean(amounts);
      const sd = stdDev(amounts);
      const cv = m > 0 ? (sd / m) : 1;
      // CV <= 0.6 is very consistent, CV > 1.8 has high spikes
      if (cv <= 0.6) {
        consistencyScore = 20;
        consistencyNote = 'High predictability (low volatility)';
      } else if (cv <= 1.4) {
        consistencyScore = 20 - ((cv - 0.6) / 0.8) * 10;
        consistencyNote = 'Moderate variance in amounts';
      } else {
        consistencyScore = Math.max(5, 10 - Math.min(5, (cv - 1.4) * 5));
        consistencyNote = 'High transaction variance / occasional spikes';
      }
    } else if (exps.length > 0) {
      consistencyScore = 15;
      consistencyNote = 'Early transaction baseline';
    }

    const totalScore = Math.round(savingsScore + expenseScore + budgetScore + recurringScore + consistencyScore);

    const factors = [
      { name: 'Savings Rate', score: savingsScore, max: 25, detail: totalIncome > 0 ? `${(savingsRate * 100).toFixed(1)}% saved (goal ≥20%)` : 'Add income to calculate' },
      { name: 'Expense Ratio', score: expenseScore, max: 20, detail: totalIncome > 0 ? `${(expenseRatio * 100).toFixed(0)}% of income spent` : 'Spending relative to earnings' },
      { name: 'Budget Adherence', score: budgetScore, max: 20, detail: budgetNote },
      { name: 'Recurring Commitments', score: recurringScore, max: 15, detail: recurringNote },
      { name: 'Financial Consistency', score: consistencyScore, max: 20, detail: consistencyNote },
    ];

    return { totalScore, factors, savingsRate, expenseRatio };
  }

  function renderHealthScore(container) {
    const exps = getExpenses();
    const incs = getIncomes();

    if (!exps.length && !incs.length) {
      container.innerHTML = emptyCardState('No Financial Data', 'Add expenses and income to compute your composite Financial Health Score.');
      return;
    }

    const { totalScore, factors, savingsRate } = computeHealthScore();

    const factorsHTML = factors.map(f => {
      const p = Math.min(100, Math.max(0, (f.score / f.max) * 100));
      const cls = p >= 80 ? '' : p >= 50 ? 'warning' : 'danger';
      return `
        <div style="margin-bottom: var(--space-4);">
          <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
            <span style="font-size:var(--text-sm); font-weight:600;">${f.name}</span>
            <span style="font-size:var(--text-xs); color:var(--text-muted); font-weight:500;">
              ${f.score.toFixed(0)}/${f.max} pts &nbsp;·&nbsp; ${f.detail}
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-bar ${cls}" style="width: ${p.toFixed(1)}%"></div>
          </div>
        </div>
      `;
    }).join('');

    let summaryText = 'Excellent balance of savings, discipline, and budget adherence.';
    if (totalScore < 50) summaryText = 'Spending exceeds optimal thresholds. Review high-variance categories and build savings.';
    else if (totalScore < 75) summaryText = 'Good progress with opportunities to increase savings rate and lock in budgets.';

    container.innerHTML = `
      <div style="display:flex; gap:var(--space-6); flex-wrap:wrap; align-items:center; margin-bottom:var(--space-5);">
        ${buildRing(totalScore, 'Health Score')}
        <div style="flex:1; min-width:200px;">
          <div style="display:flex; align-items:baseline; gap:var(--space-3);">
            <div class="score-grade" style="color:${scoreColor(totalScore)};">${grade(totalScore)}</div>
            <span class="badge ${totalScore >= 75 ? 'badge-success' : totalScore >= 50 ? 'badge-warning' : 'badge-danger'}">
              ${totalScore >= 75 ? 'Healthy' : totalScore >= 50 ? 'Moderate' : 'Needs Attention'}
            </span>
          </div>
          <p style="font-size:var(--text-sm); color:var(--text-secondary); margin-top:var(--space-2); line-height:1.5;">
            ${summaryText}
          </p>
        </div>
      </div>
      <div class="section-label" style="margin-bottom:var(--space-3);">Core Factor Breakdown</div>
      ${factorsHTML}
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. INVESTMENT READINESS
  // Income, expenses, savings, recurring commitments -> score + concrete suggestions
  // ═══════════════════════════════════════════════════════════════════════════
  function computeInvestmentReadiness() {
    const exps = getExpenses();
    const incs = getIncomes();

    const totalIncome   = incs.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalExpenses = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const netSavings    = totalIncome - totalExpenses;
    const savingsRate   = totalIncome > 0 ? (netSavings / totalIncome) : 0;

    // Monthly run rate
    const now = new Date();
    const currentMonthExps = exps.filter(e => {
      const ed = new Date(e.date);
      return ed.getMonth() === now.getMonth() && ed.getFullYear() === now.getFullYear();
    });
    const monthlyBurn = currentMonthExps.length > 0
      ? currentMonthExps.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      : (totalExpenses > 0 ? totalExpenses : 0);

    // Target emergency fund: 3x monthly burn
    const emergencyFundTarget = Math.max(500, monthlyBurn * 3);
    const emergencyFundMonths = monthlyBurn > 0 ? (Math.max(0, netSavings) / monthlyBurn) : 0;

    // Recurring commitments
    const recurringExps = exps.filter(e => {
      const n = (e.note || '').toLowerCase();
      return n.includes('sub') || n.includes('rent') || n.includes('bill') || n.includes('recurr') || n.includes('monthly') || n.includes('plan');
    });
    const recurringTotal = recurringExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const fixedObligationRatio = totalIncome > 0 ? (recurringTotal / totalIncome) : 0;

    // Scoring components (total 100)
    // 1. Savings capacity (35 pts)
    const savPts = Math.min(35, Math.max(0, (savingsRate / 0.25) * 35));

    // 2. Emergency cushion (30 pts)
    const cushionPts = Math.min(30, Math.max(0, (emergencyFundMonths / 3.0) * 30));

    // 3. Fixed commitments flexibility (20 pts) - lower obligations = more ready to invest safely
    let commitPts = 20;
    if (fixedObligationRatio > 0.5) commitPts = 5;
    else if (fixedObligationRatio > 0.3) commitPts = 12;
    else commitPts = 20;

    // 4. Income durability & surplus consistency (15 pts)
    const durabilityPts = (totalIncome > 0 && netSavings > 0) ? 15 : (totalIncome > 0 ? 7 : 0);

    const score = Math.round(savPts + cushionPts + commitPts + durabilityPts);

    // Dynamic suggestions based on numbers
    const suggestions = [];
    const strengths = [];

    if (savingsRate >= 0.20) {
      strengths.push({ icon: '📈', text: `Strong savings rate of ${(savingsRate * 100).toFixed(0)}%, exceeding the recommended 20% benchmark.` });
    } else if (totalIncome > 0) {
      const gap = (0.20 * totalIncome) - netSavings;
      suggestions.push({
        type: 'warning',
        text: `Boost your savings rate to 20% by redirecting ${$$(gap > 0 ? gap : 50)} from discretionary spending into an investment reserve.`
      });
    }

    if (emergencyFundMonths >= 3) {
      strengths.push({ icon: '🛡️', text: `Healthy liquid safety buffer: Net savings cover ~${emergencyFundMonths.toFixed(1)} months of expenses.` });
    } else {
      const needed = emergencyFundTarget - Math.max(0, netSavings);
      suggestions.push({
        type: 'danger',
        text: `Build a 3-month emergency fund (${$$(emergencyFundTarget)}) before locking funds into long-term investments (gap: ${$$(needed)}).`
      });
    }

    if (recurringTotal > 0 && fixedObligationRatio > 0.35) {
      suggestions.push({
        type: 'info',
        text: `Fixed recurring bills represent ${(fixedObligationRatio * 100).toFixed(0)}% of income. Audit subscriptions to unlock flexible capital.`
      });
    } else if (recurringTotal > 0) {
      strengths.push({ icon: '⚡', text: `Manageable recurring overhead (${(fixedObligationRatio * 100).toFixed(0)}% of income), leaving room for regular SIP or index investments.` });
    }

    if (netSavings <= 0) {
      suggestions.push({
        type: 'danger',
        text: `Expenses currently match or exceed income. Prioritize generating a monthly net surplus before investing.`
      });
    } else if (score >= 70) {
      suggestions.push({
        type: 'success',
        text: `You have surplus capital! Consider starting low-cost index funds or automated recurring deposits.`
      });
    }

    return {
      score,
      savingsRate,
      netSavings,
      monthlyBurn,
      emergencyFundMonths,
      emergencyFundTarget,
      strengths,
      suggestions
    };
  }

  function renderInvestmentReadiness(container) {
    const exps = getExpenses();
    const incs = getIncomes();

    if (!exps.length && !incs.length) {
      container.innerHTML = emptyCardState('No Financial Data', 'Add income and expenses to assess your investment readiness.');
      return;
    }

    const res = computeInvestmentReadiness();

    let tier = 'Early Stage';
    let badgeClass = 'badge-neutral';
    if (res.score >= 80) { tier = 'Prime Investor'; badgeClass = 'badge-success'; }
    else if (res.score >= 60) { tier = 'Investment Ready'; badgeClass = 'badge-blue'; }
    else if (res.score >= 40) { tier = 'Building Buffer'; badgeClass = 'badge-warning'; }
    else { tier = 'Cushion Needed'; badgeClass = 'badge-danger'; }

    const strengthsHTML = res.strengths.map(s => `
      <div class="insight-row">
        <div class="insight-icon success">${s.icon}</div>
        <div class="insight-content">
          <div class="insight-desc">${s.text}</div>
        </div>
      </div>
    `).join('');

    const suggestionsHTML = res.suggestions.map(s => `
      <div class="suggestion-item">
        <div class="suggestion-bullet" style="background:${s.type === 'danger' ? 'var(--danger)' : s.type === 'warning' ? 'var(--warning)' : s.type === 'success' ? 'var(--success)' : 'var(--blue)'}"></div>
        <div>${s.text}</div>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:flex; gap:var(--space-6); flex-wrap:wrap; align-items:center; margin-bottom:var(--space-5);">
        ${buildRing(res.score, 'Readiness')}
        <div style="flex:1; min-width:200px;">
          <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:4px;">
            <div class="score-grade" style="color:${scoreColor(res.score)};">${grade(res.score)}</div>
            <span class="badge ${badgeClass}">${tier}</span>
          </div>
          <div style="font-size:var(--text-sm); color:var(--text-secondary); line-height:1.5;">
            ${res.score >= 70 ? 'Your cash flow and buffers indicate ready capital for investing.' : 'Focus on building liquidity and reducing variable overhead first.'}
          </div>
          <div class="metric-strip mt-4">
            <div class="metric-cell">
              <div class="metric-cell-label">Net Surplus</div>
              <div class="metric-cell-value ${res.netSavings >= 0 ? 'text-success' : 'text-danger'}">
                ${res.netSavings < 0 ? '-' : ''}${$$(res.netSavings)}
              </div>
            </div>
            <div class="metric-cell">
              <div class="metric-cell-label">Safety Buffer</div>
              <div class="metric-cell-value ${res.emergencyFundMonths >= 3 ? 'text-success' : 'text-warning'}">
                ${res.emergencyFundMonths.toFixed(1)} mos
              </div>
            </div>
          </div>
        </div>
      </div>

      ${res.strengths.length > 0 ? `
        <div class="section-label" style="margin-bottom:var(--space-2);">Readiness Signals</div>
        ${strengthsHTML}
      ` : ''}

      <div class="section-label mt-4" style="margin-bottom:var(--space-2);">Actionable Improvement Steps</div>
      <div class="gap-list">
        ${suggestionsHTML}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FUTURE EXPENSE FORECASTING
  // Predict upcoming total and category-wise expenses and compare with budgets
  // ═══════════════════════════════════════════════════════════════════════════
  function computeForecast() {
    const exps = getExpenses();
    const bdg  = getBudgets();
    const cats = ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'];

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear  = now.getFullYear();
    const daysInMonth  = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayOfMonth   = Math.max(1, now.getDate());
    const monthFraction = dayOfMonth / daysInMonth;

    // Current month transactions
    const monthExps = exps.filter(e => {
      const ed = new Date(e.date);
      return ed.getMonth() === currentMonth && ed.getFullYear() === currentYear;
    });

    const currentSpentTotal = monthExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const currentCatSpent   = byCategory(monthExps);

    // Prior months data
    const history = getMonthlyHistory(4).filter(h => !h.isCurrent && h.total > 0);
    const hasPriorHistory = history.length > 0;
    const priorMonthlyAverage = hasPriorHistory ? mean(history.map(h => h.total)) : 0;

    // Total Projected Spend for current month
    // If we have days in month, run rate = currentSpentTotal / monthFraction
    let projectedTotal = 0;
    if (hasPriorHistory) {
      // Blend 60% current trajectory, 40% historical baseline
      const runRate = currentSpentTotal / monthFraction;
      projectedTotal = (runRate * 0.60) + (priorMonthlyAverage * 0.40);
    } else {
      projectedTotal = monthFraction > 0 ? (currentSpentTotal / monthFraction) : currentSpentTotal;
    }

    // Category Projections
    const catProjections = {};
    cats.forEach(cat => {
      const catSpentNow = currentCatSpent[cat] || 0;
      let projectedCat = 0;

      if (hasPriorHistory) {
        const priorCatAvg = mean(history.map(h => byCategory(h.expenses)[cat] || 0));
        const runRateCat = catSpentNow / monthFraction;
        projectedCat = (runRateCat * 0.65) + (priorCatAvg * 0.35);
      } else {
        projectedCat = catSpentNow / monthFraction;
      }
      catProjections[cat] = Math.max(catSpentNow, Math.round(projectedCat * 100) / 100);
    });

    const totalBudget = Object.values(bdg).reduce((s, b) => s + (Number(b) || 0), 0);

    return {
      projectedTotal: Math.max(currentSpentTotal, Math.round(projectedTotal * 100) / 100),
      currentSpentTotal,
      monthFraction,
      daysInMonth,
      dayOfMonth,
      catProjections,
      currentCatSpent,
      totalBudget,
      bdg
    };
  }

  async function renderForecast(container) {
    const exps = getExpenses();
    if (!exps.length) {
      container.innerHTML = emptyCardState('No Transaction History', 'Add expenses to unlock month-end predictions and category budget forecasts.');
      return;
    }

    const f = computeForecast();
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const cats = ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'];

    const rowsHTML = cats.map(cat => {
      const proj   = f.catProjections[cat] || 0;
      const actual = f.currentCatSpent[cat] || 0;
      const budget = Number(f.bdg[cat]) || 0;

      if (actual === 0 && proj === 0 && budget === 0) return '';

      const isOverBudget = budget > 0 && proj > budget;
      const budgetDiff = budget > 0 ? proj - budget : 0;
      const barPercent = budget > 0 ? Math.min(100, (proj / budget) * 100) : Math.min(100, (actual / (proj || 1)) * 100);
      const barClass = isOverBudget ? 'danger' : barPercent >= 80 ? 'warning' : '';

      return `
        <div class="insight-row">
          <div class="insight-content" style="width: 100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">
              <div>
                <span style="font-size:var(--text-sm); font-weight:600;">${cat}</span>
                <span style="font-size:var(--text-xs); color:var(--text-muted); margin-left:var(--space-2);">
                  (Actual: ${$$(actual)})
                </span>
              </div>
              <div style="display:flex; align-items:center; gap:var(--space-2);">
                <span style="font-size:var(--text-sm); font-weight:700;">Forecast: ${$$(proj)}</span>
                ${budget > 0 ? `
                  <span style="font-size:var(--text-xs); color:var(--text-muted);">/ ${$$(budget)} limit</span>
                  ${isOverBudget
                    ? `<span class="flag-chip">Exceeds by ${$$(budgetDiff)}</span>`
                    : `<span class="badge badge-success" style="font-size:10px;">Within budget</span>`
                  }
                ` : `<span class="badge badge-neutral" style="font-size:10px;">No budget</span>`}
              </div>
            </div>
            <div class="progress-track">
              <div class="progress-bar ${barClass}" style="width: ${barPercent.toFixed(1)}%"></div>
            </div>
          </div>
        </div>
      `;
    }).filter(Boolean).join('');

    const totalOverBudget = f.totalBudget > 0 && f.projectedTotal > f.totalBudget;
    
    // Fetch ML Forecast
    let arimaHtml = '';
    try {
      const res = await fetch('/api/forecast');
      if (res.ok) {
        const mlData = await res.json();
        const totalForecast = mlData.forecast.reduce((a,b) => a+b, 0);
        arimaHtml = `
          <div class="suggestion-item" style="margin-top:var(--space-4); background: var(--bg-hover); border-left: 4px solid var(--accent);">
            <div class="suggestion-bullet" style="background:var(--accent)"></div>
            <div>
              <strong>🤖 ML ARIMA Forecast (Next 7 Days):</strong> Based on historical patterns, your predicted spending for the next 7 days is <strong>${$$(totalForecast)}</strong>.
            </div>
          </div>
        `;
      }
    } catch (e) {
      console.warn("ML Forecast failed to load", e);
    }

    container.innerHTML = `
      <div class="metric-strip">
        <div class="metric-cell">
          <div class="metric-cell-label">Projected Total (${monthName})</div>
          <div class="metric-cell-value ${totalOverBudget ? 'text-danger' : 'text-primary'}">
            ${$$(f.projectedTotal)}
          </div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell-label">Spent to Date</div>
          <div class="metric-cell-value">${$$(f.currentSpentTotal)}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell-label">Pace (Day ${f.dayOfMonth}/${f.daysInMonth})</div>
          <div class="metric-cell-value">${(f.monthFraction * 100).toFixed(0)}% elapsed</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell-label">Total Budget Target</div>
          <div class="metric-cell-value">${f.totalBudget > 0 ? $$(f.totalBudget) : 'Unset'}</div>
        </div>
      </div>
      
      ${arimaHtml}

      <div class="section-label" style="margin-top:var(--space-4); margin-bottom:var(--space-3);">Category-wise Forecast & Budget Comparison</div>
      ${rowsHTML || '<div style="color:var(--text-muted);font-size:var(--text-sm);">No active categories recorded yet.</div>'}

      ${f.totalBudget > 0 ? `
        <div class="suggestion-item" style="margin-top:var(--space-4);">
          <div class="suggestion-bullet" style="background:${totalOverBudget ? 'var(--danger)' : 'var(--success)'}"></div>
          <div>
            ${totalOverBudget
              ? `Overall forecast <strong>${$$(f.projectedTotal)}</strong> will exceed total budget of <strong>${$$(f.totalBudget)}</strong> by <strong>${$$(f.projectedTotal - f.totalBudget)}</strong> at current pace.`
              : `Overall forecast of <strong>${$$(f.projectedTotal)}</strong> is well within your monthly budget of <strong>${$$(f.totalBudget)}</strong>.`
            }
          </div>
        </div>
      ` : ''}
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. UNUSUAL EXPENSE DETECTION
  // Identifies transactions differing significantly from normal spending with reasons
  // ═══════════════════════════════════════════════════════════════════════════
  function computeAnomalies() {
    const exps = getExpenses();
    if (exps.length < 2) return [];

    const flagged = [];
    const allAmounts = exps.map(e => Number(e.amount) || 0);
    const overallMean = mean(allAmounts);
    const overallStd  = stdDev(allAmounts);

    const cats = ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'];

    cats.forEach(cat => {
      const catExps = exps.filter(e => e.category === cat);
      if (catExps.length >= 2) {
        const catAmounts = catExps.map(e => Number(e.amount) || 0);
        const catMean = mean(catAmounts);
        const catSD   = stdDev(catAmounts);

        catExps.forEach(e => {
          const amt = Number(e.amount) || 0;
          const ratio = catMean > 0 ? (amt / catMean) : 1;
          const z = catSD > 0 ? (amt - catMean) / catSD : 0;

          if (z >= 1.8 || (ratio >= 2.2 && amt > 30)) {
            flagged.push({
              id: e.id,
              date: e.date,
              category: e.category,
              amount: amt,
              note: e.note,
              severity: (z >= 2.5 || ratio >= 3.0) ? 'danger' : 'warning',
              zScore: z.toFixed(1),
              reason: `${ratio.toFixed(1)}× higher than your average ${e.category} transaction (${$$(catMean)})`
            });
          }
        });
      }
    });

    // Also check overall outsized items
    if (overallStd > 0) {
      exps.forEach(e => {
        const amt = Number(e.amount) || 0;
        const z = (amt - overallMean) / overallStd;
        const ratio = overallMean > 0 ? (amt / overallMean) : 1;
        if (z >= 2.2 && !flagged.some(f => f.id === e.id)) {
          flagged.push({
            id: e.id,
            date: e.date,
            category: e.category,
            amount: amt,
            note: e.note,
            severity: 'danger',
            zScore: z.toFixed(1),
            reason: `Outlier amount: ${ratio.toFixed(1)}× higher than overall average expense (${$$(overallMean)})`
          });
        }
      });
    }

    // Sort by severity (danger first, then highest amount)
    return flagged.sort((a, b) => b.amount - a.amount);
  }

  function renderAnomalies(container) {
    const exps = getExpenses();
    if (exps.length < 2) {
      container.innerHTML = emptyCardState('Needs 2+ Expenses', 'Enter more transactions to establish your spending baseline and detect unusual charges.');
      return;
    }

    const anomalies = computeAnomalies();

    if (!anomalies.length) {
      container.innerHTML = `
        <div class="needs-data" style="padding:var(--space-6) 0;">
          <div class="needs-data-icon">✨</div>
          <div class="needs-data-title">No Unusual Expenses Detected</div>
          <div class="needs-data-sub">All transactions align closely with your typical spending patterns.</div>
        </div>
      `;
      return;
    }

    const rowsHTML = anomalies.map(a => `
      <div class="insight-row">
        <div class="insight-icon ${a.severity}">${a.severity === 'danger' ? '🚨' : '⚠️'}</div>
        <div class="insight-content">
          <div class="insight-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${a.category} &nbsp;·&nbsp; <span style="font-weight:400;color:var(--text-muted);">${a.date}</span></span>
            <span class="flag-chip ${a.severity === 'warning' ? 'warning' : ''}">
              ${a.severity === 'danger' ? 'High Outlier' : 'Flagged'} (+${a.zScore}σ)
            </span>
          </div>
          <div style="font-size:var(--text-lg); font-weight:800; font-family:var(--font-display); color:var(--danger); margin:3px 0;">
            ${$$(a.amount)}
          </div>
          <div class="insight-desc">
            ${a.reason}${a.note ? ` · Note: "${a.note}"` : ''}
          </div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-4);">
        <span class="flag-chip">${anomalies.length} Flagged</span>
        <span style="font-size:var(--text-xs); color:var(--text-muted);">Identified using category standard deviation and peer transaction ratios</span>
      </div>
      ${rowsHTML}
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SPENDING PATTERN DETECTION
  // Food spending increase, weekend spending, category spikes, recurring changes
  // ═══════════════════════════════════════════════════════════════════════════
  function computePatterns() {
    const exps = getExpenses();
    if (exps.length < 2) return [];

    const patterns = [];
    const totalSpend = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const catMap = byCategory(exps);

    // Pattern 1: Increased Food Spending
    const foodSpend = catMap['Food'] || 0;
    if (totalSpend > 0 && foodSpend > 0) {
      const foodRatio = foodSpend / totalSpend;
      if (foodRatio >= 0.35) {
        patterns.push({
          type: 'up',
          icon: '🍔',
          tag: `Food dominates ${(foodRatio * 100).toFixed(0)}%`,
          title: 'High Food Spending Concentration',
          desc: `Food accounts for ${$$(foodSpend)} (${(foodRatio * 100).toFixed(0)}% of total spending), exceeding the standard 20-25% balance.`
        });
      }
    }

    // Pattern 2: Weekend vs Weekday Spending Analysis
    const weekendExps = exps.filter(e => {
      const day = new Date(e.date).getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });
    const weekdayExps = exps.filter(e => {
      const day = new Date(e.date).getDay();
      return day >= 1 && day <= 5;
    });

    if (weekendExps.length > 0 && weekdayExps.length > 0) {
      const weekendAvg = mean(weekendExps.map(e => Number(e.amount) || 0));
      const weekdayAvg = mean(weekdayExps.map(e => Number(e.amount) || 0));

      if (weekdayAvg > 0 && weekendAvg > weekdayAvg * 1.3) {
        const mult = (weekendAvg / weekdayAvg).toFixed(1);
        patterns.push({
          type: 'warn',
          icon: '🎉',
          tag: `Weekend ${mult}× Weekdays`,
          title: 'Elevated Weekend Spending',
          desc: `Average weekend transaction is ${$$(weekendAvg)} vs ${$$(weekdayAvg)} on weekdays. Most discretionary spikes happen Saturday-Sunday.`
        });
      } else if (weekendAvg > 0) {
        patterns.push({
          type: 'down',
          icon: '🗓️',
          tag: 'Balanced Weekends',
          title: 'Disciplined Weekend Outflow',
          desc: `Weekend transactions (${$$(weekendAvg)} avg) match weekday pace (${$$(weekdayAvg)} avg), showing consistent habit control.`
        });
      }
    }

    // Pattern 3: Category Spikes
    Object.entries(catMap).forEach(([cat, amt]) => {
      if (cat !== 'Food' && totalSpend > 0) {
        const ratio = amt / totalSpend;
        if (ratio >= 0.45 && exps.length >= 3) {
          patterns.push({
            type: 'up',
            icon: '⚡',
            tag: `${cat} Spike (${(ratio * 100).toFixed(0)}%)`,
            title: `${cat} Outflow Concentration`,
            desc: `${cat} claims ${$$(amt)}, taking up nearly half of all logged expenses.`
          });
        }
      }
    });

    // Pattern 4: Recurring Expense Changes & Tracking
    const recurringExps = exps.filter(e => {
      const n = (e.note || '').toLowerCase();
      return n.includes('sub') || n.includes('rent') || n.includes('bill') || n.includes('recurr') || n.includes('gym') || n.includes('monthly');
    });

    if (recurringExps.length > 0) {
      const recTotal = recurringExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const recRatio = totalSpend > 0 ? (recTotal / totalSpend) : 0;
      patterns.push({
        type: recRatio > 0.4 ? 'warn' : 'down',
        icon: '🔄',
        tag: `${recurringExps.length} Recurring Commitments`,
        title: 'Active Recurring Overhead',
        desc: `Identified ${recurringExps.length} recurring expense entries totaling ${$$(recTotal)} (${(recRatio * 100).toFixed(0)}% of commitments).`
      });
    }

    // Fallback pattern if only few transactions
    if (!patterns.length && exps.length >= 2) {
      patterns.push({
        type: 'down',
        icon: '📊',
        tag: 'Stable Flow',
        title: 'Steady Expenditure',
        desc: 'Transactions show evenly distributed amounts without irregular surges or category over-concentration.'
      });
    }

    return patterns;
  }

  function renderPatterns(container) {
    const exps = getExpenses();
    if (exps.length < 2) {
      container.innerHTML = emptyCardState('Needs 2+ Expenses', 'Record a few more expenses to detect spending velocity, food ratios, and weekend habits.');
      return;
    }

    const patterns = computePatterns();

    const tagsHTML = patterns.map(p => `
      <span class="pattern-tag ${p.type}">
        ${p.icon} ${p.tag}
      </span>
    `).join('');

    const rowsHTML = patterns.map(p => `
      <div class="insight-row">
        <div class="insight-icon ${p.type === 'up' ? 'danger' : p.type === 'warn' ? 'warning' : 'info'}">
          ${p.icon}
        </div>
        <div class="insight-content">
          <div class="insight-title">${p.title}</div>
          <div class="insight-desc">${p.desc}</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="margin-bottom:var(--space-4); display:flex; flex-wrap:wrap; gap:4px;">
        ${tagsHTML}
      </div>
      ${rowsHTML}
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════
  function refresh() {
    const healthEl   = document.getElementById('insight-health-body');
    const investEl   = document.getElementById('insight-invest-body');
    const forecastEl = document.getElementById('insight-forecast-body');
    const anomalyEl  = document.getElementById('insight-anomaly-body');
    const patternEl  = document.getElementById('insight-pattern-body');

    if (healthEl)   renderHealthScore(healthEl);
    if (investEl)   renderInvestmentReadiness(investEl);
    if (forecastEl) renderForecast(forecastEl);
    if (anomalyEl)  renderAnomalies(anomalyEl);
    if (patternEl)  renderPatterns(patternEl);
  }

  return {
    refresh,
    computeHealthScore,
    computeInvestmentReadiness,
    computeForecast,
    computeAnomalies,
    computePatterns
  };

})();

// Export globally
window.Insights = Insights;
