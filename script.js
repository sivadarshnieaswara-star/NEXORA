/* ================================================
   EXPENSE TRACKER — script.js
   Phase 0: Design System + Toast/Modal modules
   Phase 1: Income, Budgets, Trend chart (upgraded)
   ================================================ */

'use strict';

// ── Toast Module ───────────────────────────────────────────────────────────
const Toast = (() => {
  const container = document.getElementById('toast-container');

  function show(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="toast-dot"></div>
      <span>${message}</span>
      <button class="toast-close" aria-label="Dismiss">✕</button>
    `;

    const close = () => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.querySelector('.toast-close').addEventListener('click', close);
    container.appendChild(toast);

    if (duration > 0) setTimeout(close, duration);
    return { close };
  }

  return { show };
})();

// ── Modal Module ───────────────────────────────────────────────────────────
const Modal = (() => {
  function confirm({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger' }) {
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';

      const icons = { danger: '🗑️', warning: '⚠️', success: '✅', info: 'ℹ️' };

      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-icon ${type}">${icons[type] || '❓'}</div>
          <div class="modal-title" id="modal-title">${title}</div>
          <div class="modal-body">${body}</div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
            <button class="btn btn-${type === 'danger' ? 'danger' : 'primary'}" id="modal-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      const close = (result) => {
        backdrop.classList.add('hiding');
        backdrop.querySelector('.modal').style.animation = 'modal-out 0.2s ease forwards';
        setTimeout(() => { backdrop.remove(); resolve(result); }, 200);
      };

      backdrop.querySelector('#modal-cancel').addEventListener('click', () => close(false));
      backdrop.querySelector('#modal-confirm').addEventListener('click', () => close(true));
      backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });

      document.body.appendChild(backdrop);
      // Focus confirm button for keyboard nav
      setTimeout(() => backdrop.querySelector('#modal-confirm').focus(), 50);
    });
  }

  return { confirm };
})();

// ── Data Layer ─────────────────────────────────────────────────────────────
let expenses = [];
let incomes  = [];
let budgets  = {
  Food: 0, Transport: 0, Housing: 0, Entertainment: 0, Other: 0
};

let recurringRules = JSON.parse(localStorage.getItem('recurringRules')) || [];

function saveRecurringRules() {
  localStorage.setItem('recurringRules', JSON.stringify(recurringRules));
}

async function processRecurringRules() {
  let changed = false;
  const now = new Date();
  now.setHours(0,0,0,0);
  const posts = [];

  for (let rule of recurringRules) {
    let nextD = new Date(rule.nextDate);
    nextD.setHours(0,0,0,0);
    
    while (nextD <= now) {
      const newId = Date.now().toString() + Math.floor(Math.random()*1000);
      const entry = {
        id: newId,
        amount: rule.amount,
        category: rule.category,
        date: nextD.toISOString().split('T')[0],
        note: rule.note,
        isRecurring: true
      };

      if (rule.type === 'expense') {
        expenses.push(entry);
        posts.push(fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }));
      } else {
        incomes.push(entry);
        posts.push(fetch('/api/incomes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }));
      }

      if (rule.frequency === 'weekly') {
        nextD.setDate(nextD.getDate() + 7);
      } else {
        nextD.setMonth(nextD.getMonth() + 1);
      }
      changed = true;
    }
    rule.nextDate = nextD.toISOString().split('T')[0];
  }

  if (changed) {
    saveRecurringRules();
    await Promise.all(posts);
    saveExpenses();
    saveIncomes();
  }
}

// Expose globally for Insights engine
window.expenses = expenses;
window.incomes  = incomes;
window.budgets  = budgets;

async function loadData() {
  try {
    const [expRes, incRes, budRes] = await Promise.all([
      fetch('/api/expenses'),
      fetch('/api/incomes'),
      fetch('/api/budgets')
    ]);
    expenses = await expRes.json();
    incomes = await incRes.json();
    budgets = await budRes.json();
    
    window.expenses = expenses;
    window.incomes = incomes;
    window.budgets = budgets;
    
    await processRecurringRules();
    renderRecurringRules();

    refreshAllCharts();
    if (document.getElementById('section-expenses').classList.contains('active')) renderExpenses();
    if (document.getElementById('section-income').classList.contains('active')) renderIncomes();
    if (document.getElementById('section-budgets').classList.contains('active')) renderBudgetInputs();
    if (window.Insights) window.Insights.refresh();
  } catch (err) {
    console.error("Failed to load initial data from server", err);
  }
}

// Load data initially
loadData();

function saveExpenses() {
  window.expenses = expenses;
  if (window.Insights) window.Insights.refresh();
}
function saveIncomes() {
  window.incomes = incomes;
  if (window.Insights) window.Insights.refresh();
}
function saveBudgets() {
  window.budgets = budgets;
  if (window.Insights) window.Insights.refresh();
}

// ── Theme ──────────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
const themeLabel  = document.getElementById('theme-toggle-label');

let currentTheme = localStorage.getItem('theme') || 'light';
applyTheme(currentTheme);

themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(currentTheme);
  localStorage.setItem('theme', currentTheme);
  refreshAllCharts();
  if (window.Insights) window.Insights.refresh();
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeLabel.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// ── Sidebar Navigation ─────────────────────────────────────────────────────
const navItems    = document.querySelectorAll('.nav-item[data-section]');
const sections    = document.querySelectorAll('.page-section');
const pageLabel   = document.getElementById('page-label');
const pageTitle   = document.getElementById('page-title');
const pageSubtitle= document.getElementById('page-subtitle');

const PAGE_META = {
  dashboard:  { label: 'OVERVIEW',     title: 'Dashboard',   subtitle: 'Your financial summary at a glance.' },
  expenses:   { label: 'MONEY',        title: 'Expenses',    subtitle: 'Track and manage your spending.' },
  income:     { label: 'MONEY',        title: 'Income',      subtitle: 'Record your earnings and sources.' },
  budgets:    { label: 'PLANNING',     title: 'Budgets',     subtitle: 'Set monthly limits and track progress.' },
  insights:   { label: 'INTELLIGENCE', title: 'AI Insights', subtitle: 'Health score, investment readiness, forecasting, and anomaly detection.' },
  analytics:  { label: 'INSIGHTS',     title: 'Analytics',   subtitle: 'Visualise your spending patterns.' },
};

function navigate(section) {
  // Update nav items
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  // Update sections
  sections.forEach(sec => {
    const isActive = sec.id === `section-${section}`;
    sec.classList.toggle('active', isActive);
  });

  // Update header
  const meta = PAGE_META[section] || {};
  pageLabel.textContent    = meta.label || '';
  pageTitle.textContent    = meta.title || section;
  pageSubtitle.textContent = meta.subtitle || '';

  // Re-render charts & insights when switching to pages that have them
  if (section === 'insights')  { if (window.Insights) window.Insights.refresh(); }
  if (section === 'analytics') refreshAnalyticsCharts();
  if (section === 'expenses')  renderExpensePieChart();
  if (section === 'income')    renderIncomePieChart();
  if (section === 'dashboard') { updateSummary(); updateBudgetProgress('budget-progress-container'); }
}

navItems.forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.section));
});

// "Manage →" shortcut button on dashboard
document.getElementById('go-to-budgets').addEventListener('click', () => navigate('budgets'));

// Mobile sidebar
const mobileBtn = document.getElementById('mobile-menu-btn');
const sidebar   = document.getElementById('sidebar');

function checkMobile() {
  const isMobile = window.innerWidth <= 768;
  mobileBtn.style.display = isMobile ? 'flex' : 'none';
}

mobileBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

// Close sidebar when clicking outside on mobile
document.addEventListener('click', e => {
  if (window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== mobileBtn) {
    sidebar.classList.remove('open');
  }
});

window.addEventListener('resize', checkMobile);
checkMobile();

// ── Chart Color Palette ────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  Food:           '#FF6384',
  Transport:      '#36A2EB',
  Housing:        '#FFCE56',
  Entertainment:  '#4BC0C0',
  Other:          '#9966FF',
  // Income sources
  Salary:         '#10b981',
  Freelance:      '#3b82f6',
  Investments:    '#f59e0b',
};

const CHART_INSTANCES = {};

function getChartThemeColors() {
  const isDark = currentTheme === 'dark';
  return {
    text:     isDark ? '#94a3b8' : '#64748b',
    grid:     isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    accent:   isDark ? '#34d399' : '#10b981',
    accentFill: isDark ? 'rgba(52,211,153,0.15)' : 'rgba(16,185,129,0.1)',
  };
}

function destroyChart(key) {
  if (CHART_INSTANCES[key]) {
    CHART_INSTANCES[key].destroy();
    delete CHART_INSTANCES[key];
  }
}

// ── Dashboard Summary ──────────────────────────────────────────────────────
function updateSummary() {
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome   = incomes.reduce((s, i) => s + i.amount, 0);
  const netSavings    = totalIncome - totalExpenses;

  // Current month expenses
  const now = new Date();
  const thisMonth = expenses
    .filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((s, e) => s + e.amount, 0);

  document.getElementById('total-amount').textContent   = fmt(totalExpenses);
  document.getElementById('total-income').textContent   = fmt(totalIncome);
  document.getElementById('this-month-total').textContent = fmt(thisMonth);

  const savEl = document.getElementById('net-savings');
  savEl.textContent  = `${netSavings < 0 ? '-' : ''}${fmt(Math.abs(netSavings))}`;
  savEl.className    = `stat-value ${netSavings >= 0 ? 'text-success' : 'text-danger'}`;

  // Dashboard charts
  renderIncomeVsExpensesChart();
  renderTrendChart('trendChart', currentTrendView);
  updateBudgetProgress('budget-progress-container');
}

function fmt(n) { return `₹${n.toFixed(2)}`; }

// ── Income vs Expenses Bar Chart (Dashboard) ───────────────────────────────
function renderIncomeVsExpensesChart() {
  const { text, grid } = getChartThemeColors();
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome   = incomes.reduce((s, i) => s + i.amount, 0);

  destroyChart('categoryChart');
  const ctx = document.getElementById('categoryChart').getContext('2d');
  CHART_INSTANCES.categoryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Income', 'Expenses'],
      datasets: [{
        data: [totalIncome, totalExpenses],
        backgroundColor: ['rgba(16,185,129,0.85)', 'rgba(239,68,68,0.85)'],
        borderRadius: 10,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: text, font: { family: 'DM Sans' } }, grid: { color: grid } },
        x: { ticks: { color: text, font: { family: 'DM Sans' } }, grid: { display: false } }
      }
    }
  });
}

// ── Spending Trend Chart ───────────────────────────────────────────────────
let currentTrendView = 'weekly';

const toggleWeekly  = document.getElementById('toggle-weekly');
const toggleMonthly = document.getElementById('toggle-monthly');

toggleWeekly.addEventListener('click', () => {
  currentTrendView = 'weekly';
  toggleWeekly.classList.add('active');
  toggleMonthly.classList.remove('active');
  renderTrendChart('trendChart', 'weekly');
});

toggleMonthly.addEventListener('click', () => {
  currentTrendView = 'monthly';
  toggleMonthly.classList.add('active');
  toggleWeekly.classList.remove('active');
  renderTrendChart('trendChart', 'monthly');
});

function aggregateTrendData(expArray, view) {
  const now = new Date();
  const labels = [], data = [];
  if (view === 'weekly') {
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      const end   = new Date(start.getTime() + 7 * 86400000);
      labels.push(`${start.getMonth()+1}/${start.getDate()}`);
      data.push(expArray.reduce((acc, e) => {
        const d = new Date(e.date);
        return d >= start && d < end ? acc + e.amount : acc;
      }, 0));
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString('default', { month: 'short' }));
      data.push(expArray.reduce((acc, e) => {
        const ed = new Date(e.date);
        return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear() ? acc + e.amount : acc;
      }, 0));
    }
  }
  return { labels, data };
}

function renderTrendChart(canvasId, view) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { text, grid, accent, accentFill } = getChartThemeColors();
  const { labels, data } = aggregateTrendData(expenses, view);

  const key = canvasId;
  destroyChart(key);
  const ctx = canvas.getContext('2d');
  CHART_INSTANCES[key] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Spending (₹)',
        data,
        borderColor: accent,
        backgroundColor: accentFill,
        borderWidth: 2.5,
        pointBackgroundColor: accent,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: text, font: { family: 'DM Sans' } }, grid: { color: grid } },
        x: { ticks: { color: text, font: { family: 'DM Sans' } }, grid: { display: false } }
      }
    }
  });
}

// ── Expense Pie Chart (Expenses page) ─────────────────────────────────────
function renderExpensePieChart() {
  const canvas = document.getElementById('expensePieChart');
  if (!canvas) return;
  const { text } = getChartThemeColors();

  const categoryTotals = {};
  expenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const labels = Object.keys(categoryTotals);
  const data   = Object.values(categoryTotals);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#ccc');

  destroyChart('expensePieChart');
  const ctx = canvas.getContext('2d');
  CHART_INSTANCES.expensePieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: text, font: { family: 'DM Sans', size: 12 }, padding: 16, boxWidth: 12, borderRadius: 4 }
        }
      }
    }
  });
}

// ── Income Pie Chart (Income page) — Enhanced ─────────────────────────────

// Current filter state
let incomePieFilter = 'this-month';

function getFilteredIncomes(filter) {
  const now = new Date();
  return incomes.filter(i => {
    const d = new Date(i.date);
    if (filter === 'this-month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (filter === 'last-month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    if (filter === 'ytd') {
      return d.getFullYear() === now.getFullYear();
    }
    return true; // 'all'
  });
}

function renderIncomeLegend(labels, data, colors, total) {
  const legendEl = document.getElementById('income-legend');
  if (!legendEl) return;
  legendEl.innerHTML = '';

  labels.forEach((label, i) => {
    const pct   = total > 0 ? ((data[i] / total) * 100).toFixed(1) : '0.0';
    const color = colors[i] || '#ccc';
    const ICONS = { Salary: '💼', Freelance: '💻', Investments: '📈', Other: '📦' };
    const icon  = ICONS[label] || '💰';

    const item = document.createElement('div');
    item.className = 'income-legend-item';
    item.innerHTML = `
      <div class="income-legend-left">
        <span class="income-legend-dot" style="background:${color}"></span>
        <span class="income-legend-icon">${icon}</span>
        <span class="income-legend-name">${label}</span>
      </div>
      <div class="income-legend-right">
        <span class="income-legend-amount">${fmt(data[i])}</span>
        <span class="income-legend-pct">${pct}%</span>
      </div>
    `;

    // Hover highlight: highlight the corresponding chart segment
    item.addEventListener('mouseenter', () => {
      const chart = CHART_INSTANCES.incomePieChart;
      if (chart) {
        chart.setDatasetVisibility(0, true);
        chart.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
        chart.update();
      }
      item.classList.add('active');
    });
    item.addEventListener('mouseleave', () => {
      const chart = CHART_INSTANCES.incomePieChart;
      if (chart) {
        chart.tooltip.setActiveElements([], {});
        chart.update();
      }
      item.classList.remove('active');
    });

    legendEl.appendChild(item);
  });
}

function renderIncomePieChart() {
  const canvas   = document.getElementById('incomePieChart');
  const emptyEl  = document.getElementById('income-chart-empty');
  const areaEl   = document.getElementById('income-donut-wrapper')?.parentElement; // .income-chart-area
  const totalEl  = document.getElementById('income-donut-total');
  if (!canvas) return;

  const { text } = getChartThemeColors();

  // Filter incomes
  const filtered     = getFilteredIncomes(incomePieFilter);
  const sourceTotals = {};
  filtered.forEach(i => {
    sourceTotals[i.category] = (sourceTotals[i.category] || 0) + i.amount;
  });

  const labels = Object.keys(sourceTotals);
  const data   = Object.values(sourceTotals);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#ccc');
  const total  = data.reduce((s, v) => s + v, 0);

  // Update center stat
  if (totalEl) totalEl.textContent = fmt(total);

  // Show/hide empty state
  const incomeChartArea = document.getElementById('income-donut-wrapper')?.closest('.income-chart-area');
  if (labels.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (incomeChartArea) incomeChartArea.style.display = 'none';
    document.getElementById('income-legend').innerHTML = '';
    destroyChart('incomePieChart');
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (incomeChartArea) incomeChartArea.style.display = 'flex';

  // Render chart (no built-in legend — we use custom)
  destroyChart('incomePieChart');
  const ctx = canvas.getContext('2d');
  CHART_INSTANCES.incomePieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 8,
        hoverBorderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
              return ` ${fmt(ctx.parsed)}  (${pct}%)`;
            }
          }
        }
      },
      animation: { animateRotate: true, duration: 500 }
    }
  });

  // Render custom legend
  renderIncomeLegend(labels, data, colors, total);
}

// Filter dropdown listener
document.getElementById('income-chart-filter')?.addEventListener('change', e => {
  incomePieFilter = e.target.value;
  renderIncomePieChart();
});

// ── Analytics Charts ───────────────────────────────────────────────────────
let analyticsView = 'weekly';
const analyticsToggleWeekly  = document.getElementById('analytics-toggle-weekly');
const analyticsToggleMonthly = document.getElementById('analytics-toggle-monthly');

analyticsToggleWeekly.addEventListener('click', () => {
  analyticsView = 'weekly';
  analyticsToggleWeekly.classList.add('active');
  analyticsToggleMonthly.classList.remove('active');
  renderTrendChart('analyticsTrendChart', 'weekly');
});

analyticsToggleMonthly.addEventListener('click', () => {
  analyticsView = 'monthly';
  analyticsToggleMonthly.classList.add('active');
  analyticsToggleWeekly.classList.remove('active');
  renderTrendChart('analyticsTrendChart', 'monthly');
});

function refreshAnalyticsCharts() {
  // Re-render the analytics pie using the same helper but on a different canvas
  const canvas = document.getElementById('analyticsExpensePie');
  if (!canvas) return;
  const { text } = getChartThemeColors();
  const categoryTotals = {};
  expenses.forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
  const labels = Object.keys(categoryTotals);
  const data   = Object.values(categoryTotals);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#ccc');

  destroyChart('analyticsExpensePie');
  const ctx = canvas.getContext('2d');
  CHART_INSTANCES.analyticsExpensePie = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: text, font: { family: 'DM Sans', size: 12 }, padding: 14, boxWidth: 12, borderRadius: 4 }
        }
      }
    }
  });
  renderTrendChart('analyticsTrendChart', analyticsView);
}

function refreshAllCharts() {
  // Rebuild whatever charts are visible
  updateSummary();
  renderExpensePieChart();
  renderIncomePieChart();
}

// ── Budget Progress ────────────────────────────────────────────────────────
function updateBudgetProgress(containerId = 'budget-progress-container') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const now = new Date();
  const categories = ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'];
  const categorySpent = {};
  categories.forEach(c => categorySpent[c] = 0);

  expenses.forEach(e => {
    const d = new Date(e.date);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      if (categories.includes(e.category)) categorySpent[e.category] += e.amount;
    }
  });

  categories.forEach(cat => {
    const spent  = categorySpent[cat];
    const budget = budgets[cat] || 0;
    if (budget === 0 && spent === 0) return; // hide unset, unspent
    const pct    = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const cls    = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : '';

    const div = document.createElement('div');
    div.className = 'budget-item';
    div.innerHTML = `
      <div class="budget-header">
        <span>${cat}</span>
        <span class="${cls === 'danger' ? 'text-danger' : cls === 'warning' ? 'text-warning' : ''}">${fmt(spent)} / ${fmt(budget)}</span>
      </div>
      <div class="progress-track thick">
        <div class="progress-bar ${cls}" style="width:${pct}%"></div>
      </div>
      ${pct >= 100 ? `<span class="badge badge-danger">Over budget</span>` : pct >= 80 ? `<span class="badge badge-warning">Near limit</span>` : ''}
    `;
    container.appendChild(div);
  });

  if (container.children.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--space-6) 0">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">No budgets set</div>
      <div class="empty-state-sub">Go to Budgets to set monthly limits.</div>
    </div>`;
  }
}

// ── Budget Form ────────────────────────────────────────────────────────────
function renderBudgetInputs() {
  const container = document.getElementById('budget-inputs');
  if (!container) return;
  container.innerHTML = '';
  ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'].forEach(cat => {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `
      <label class="form-label" for="budget-${cat}">${cat} Budget (₹)</label>
      <input type="number" id="budget-${cat}" value="${budgets[cat] || 0}" min="0" step="0.01">
    `;
    container.appendChild(div);
  });
}

document.getElementById('budget-form').addEventListener('submit', async e => {
  e.preventDefault();
  ['Food', 'Transport', 'Housing', 'Entertainment', 'Other'].forEach(cat => {
    budgets[cat] = parseFloat(document.getElementById(`budget-${cat}`).value) || 0;
  });
  
  await fetch('/api/budgets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(budgets)
  });
  
  saveBudgets();
  updateBudgetProgress('budget-progress-container');
  updateBudgetProgress('budget-progress-container-2');
  Toast.show('Budgets saved!', 'success');
});

// ── Expense Form ───────────────────────────────────────────────────────────
const expenseForm      = document.getElementById('expense-form');
const amountInput      = document.getElementById('amount');
const categoryInput    = document.getElementById('category');
const dateInput        = document.getElementById('date');
const noteInput        = document.getElementById('note');
const expenseIdInput   = document.getElementById('expense-id');
const submitBtn        = document.getElementById('submit-btn');
const cancelBtn        = document.getElementById('cancel-btn');
const expenseFormTitle = document.getElementById('expense-form-title');
const quickEntryInput  = document.getElementById('quick-entry');

const expenseRecurringCb = document.getElementById('expense-recurring');
const expenseFrequencyGroup = document.getElementById('expense-frequency-group');
const expenseFrequencySelect = document.getElementById('expense-frequency');

if (expenseRecurringCb) {
  expenseRecurringCb.addEventListener('change', e => {
    expenseFrequencyGroup.style.display = e.target.checked ? 'flex' : 'none';
  });
}

// Simple keyword-to-category map for quick entry parsing
const QUICK_CATEGORY_MAP = {
  Food: ['lunch', 'breakfast', 'dinner', 'meal', 'snack', 'restaurant', 'coffee', 'tea'],
  Transport: ['taxi', 'bus', 'train', 'uber', 'fuel', 'gas', 'metro', 'metrocard'],
  Housing: ['rent', 'mortgage', 'utility', 'electric', 'water', 'gas bill'],
  Entertainment: ['movie', 'concert', 'games', 'netflix', 'spotify', 'show'],
  Other: []
};

/**
 * Parses a quick-entry string like "300 lunch" or "coffee 150".
 * Returns an object { amount, note, category } where amount is a number,
 * note is the remaining text, and category is guessed from keywords.
 */
function parseQuickEntry(text) {
  const tokens = text.trim().split(/\s+/);
  let amount = null;
  const noteParts = [];
  // Identify token that looks like a number (allow commas and decimals)
  tokens.forEach(tok => {
    const num = parseFloat(tok.replace(/,/g, ''));
    if (!isNaN(num) && amount === null) {
      amount = num;
    } else {
      noteParts.push(tok);
    }
  });
  const note = noteParts.join(' ');
  // Guess category based on keyword matching (case‑insensitive)
  let guessedCategory = 'Other';
  const lowerNote = note.toLowerCase();
  for (const [cat, keywords] of Object.entries(QUICK_CATEGORY_MAP)) {
    for (const kw of keywords) {
      if (lowerNote.includes(kw.toLowerCase())) {
        guessedCategory = cat;
        break;
      }
    }
    if (guessedCategory !== 'Other') break;
  }
  return { amount, note, category: guessedCategory };
}

// When quick entry changes (or on Enter), populate the main fields
quickEntryInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const parsed = parseQuickEntry(quickEntryInput.value);
    if (parsed.amount !== null) amountInput.value = parsed.amount;
    if (parsed.note) noteInput.value = parsed.note;
    if (parsed.category) categoryInput.value = parsed.category;
    // Clear quick entry after processing
    quickEntryInput.value = '';
  }
});

// Also handle blur (loss of focus) as a fallback
quickEntryInput.addEventListener('blur', () => {
  if (quickEntryInput.value.trim() === '') return;
  const parsed = parseQuickEntry(quickEntryInput.value);
  if (parsed.amount !== null) amountInput.value = parsed.amount;
  if (parsed.note) noteInput.value = parsed.note;
  if (parsed.category) categoryInput.value = parsed.category;
  quickEntryInput.value = '';
});

// Receipt Upload OCR Logic
const receiptUpload = document.getElementById('receipt-upload');
const receiptHint = document.getElementById('receipt-upload-hint');

if (receiptUpload) {
  receiptUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    receiptHint.textContent = 'Scanning receipt... Please wait (this may take a moment).';
    receiptHint.style.color = 'var(--primary-color)';

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      const res = await fetch('/api/upload-receipt', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success && data.suggestedData) {
        if (data.suggestedData.amount) amountInput.value = data.suggestedData.amount;
        if (data.suggestedData.category) categoryInput.value = data.suggestedData.category;
        if (data.suggestedData.note) noteInput.value = data.suggestedData.note;
        
        Toast.show('Receipt scanned successfully!', 'success');
        receiptHint.textContent = 'Auto-filled from receipt.';
        receiptHint.style.color = 'var(--success)';
      } else {
        Toast.show('Could not read receipt data clearly.', 'warning');
        receiptHint.textContent = 'Upload failed or unclear.';
        receiptHint.style.color = 'var(--danger)';
      }
    } catch (err) {
      console.error(err);
      Toast.show('Error processing receipt.', 'error');
      receiptHint.textContent = 'Error scanning receipt.';
      receiptHint.style.color = 'var(--danger)';
    }
    
    // Reset file input
    receiptUpload.value = '';
  });
}

expenseForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validateExpenseForm()) return;

  const amount   = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const date     = dateInput.value;
  const note     = noteInput.value.trim();
  const id       = expenseIdInput.value;

  if (id) {
    const idx = expenses.findIndex(ex => ex.id === id);
    if (idx !== -1) expenses[idx] = { id, amount, category, date, note };
    await fetch(`/api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, category, date, note })
    });
    Toast.show('Expense updated.', 'success');
  } else {
    // Duplicate detection: warn if same amount, date, and category already exists
    const duplicate = expenses.find(e => e.amount === amount && e.date === date && e.category === category);
    if (duplicate) {
      Toast.show('Duplicate expense detected. Same amount, date, and category already logged.', 'warning');
      return;
    }
    const newId = Date.now().toString();
    const newExpense = { id: newId, amount, category, date, note };

    if (expenseRecurringCb && expenseRecurringCb.checked) {
      newExpense.isRecurring = true;
      const freq = expenseFrequencySelect.value;
      const nd = new Date(date);
      if (freq === 'weekly') nd.setDate(nd.getDate() + 7);
      else nd.setMonth(nd.getMonth() + 1);
      recurringRules.push({
        id: 'rule-' + Date.now(),
        type: 'expense',
        amount, category, note,
        frequency: freq,
        nextDate: nd.toISOString().split('T')[0]
      });
      saveRecurringRules();
      renderRecurringRules();
    }

    expenses.push(newExpense);
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newExpense)
    });
    Toast.show('Expense added!', 'success');
  }

  saveExpenses();
  resetExpenseForm();
  renderExpenses();
  updateSummary();
  updateBudgetProgress('budget-progress-container');
  updateBudgetProgress('budget-progress-container-2');
  renderExpensePieChart();
});

