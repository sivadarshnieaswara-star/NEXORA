document.addEventListener('DOMContentLoaded', () => {
  loadAdminData();
});

async function loadAdminData() {
  try {
    const [expRes, incRes, budRes] = await Promise.all([
      fetch('/api/expenses'),
      fetch('/api/incomes'),
      fetch('/api/budgets')
    ]);

    const expenses = await expRes.json();
    const incomes = await incRes.json();
    const budgets = await budRes.json();

    renderExpensesTable(expenses);
    renderIncomesTable(incomes);
    renderBudgetsTable(budgets);
  } catch (error) {
    console.error('Error fetching admin data:', error);
  }
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expenses-body');
  tbody.innerHTML = '';
  if (expenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No expenses recorded.</td></tr>';
    return;
  }
  expenses.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.id}</td>
      <td>${e.amount.toFixed(2)}</td>
      <td>${e.category}</td>
      <td>${e.date}</td>
      <td>${e.note || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderIncomesTable(incomes) {
  const tbody = document.getElementById('incomes-body');
  tbody.innerHTML = '';
  if (incomes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No incomes recorded.</td></tr>';
    return;
  }
  incomes.forEach(i => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i.id}</td>
      <td>${i.amount.toFixed(2)}</td>
      <td>${i.category}</td>
      <td>${i.date}</td>
      <td>${i.note || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderBudgetsTable(budgets) {
  const tbody = document.getElementById('budgets-body');
  tbody.innerHTML = '';
  const categories = Object.keys(budgets);
  if (categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2">No budgets recorded.</td></tr>';
    return;
  }
  categories.forEach(cat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat}</td>
      <td>${budgets[cat].toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}
