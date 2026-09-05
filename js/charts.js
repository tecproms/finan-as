// Módulo de Gráficos e Visualização de Dados - FinControl Pro

class ChartsModule {
  constructor() {
    this.flowChart = null;
    this.categoryChart = null;
  }

  // Inicializa ou atualiza o gráfico de fluxo de caixa (Barra Receitas vs Despesas)
  renderFlowChart(canvasId = 'flow-chart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    const data = window.finance.getSixMonthsFlow();
    const labels = data.map(d => d.label);
    const incomes = data.map(d => d.income);
    const expenses = data.map(d => d.expense);

    if (this.flowChart) {
      this.flowChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    this.flowChart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Receitas',
            data: incomes,
            backgroundColor: '#10b981',
            borderRadius: 6,
            borderSkipped: false
          },
          {
            label: 'Despesas',
            data: expenses,
            backgroundColor: '#ef4444',
            borderRadius: 6,
            borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: { size: 11, family: 'inherit' },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${window.finance.formatMoney(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              font: { size: 10 },
              callback: (value) => 'R$ ' + value
            }
          }
        }
      }
    });
  }

  // Inicializa ou atualiza o gráfico de rosca das despesas por categoria
  renderCategoryChart(canvasId = 'category-chart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    const metrics = window.finance.getMonthlyMetrics();
    const categories = Object.keys(metrics.categoryExpenses);
    const values = Object.values(metrics.categoryExpenses);

    const colors = categories.map(cat => {
      const meta = window.finance.getCategoryMeta(cat);
      return meta.color || '#64748b';
    });

    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    if (categories.length === 0 || values.every(v => v === 0)) {
      // Estado vazio
      this.categoryChart = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Sem despesas no período'],
          datasets: [{
            data: [1],
            backgroundColor: ['#1e293b'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
      return;
    }

    this.categoryChart = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#131d31',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: { size: 10, family: 'inherit' },
              usePointStyle: true,
              boxWidth: 6,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(context) {
                const total = values.reduce((a, b) => a + b, 0);
                const percent = ((context.raw / total) * 100).toFixed(1);
                return `${context.label}: ${window.finance.formatMoney(context.raw)} (${percent}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Atualiza ambos os gráficos
  updateAll() {
    this.renderFlowChart();
    this.renderCategoryChart();
  }
}

window.charts = new ChartsModule();