cancelBtn.addEventListener('click', resetExpenseForm);

function validateExpenseForm() {
  const amountErr = document.getElementById('amount-error');
  const val = parseFloat(amountInput.value);
  if (!val || val <= 0) {
    amountInput.classList.add('error');
    amountErr.classList.add('visible');
    amountInput.focus();
    return false;
  }
  amountInput.classList.remove('error');
  amountErr.classList.remove('visible');
  return true;
}

function resetExpenseForm() {
  expenseForm.reset();
  expenseIdInput.value = '';
  dateInput.valueAsDate = new Date();
  submitBtn.textContent = 'Add Expense';
  cancelBtn.style.display = 'none';
  expenseFormTitle.textContent = 'Add Expense';
  document.getElementById('amount-error').classList.remove('visible');
  amountInput.classList.remove('error');
  if (expenseRecurringCb) {
    expenseRecurringCb.checked = false;
    expenseFrequencyGroup.style.display = 'none';
  }
}

// ── Expense List ───────────────────────────────────────────────────────────
function renderExpenses() {
  const tbody = document.getElementById('expense-list');
  const empty = document.getElementById('expense-empty');
  tbody.innerHTML = '';

  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  sorted.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${exp.date}</td>
      <td><span class="badge badge-neutral">${exp.category}</span>
          ${exp.isRecurring ? '<span class="recurring-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg> Recurring</span>' : ''}
      </td>
      <td style="color:var(--text-secondary)">${exp.note || '—'}</td>
      <td style="font-weight:700;color:var(--danger)">${fmt(exp.amount)}</td>
      <td>
        <button class="btn btn-blue btn-sm" onclick="editExpense('${exp.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${exp.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.editExpense = function(id) {
  const exp = expenses.find(e => e.id === id);
  if (!exp) return;
  expenseIdInput.value = exp.id;
  amountInput.value    = exp.amount;
  categoryInput.value  = exp.category;
  dateInput.value      = exp.date;
  noteInput.value      = exp.note || '';
  submitBtn.textContent = 'Update Expense';
  cancelBtn.style.display = 'block';
  expenseFormTitle.textContent = 'Edit Expense';
  navigate('expenses');
  document.querySelector('#section-expenses .card').scrollIntoView({ behavior: 'smooth' });
};

