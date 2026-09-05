// Controlador Principal da Aplicação SPA - FinControl Pro

class App {
  constructor() {
    this.currentTab = 'dashboard';
    this.init();
  }

  init() {
    this.bindEvents();
    this.initMonthSelector();
    this.initSettingsModal();
    this.renderCurrentTab();
    this.registerServiceWorker();

    // Sincroniza automaticamente com PostgreSQL se configurado
    if (db.getApiUrl()) {
      db.syncWithServer().then(() => this.renderCurrentTab());
    }

    // Inicializa estado de bloqueio de segurança
    if (window.auth) {
      window.auth.updateLockUI();
    }

    // Captura digitação no teclado físico do computador para desbloqueio por PIN
    window.addEventListener('keydown', (e) => {
      if (window.auth && window.auth.isLocked) {
        if (e.key >= '0' && e.key <= '9') {
          window.auth.handleKeypadPress(e.key);
        } else if (e.key === 'Backspace') {
          window.auth.handleKeypadPress('backspace');
        } else if (e.key === 'Escape' || e.key === 'Delete') {
          window.auth.handleKeypadPress('clear');
        }
      }
    });

    // Reatividade: atualiza interface ao alterar o banco
    window.db.subscribe((event) => {
      this.renderCurrentTab();
      this.updateHeaderStats();
    });

    this.updateHeaderStats();

    // Sincronização automática silenciosa com a nuvem na abertura e ao focar a aba
    if (window.db && window.db.getApiUrl()) {
      setTimeout(() => {
        window.db.syncWithServer().catch(() => {});
      }, 500);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          window.db.syncWithServer().catch(() => {});
        }
      });
    }
  }

  // Registra Service Worker para PWA offline
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          console.log('Service Worker registrado:', reg.scope);
        }).catch(err => {
          console.warn('Falha ao registrar Service Worker:', err);
        });
      });
    }
  }

  // Configuração do seletor de mês (Cobre todos os anos desde 2023 até o futuro)
  initMonthSelector() {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!window.finance.selectedMonth) {
      window.finance.selectedMonth = currentYM;
    }
    this.updateMonthSelectorDisplay();

    // Fecha o popover ao clicar fora
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('month-picker-popover');
      const btn = document.getElementById('btn-month-display');
      if (pop && !pop.classList.contains('hidden')) {
        if (!pop.contains(e.target) && !btn?.contains(e.target)) {
          pop.classList.add('hidden');
        }
      }
    });
  }

  updateMonthSelectorDisplay() {
    const ym = window.finance.selectedMonth || new Date().toISOString().substring(0, 7);
    const [year, month] = ym.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    const monthName = d.toLocaleString('pt-BR', { month: 'long' });
    const formatted = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
    
    const label = document.getElementById('current-month-label');
    if (label) label.textContent = formatted;

    this.pickerYear = year;
    const yearLabel = document.getElementById('picker-year-label');
    if (yearLabel) yearLabel.textContent = year;
    this.renderPickerMonths();
  }

  navigateMonth(direction) {
    let ym = window.finance.selectedMonth || new Date().toISOString().substring(0, 7);
    let [year, month] = ym.split('-').map(Number);
    month += direction;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    const newYM = `${year}-${String(month).padStart(2, '0')}`;
    this.selectMonth(newYM);
  }

  selectMonth(ym) {
    window.finance.selectedMonth = ym;
    this.updateMonthSelectorDisplay();
    this.renderCurrentTab();
    this.updateHeaderStats();
    this.toggleMonthPicker(false);
  }

  toggleMonthPicker(force) {
    const pop = document.getElementById('month-picker-popover');
    if (!pop) return;
    const isHidden = pop.classList.contains('hidden');
    const shouldOpen = force !== undefined ? force : isHidden;
    if (shouldOpen) {
      this.pickerYear = parseInt((window.finance.selectedMonth || new Date().toISOString().substring(0, 7)).split('-')[0]);
      const yearLabel = document.getElementById('picker-year-label');
      if (yearLabel) yearLabel.textContent = this.pickerYear;
      this.renderPickerMonths();
      pop.classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    } else {
      pop.classList.add('hidden');
    }
  }

  changePickerYear(delta) {
    this.pickerYear = (this.pickerYear || parseInt(window.finance.selectedMonth.split('-')[0])) + delta;
    const yearLabel = document.getElementById('picker-year-label');
    if (yearLabel) yearLabel.textContent = this.pickerYear;
    this.renderPickerMonths();
  }

  goToCurrentMonth() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.selectMonth(ym);
  }

  renderPickerMonths() {
    const grid = document.getElementById('picker-months-grid');
    if (!grid) return;
    const year = this.pickerYear || parseInt((window.finance.selectedMonth || new Date().toISOString().substring(0, 7)).split('-')[0]);
    const currentYM = window.finance.selectedMonth;
    const todayYM = new Date().toISOString().substring(0, 7);

    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    grid.innerHTML = monthNames.map((name, idx) => {
      const mStr = String(idx + 1).padStart(2, '0');
      const ym = `${year}-${mStr}`;
      const isSelected = ym === currentYM;
      const isToday = ym === todayYM;

      let btnClass = 'py-2 rounded-xl text-center transition-all ';
      if (isSelected) {
        btnClass += 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20';
      } else if (isToday) {
        btnClass += 'bg-slate-800 text-emerald-400 font-bold border border-emerald-500/40 hover:bg-slate-700';
      } else {
        btnClass += 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white';
      }

      return `<button onclick="app.selectMonth('${ym}')" class="${btnClass}">${name}</button>`;
    }).join('');
  }

  // Atualiza saldo rápido e indicadores no topo
  updateHeaderStats() {
    const metrics = window.finance.getMonthlyMetrics();
    const balanceEl = document.getElementById('header-balance');
    if (balanceEl) {
      balanceEl.textContent = window.finance.formatMoney(metrics.currentBalance);
      if (metrics.currentBalance >= 0) {
        balanceEl.className = 'text-sm md:text-base font-bold text-emerald-400';
      } else {
        balanceEl.className = 'text-sm md:text-base font-bold text-red-400';
      }
    }

    // Indicador de compromissos pendentes hoje
    const pendingApps = window.agenda.getTodayPendingCount();
    const appBadge = document.getElementById('badge-agenda-today');
    const desktopAppBadge = document.getElementById('badge-agenda-desktop');
    if (appBadge) {
      if (pendingApps > 0) {
        appBadge.textContent = pendingApps;
        appBadge.classList.remove('hidden');
      } else {
        appBadge.classList.add('hidden');
      }
    }
    if (desktopAppBadge) {
      if (pendingApps > 0) {
        desktopAppBadge.classList.remove('hidden');
      } else {
        desktopAppBadge.classList.add('hidden');
      }
    }

    // Atualiza status do sino de notificações
    if (window.notifications) {
      window.notifications.updateUI();
    }
  }

  // Roteamento de telas (Tabs)
  switchTab(tabId) {
    this.currentTab = tabId;

    // Atualiza classes dos botões de navegação mobile
    document.querySelectorAll('.nav-item').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active', 'text-emerald-400');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('active', 'text-emerald-400');
        btn.classList.add('text-slate-400');
      }
    });

    // Atualiza classes dos botões de navegação desktop
    document.querySelectorAll('.nav-desktop-item').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.className = 'nav-desktop-item px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 transition-all shadow-sm';
      } else {
        btn.className = 'nav-desktop-item px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 flex items-center gap-1.5 transition-all border border-transparent';
      }
    });

    // Oculta todas as telas e exibe a selecionada
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.add('hidden');
    });

    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) {
      activeView.classList.remove('hidden');
    }

    this.renderCurrentTab();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderCurrentTab() {
    switch (this.currentTab) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'finances':
        this.renderFinances();
        break;
      case 'agenda':
        this.renderAgenda();
        break;
      case 'notes':
        this.renderNotes();
        break;
      case 'chat':
        this.renderChat();
        break;
    }

    // Atualiza ícones Lucide dinâmicos
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  clearCustomFilter() {
    this.activeCustomFilter = null;
    this.renderFinances();
  }

  filterFromRadar(startStr, endStr, type) {
    this.activeCustomFilter = { start: startStr, end: endStr, type: type };
    this.switchTab('finances');
    this.renderFinances();
  }

  filterFromDashboard(cardType) {
    this.switchTab('finances');
    
    const typeSelect = document.getElementById('finance-filter-type');
    const statusSelect = document.getElementById('finance-filter-status');
    
    if (typeSelect && statusSelect) {
      if (cardType === 'balance') {
        typeSelect.value = 'all';
        statusSelect.value = 'all';
      } else if (cardType === 'income') {
        typeSelect.value = 'income';
        statusSelect.value = 'all';
      } else if (cardType === 'expense') {
        typeSelect.value = 'expense';
        statusSelect.value = 'all';
      } else if (cardType === 'projected') {
        typeSelect.value = 'all';
        statusSelect.value = 'pending';
      }
    }
    
    this.renderFinances();
  }

  // --- RENDER DASHBOARD ---
  renderDashboard() {
    const metrics = window.finance.getMonthlyMetrics();

    // Valores dos cards
    const elSaldo = document.getElementById('dash-balance');
    const elEntradas = document.getElementById('dash-income');
    const elSaidas = document.getElementById('dash-expense');
    const elPrevisto = document.getElementById('dash-projected');

    if (elSaldo) {
      elSaldo.textContent = window.finance.formatMoney(metrics.currentBalance);
      if (metrics.currentBalance >= 0) {
        elSaldo.className = 'text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white';
      } else {
        elSaldo.className = 'text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-rose-400';
      }
    }

    const elSub = document.getElementById('dash-balance-subtext');
    if (elSub) {
      if (metrics.carriedBalance !== 0) {
        const netFmt = (metrics.monthlyNet >= 0 ? '+' : '') + window.finance.formatMoney(metrics.monthlyNet);
        const carriedFmt = window.finance.formatMoney(metrics.carriedBalance);
        elSub.innerHTML = `Mês: <span class="${metrics.monthlyNet >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-semibold">${netFmt}</span> <span class="text-slate-500">|</span> Anterior: <span class="text-slate-300 font-semibold">${carriedFmt}</span>`;
      } else {
        elSub.textContent = 'Saldo consolidado da conta';
      }
    }

    const elIncomeSub = document.getElementById('dash-income-subtext');
    const elExpenseSub = document.getElementById('dash-expense-subtext');

    const totalIncomePrevisto = metrics.totalIncome + (metrics.totalPendingIncome !== undefined ? metrics.totalPendingIncome : metrics.pendingIncome);
    const totalExpensePrevisto = metrics.totalExpense + (metrics.totalPendingExpense !== undefined ? metrics.totalPendingExpense : metrics.pendingExpense);

    if (elEntradas) elEntradas.textContent = window.finance.formatMoney(totalIncomePrevisto);
    if (elSaidas) elSaidas.textContent = window.finance.formatMoney(totalExpensePrevisto);
    if (elPrevisto) elPrevisto.textContent = window.finance.formatMoney(metrics.projectedBalance);

    if (elIncomeSub) {
      if (metrics.overduePendingIncome > 0) {
        elIncomeSub.innerHTML = `Mês: ${window.finance.formatMoney(metrics.pendingIncome)} <span class="text-amber-400 font-bold">(+ ${window.finance.formatMoney(metrics.overduePendingIncome)} atrasadas)</span>`;
      } else if (metrics.pendingIncome > 0 && metrics.totalIncome > 0) {
        elIncomeSub.innerHTML = `Recebido: <span class="text-emerald-400 font-semibold">${window.finance.formatMoney(metrics.totalIncome)}</span> | Pendente: <span class="text-slate-300 font-semibold">${window.finance.formatMoney(metrics.pendingIncome)}</span>`;
      } else if (metrics.pendingIncome > 0) {
        elIncomeSub.innerHTML = `A receber: <span class="text-emerald-400 font-semibold">${window.finance.formatMoney(metrics.pendingIncome)}</span>`;
      } else if (metrics.totalIncome > 0) {
        elIncomeSub.innerHTML = `Recebido: <span class="text-emerald-400 font-semibold">${window.finance.formatMoney(metrics.totalIncome)}</span> (100%)`;
      } else {
        elIncomeSub.textContent = 'Nenhuma entrada no mês';
      }
    }

    const isOverdueIncluded = metrics.includeOverdue !== false;

    if (elExpenseSub) {
      if (metrics.overduePendingExpense > 0 && isOverdueIncluded) {
        elExpenseSub.innerHTML = `A pagar: ${window.finance.formatMoney(metrics.pendingExpense)} <span class="text-rose-400 font-bold">(+ ${window.finance.formatMoney(metrics.overduePendingExpense)} em atraso)</span>`;
      } else if (metrics.overduePendingExpense > 0 && !isOverdueIncluded) {
        elExpenseSub.innerHTML = `A pagar: ${window.finance.formatMoney(metrics.pendingExpense)} <span class="text-slate-400 text-[10px]">(${window.finance.formatMoney(metrics.overduePendingExpense)} atraso não somados)</span>`;
      } else if (metrics.pendingExpense > 0 && metrics.totalExpense > 0) {
        elExpenseSub.innerHTML = `Pago: <span class="text-rose-400 font-semibold">${window.finance.formatMoney(metrics.totalExpense)}</span> | Pendente: <span class="text-slate-300 font-semibold">${window.finance.formatMoney(metrics.pendingExpense)}</span>`;
      } else if (metrics.pendingExpense > 0) {
        elExpenseSub.innerHTML = `A pagar: <span class="text-rose-400 font-semibold">${window.finance.formatMoney(metrics.pendingExpense)}</span>`;
      } else if (metrics.totalExpense > 0) {
        elExpenseSub.innerHTML = `Pago: <span class="text-rose-400 font-semibold">${window.finance.formatMoney(metrics.totalExpense)}</span> (100%)`;
      } else {
        elExpenseSub.textContent = 'Nenhuma saída no mês';
      }
    }

    // Alerta Proativo de Contas Vencidas Anteriores
    const elOverdueAlert = document.getElementById('dash-overdue-alert');
    const elOverdueIconBox = document.getElementById('dash-overdue-icon-box');
    const elOverdueIcon = document.getElementById('dash-overdue-icon');
    const elOverdueTitle = document.getElementById('dash-overdue-title');
    const elOverdueText = document.getElementById('dash-overdue-text');
    const elOverdueToggle = document.getElementById('dash-overdue-toggle');
    const elOverdueToggleLabel = document.getElementById('dash-overdue-toggle-label');

    if (elOverdueAlert) {
      if (metrics.overduePendingExpense > 0) {
        elOverdueAlert.classList.remove('hidden');
        if (elOverdueToggle) {
          elOverdueToggle.checked = isOverdueIncluded;
        }

        if (isOverdueIncluded) {
          elOverdueAlert.className = 'p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in';
          if (elOverdueIconBox) elOverdueIconBox.className = 'p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0';
          if (elOverdueIcon) elOverdueIcon.setAttribute('data-lucide', 'alert-octagon');
          if (elOverdueTitle) {
            elOverdueTitle.className = 'text-xs sm:text-sm font-bold text-rose-300 flex items-center gap-1.5';
            elOverdueTitle.textContent = 'Atenção: Contas Vencidas de Meses Anteriores em Aberto!';
          }
          if (elOverdueText) {
            elOverdueText.className = 'text-xs text-rose-200/80 mt-0.5';
            elOverdueText.innerHTML = `Você possui <strong class="text-rose-300">${metrics.overdueCount} conta(s) vencida(s)</strong> de meses anteriores somando <strong class="text-rose-300">${window.finance.formatMoney(metrics.overduePendingExpense)}</strong> em aberto. Elas estão somadas nas suas Saídas Previstas e deduzidas do Saldo Previsto para não passar aperto!`;
          }
          if (elOverdueToggleLabel) {
            elOverdueToggleLabel.textContent = 'Somar no mês: ATIVO';
            elOverdueToggleLabel.className = 'text-[11px] font-semibold text-emerald-400';
          }
        } else {
          elOverdueAlert.className = 'p-4 rounded-2xl bg-slate-800/80 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in';
          if (elOverdueIconBox) elOverdueIconBox.className = 'p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0';
          if (elOverdueIcon) elOverdueIcon.setAttribute('data-lucide', 'info');
          if (elOverdueTitle) {
            elOverdueTitle.className = 'text-xs sm:text-sm font-bold text-amber-300 flex items-center gap-1.5';
            elOverdueTitle.textContent = 'Contas Vencidas Anteriores Desativadas da Soma do Mês';
          }
          if (elOverdueText) {
            elOverdueText.className = 'text-xs text-slate-300 mt-0.5';
            elOverdueText.innerHTML = `Você possui <strong class="text-amber-300">${metrics.overdueCount} conta(s) vencida(s)</strong> de meses anteriores (<strong class="text-amber-300">${window.finance.formatMoney(metrics.overduePendingExpense)}</strong>), mas a soma no mês está <strong class="text-amber-300">desativada pela chavinha</strong>. O mês atual exibe apenas seus números isolados.`;
          }
          if (elOverdueToggleLabel) {
            elOverdueToggleLabel.textContent = 'Somar no mês: DESLIGADO';
            elOverdueToggleLabel.className = 'text-[11px] font-semibold text-slate-400';
          }
        }
      } else {
        elOverdueAlert.classList.add('hidden');
      }
    }

    // Renderiza Gráficos
    setTimeout(() => {
      window.charts.updateAll();
    }, 50);

    // Próximos compromissos na dashboard
    const appGroups = window.agenda.getGroupedAppointments();
    const appContainer = document.getElementById('dash-appointments-list');
    if (appContainer) {
      const upcomingItems = [...appGroups.today, ...appGroups.tomorrow].slice(0, 3);
      if (upcomingItems.length === 0) {
        appContainer.innerHTML = `<div class="text-xs text-slate-400 py-3 text-center">Nenhum compromisso para hoje ou amanhã.</div>`;
      } else {
        appContainer.innerHTML = upcomingItems.map(item => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="w-2 h-2 rounded-full ${item.date === new Date().toISOString().split('T')[0] ? 'bg-emerald-400' : 'bg-blue-400'}"></span>
              <div>
                <p class="font-medium text-slate-200">${item.title}</p>
                <p class="text-slate-400 text-[11px]">${window.finance.formatDate(item.date)} às ${item.time}${item.cost ? ` • ${window.finance.formatMoney(item.cost)}` : ''}</p>
              </div>
            </div>
            <button onclick="app.toggleAppointment('${item.id}')" class="px-2 py-1 rounded text-[11px] ${item.completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}">
              ${item.completed ? 'Feito' : 'Concluir'}
            </button>
          </div>
        `).join('');
      }
    }

    // Últimas transações na dashboard
    const recentTxList = window.finance.getMonthlyTransactions().slice(0, 5);
    const txContainer = document.getElementById('dash-recent-transactions');
    if (txContainer) {
      if (recentTxList.length === 0) {
        txContainer.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">Nenhum lançamento registrado neste mês.</div>`;
      } else {
        txContainer.innerHTML = recentTxList.map(tx => this.generateTransactionHTML(tx)).join('');
      }
    }

    // Renderiza o Radar Semanal de Caixa & Previsão
    this.renderWeeklyRadar();
  }

  // Renderiza o Radar Semanal de Caixa e Previsão de Sobra / Falta
  renderWeeklyRadar() {
    if (!window.finance || !window.finance.getWeeklyRadar) return;
    const radar = window.finance.getWeeklyRadar();

    // Esta Semana
    const elThisLabel = document.getElementById('radar-this-week-label');
    const elThisIncome = document.getElementById('radar-this-income');
    const elThisExpense = document.getElementById('radar-this-expense');
    const elThisNet = document.getElementById('radar-this-net');
    const elThisStatus = document.getElementById('radar-this-status');

    if (elThisLabel) elThisLabel.textContent = radar.thisWeek.label;
    if (elThisIncome) {
      elThisIncome.textContent = window.finance.formatMoney(radar.thisWeek.totalIncome);
      elThisIncome.parentElement.onclick = () => this.filterFromRadar(radar.thisWeek.startStr, radar.thisWeek.endStr, 'income');
      elThisIncome.parentElement.classList.add('cursor-pointer', 'hover:scale-[1.05]', 'transition-transform');
    }
    
    if (elThisExpense) {
      if (radar.thisWeek.overdueExpense > 0) {
        elThisExpense.innerHTML = `<span>${window.finance.formatMoney(radar.thisWeek.totalExpense)}</span> <span class="text-[10px] text-rose-400 font-bold block">(+ ${window.finance.formatMoney(radar.thisWeek.overdueExpense)} atraso)</span>`;
      } else {
        elThisExpense.textContent = window.finance.formatMoney(radar.thisWeek.totalExpense);
      }
      elThisExpense.parentElement.onclick = () => this.filterFromRadar(radar.thisWeek.startStr, radar.thisWeek.endStr, 'expense');
      elThisExpense.parentElement.classList.add('cursor-pointer', 'hover:scale-[1.05]', 'transition-transform');
    }

    if (elThisNet) {
      const netVal = radar.thisWeek.overdueExpense > 0 ? radar.thisWeek.netWithOverdue : radar.thisWeek.net;
      elThisNet.textContent = (netVal >= 0 ? '+' : '') + window.finance.formatMoney(netVal);
      elThisNet.className = `text-xs sm:text-sm font-bold ${netVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    if (elThisStatus) {
      const netVal = radar.thisWeek.overdueExpense > 0 ? radar.thisWeek.netWithOverdue : radar.thisWeek.net;
      if (netVal > 0) {
        elThisStatus.innerHTML = `<span class="text-emerald-400 font-bold">${radar.thisWeek.overdueExpense > 0 ? 'Sobra Real:' : 'Sobra:'} +${window.finance.formatMoney(netVal)}</span>`;
      } else if (netVal < 0) {
        elThisStatus.innerHTML = `<span class="text-rose-400 font-bold">Falta: -${window.finance.formatMoney(Math.abs(netVal))}</span>`;
      } else {
        elThisStatus.innerHTML = `<span class="text-slate-400 font-medium">Equilibrado (R$ 0,00)</span>`;
      }
    }

    // Próxima Semana
    const elNextLabel = document.getElementById('radar-next-week-label');
    const elNextIncome = document.getElementById('radar-next-income');
    const elNextExpense = document.getElementById('radar-next-expense');
    const elNextNet = document.getElementById('radar-next-net');
    const elNextStatus = document.getElementById('radar-next-status');

    if (elNextLabel) elNextLabel.textContent = radar.nextWeek.label;
    if (elNextIncome) {
      elNextIncome.textContent = window.finance.formatMoney(radar.nextWeek.totalIncome);
      elNextIncome.parentElement.onclick = () => this.filterFromRadar(radar.nextWeek.startStr, radar.nextWeek.endStr, 'income');
      elNextIncome.parentElement.classList.add('cursor-pointer', 'hover:scale-[1.05]', 'transition-transform');
    }
    if (elNextExpense) {
      elNextExpense.textContent = window.finance.formatMoney(radar.nextWeek.totalExpense);
      elNextExpense.parentElement.onclick = () => this.filterFromRadar(radar.nextWeek.startStr, radar.nextWeek.endStr, 'expense');
      elNextExpense.parentElement.classList.add('cursor-pointer', 'hover:scale-[1.05]', 'transition-transform');
    }
    if (elNextNet) {
      elNextNet.textContent = (radar.nextWeek.net >= 0 ? '+' : '') + window.finance.formatMoney(radar.nextWeek.net);
      elNextNet.className = `text-xs sm:text-sm font-bold ${radar.nextWeek.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }
    if (elNextStatus) {
      if (radar.nextWeek.net > 0) {
        elNextStatus.innerHTML = `<span class="text-emerald-400 font-bold">Previsão: +${window.finance.formatMoney(radar.nextWeek.net)}</span>`;
      } else if (radar.nextWeek.net < 0) {
        elNextStatus.innerHTML = `<span class="text-rose-400 font-bold">Faltará: -${window.finance.formatMoney(Math.abs(radar.nextWeek.net))}</span>`;
      } else {
        elNextStatus.innerHTML = `<span class="text-slate-400 font-medium">Previsão: R$ 0,00</span>`;
      }
    }

    // Badge Dinâmico de Topo
    const elBadge = document.getElementById('radar-status-badge');
    if (elBadge) {
      if (radar.advice.alertType === 'warning') {
        elBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Alerta de Reserva</span>`;
      } else if (radar.advice.alertType === 'danger') {
        elBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold flex items-center gap-1.5"><i data-lucide="alert-octagon" class="w-3.5 h-3.5"></i> Atenção ao Caixa</span>`;
      } else if (radar.advice.alertType === 'success') {
        elBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1.5"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Caixa Seguro</span>`;
      } else {
        elBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300 font-medium flex items-center gap-1.5"><i data-lucide="info" class="w-3.5 h-3.5"></i> Equilibrado</span>`;
      }
    }

    // Box de Orientação Inteligente (Conselho do que fazer com o dinheiro)
    const elAdvice = document.getElementById('radar-advice-box');
    if (elAdvice) {
      let boxBg = 'bg-slate-800/80 border-slate-700/60 text-slate-300';
      let icon = '<i data-lucide="lightbulb" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>';

      if (radar.advice.alertType === 'warning') {
        boxBg = 'bg-amber-500/10 border-amber-500/30 text-amber-200';
        icon = '<i data-lucide="shield-alert" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>';
      } else if (radar.advice.alertType === 'danger') {
        boxBg = 'bg-rose-500/10 border-rose-500/30 text-rose-200';
        icon = '<i data-lucide="alert-triangle" class="w-4 h-4 text-rose-400 shrink-0 mt-0.5"></i>';
      } else if (radar.advice.alertType === 'success') {
        boxBg = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200';
        icon = '<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>';
      }

      elAdvice.className = `p-3.5 rounded-xl border flex items-start gap-3 text-xs ${boxBg}`;
      elAdvice.innerHTML = `
        ${icon}
        <div class="space-y-1">
          <p class="font-bold text-slate-100">${radar.advice.alertTitle}</p>
          <p class="leading-relaxed text-slate-300">${radar.advice.alertMessage.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')}</p>
        </div>
      `;
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Alterna a soma de contas vencidas de meses anteriores nas métricas do mês
  toggleIncludeOverdue(checked) {
    const settings = window.db.getSettings();
    const current = settings.includeOverdueInMetrics !== false;
    const newVal = typeof checked === 'boolean' ? checked : !current;
    window.db.setSettings({ includeOverdueInMetrics: newVal });
    this.renderDashboard();
    if (this.currentTab === 'finances') {
      this.renderFinances();
    }
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- RENDER FINANÇAS ---
  renderFinances() {
    // Atualiza indicadores das realizadas do mês
    const metrics = window.finance.getMonthlyMetrics();
    const allMonthly = window.finance.getMonthlyTransactions();
    const paidIncomesCount = allMonthly.filter(t => t.type === 'income' && t.status === 'paid').length;
    const paidExpensesCount = allMonthly.filter(t => t.type === 'expense' && t.status === 'paid').length;

    const elIncomeRealized = document.getElementById('fin-income-realized');
    const elIncomeRealizedSub = document.getElementById('fin-income-realized-sub');
    const elExpenseRealized = document.getElementById('fin-expense-realized');
    const elExpenseRealizedSub = document.getElementById('fin-expense-realized-sub');
    const elNetRealized = document.getElementById('fin-net-realized');
    const elBalanceRealized = document.getElementById('fin-balance-realized');

    if (elIncomeRealized) elIncomeRealized.textContent = window.finance.formatMoney(metrics.totalIncome);
    if (elIncomeRealizedSub) elIncomeRealizedSub.textContent = `${paidIncomesCount} ${paidIncomesCount === 1 ? 'recebimento' : 'recebimentos'}`;

    if (elExpenseRealized) elExpenseRealized.textContent = window.finance.formatMoney(metrics.totalExpense);
    if (elExpenseRealizedSub) elExpenseRealizedSub.textContent = `${paidExpensesCount} ${paidExpensesCount === 1 ? 'pagamento' : 'pagamentos'}`;

    if (elNetRealized) {
      elNetRealized.textContent = (metrics.monthlyNet >= 0 ? '+' : '') + window.finance.formatMoney(metrics.monthlyNet);
      elNetRealized.className = `text-base sm:text-lg lg:text-xl font-black tracking-tight ${metrics.monthlyNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    if (elBalanceRealized) {
      elBalanceRealized.textContent = window.finance.formatMoney(metrics.currentBalance);
      elBalanceRealized.className = `text-base sm:text-lg lg:text-xl font-black tracking-tight ${metrics.currentBalance >= 0 ? 'text-white' : 'text-rose-400'}`;
    }

    const filterType = document.getElementById('finance-filter-type')?.value || 'all';
    const filterStatus = document.getElementById('finance-filter-status')?.value || 'all';
    const searchQuery = document.getElementById('finance-search')?.value.toLowerCase() || '';

    let list = allMonthly;

    if (this.activeCustomFilter) {
      const allTx = window.db.getTransactions();
      list = allTx.filter(t => t.date >= this.activeCustomFilter.start && t.date <= this.activeCustomFilter.end);
      if (this.activeCustomFilter.type !== 'all') {
        list = list.filter(t => t.type === this.activeCustomFilter.type);
      }
      
      const filterBadge = document.getElementById('custom-filter-badge');
      if (filterBadge) {
        filterBadge.classList.remove('hidden');
        filterBadge.innerHTML = `<i data-lucide="filter" class="w-3.5 h-3.5"></i> Filtro Especial Ativo: ${this.activeCustomFilter.start.split('-').reverse().join('/')} até ${this.activeCustomFilter.end.split('-').reverse().join('/')} (${this.activeCustomFilter.type === 'income' ? 'Receitas' : this.activeCustomFilter.type === 'expense' ? 'Despesas' : 'Tudo'}) <button onclick="app.clearCustomFilter()" class="ml-2 font-bold text-rose-300 hover:text-rose-100 underline flex items-center gap-1 inline-flex"><i data-lucide="x" class="w-3 h-3"></i> Limpar</button>`;
      }
    } else {
      const filterBadge = document.getElementById('custom-filter-badge');
      if (filterBadge) filterBadge.classList.add('hidden');
      
      if (filterType !== 'all') {
        list = list.filter(t => t.type === filterType);
      }
      if (filterStatus !== 'all') {
        list = list.filter(t => t.status === filterStatus);
      }
    }

    if (searchQuery.trim()) {
      list = list.filter(t => 
        (t.description && t.description.toLowerCase().includes(searchQuery)) ||
        (t.category && t.category.toLowerCase().includes(searchQuery))
      );
    }

    // Ordenação por vencimento: o que vence primeiro no topo, descendo cronologicamente
    list.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return (a.description || '').localeCompare(b.description || '');
    });

    const container = document.getElementById('finances-list');
    const countEl = document.getElementById('finances-count');
    if (countEl) countEl.textContent = `${list.length} lançamentos`;

    if (container) {
      if (list.length === 0) {
        container.innerHTML = `
          <div class="text-center py-10 text-slate-400">
            <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-600"></i>
            <p class="text-sm">Nenhum lançamento encontrado para os filtros selecionados.</p>
          </div>
        `;
      } else {
        container.innerHTML = list.map(tx => this.generateTransactionHTML(tx, true)).join('');
      }
    }
  }

  // Gera HTML de um item de transação
  generateTransactionHTML(tx, fullActions = false) {
    const meta = window.finance.getCategoryMeta(tx.category);
    const isIncome = tx.type === 'income';
    const sign = isIncome ? '+' : '-';
    const colorClass = isIncome ? 'text-emerald-400' : 'text-rose-400';
    const isPaid = tx.status === 'paid';
    const isOverduePrior = !!tx._isOverduePrior;
    const borderBg = isOverduePrior ? 'border-rose-500/50 bg-rose-500/[0.06] hover:bg-rose-500/[0.1]' : 'border-slate-700/50 bg-slate-800/70 hover:bg-slate-800/90';

    return `
      <div class="transaction-item w-full flex items-center justify-between p-3.5 rounded-2xl ${borderBg} transition-colors">
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background-color: ${meta.color}20; color: ${meta.color}">
            <i data-lucide="${meta.icon || 'circle-dollar-sign'}" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-semibold text-slate-200 text-sm truncate">${tx.description}</p>
              ${tx.installments > 1 ? `<span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-300 font-mono">${tx.currentInstallment}/${tx.installments}</span>` : ''}
              ${tx.totalPaid && tx.totalPaid > 0 && !isPaid 
                ? `<span class="px-2 py-0.5 rounded-md text-[10px] bg-sky-500/20 text-sky-300 font-medium flex items-center gap-1"><i data-lucide="pie-chart" class="w-3 h-3"></i> Parcial (${window.finance.formatMoney(tx.totalPaid)} pago)</span>` 
                : tx.parentId && isPaid
                ? `<span class="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/20 text-emerald-300 font-medium">Amortização</span>`
                : isOverduePrior 
                ? `<span class="px-2 py-0.5 rounded-md text-[10px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Atrasada (${window.finance.formatDate(tx.date)})</span>` 
                : (!isPaid ? `<span class="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/20 text-amber-300 font-medium">Pendente</span>` : `<span class="px-2 py-0.5 rounded-md text-[10px] bg-emerald-500/20 text-emerald-400 font-medium">Pago</span>`)}
            </div>
            <p class="text-xs text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
              <span class="font-medium text-slate-300">${tx.category}</span>
              <span class="text-slate-600">•</span>
              <span class="text-slate-200 font-medium ${isOverduePrior ? 'text-rose-300 font-bold' : ''}">${isOverduePrior ? 'Venceu em' : (isPaid ? 'Pago em' : 'Vence')} ${window.finance.formatDate(tx.date)}</span>
              <span class="text-slate-600">•</span>
              <span class="text-slate-400">${tx.paymentMethod}</span>
              ${tx.originalTotal && tx.originalTotal > tx.amount && !isPaid ? `<span class="text-slate-400 text-[11px]">(Orig: ${window.finance.formatMoney(tx.originalTotal)})</span>` : ''}
            </p>
          </div>
        </div>

        <div class="text-right shrink-0 pl-3">
          <p class="font-bold text-sm md:text-base ${colorClass}">${sign} ${window.finance.formatMoney(tx.amount)}</p>
          ${fullActions ? `
            <div class="flex items-center justify-end gap-1.5 mt-1.5">
              ${!isPaid ? `
                <button onclick="app.openSettleModal('${tx.id}')" title="Dar Baixa Total ou Parcial" class="px-2 py-1 rounded-lg text-xs ${isOverduePrior ? 'bg-rose-500/20 hover:bg-rose-500 text-rose-300 border-rose-500/40' : 'bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 border-emerald-500/40'} hover:text-white font-bold transition-all flex items-center gap-1 border">
                  <i data-lucide="check" class="w-3.5 h-3.5"></i> Baixa
                </button>
              ` : `
                <button onclick="app.toggleTransactionStatus('${tx.id}')" title="Marcar como Pendente" class="p-1.5 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                  <i data-lucide="check-circle" class="w-4 h-4"></i>
                </button>
              `}
              <button onclick="app.editTransaction('${tx.id}')" title="Editar Lançamento" class="p-1.5 rounded-lg text-xs text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="app.deleteTransaction('${tx.id}')" title="Excluir Lançamento" class="p-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // --- RENDER AGENDA ---
  renderAgenda() {
    const groups = window.agenda.getGroupedAppointments();
    const container = document.getElementById('agenda-container');
    if (!container) return;

    const sections = [
      { key: 'today', title: 'Hoje', items: groups.today, badgeColor: 'bg-emerald-500/20 text-emerald-400' },
      { key: 'tomorrow', title: 'Amanhã', items: groups.tomorrow, badgeColor: 'bg-blue-500/20 text-blue-400' },
      { key: 'upcoming', title: 'Próximos Dias', items: groups.upcoming, badgeColor: 'bg-purple-500/20 text-purple-400' },
      { key: 'past', title: 'Anteriores', items: groups.past, badgeColor: 'bg-slate-700 text-slate-400' }
    ];

    let html = '';
    let totalItems = 0;

    sections.forEach(sec => {
      if (sec.items.length > 0) {
        totalItems += sec.items.length;
        html += `
          <div class="mb-5">
            <div class="flex items-center gap-2 mb-2.5">
              <h3 class="font-bold text-sm text-slate-300">${sec.title}</h3>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${sec.badgeColor}">${sec.items.length}</span>
            </div>
            <div class="space-y-2">
              ${sec.items.map(item => this.generateAppointmentHTML(item)).join('')}
            </div>
          </div>
        `;
      }
    });

    if (totalItems === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-slate-400">
          <i data-lucide="calendar-off" class="w-12 h-12 mx-auto mb-2 text-slate-600"></i>
          <p class="text-base font-medium text-slate-300">Nenhum compromisso na agenda</p>
          <p class="text-xs text-slate-400 mt-1">Toque no botão abaixo para adicionar um compromisso ou use o chat!</p>
        </div>
      `;
    } else {
      container.innerHTML = html;
    }
  }

  generateAppointmentHTML(appItem) {
    const isCompleted = appItem.completed;
    return `
      <div class="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700/50 flex items-start justify-between gap-3 ${isCompleted ? 'opacity-60' : ''}">
        <div class="flex items-start gap-3 min-w-0">
          <button onclick="app.toggleAppointment('${appItem.id}')" class="mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600 hover:border-emerald-400'}">
            ${isCompleted ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
          </button>
          <div>
            <p class="font-semibold text-sm ${isCompleted ? 'line-through text-slate-400' : 'text-slate-200'}">${appItem.title}</p>
            <div class="flex items-center gap-2 flex-wrap text-xs text-slate-400 mt-1">
              <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${window.finance.formatDate(appItem.date)}</span>
              <span class="flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i> ${appItem.time}</span>
              ${appItem.location ? `<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> ${appItem.location}</span>` : ''}
            </div>
            ${appItem.cost ? `
              <div class="mt-2 flex items-center gap-2">
                <span class="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  Custo: ${window.finance.formatMoney(appItem.cost)}
                </span>
                <button onclick="app.convertAppToFinance('${appItem.id}')" class="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
                  <i data-lucide="arrow-right-left" class="w-3 h-3"></i> Lançar na despesa
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        <button onclick="app.deleteAppointment('${appItem.id}')" class="text-slate-500 hover:text-red-400 p-1">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }

  // --- RENDER ANOTAÇÕES ---
  renderNotes() {
    const searchVal = document.getElementById('notes-search')?.value || '';
    const container = document.getElementById('notes-container');
    const tagsContainer = document.getElementById('notes-tags-bar');

    // Tags
    if (tagsContainer) {
      const tags = window.notes.getTags();
      tagsContainer.innerHTML = tags.map(tag => `
        <button onclick="app.setNoteTagFilter('${tag}')" class="px-3 py-1 rounded-xl text-xs whitespace-nowrap transition-colors ${window.notes.activeTag === tag ? 'bg-emerald-500 text-white font-medium' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">
          ${tag}
        </button>
      `).join('');
    }

    const list = window.notes.getFilteredNotes(searchVal);

    if (container) {
      if (list.length === 0) {
        container.innerHTML = `
          <div class="col-span-full text-center py-12 text-slate-400">
            <i data-lucide="file-text" class="w-12 h-12 mx-auto mb-2 text-slate-600"></i>
            <p class="text-base font-medium text-slate-300">Nenhuma anotação encontrada</p>
            <p class="text-xs text-slate-400 mt-1">Clique no botão "+" para criar notas e lembretes rápidos!</p>
          </div>
        `;
      } else {
        container.innerHTML = list.map(note => `
          <div class="note-card relative p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex flex-col justify-between" style="border-top: 3px solid ${note.color || '#3b82f6'}">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-700/60 text-slate-300">${note.tag || 'Geral'}</span>
                <div class="flex items-center gap-1">
                  <button onclick="app.toggleNotePin('${note.id}')" title="${note.pinned ? 'Desafixar' : 'Fixar no topo'}" class="p-1 text-xs ${note.pinned ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}">
                    <i data-lucide="pin" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="app.deleteNote('${note.id}')" title="Excluir" class="p-1 text-xs text-slate-500 hover:text-red-400">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
              <h4 class="font-bold text-sm text-slate-100 mb-1.5">${note.title}</h4>
              <p class="text-xs text-slate-300 whitespace-pre-line leading-relaxed">${note.content}</p>
            </div>

            <div class="mt-3 pt-2.5 border-t border-slate-700/40 flex items-center justify-between text-[11px] text-slate-400">
              <span>${window.finance.formatDate(note.createdAt.split('T')[0])}</span>
              <button onclick="app.convertNoteToFinance('${note.id}')" class="text-emerald-400 hover:underline flex items-center gap-1">
                <i data-lucide="arrow-up-right" class="w-3 h-3"></i> Lançar
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  }

  // --- RENDER CHAT IA ---
  renderChat() {
    const messages = window.db.getChatMessages();
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-400 space-y-3">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <i data-lucide="bot" class="w-7 h-7"></i>
          </div>
          <div>
            <h4 class="font-bold text-slate-200 text-sm">Assistente FinControl IA</h4>
            <p class="text-xs text-slate-400 max-w-xs mx-auto mt-1">Fale ou digite seus gastos, receitas, compromissos ou anotações. Eu organizo tudo para você!</p>
          </div>
          <div class="flex flex-wrap justify-center gap-1.5 pt-2 max-w-sm mx-auto">
            <button onclick="app.sendSuggestedPrompt('Gastei 45 no almoço hoje no cartão')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 text-[11px] text-slate-300 border border-slate-700 hover:border-emerald-500/50">
              🍔 "Gastei 45 no almoço hoje no cartão"
            </button>
            <button onclick="app.sendSuggestedPrompt('Recebi 3500 do salário via pix')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 text-[11px] text-slate-300 border border-slate-700 hover:border-emerald-500/50">
              💵 "Recebi 3500 do salário via pix"
            </button>
            <button onclick="app.sendSuggestedPrompt('Dentista amanhã às 14:30')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 text-[11px] text-slate-300 border border-slate-700 hover:border-emerald-500/50">
              📅 "Dentista amanhã às 14:30"
            </button>
            <button onclick="app.sendSuggestedPrompt('Qual o meu saldo atual?')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 text-[11px] text-slate-300 border border-slate-700 hover:border-emerald-500/50">
              📊 "Qual o meu saldo atual?"
            </button>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = messages.map(msg => {
        const isUser = msg.sender === 'user';
        return `
          <div class="flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-3">
            <div class="max-w-[85%] md:max-w-[70%] p-3 rounded-2xl text-xs md:text-sm leading-relaxed ${isUser ? 'chat-bubble-user' : 'chat-bubble-bot'}">
              <p class="whitespace-pre-line">${msg.text}</p>
            </div>
            ${msg.actionCard ? this.generateActionCardHTML(msg.actionCard, msg.id) : ''}
          </div>
        `;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }
  }

  generateActionCardHTML(card, msgId) {
    if (card.confirmed) {
      return `
        <div class="mt-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <i data-lucide="check-circle-2" class="w-4 h-4 shrink-0"></i>
          <span>Ação registrada com sucesso!</span>
        </div>
      `;
    }

    const data = card.data;
    let detailsHTML = '';

    if (card.action === 'create_transaction') {
      const isIncome = data.type === 'income';
      const isPending = data.status === 'pending';
      const isInstallment = data.installments && parseInt(data.installments) > 1;
      const instAmt = data.installmentAmount || data.amount;
      const totAmt = data.totalAmount || (instAmt * (data.installments || 1));

      detailsHTML = `
        <div class="text-xs text-slate-300 space-y-1 my-2">
          <p><strong>Tipo:</strong> ${isIncome ? 'Receita' : 'Despesa'}</p>
          <p><strong>Descrição:</strong> ${data.description}</p>
          ${data.isRecurring ? `
            <div class="p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-semibold flex items-center gap-1.5 my-1.5">
              <i data-lucide="repeat" class="w-3.5 h-3.5 text-sky-400"></i> Recorrência Mensal Automática (12 meses)
            </div>
            <p><strong>Valor:</strong> <span class="font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">${window.finance.formatMoney(data.amount)} / mês</span></p>
            <p><strong>Início:</strong> ${window.finance.formatDate(data.date)} (todo dia ${parseInt((data.date || '').split('-')[2] || '1', 10)})</p>
            <p><strong>Projeção:</strong> 12 parcelas de ${window.finance.formatMoney(data.amount)} projetadas mês a mês</p>
          ` : isInstallment ? `
            <p><strong>Parcelamento:</strong> <span class="font-bold text-amber-400">${data.installments}x de ${window.finance.formatMoney(instAmt)}</span> <span class="text-slate-400 text-[11px]">(Total: ${window.finance.formatMoney(totAmt)})</span></p>
            <p><strong>Data da 1ª Parcela:</strong> ${window.finance.formatDate(data.date)}</p>
          ` : `
            <p><strong>Valor:</strong> <span class="font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">${window.finance.formatMoney(data.amount)}</span></p>
            <p><strong>Data:</strong> ${window.finance.formatDate(data.date)}</p>
          `}
          <p><strong>Categoria:</strong> ${data.category}</p>
          <p><strong>Forma de Pagamento:</strong> ${data.paymentMethod || 'PIX'}</p>
          <p><strong>Status:</strong> <span class="font-semibold ${isPending ? (data.date < new Date().toISOString().split('T')[0] ? 'text-rose-400 font-bold' : 'text-amber-400') : 'text-emerald-400'}">${isPending ? (data.date < new Date().toISOString().split('T')[0] ? '⚠️ Vencida / Em Aberto' : '⏳ Pendente (Previsto)') : '✅ Realizado'}</span></p>
        </div>
      `;
    } else if (card.action === 'settle_transaction') {
      const isIncome = data.type === 'income';
      const isPartial = !!data.isPartial;
      detailsHTML = `
        <div class="text-xs text-slate-300 space-y-1.5 my-2 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <p><strong>Ação:</strong> <span class="${isPartial ? 'text-amber-400' : 'text-emerald-400'} font-bold">${isPartial ? 'Dar Baixa Parcial (Amortização)' : 'Dar Baixa Total (Quitação)'}</span></p>
          <p><strong>Lançamento:</strong> <span class="text-white font-semibold">${data.description}</span></p>
          ${isPartial ? `
            <p><strong>Valor Efetivado Agora:</strong> <span class="font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">${window.finance.formatMoney(data.amount)}</span> <span class="text-emerald-300 font-semibold">(✅ ${isIncome ? 'Recebido Hoje' : 'Pago Hoje'})</span></p>
            <p><strong>Saldo Restante:</strong> <span class="font-bold text-amber-400">${window.finance.formatMoney(data.remainingAmount || (data.originalAmount - data.amount))}</span> <span class="text-slate-400">(⏳ Continuará Pendente)</span></p>
          ` : `
            <p><strong>Valor:</strong> <span class="font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">${window.finance.formatMoney(data.amount)}</span></p>
            <p><strong>Vencimento Original:</strong> ${window.finance.formatDate(data.date)}</p>
            <p><strong>Novo Status:</strong> <span class="text-amber-400 font-medium line-through">⏳ Pendente</span> ➔ <span class="text-emerald-400 font-bold">✅ ${isIncome ? 'Recebido' : 'Pago'}</span></p>
          `}
        </div>
      `;
    } else if (card.action === 'create_appointment') {
      detailsHTML = `
        <div class="text-xs text-slate-300 space-y-1 my-2">
          <p><strong>Título:</strong> ${data.title}</p>
          <p><strong>Data:</strong> ${window.finance.formatDate(data.date)} às ${data.time}</p>
          ${data.cost ? `<p><strong>Custo:</strong> ${window.finance.formatMoney(data.cost)}</p>` : ''}
        </div>
      `;
    } else if (card.action === 'create_note') {
      detailsHTML = `
        <div class="text-xs text-slate-300 space-y-1 my-2">
          <p><strong>Título:</strong> ${data.title}</p>
          <p><strong>Conteúdo:</strong> ${data.content}</p>
          <p><strong>Tag:</strong> ${data.tag}</p>
        </div>
      `;
    }

    return `
      <div class="ai-action-card mt-2 p-3 rounded-xl border border-emerald-500/30 max-w-[85%] md:max-w-[70%]">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <i data-lucide="sparkles" class="w-4 h-4"></i>
          <span>Confirmação de Ação</span>
        </div>
        ${detailsHTML}
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50">
          <button onclick="app.confirmActionCard('${msgId}')" class="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs flex items-center justify-center gap-1 shadow-sm shadow-emerald-500/20">
            <i data-lucide="check" class="w-3.5 h-3.5"></i> Confirmar
          </button>
          <button onclick="app.cancelActionCard('${msgId}')" class="py-1.5 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs">
            Descartar
          </button>
        </div>
      </div>
    `;
  }

  // Envia prompt sugerido
  sendSuggestedPrompt(text) {
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = text;
      this.sendChatMessage();
    }
  }

  // Envia mensagem do chat
  async sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    await window.chatNLP.processMessage(text);
    this.renderChat();
  }

  confirmActionCard(msgId) {
    const messages = window.db.getChatMessages();
    const msg = messages.find(m => m.id === msgId);
    if (msg && msg.actionCard) {
      window.chatNLP.confirmAction(msg.actionCard, msgId);
    }
  }

  cancelActionCard(msgId) {
    const messages = window.db.getChatMessages();
    const msg = messages.find(m => m.id === msgId);
    if (msg) {
      msg.actionCard = null;
      window.db.saveChatMessages(messages);
      this.renderChat();
    }
  }

  // --- AÇÕES RÁPIDAS E LIQUIDAÇÃO DE LANÇAMENTOS ---
  openSettleModal(id) {
    const tx = window.db.getTransactions().find(t => t.id === id);
    if (!tx) return;

    this.settlingTx = tx;
    const modal = document.getElementById('modal-settle-transaction');
    if (!modal) return;

    document.getElementById('settle-tx-id').value = tx.id;
    const titleEl = document.getElementById('settle-modal-title');
    if (titleEl) {
      titleEl.textContent = tx.type === 'income' ? 'Receber / Dar Baixa em Entrada' : 'Pagar / Dar Baixa em Despesa';
    }
    
    const elType = document.getElementById('settle-tx-type');
    if (elType) {
      elType.textContent = tx.type === 'income' ? 'Receita Prevista' : 'Despesa a Pagar';
      elType.className = `font-semibold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    const elDesc = document.getElementById('settle-tx-desc');
    if (elDesc) elDesc.textContent = tx.description;

    const elCurrentAmt = document.getElementById('settle-tx-current-amount');
    if (elCurrentAmt) elCurrentAmt.textContent = window.finance.formatMoney(tx.amount);

    const historyBox = document.getElementById('settle-tx-history-box');
    const historyText = document.getElementById('settle-tx-history-text');
    if (historyBox && historyText) {
      if (tx.totalPaid && tx.totalPaid > 0) {
        historyBox.classList.remove('hidden');
        historyText.textContent = `Histórico: Já foi pago ${window.finance.formatMoney(tx.totalPaid)} do total original de ${window.finance.formatMoney(tx.originalTotal)}.`;
      } else {
        historyBox.classList.add('hidden');
      }
    }

    // Define valor inicial como o total em aberto
    const elAmount = document.getElementById('settle-amount');
    if (elAmount) {
      elAmount.value = parseFloat(tx.amount).toFixed(2);
      elAmount.max = parseFloat(tx.amount).toFixed(2);
    }

    // Data de hoje
    const elDate = document.getElementById('settle-date');
    if (elDate) elDate.value = new Date().toISOString().split('T')[0];

    // Forma de pagamento
    const elMethod = document.getElementById('settle-payment-method');
    if (elMethod) elMethod.value = tx.paymentMethod || 'PIX';

    this.setSettleType('full');
    this.updateSettlePreview();

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeSettleModal() {
    const modal = document.getElementById('modal-settle-transaction');
    if (modal) modal.classList.add('hidden');
    this.settlingTx = null;
  }

  setSettleType(type) {
    if (!this.settlingTx) return;
    const btnFull = document.getElementById('btn-settle-full');
    const btnPartial = document.getElementById('btn-settle-partial');
    const elAmount = document.getElementById('settle-amount');

    if (type === 'full') {
      if (btnFull) btnFull.className = 'py-2 px-3 rounded-xl text-xs font-bold border transition-all bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      if (btnPartial) btnPartial.className = 'py-2 px-3 rounded-xl text-xs font-bold border transition-all bg-slate-800 text-slate-400 border-slate-700 hover:text-white';
      if (elAmount) elAmount.value = parseFloat(this.settlingTx.amount).toFixed(2);
    } else {
      if (btnFull) btnFull.className = 'py-2 px-3 rounded-xl text-xs font-bold border transition-all bg-slate-800 text-slate-400 border-slate-700 hover:text-white';
      if (btnPartial) btnPartial.className = 'py-2 px-3 rounded-xl text-xs font-bold border transition-all bg-amber-500/20 text-amber-300 border-amber-500/40';
      if (elAmount) {
        elAmount.focus();
        elAmount.select();
      }
    }
    this.updateSettlePreview();
  }

  updateSettlePreview() {
    if (!this.settlingTx) return;
    const elAmount = document.getElementById('settle-amount');
    const previewText = document.getElementById('settle-preview-text');
    const btnConfirm = document.getElementById('btn-confirm-settle');
    if (!elAmount || !previewText) return;

    const currentTotal = parseFloat(this.settlingTx.amount) || 0;
    const inputVal = parseFloat(elAmount.value) || 0;

    if (inputVal <= 0) {
      previewText.innerHTML = '<span class="text-rose-400 font-semibold">⚠️ Informe um valor maior que zero.</span>';
      if (btnConfirm) btnConfirm.disabled = true;
      return;
    }

    if (btnConfirm) btnConfirm.disabled = false;

    if (inputVal >= currentTotal - 0.001) {
      previewText.innerHTML = `<span class="text-emerald-400 font-semibold">✅ Quitação total:</span> Este lançamento será marcado como 100% pago/recebido no valor de ${window.finance.formatMoney(currentTotal)}.`;
    } else {
      const remaining = currentTotal - inputVal;
      previewText.innerHTML = `
        <span class="text-amber-300 font-semibold">⏳ Baixa Parcial:</span> Você efetivará <strong>${window.finance.formatMoney(inputVal)}</strong> no caixa hoje. 
        O saldo restante de <strong>${window.finance.formatMoney(remaining)}</strong> continuará pendente no vencimento original.
      `;
    }
  }

  handleSettleSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('settle-tx-id').value;
    const paidAmount = parseFloat(document.getElementById('settle-amount').value);
    const date = document.getElementById('settle-date').value;
    const paymentMethod = document.getElementById('settle-payment-method').value;

    if (!id || isNaN(paidAmount) || paidAmount <= 0) {
      alert('Por favor, informe um valor válido para a baixa.');
      return;
    }

    const result = window.finance.settleTransaction(id, {
      paidAmount,
      date,
      paymentMethod
    });

    if (result.success) {
      this.closeSettleModal();
      if (window.confetti) {
        window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
      }
      this.renderAll();
    } else {
      alert(result.error || 'Erro ao processar baixa.');
    }
  }

  toggleTransactionStatus(id) {
    const tx = window.db.getTransactions().find(t => t.id === id);
    if (tx) {
      if (tx.status === 'pending') {
        // Se estiver pendente, abre o modal de baixa para escolher total ou parcial
        this.openSettleModal(id);
      } else {
        // Se já estiver pago, permite reabrir como pendente
        window.db.updateTransaction(id, { status: 'pending' });
        this.renderAll();
      }
    }
  }

  deleteTransaction(id) {
    if (confirm('Deseja realmente excluir este lançamento?')) {
      window.db.deleteTransaction(id);
    }
  }

  toggleAppointment(id) {
    const appItem = window.db.getAppointments().find(a => a.id === id);
    if (appItem) {
      window.db.updateAppointment(id, { completed: !appItem.completed });
    }
  }

  deleteAppointment(id) {
    if (confirm('Deseja excluir este compromisso?')) {
      window.db.deleteAppointment(id);
    }
  }

  convertAppToFinance(id) {
    const tx = window.agenda.convertAppointmentToTransaction(id);
    if (tx) {
      alert(`Lançamento de despesa "${tx.description}" de ${window.finance.formatMoney(tx.amount)} criado com sucesso!`);
      this.switchTab('finances');
    }
  }

  toggleNotePin(id) {
    const note = window.db.getNotes().find(n => n.id === id);
    if (note) {
      window.db.updateNote(id, { pinned: !note.pinned });
    }
  }

  deleteNote(id) {
    if (confirm('Deseja excluir esta anotação?')) {
      window.db.deleteNote(id);
    }
  }

  setNoteTagFilter(tag) {
    window.notes.activeTag = tag;
    this.renderNotes();
  }

  convertNoteToFinance(id) {
    const note = window.db.getNotes().find(n => n.id === id);
    if (!note) return;
    this.openTransactionModal('expense', {
      description: note.title,
      notes: note.content
    });
  }

  // --- MODAIS ---
  editTransaction(id) {
    const tx = window.db.getTransactions().find(t => t.id === id);
    if (!tx) return;
    this.editingTxId = id;
    this.openTransactionModal(tx.type, tx);
    const titleEl = document.querySelector('#modal-transaction h3');
    if (titleEl) titleEl.innerHTML = '<i data-lucide="edit-3" class="w-4 h-4 text-emerald-400"></i> Editar Lançamento';
    if (window.lucide) window.lucide.createIcons();
  }

  openTransactionModal(type = 'expense', prefill = {}) {
    const modal = document.getElementById('modal-transaction');
    if (!modal) return;

    document.getElementById('tx-type').value = type;
    this.updateTransactionTypeUI(type);

    document.getElementById('tx-desc').value = prefill.description || '';
    document.getElementById('tx-amount').value = prefill.amount !== undefined ? prefill.amount : '';
    document.getElementById('tx-date').value = prefill.date || new Date().toISOString().split('T')[0];
    document.getElementById('tx-notes').value = prefill.notes || '';
    document.getElementById('tx-installments').value = prefill.installments || '1';
    document.getElementById('tx-status').value = prefill.status || 'paid';

    // Preenche categorias e seleciona
    this.populateCategoryOptions(type);
    if (prefill.category) {
      const catSel = document.getElementById('tx-category');
      if (catSel) catSel.value = prefill.category;
    }
    if (prefill.paymentMethod) {
      const paySel = document.getElementById('tx-payment');
      if (paySel) paySel.value = prefill.paymentMethod;
    }

    modal.classList.remove('hidden');
  }

  updateTransactionTypeUI(type) {
    const btnExpense = document.getElementById('btn-type-expense');
    const btnIncome = document.getElementById('btn-type-income');

    if (type === 'expense') {
      btnExpense.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white shadow-md shadow-rose-500/20';
      btnIncome.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 hover:text-slate-200';
    } else {
      btnIncome.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white shadow-md shadow-emerald-500/20';
      btnExpense.className = 'flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 hover:text-slate-200';
    }
    this.populateCategoryOptions(type);
  }

  populateCategoryOptions(type) {
    const catSel = document.getElementById('tx-category');
    if (!catSel) return;
    catSel.innerHTML = '';

    Object.entries(FINANCE_CATEGORIES).forEach(([name, meta]) => {
      if (meta.type === type) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        catSel.appendChild(opt);
      }
    });
  }

  closeTransactionModal() {
    this.editingTxId = null;
    const titleEl = document.querySelector('#modal-transaction h3');
    if (titleEl) titleEl.innerHTML = '<i data-lucide="receipt" class="w-4 h-4 text-emerald-400"></i> Novo Lançamento';
    if (window.lucide) window.lucide.createIcons();
    const modal = document.getElementById('modal-transaction');
    if (modal) modal.classList.add('hidden');
  }

  saveTransactionFromModal(e) {
    e.preventDefault();
    const type = document.getElementById('tx-type').value;
    const desc = document.getElementById('tx-desc').value.trim();
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const category = document.getElementById('tx-category').value;
    const paymentMethod = document.getElementById('tx-payment').value;
    const date = document.getElementById('tx-date').value;
    const status = document.getElementById('tx-status').value;
    const installments = parseInt(document.getElementById('tx-installments').value) || 1;
    const notes = document.getElementById('tx-notes').value.trim();

    if (!desc || isNaN(amount) || amount <= 0) {
      alert('Por favor, informe uma descrição e um valor válido.');
      return;
    }

    const baseTx = {
      type,
      description: desc,
      amount,
      category,
      paymentMethod,
      date,
      dueDate: date,
      status,
      notes
    };

    if (this.editingTxId) {
      window.db.updateTransaction(this.editingTxId, baseTx);
      this.editingTxId = null;
    } else {
      window.finance.createInstallments(baseTx, installments);
    }

    if (window.confetti) {
      window.confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    }

    this.closeTransactionModal();
  }

  // Modal de Compromisso
  openAppointmentModal() {
    const modal = document.getElementById('modal-appointment');
    if (!modal) return;
    document.getElementById('app-form').reset();
    document.getElementById('app-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('app-time').value = '09:00';
    modal.classList.remove('hidden');
  }

  closeAppointmentModal() {
    const modal = document.getElementById('modal-appointment');
    if (modal) modal.classList.add('hidden');
  }

  saveAppointmentFromModal(e) {
    e.preventDefault();
    const title = document.getElementById('app-title').value.trim();
    const date = document.getElementById('app-date').value;
    const time = document.getElementById('app-time').value;
    const location = document.getElementById('app-location').value.trim();
    const cost = parseFloat(document.getElementById('app-cost').value) || 0;
    const priority = document.getElementById('app-priority').value;

    if (!title) {
      alert('Informe o título do compromisso.');
      return;
    }

    window.db.addAppointment({
      title,
      date,
      time,
      location,
      cost,
      priority,
      completed: false
    });

    this.closeAppointmentModal();
  }

  // Modal de Anotação
  openNoteModal() {
    const modal = document.getElementById('modal-note');
    if (!modal) return;
    document.getElementById('note-form').reset();
    modal.classList.remove('hidden');
  }

  closeNoteModal() {
    const modal = document.getElementById('modal-note');
    if (modal) modal.classList.add('hidden');
  }

  saveNoteFromModal(e) {
    e.preventDefault();
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const tag = document.getElementById('note-tag').value.trim() || 'Geral';
    const color = document.getElementById('note-color').value || '#3b82f6';

    if (!title && !content) {
      alert('Informe ao menos um título ou conteúdo para a nota.');
      return;
    }

    window.db.addNote({
      title: title || 'Anotação rápida',
      content,
      tag,
      color,
      pinned: false
    });

    this.closeNoteModal();
  }

  // Modal de Configurações, Chave Groq e PIN
  initSettingsModal() {
    const settings = window.db.getSettings();
    const keyInput = document.getElementById('setting-groq-key');
    const modelSel = document.getElementById('setting-groq-model');
    
    if (keyInput) keyInput.value = settings.groqApiKey || '';
    if (modelSel) {
      let saved = settings.groqModel || 'llama-3.1-8b-instant';
      if (saved === 'llama-3.3-70b-versatile') saved = 'llama-3.1-8b-instant';
      modelSel.value = saved;
    }
    
    this.updateGroqStatusUI(settings.groqApiKey);
    this.updateAuthStatusUI();

    // Configurações Asaas
    const asaasEnvInput = document.getElementById('asaas-env');
    const asaasKeyInput = document.getElementById('asaas-api-key');
    if (settings.asaas) {
      
      
    }
    // this.updateAsaasStatusUI();

    // Configurações PostgreSQL (aaPanel / VPS)
    const serverUrlInput = document.getElementById('setting-server-url');
    if (serverUrlInput) serverUrlInput.value = settings.serverApiUrl || '';
    this.updatePgsqlStatusUI(settings.serverApiUrl || '');

    // Configurações Mercado Pago
    const mpTokenInput = document.getElementById('setting-mp-token');
    if (mpTokenInput) mpTokenInput.value = settings.mercadoPagoToken || '';
    this.updateMpStatusUI(settings.mercadoPagoToken);

    // Saldo Inicial da Conta
    const initBalInput = document.getElementById('setting-initial-balance');
    if (initBalInput) initBalInput.value = settings.initialBalance !== undefined && settings.initialBalance !== '' ? settings.initialBalance : '';

    // Preferências de Contas Vencidas Anteriores
    const overdueToggleSetting = document.getElementById('setting-include-overdue');
    if (overdueToggleSetting) {
      overdueToggleSetting.checked = settings.includeOverdueInMetrics !== false;
    }

    // Notificações e Lembretes Diários
    const dailyNotifToggle = document.getElementById('setting-daily-notif');
    if (dailyNotifToggle) dailyNotifToggle.checked = settings.dailyNotificationEnabled !== false;

    const dailyNotifTime = document.getElementById('setting-daily-notif-time');
    if (dailyNotifTime) dailyNotifTime.value = settings.dailyNotificationTime || '08:00';

    const appReminderToggle = document.getElementById('setting-app-reminder');
    if (appReminderToggle) appReminderToggle.checked = settings.appointmentReminderEnabled !== false;

    if (window.notifications) {
      window.notifications.updateUI();
    }

    // Configurações Banco Inter
    if (window.bankImport) {
      const interCfg = window.bankImport.getInterSettings();
      const interClientId = document.getElementById('setting-inter-client-id');
      const interClientSec = document.getElementById('setting-inter-client-secret');
      const interEnv = document.getElementById('setting-inter-env');
      if (interClientId) interClientId.value = interCfg.clientId || '';
      if (interClientSec) interClientSec.value = interCfg.clientSecret || '';
      if (interEnv) interEnv.value = interCfg.environment || 'sandbox';
      this.updateInterStatusUI(interCfg);
    }

    // Configurações Evolution API (WhatsApp)
    if (window.evolutionService) {
      const evoCfg = window.evolutionService.getConfig();
      const evoUrl = document.getElementById('setting-evolution-url');
      const evoKey = document.getElementById('setting-evolution-apikey');
      const evoInst = document.getElementById('setting-evolution-instance');
      const evoPhone = document.getElementById('setting-evolution-phone');
      const evoSummary = document.getElementById('setting-evolution-summary');
      const evoApps = document.getElementById('setting-evolution-appointments');
      const evoAuto = document.getElementById('setting-evolution-auto-execute');

      if (evoUrl) evoUrl.value = evoCfg.apiUrl || 'https://api.bascully.com.br';
      if (evoKey) evoKey.value = evoCfg.apiKey || 'MudeParaUmaSenhaForte123';
      if (evoInst) evoInst.value = evoCfg.instanceName || 'financeiro3';
      if (evoPhone) evoPhone.value = evoCfg.userPhone || '5511943137268';
      if (evoSummary) evoSummary.checked = evoCfg.notifySummary !== false;
      if (evoApps) evoApps.checked = evoCfg.notifyAppointments !== false;
      if (evoAuto) evoAuto.checked = evoCfg.autoExecuteActions !== false;

      this.updateEvolutionStatusUI();
    }
  }

  updatePgsqlStatusUI(serverUrl) {
    const badge = document.getElementById('pgsql-status-badge');
    if (!badge) return;
    const url = serverUrl || window.db.getApiUrl();
    if (url) {
      badge.textContent = '🟢 PostgreSQL Configurado';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30';
    } else {
      badge.textContent = '⚪ Modo Local Offline';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-700 text-slate-300';
    }
  }

  updateMpStatusUI(token) {
    const badge = document.getElementById('mp-status-badge');
    if (!badge) return;
    const settings = window.db.getSettings();
    const t = token || settings.mercadoPagoToken;
    if (t && t.length > 10) {
      badge.textContent = '🟢 Mercado Pago Conectado';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
    } else {
      badge.textContent = '⚪ Pronto para Conectar';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-700 text-slate-300';
    }
  }

  async testPostgresConnection() {
    const urlInput = document.getElementById('setting-server-url');
    let url = urlInput ? urlInput.value.trim().replace(/\/+$/, '') : '';
    if (!url) {
      alert('Informe a URL da API do seu servidor na VPS (ex: http://76.13.163.214:3000/api).');
      return;
    }

    const btn = document.getElementById('btn-test-pgsql');
    if (btn) btn.textContent = 'Testando conexão...';

    try {
      const resp = await fetch(`${url}/health`, { method: 'GET' });
      if (!resp.ok) throw new Error(`Status HTTP ${resp.status}`);
      const data = await resp.json();

      alert(`✅ Conexão bem-sucedida com o PostgreSQL!\n\nServiço: ${data.service}\nBanco: ${data.database}\nTransações armazenadas: ${data.totalTransactions}\nHora do Servidor: ${new Date(data.serverTime).toLocaleString('pt-BR')}`);
      this.updatePgsqlStatusUI(url);
    } catch (err) {
      alert(`❌ Não foi possível conectar ao PostgreSQL em ${url}.\n\nDetalhe do erro: ${err.message}\n\nDica: Verifique se a porta 3006 está aberta no firewall do aaPanel ou se o app Node está rodando.`);
    } finally {
      if (btn) btn.innerHTML = '<i data-lucide="activity" class="w-3.5 h-3.5"></i> Testar Conexão PostgreSQL';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async syncWithPostgres() {
    const res = await window.db.syncWithServer();
    if (res.success) {
      this.renderCurrentTab();
      if (window.confetti) window.confetti({ particleCount: 50, spread: 60 });
      alert('✅ ' + res.message);
    }
  }

  async confirmAndClearAllData() {
    const msg = 
      "⚠️ AVISO DE SEGURANÇA: EXCLUSÃO TOTAL DE DADOS!\n\n" +
      "Esta ação apagará todas as transações financeiras, compromissos e anotações tanto deste aparelho quanto do banco PostgreSQL da sua VPS.\n\n" +
      "🛡️ Por segurança, um BACKUP AUTOMÁTICO (.json) será baixado no seu computador antes da exclusão.\n\n" +
      "Se tem certeza absoluta, digite a palavra ZERAR para confirmar:";

    const userInput = prompt(msg);
    if (!userInput) return;
    
    const cleanInput = userInput.trim().toUpperCase();
    if (cleanInput !== 'ZERAR' && cleanInput !== 'ZERA') {
      alert('❌ Operação cancelada! A palavra digitada não foi ZERAR. Seus dados estão 100% seguros e intactos.');
      return;
    }

    // 1. Download de backup preventivo automático
    try {
      if (window.exporter && typeof window.exporter.downloadFullBackup === 'function') {
        window.exporter.downloadFullBackup();
      } else {
        const backupData = window.db.exportAll();
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `backup_seguranca_fincontrol_${now}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('Falha no backup automático preventivo:', e);
    }

    // 2. Limpeza profunda segura aguardando o PostgreSQL
    try {
      await window.db.clearAll();
      this.renderCurrentTab();
      this.updateHeaderStats();
      alert('✅ Banco de dados zerado com sucesso!\n\nTodos os registros foram removidos do seu navegador e do banco PostgreSQL da VPS. Um backup preventivo foi salvo na sua pasta de Downloads.');
    } catch (err) {
      alert('⚠️ Erro durante a limpeza: ' + err.message);
    }
  }

  async syncMercadoPago() {
    const settings = window.db.getSettings();
    const tokenInput = document.getElementById('setting-mp-token');
    const token = (tokenInput ? tokenInput.value.trim() : '') || settings.mercadoPagoToken;
    const apiUrl = window.db.getApiUrl();

    if (!token && !apiUrl) {
      if (confirm('Você ainda não configurou o Access Token do Mercado Pago.\n\nDeseja abrir as Configurações para colar sua chave do Mercado Pago agora?')) {
        this.openSettingsModal();
      }
      return;
    }

    try {
      if (apiUrl) {
        const resp = await fetch(`${apiUrl}/mercadopago/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token })
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        await window.db.syncWithServer();
        this.renderCurrentTab();

        if (window.confetti) window.confetti({ particleCount: 60, spread: 70 });
        alert(`✅ Sincronização Concluída!\n\n${data.mensagem}`);
      } else {
        alert('💡 Para sincronização automática com o Mercado Pago, configure a URL do seu servidor PostgreSQL na VPS em Configurações.');
      }
    } catch (err) {
      alert('❌ Falha ao sincronizar com Mercado Pago: ' + err.message);
    }
  }

  updateInterStatusUI(cfg) {
    const badge = document.getElementById('inter-status-badge');
    if (!badge) return;
    const interCfg = cfg || (window.bankImport ? window.bankImport.getInterSettings() : {});
    if (interCfg.clientId && interCfg.clientId.length > 5) {
      badge.textContent = `🟢 Conectado (${interCfg.environment === 'production' ? 'Produção' : 'Sandbox'})`;
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/30';
    } else {
      badge.textContent = '⚪ Pronto para Conectar';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-700 text-slate-300';
    }
  }

  async testInterApi() {
    const clientId = document.getElementById('setting-inter-client-id')?.value.trim();
    const clientSecret = document.getElementById('setting-inter-client-secret')?.value.trim();
    const env = document.getElementById('setting-inter-env')?.value || 'sandbox';

    if (!clientId) {
      alert('Informe o Client ID do Banco Inter.');
      return;
    }

    try {
      const res = await window.bankImport.testInterConnection(clientId, clientSecret, env);
      alert('✅ ' + res.message);
      this.updateInterStatusUI({ clientId, environment: env });
    } catch (e) {
      alert('❌ Falha na conexão com Banco Inter: ' + e.message);
    }
  }

  updateAuthStatusUI() {
    const authConfig = window.auth ? window.auth.getAuthConfig() : { enabled: false };
    const authBadge = document.getElementById('auth-status-badge');
    const btnDisableAuth = document.getElementById('btn-disable-auth');
    const autolockSel = document.getElementById('setting-autolock');

    if (authBadge) {
      authBadge.textContent = authConfig.enabled ? '🔒 Ativa (PIN Cadastrado)' : '🔓 Desativada';
      authBadge.className = authConfig.enabled 
        ? 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-700 text-slate-300';
    }

    if (btnDisableAuth) {
      if (authConfig.enabled) {
        btnDisableAuth.classList.remove('hidden');
      } else {
        btnDisableAuth.classList.add('hidden');
      }
    }

    if (autolockSel && authConfig.autoLockMinutes !== undefined) {
      autolockSel.value = String(authConfig.autoLockMinutes);
    }
  }

  // Salvar ou alterar PIN de segurança
  async saveSecurityPin() {
    const pin1 = document.getElementById('setting-new-pin')?.value.trim();
    const pin2 = document.getElementById('setting-confirm-pin')?.value.trim();
    const autolock = document.getElementById('setting-autolock')?.value || 5;

    if (!pin1 || pin1.length < 4) {
      alert('Por favor, informe um PIN numérico de no mínimo 4 dígitos.');
      return;
    }

    if (pin1 !== pin2) {
      alert('Os PINs digitados não conferem. Por favor, digite o mesmo PIN nos dois campos.');
      return;
    }

    try {
      await window.auth.setSecurityPin(pin1, autolock);
      document.getElementById('setting-new-pin').value = '';
      document.getElementById('setting-confirm-pin').value = '';
      this.updateAuthStatusUI();
      window.auth.updateLockUI();
      alert('✅ Proteção por PIN ativada com sucesso!\nVocê pode bloquear a tela a qualquer momento clicando no cadeado 🔓 no topo.');
    } catch (err) {
      alert('Erro ao configurar PIN: ' + err.message);
    }
  }

  // Desativar proteção por senha
  async disableSecurityPin() {
    const current = prompt('Digite o seu PIN atual para desativar a segurança:');
    if (current === null) return;

    try {
      await window.auth.disableAuth(current);
      this.updateAuthStatusUI();
      window.auth.updateLockUI();
      alert('🔓 Proteção por senha desativada com sucesso.');
    } catch (err) {
      alert('❌ ' + err.message);
    }
  }

  openSettingsModal() {
    this.initSettingsModal();
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.remove('hidden');
  }

  closeSettingsModal() {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.classList.add('hidden');
  }

  saveSettings() {
    const keyInput = document.getElementById('setting-groq-key');
    const modelSel = document.getElementById('setting-groq-model');

    const key = keyInput ? keyInput.value.trim() : '';
    const model = modelSel ? modelSel.value : 'llama-3.1-8b-instant';

    const serverUrl = document.getElementById('setting-server-url')?.value.trim() || '';
    const mpToken = document.getElementById('setting-mp-token')?.value.trim() || '';
    const initBalInput = document.getElementById('setting-initial-balance');
    const initialBalance = initBalInput && initBalInput.value !== '' ? parseFloat(initBalInput.value) : 0;
    const overdueToggleSetting = document.getElementById('setting-include-overdue');
    const includeOverdue = overdueToggleSetting ? overdueToggleSetting.checked : true;
    const dailyNotif = document.getElementById('setting-daily-notif') ? document.getElementById('setting-daily-notif').checked : true;
    const dailyNotifTime = document.getElementById('setting-daily-notif-time')?.value || '08:00';
    const appReminder = document.getElementById('setting-app-reminder') ? document.getElementById('setting-app-reminder').checked : true;
    const asaasEnv = 'sandbox';
    const asaasKey = '';

    window.db.setSettings({
      asaas: { environment: asaasEnv, apiKey: asaasKey },
      groqApiKey: key,
      groqModel: model,
      serverApiUrl: serverUrl,
      mercadoPagoToken: mpToken,
      initialBalance: initialBalance,
      includeOverdueInMetrics: includeOverdue,
      dailyNotificationEnabled: dailyNotif,
      dailyNotificationTime: dailyNotifTime,
      appointmentReminderEnabled: appReminder
    });

    // Salva configurações do Banco Inter
    if (window.bankImport) {
      const interClientId = document.getElementById('setting-inter-client-id')?.value.trim() || '';
      const interClientSec = document.getElementById('setting-inter-client-secret')?.value.trim() || '';
      const interEnv = document.getElementById('setting-inter-env')?.value || 'sandbox';
      window.bankImport.saveInterSettings({
        clientId: interClientId,
        clientSecret: interClientSec,
        environment: interEnv
      });
      this.updateInterStatusUI();
    }

    // Salva configurações Evolution API (WhatsApp)
    if (window.evolutionService) {
      const evoUrl = document.getElementById('setting-evolution-url')?.value.trim() || 'http://localhost:8080';
      const evoKey = document.getElementById('setting-evolution-apikey')?.value.trim() || '';
      const evoInst = document.getElementById('setting-evolution-instance')?.value.trim() || 'fincontrol';
      const evoPhone = document.getElementById('setting-evolution-phone')?.value.trim() || '';
      const evoSummary = document.getElementById('setting-evolution-summary')?.checked !== false;
      const evoApps = document.getElementById('setting-evolution-appointments')?.checked !== false;
      const evoAuto = document.getElementById('setting-evolution-auto-execute')?.checked !== false;

      window.evolutionService.saveConfig({
        apiUrl: evoUrl,
        apiKey: evoKey,
        instanceName: evoInst,
        userPhone: evoPhone,
        notifySummary: evoSummary,
        notifyAppointments: evoApps,
        autoExecuteActions: evoAuto
      });
      this.updateEvolutionStatusUI();
    }

    this.updateGroqStatusUI(key);
    this.updatePgsqlStatusUI(serverUrl);
    this.updateMpStatusUI(mpToken);
    alert('Configurações salvas com sucesso!');
    this.closeSettingsModal();
  }

  updateEvolutionStatusUI(state = null, isConnected = null) {
    const badge = document.getElementById('evolution-status-badge');
    if (!badge) return;

    if (isConnected === true || state === 'open' || state === 'connected') {
      badge.textContent = '🟢 WhatsApp Conectado';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    } else if (state === 'connecting') {
      badge.textContent = '🟡 Conectando...';
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30';
    } else {
      const config = window.evolutionService ? window.evolutionService.getConfig() : {};
      if (config.apiKey && config.userPhone) {
        badge.textContent = '⚪ Pronto para Parear';
      } else {
        badge.textContent = '⚪ Desconectado';
      }
      badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-700 text-slate-300';
    }
  }

  async checkEvolutionStatus() {
    if (!window.evolutionService) return;
    const url = document.getElementById('setting-evolution-url')?.value.trim() || 'https://api.bascully.com.br';
    const key = document.getElementById('setting-evolution-apikey')?.value.trim() || '6A55A3BBE45B-4F2B-8250-AE33F929D789';
    const instance = document.getElementById('setting-evolution-instance')?.value.trim() || 'teste';

    const btn = document.getElementById('btn-evolution-check');
    if (btn) btn.textContent = 'Verificando...';

    const res = await window.evolutionService.checkConnectionState(url, key, instance);
    this.updateEvolutionStatusUI(res.state, res.connected);

    if (btn) {
      btn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Status';
      if (window.lucide) window.lucide.createIcons();
    }

    if (res.connected) {
      alert(`🟢 Evolution API conectada com sucesso!\nInstância: ${instance || 'teste'}\nEstado: Aberta / Conectada ao WhatsApp`);
    } else if (res.state === 'connecting') {
      alert(`🟡 Instância conectando... Abra o QR Code para parear.`);
    } else if (res.state === 'not_found') {
      alert(`⚠️ Instância "${instance}" ainda não existe na Evolution API. Clique em "Conectar / QR" para criá-la e parear.`);
    } else {
      alert(`⚪ Status da Evolution API: ${res.state || 'Desconectado'}\n${res.message || ''}`);
    }
  }

  async connectEvolutionWhatsApp() {
    if (!window.evolutionService) return;
    const url = document.getElementById('setting-evolution-url')?.value.trim() || 'https://api.bascully.com.br';
    const key = document.getElementById('setting-evolution-apikey')?.value.trim() || '6A55A3BBE45B-4F2B-8250-AE33F929D789';
    const instance = document.getElementById('setting-evolution-instance')?.value.trim() || 'teste';
    const phone = document.getElementById('setting-evolution-phone')?.value.trim() || '5511943137268';

    // Salva temporariamente os inputs
    window.evolutionService.saveConfig({
      apiUrl: url,
      apiKey: key,
      instanceName: instance,
      userPhone: phone
    });

    const modal = document.getElementById('modal-evolution-qrcode');
    const box = document.getElementById('evolution-qrcode-box');
    const statusTxt = document.getElementById('evolution-qrcode-status');
    const pairingBox = document.getElementById('evolution-pairing-code-box');

    if (modal) modal.classList.remove('hidden');
    if (box) {
      box.innerHTML = `
        <div class="text-center p-2">
          <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <span class="text-xs text-slate-700 font-medium block">Obtendo QR Code da Evolution API...</span>
        </div>`;
    }
    if (statusTxt) statusTxt.textContent = 'Carregando...';
    if (pairingBox) pairingBox.classList.add('hidden');

    const qrResult = await window.evolutionService.fetchQrCode(url, key, instance);

    if (!qrResult.success) {
      if (box) {
        box.innerHTML = `
          <div class="text-center p-2 text-rose-600">
            <span class="text-xs font-bold block mb-1">Falha ao obter QR Code</span>
            <span class="text-[11px] block leading-tight text-slate-600">${qrResult.message || 'Verifique se a Evolution API está rodando e a chave API está correta.'}</span>
          </div>`;
      }
      if (statusTxt) statusTxt.textContent = 'Erro ao conectar';
      return;
    }

    // Se já estava conectado
    if (qrResult.raw && (qrResult.raw.state === 'open' || qrResult.raw.status === 'open')) {
      if (box) {
        box.innerHTML = `
          <div class="text-center p-4 text-emerald-600">
            <span class="text-3xl block mb-2">🟢</span>
            <span class="text-xs font-bold block">WhatsApp Já Conectado!</span>
          </div>`;
      }
      if (statusTxt) statusTxt.textContent = 'Instância conectada';
      this.updateEvolutionStatusUI('open', true);
      return;
    }

    // Renderiza imagem do QR Code
    if (qrResult.base64) {
      let src = qrResult.base64;
      if (!src.startsWith('data:image')) {
        src = `data:image/png;base64,${src}`;
      }
      if (box) {
        box.innerHTML = `<img src="${src}" alt="QR Code WhatsApp" class="w-full h-full object-contain rounded-xl" />`;
      }
      if (statusTxt) statusTxt.textContent = 'Aguardando leitura do QR Code...';
    } else if (qrResult.code && window.QRious) {
      if (box) {
        box.innerHTML = `<canvas id="evolution-canvas-qr" class="w-full h-full"></canvas>`;
        new window.QRious({
          element: document.getElementById('evolution-canvas-qr'),
          value: qrResult.code,
          size: 240
        });
      }
      if (statusTxt) statusTxt.textContent = 'Aguardando leitura do QR Code...';
    }

    // Se tiver código de pareamento
    if (qrResult.pairingCode && pairingBox) {
      pairingBox.textContent = `Código de Pareamento: ${qrResult.pairingCode}`;
      pairingBox.classList.remove('hidden');
    }

    // Inicia verificação periódica (polling) de conexão a cada 3 segundos
    if (this.evolutionPollingTimer) clearInterval(this.evolutionPollingTimer);
    this.evolutionPollingTimer = setInterval(async () => {
      const stateCheck = await window.evolutionService.checkConnectionState(url, key, instance);
      if (stateCheck.connected) {
        clearInterval(this.evolutionPollingTimer);
        this.evolutionPollingTimer = null;
        this.updateEvolutionStatusUI('open', true);
        if (box) {
          box.innerHTML = `
            <div class="text-center p-4 text-emerald-600">
              <span class="text-4xl block mb-2">🎉</span>
              <span class="text-xs font-bold block">WhatsApp Conectado com Sucesso!</span>
            </div>`;
        }
        if (statusTxt) statusTxt.textContent = 'Conectado!';
        if (window.confetti) window.confetti({ particleCount: 60, spread: 70 });
        setTimeout(() => {
          this.closeEvolutionQrModal();
        }, 1800);
      }
    }, 3000);
  }

  closeEvolutionQrModal() {
    if (this.evolutionPollingTimer) {
      clearInterval(this.evolutionPollingTimer);
      this.evolutionPollingTimer = null;
    }
    const modal = document.getElementById('modal-evolution-qrcode');
    if (modal) modal.classList.add('hidden');
  }

  async logoutEvolutionWhatsApp() {
    if (!window.evolutionService) return;
    if (!confirm('Deseja desconectar a sessão do WhatsApp da Evolution API?')) return;

    const res = await window.evolutionService.logoutInstance();
    this.updateEvolutionStatusUI('disconnected', false);
    if (res.success) {
      alert('Sessão do WhatsApp desconectada com sucesso.');
    } else {
      alert('Não foi possível desconectar: ' + (res.error || 'Erro desconhecido'));
    }
  }

  async testEvolutionMessage() {
    if (!window.evolutionService) return;
    const url = document.getElementById('setting-evolution-url')?.value.trim() || 'https://api.bascully.com.br';
    const key = document.getElementById('setting-evolution-apikey')?.value.trim() || '6A55A3BBE45B-4F2B-8250-AE33F929D789';
    const instance = document.getElementById('setting-evolution-instance')?.value.trim() || 'teste';
    const phone = document.getElementById('setting-evolution-phone')?.value.trim() || '';

    if (!phone) {
      alert('⚠️ Por favor, digite o seu número de WhatsApp com DDD (ex: 11999998888) antes de testar.');
      document.getElementById('setting-evolution-phone')?.focus();
      return;
    }

    const btn = document.getElementById('btn-evolution-test');
    if (btn) btn.textContent = 'Verificando...';

    // Salva configurações atualizadas
    window.evolutionService.saveConfig({
      apiUrl: url,
      apiKey: key,
      instanceName: instance,
      userPhone: phone
    });

    // 1. Valida se a instância está conectada antes de tentar disparar
    const check = await window.evolutionService.checkConnectionState(url, key, instance);
    if (!check.connected) {
      if (btn) {
        btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Testar Envio';
        if (window.lucide) window.lucide.createIcons();
      }
      alert('⚠️ O WhatsApp ainda não está conectado!\n\nClique no botão verde "Conectar / QR", aponte a câmera do seu WhatsApp (Aparelhos Conectados) para o QR Code na tela e aguarde conectar.');
      return;
    }

    if (btn) btn.textContent = 'Enviando...';
    const res = await window.evolutionService.sendTestMessage();

    if (btn) {
      btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i> Testar Envio';
      if (window.lucide) window.lucide.createIcons();
    }

    if (res && res.success) {
      if (window.confetti) window.confetti({ particleCount: 40, spread: 50 });
      alert(`✅ Mensagem de teste enviada com sucesso para o WhatsApp ${phone}!\nVerifique as mensagens no seu celular.`);
    } else {
      alert(`❌ Falha ao enviar WhatsApp:\n${(res && res.message) || 'Verifique se o seu celular está com internet e se a instância está ativa.'}`);
    }
  }

  updateGroqStatusUI(apiKey) {
    const badge = document.getElementById('groq-status-badge');
    const chatBadge = document.getElementById('chat-engine-badge');
    const isConfigured = apiKey && apiKey.trim().length > 10;

    if (badge) {
      badge.textContent = isConfigured ? '🟢 Groq Conectado (IA Ativa)' : '⚪ Motor Local Offline Ativo';
      badge.className = isConfigured 
        ? 'text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300';
    }

    if (chatBadge) {
      chatBadge.innerHTML = isConfigured
        ? '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Groq IA Conectado'
        : '<span class="w-2 h-2 rounded-full bg-blue-400"></span> NLP Local Inteligente';
    }
  }

  // Testar conexão com a API do Groq e carregar modelos disponíveis na conta
  async testGroqConnection() {
    const keyInput = document.getElementById('setting-groq-key');
    const modelSel = document.getElementById('setting-groq-model');
    const key = keyInput ? keyInput.value.trim() : '';

    if (!key) {
      alert('Por favor, cole a sua chave da API do Groq no campo antes de testar.');
      return;
    }

    const testBtn = document.getElementById('btn-test-groq');
    if (testBtn) testBtn.textContent = 'Testando conexão...';

    try {
      let selectedModel = modelSel ? modelSel.value : 'llama-3.1-8b-instant';

      // 1. Tenta listar modelos reais disponíveis na conta do usuário no Groq
      try {
        const modelsResp = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (modelsResp.ok) {
          const modelsJson = await modelsResp.json();
          const availableModels = (modelsJson.data || [])
            .filter(m => m.active !== false && !m.id.includes('whisper'))
            .map(m => m.id);

          if (availableModels.length > 0 && modelSel) {
            const currentVal = modelSel.value;
            modelSel.innerHTML = availableModels.map(mId => {
              return `<option value="${mId}">${mId}</option>`;
            }).join('');

            // Se o modelo atual estiver na lista, mantém ele. Se não, seleciona llama-3.1-8b-instant ou o primeiro
            if (availableModels.includes(currentVal)) {
              modelSel.value = currentVal;
            } else if (availableModels.includes('llama-3.1-8b-instant')) {
              modelSel.value = 'llama-3.1-8b-instant';
            } else {
              modelSel.value = availableModels[0];
            }
            selectedModel = modelSel.value;
          }
        }
      } catch (eModels) {
        console.warn('Não foi possível sincronizar lista dinâmica de modelos:', eModels);
      }

      // 2. Executa teste de resposta com o modelo selecionado
      let resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: 'Diga "Conexão Groq OK!" em 3 palavras.' }],
          max_tokens: 20
        })
      });

      let autoSwitched = false;
      let originalFailedModel = selectedModel;

      // Se falhar porque o modelo não existe ou não tem acesso, tenta fallback automático para llama-3.1-8b-instant
      if (!resp.ok && selectedModel !== 'llama-3.1-8b-instant') {
        const errCheck = await resp.clone().json().catch(() => ({}));
        if (errCheck.error?.message?.includes('does not exist') || errCheck.error?.message?.includes('access')) {
          console.warn(`Modelo ${selectedModel} sem acesso, tentando fallback automático para llama-3.1-8b-instant...`);
          selectedModel = 'llama-3.1-8b-instant';
          autoSwitched = true;
          if (modelSel) {
            let opt = Array.from(modelSel.options).find(o => o.value === 'llama-3.1-8b-instant');
            if (!opt) {
              const newOpt = document.createElement('option');
              newOpt.value = 'llama-3.1-8b-instant';
              newOpt.textContent = 'Llama 3.1 8B Instant (Recomendado)';
              modelSel.prepend(newOpt);
            }
            modelSel.value = 'llama-3.1-8b-instant';
          }
          resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
              model: selectedModel,
              messages: [{ role: 'user', content: 'Diga "Conexão Groq OK!" em 3 palavras.' }],
              max_tokens: 20
            })
          });
        }
      }

      if (resp.ok) {
        const json = await resp.json();
        const reply = json.choices[0]?.message?.content || 'Conexão confirmada!';
        let noteMsg = '';
        if (autoSwitched) {
          noteMsg = `\n\n💡 Nota: O modelo "${originalFailedModel}" não está disponível no plano gratuito do Groq. O sistema ajustou automaticamente para "${selectedModel}" (que é super rápido e 100% gratuito)!`;
          window.db.setSettings({ groqModel: selectedModel });
        }
        alert(`✅ Sucesso! Conexão com o Groq realizada com êxito!\n\n🤖 Modelo ativo: ${selectedModel}\n💬 Resposta do Groq: "${reply.trim()}"${noteMsg}\n\nClique em "Salvar Configurações" para ativar.`);
        this.updateGroqStatusUI(key);
      } else {
        const err = await resp.json().catch(() => ({}));
        alert(`❌ Falha na conexão: ${err.error?.message || 'Verifique a chave informada.'}`);
      }
    } catch (e) {
      alert(`❌ Erro ao conectar com o servidor do Groq: ${e.message}`);
    } finally {
      if (testBtn) testBtn.textContent = 'Testar Conexão';
    }
  }

  // Modal QR Code para Conectar o Celular
  openMobileQRModal() {
    const modal = document.getElementById('modal-qrcode');
    if (!modal) return;

    // Constrói URL acessível para outros dispositivos na rede Wi-Fi
    const port = window.location.port || '8080';
    let host = window.location.hostname;
    // Se estiver no computador (localhost ou 127.0.0.1), substitui pelo IP da rede local
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      host = '192.168.1.73';
    }
    const targetUrl = `http://${host}:${port}/`;

    const urlDisplay = document.getElementById('qr-url-text');
    if (urlDisplay) urlDisplay.textContent = targetUrl;

    const qrContainer = document.getElementById('qr-code-canvas');
    if (qrContainer && window.QRious) {
      new window.QRious({
        element: qrContainer,
        value: targetUrl,
        size: 200,
        background: '#ffffff',
        foreground: '#090d16',
        level: 'H'
      });
    }

    modal.classList.remove('hidden');
  }

  closeMobileQRModal() {
    const modal = document.getElementById('modal-qrcode');
    if (modal) modal.classList.add('hidden');
  }

  // Menu rápido flutuante (+)
  toggleQuickMenu() {
    const menu = document.getElementById('quick-fab-menu');
    if (menu) {
      menu.classList.toggle('hidden');
    }
  }

  closeQuickMenu() {
    const menu = document.getElementById('quick-fab-menu');
    if (menu) {
      menu.classList.add('hidden');
    }
  }

  // Bind de eventos globais
  bindEvents() {
    // Form submits
    document.getElementById('tx-form')?.addEventListener('submit', (e) => this.saveTransactionFromModal(e));
    document.getElementById('app-form')?.addEventListener('submit', (e) => this.saveAppointmentFromModal(e));
    document.getElementById('note-form')?.addEventListener('submit', (e) => this.saveNoteFromModal(e));

    // Chat enter key
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendChatMessage();
      }
    });

    // Filtros de Finanças
    document.getElementById('finance-filter-type')?.addEventListener('change', () => this.renderFinances());
    document.getElementById('finance-filter-status')?.addEventListener('change', () => this.renderFinances());
    document.getElementById('finance-search')?.addEventListener('input', () => this.renderFinances());

    // Busca de Notas
    document.getElementById('notes-search')?.addEventListener('input', () => this.renderNotes());

    // Fechar modais ao clicar no overlay de fundo
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
        }
      });
    });
  }
}

// Inicializa no carregamento do DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

