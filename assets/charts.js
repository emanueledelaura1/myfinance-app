// Gestione dei grafici con Chart.js
const Charts = (() => {
  let categoryChart = null;
  let trendChart = null;
  let budgetChart = null;
  let allocationChart = null;

  const PALETTE = [
    '#7c3aed', '#ec4899', '#f97316', '#10b981', '#3b82f6',
    '#f43f5e', '#14b8a6', '#eab308', '#8b5cf6', '#06b6d4',
  ];

  function formatEUR(value) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
  }

  function renderCategoryChart(canvasId, spendingByCategory) {
    const canvas = document.getElementById(canvasId);
    const entries = Object.entries(spendingByCategory).sort((a, b) => b[1] - a[1]);
    const emptyHint = document.getElementById('chart-category-empty');

    if (entries.length === 0) {
      canvas.style.display = 'none';
      if (emptyHint) emptyHint.style.display = 'block';
      if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
      return;
    }
    canvas.style.display = 'block';
    if (emptyHint) emptyHint.style.display = 'none';

    const labels = entries.map((e) => e[0]);
    const data = entries.map((e) => e[1]);

    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: PALETTE, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatEUR(ctx.raw)}` } },
        },
      },
    });
  }

  function renderTrendChart(canvasId, months, incomeData, expenseData) {
    const canvas = document.getElementById(canvasId);
    const labels = months.map((m) => {
      const [y, mo] = m.split('-');
      const d = new Date(Number(y), Number(mo) - 1, 1);
      return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
    });

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Entrate', data: incomeData, backgroundColor: '#10b981' },
          { label: 'Uscite', data: expenseData, backgroundColor: '#f43f5e' },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { ticks: { callback: (v) => formatEUR(v) } },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatEUR(ctx.raw)}` } },
        },
      },
    });
  }

  function renderBudgetChart(canvasId, categories, budgetData, actualData) {
    const canvas = document.getElementById(canvasId);
    const emptyHint = document.getElementById('chart-budget-empty');

    const hasAnyBudget = budgetData.some((v) => v > 0);
    if (!hasAnyBudget) {
      canvas.style.display = 'none';
      if (emptyHint) emptyHint.style.display = 'block';
      if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
      return;
    }
    canvas.style.display = 'block';
    if (emptyHint) emptyHint.style.display = 'none';

    if (budgetChart) budgetChart.destroy();
    budgetChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          { label: 'Budget', data: budgetData, backgroundColor: '#d8c9fb' },
          { label: 'Spesa reale', data: actualData, backgroundColor: '#7c3aed' },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { ticks: { callback: (v) => formatEUR(v) } },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatEUR(ctx.raw)}` } },
        },
      },
    });
  }

  function renderAllocationChart(canvasId, emptyHintId, labels, data) {
    const canvas = document.getElementById(canvasId);
    const emptyHint = document.getElementById(emptyHintId);

    if (labels.length === 0 || data.every((v) => v <= 0)) {
      canvas.style.display = 'none';
      if (emptyHint) emptyHint.style.display = 'block';
      if (allocationChart) { allocationChart.destroy(); allocationChart = null; }
      return;
    }
    canvas.style.display = 'block';
    if (emptyHint) emptyHint.style.display = 'none';

    if (allocationChart) allocationChart.destroy();
    allocationChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: PALETTE, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatEUR(ctx.raw)}` } },
        },
      },
    });
  }

  return { renderCategoryChart, renderTrendChart, renderBudgetChart, renderAllocationChart, formatEUR };
})();