window.deleteExpense = async function(id) {
  const exp = expenses.find(e => e.id === id);
  if (!exp) return;
  const ok = await Modal.confirm({
    title: 'Delete Expense',
    body: `Are you sure you want to delete this <strong>${exp.category}</strong> expense of <strong>${fmt(exp.amount)}</strong>? This cannot be undone.`,
    confirmText: 'Delete',
    type: 'danger'
  });
  if (!ok) return;
  expenses = expenses.filter(e => e.id !== id);
  await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  saveExpenses();
  renderExpenses();
  updateSummary();
  updateBudgetProgress('budget-progress-container');
  updateBudgetProgress('budget-progress-container-2');
  renderExpensePieChart();
  Toast.show('Expense deleted.', 'error');
};

// ── Income Form ────────────────────────────────────────────────────────────
const incomeForm      = document.getElementById('income-form');
const incomeAmountInput    = document.getElementById('income-amount');
const incomeCategoryInput  = document.getElementById('income-category');
const incomeDateInput      = document.getElementById('income-date');
const incomeNoteInput      = document.getElementById('income-note');
const incomeIdInput        = document.getElementById('income-id');
const incomeSubmitBtn      = document.getElementById('income-submit-btn');
const incomeCancelBtn      = document.getElementById('income-cancel-btn');
const incomeFormTitle      = document.getElementById('income-form-title');

const incomeRecurringCb = document.getElementById('income-recurring');
const incomeFrequencyGroup = document.getElementById('income-frequency-group');
const incomeFrequencySelect = document.getElementById('income-frequency');

if (incomeRecurringCb) {
  incomeRecurringCb.addEventListener('change', e => {
    incomeFrequencyGroup.style.display = e.target.checked ? 'flex' : 'none';
  });
}

incomeForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validateIncomeForm()) return;

  const amount   = parseFloat(incomeAmountInput.value);
  const category = incomeCategoryInput.value;
  const date     = incomeDateInput.value;
  const note     = incomeNoteInput.value.trim();
  const id       = incomeIdInput.value;

  if (id) {
    const idx = incomes.findIndex(i => i.id === id);
    if (idx !== -1) incomes[idx] = { id, amount, category, date, note };
    await fetch(`/api/incomes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, category, date, note })
    });
    Toast.show('Income updated.', 'success');
  } else {
    const newId = Date.now().toString();
    const newIncome = { id: newId, amount, category, date, note };

    if (incomeRecurringCb && incomeRecurringCb.checked) {
      newIncome.isRecurring = true;
      const freq = incomeFrequencySelect.value;
      const nd = new Date(date);
      if (freq === 'weekly') nd.setDate(nd.getDate() + 7);
      else nd.setMonth(nd.getMonth() + 1);
      recurringRules.push({
        id: 'rule-' + Date.now(),
        type: 'income',
        amount, category, note,
        frequency: freq,
        nextDate: nd.toISOString().split('T')[0]
      });
      saveRecurringRules();
      renderRecurringRules();
    }

    incomes.push(newIncome);
    await fetch('/api/incomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIncome)
    });
    Toast.show('Income added!', 'success');
  }

  saveIncomes();
  resetIncomeForm();
  renderIncomes();
  updateSummary();
  renderIncomePieChart();
});

incomeCancelBtn.addEventListener('click', resetIncomeForm);

function validateIncomeForm() {
  const err = document.getElementById('income-amount-error');
  const val = parseFloat(incomeAmountInput.value);
  if (!val || val <= 0) {
    incomeAmountInput.classList.add('error');
    err.classList.add('visible');
    incomeAmountInput.focus();
    return false;
  }
  incomeAmountInput.classList.remove('error');
  err.classList.remove('visible');
  return true;
}

function resetIncomeForm() {
  incomeForm.reset();
  incomeIdInput.value = '';
  incomeDateInput.valueAsDate = new Date();
  incomeSubmitBtn.textContent = 'Add Income';
  incomeCancelBtn.style.display = 'none';
  incomeFormTitle.textContent = 'Add Income';
  document.getElementById('income-amount-error').classList.remove('visible');
  incomeAmountInput.classList.remove('error');
  if (incomeRecurringCb) {
    incomeRecurringCb.checked = false;
    incomeFrequencyGroup.style.display = 'none';
  }
}

// ── Income List ────────────────────────────────────────────────────────────
function renderIncomes() {
  const tbody = document.getElementById('income-list');
  const empty = document.getElementById('income-empty');
  tbody.innerHTML = '';

  const sorted = [...incomes].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  sorted.forEach(inc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inc.date}</td>
      <td><span class="badge badge-success">${inc.category}</span>
          ${inc.isRecurring ? '<span class="recurring-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg> Recurring</span>' : ''}
      </td>
      <td style="color:var(--text-secondary)">${inc.note || '—'}</td>
      <td style="font-weight:700;color:var(--success)">+${fmt(inc.amount)}</td>
      <td>
        <button class="btn btn-blue btn-sm" onclick="editIncome('${inc.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteIncome('${inc.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.editIncome = function(id) {
  const inc = incomes.find(i => i.id === id);
  if (!inc) return;
  incomeIdInput.value        = inc.id;
  incomeAmountInput.value    = inc.amount;
  incomeCategoryInput.value  = inc.category;
  incomeDateInput.value      = inc.date;
  incomeNoteInput.value      = inc.note || '';
  incomeSubmitBtn.textContent  = 'Update Income';
  incomeCancelBtn.style.display = 'block';
  incomeFormTitle.textContent  = 'Edit Income';
  navigate('income');
};

window.deleteIncome = async function(id) {
  const inc = incomes.find(i => i.id === id);
  if (!inc) return;
  const ok = await Modal.confirm({
    title: 'Delete Income',
    body: `Delete this <strong>${inc.category}</strong> income of <strong>+${fmt(inc.amount)}</strong>?`,
    confirmText: 'Delete',
    type: 'danger'
  });
  if (!ok) return;
  incomes = incomes.filter(i => i.id !== id);
  await fetch(`/api/incomes/${id}`, { method: 'DELETE' });
  saveIncomes();
  renderIncomes();
  updateSummary();
  renderIncomePieChart();
  Toast.show('Income entry deleted.', 'error');
};

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  dateInput.valueAsDate       = new Date();
  incomeDateInput.valueAsDate = new Date();

  window.expenses = expenses;
  window.incomes  = incomes;
  window.budgets  = budgets;

  renderBudgetInputs();
  renderExpenses();
  renderIncomes();
  updateSummary();
  updateBudgetProgress('budget-progress-container-2');

  if (window.Insights) {
    window.Insights.refresh();
  }
}

init();

// ── 3D Cover Screen: Click / Swipe to Enter ──────────────────────────────
const coverScreen = document.getElementById('cover-screen');
if (coverScreen) {
  let startY = 0;
  let isDragging = false;
  let moved = false; // distinguish click from drag

  function dismissCover(clickX, clickY) {
    // Ripple from click/tap point (or center if swipe)
    const cx = clickX ?? coverScreen.offsetWidth  / 2;
    const cy = clickY ?? coverScreen.offsetHeight / 2;
    const maxDim = Math.max(coverScreen.offsetWidth, coverScreen.offsetHeight) * 2.2;

    const ripple = document.createElement('div');
    ripple.className = 'cover-ripple';
    ripple.style.cssText = `
      width:${maxDim}px; height:${maxDim}px;
      left:${cx - maxDim / 2}px; top:${cy - maxDim / 2}px;
    `;
    coverScreen.appendChild(ripple);

    // Short pause so ripple is visible, then fly out
    setTimeout(() => {
      coverScreen.style.transform = '';
      coverScreen.classList.add('hidden');

      // Trigger the dashboard reveal once cover starts leaving
      const shell = document.querySelector('.app-shell');
      if (shell) shell.classList.add('revealed');
    }, 120);
  }

  // ── Click to open ──────────────────────────────
  coverScreen.addEventListener('click', (e) => {
    if (!moved) dismissCover(e.clientX, e.clientY);
    moved = false;
  });

  // ── Touch swipe up ─────────────────────────────
  coverScreen.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    moved = false;
  }, { passive: true });

  coverScreen.addEventListener('touchmove', e => {
    const deltaY = e.touches[0].clientY - startY;
    moved = true;
    if (deltaY < 0) coverScreen.style.transform = `translateY(${deltaY}px)`;
  }, { passive: true });

  coverScreen.addEventListener('touchend', e => {
    const deltaY = e.changedTouches[0].clientY - startY;
    if (deltaY < -60) {
      dismissCover();
    } else {
      coverScreen.style.transform = 'translateY(0)';
    }
  });

  // ── Mouse drag up ──────────────────────────────
  coverScreen.addEventListener('mousedown', e => {
    startY = e.clientY;
    isDragging = true;
    moved = false;
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const deltaY = e.clientY - startY;
    if (Math.abs(deltaY) > 5) moved = true;
    if (deltaY < 0) coverScreen.style.transform = `translateY(${deltaY}px)`;
  });

  window.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    const deltaY = e.clientY - startY;
    if (deltaY < -60) {
      dismissCover();
    } else {
      coverScreen.style.transform = 'translateY(0)';
    }
  });
}

// ── Recurring Rules Management ───────────────────────────────────────────────
function renderRecurringRules() {
  const tbody = document.getElementById('recurring-list');
  const empty = document.getElementById('recurring-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (recurringRules.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  recurringRules.forEach(rule => {
    const tr = document.createElement('tr');
    const badgeCls = rule.type === 'expense' ? 'badge-danger' : 'badge-success';
    const amountStr = rule.type === 'expense' ? fmt(rule.amount) : `+${fmt(rule.amount)}`;
    tr.innerHTML = `
      <td><span class="badge ${badgeCls}" style="text-transform: capitalize;">${rule.type}</span></td>
      <td><span class="badge badge-neutral">${rule.category}</span></td>
      <td style="color:var(--text-secondary)">${rule.note || '—'}</td>
      <td style="font-weight:700;color:var(--${rule.type === 'expense' ? 'danger' : 'success'})">${amountStr}</td>
      <td style="text-transform: capitalize;">${rule.frequency}</td>
      <td>${rule.nextDate}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteRecurringRule('${rule.id}')">Cancel</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteRecurringRule = async function(id) {
  const ok = await Modal.confirm({
    title: 'Cancel Recurring Rule',
    body: 'Are you sure you want to cancel this recurring rule? Past auto-generated entries will not be deleted.',
    confirmText: 'Cancel Rule',
    type: 'danger'
  });
  if (!ok) return;

  recurringRules = recurringRules.filter(r => r.id !== id);
  saveRecurringRules();
  renderRecurringRules();
  Toast.show('Recurring rule cancelled.', 'info');
};
