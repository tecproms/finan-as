// Módulo Financeiro - FinControl Pro

const FINANCE_CATEGORIES = {
  // Despesas
  'Alimentação': { icon: 'utensils', color: '#f97316', type: 'expense' },
  'Moradia': { icon: 'home', color: '#3b82f6', type: 'expense' },
  'Transporte': { icon: 'car', color: '#eab308', type: 'expense' },
  'Saúde': { icon: 'heart-pulse', color: '#ef4444', type: 'expense' },
  'Educação': { icon: 'graduation-cap', color: '#8b5cf6', type: 'expense' },
  'Lazer': { icon: 'party-popper', color: '#ec4899', type: 'expense' },
  'Assinaturas': { icon: 'tv', color: '#6366f1', type: 'expense' },
  'Compras': { icon: 'shopping-bag', color: '#14b8a6', type: 'expense' },
  'Outros': { icon: 'layers', color: '#64748b', type: 'expense' },

  // Receitas
  'Salário': { icon: 'briefcase', color: '#10b981', type: 'income' },
  'Serviços': { icon: 'laptop', color: '#06b6d4', type: 'income' },
  'Investimentos': { icon: 'trending-up', color: '#22c55e', type: 'income' },
  'Vendas': { icon: 'tag', color: '#84cc16', type: 'income' },
  'Outras Receitas': { icon: 'plus-circle', color: '#10b981', type: 'income' }
};

const PAYMENT_METHODS = [
  { id: 'PIX', name: 'PIX', icon: 'zap' },
  { id: 'Cartão de Crédito', name: 'Cartão de Crédito', icon: 'credit-card' },
  { id: 'Cartão de Débito', name: 'Cartão de Débito', icon: 'credit-card' },
  { id: 'Dinheiro', name: 'Dinheiro em Espécie', icon: 'banknote' },
  { id: 'Boleto', name: 'Boleto Bancário', icon: 'file-text' },
  { id: 'Transferência', name: 'Transferência / TED', icon: 'arrow-left-right' }
];

class FinanceModule {
  constructor() {
    this.selectedMonth = this.getCurrentYearMonth(); // Formato: "YYYY-MM"
  }

  getCurrentYearMonth() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  formatMoney(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  getCategoryMeta(categoryName) {
    return FINANCE_CATEGORIES[categoryName] || { icon: 'circle-dollar-sign', color: '#94a3b8', type: 'expense' };
  }

  // Gera parcelas de um lançamento (se selecionado parcelamento)
  createInstallments(baseTx, numInstallments) {
    const count = parseInt(numInstallments) || 1;
    if (count <= 1) {
      return [window.db.addTransaction(baseTx)];
    }

    let installmentAmount, totalAmount;
    if (baseTx.installmentAmount && baseTx.totalAmount) {
      installmentAmount = parseFloat(baseTx.installmentAmount);
      totalAmount = parseFloat(baseTx.totalAmount);
    } else if (baseTx.isPerInstallment) {
      installmentAmount = parseFloat(baseTx.amount);
      totalAmount = installmentAmount * count;
    } else {
      totalAmount = parseFloat(baseTx.amount);
      installmentAmount = (totalAmount / count);
    }
    const startDate = new Date(baseTx.date + 'T12:00:00');
    const createdList = [];
    const isRecurring = !!baseTx.isRecurring;

    for (let i = 1; i <= count; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
      const dateStr = dueDate.toISOString().split('T')[0];

      const txCopy = {
        ...baseTx,
        description: isRecurring ? baseTx.description : `${baseTx.description} (${i}/${count})`,
        amount: installmentAmount,
        totalAmount: isRecurring ? installmentAmount : totalAmount,
        installmentAmount: installmentAmount,
        date: dateStr,
        dueDate: dateStr,
        installments: isRecurring ? 1 : count,
        currentInstallment: isRecurring ? 1 : i,
        status: i === 1 && startDate <= new Date() && baseTx.status === 'paid' ? 'paid' : 'pending',
        isRecurring: isRecurring
      };

      createdList.push(window.db.addTransaction(txCopy));
    }
    return createdList;
  }

  // Filtra transações por mês selecionado (ordenadas por data crescente de vencimento)
  // Inclui as pendências de meses anteriores no topo para não serem esquecidas
  getMonthlyTransactions(yearMonth = this.selectedMonth) {
    const all = window.db.getTransactions();
    const settings = window.db.getSettings();
    const includeOverdue = settings.includeOverdueInMetrics !== false;
    const monthlyList = yearMonth ? all.filter(tx => tx.date && tx.date.startsWith(yearMonth)) : [...all];
    
    // Contas e receitas pendentes de meses anteriores (atrasadas/vencidas que ainda não foram pagas)
    // Se a chavinha estiver ligada, inclui no topo do mês. Se estiver desligada, mantém apenas o mês isolado.
    const overdueList = (includeOverdue && yearMonth) ? all.filter(tx => tx.status === 'pending' && tx.date && tx.date < `${yearMonth}-01`).map(tx => ({
      ...tx,
      _isOverduePrior: true
    })) : [];

    const combined = [...overdueList, ...monthlyList];

    return combined.sort((a, b) => {
      // Contas atrasadas de meses anteriores sempre no topo com máxima prioridade
      if (a._isOverduePrior && !b._isOverduePrior) return -1;
      if (!a._isOverduePrior && b._isOverduePrior) return 1;

      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return (b.id || '').localeCompare(a.id || '');
    });
  }

  // Resumo estatístico do mês com Saldo Transportado e Acumulação de Contas Atrasadas
  getMonthlyMetrics(yearMonth = this.selectedMonth) {
    const all = window.db.getTransactions();
    const settings = window.db.getSettings();
    const initialBalance = parseFloat(settings.initialBalance) || 0;
    const includeOverdue = settings.includeOverdueInMetrics !== false;

    // 1. Saldo Transportado dos meses anteriores a yearMonth (apenas transações pagas)
    // E detecção de pendências que ficaram para trás em aberto (vencidas não pagas)
    let carriedBalance = initialBalance;
    let overduePendingExpense = 0;
    let overduePendingIncome = 0;
    const overdueTransactions = [];

    if (yearMonth) {
      all.forEach(tx => {
        if (tx.date && tx.date < `${yearMonth}-01`) {
          const amt = parseFloat(tx.amount) || 0;
          if (tx.status === 'paid') {
            if (tx.type === 'income') {
              carriedBalance += amt;
            } else {
              carriedBalance -= amt;
            }
          } else if (tx.status === 'pending') {
            if (tx.type === 'expense') {
              overduePendingExpense += amt;
            } else {
              overduePendingIncome += amt;
            }
            overdueTransactions.push(tx);
          }
        }
      });
    }

    // 2. Transações do próprio mês selecionado
    const transactions = yearMonth ? all.filter(tx => tx.date && tx.date.startsWith(yearMonth)) : [...all];
    
    let totalIncome = 0;
    let totalExpense = 0;
    let pendingIncome = 0;
    let pendingExpense = 0;

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount) || 0;
      if (tx.type === 'income') {
        if (tx.status === 'paid') {
          totalIncome += amount;
        } else {
          pendingIncome += amount;
        }
      } else {
        if (tx.status === 'paid') {
          totalExpense += amount;
        } else {
          pendingExpense += amount;
        }
      }
    });

    // Resultado/Fluxo líquido do mês atual (apenas o que foi efetivamente recebido/pago neste mês)
    const monthlyNet = totalIncome - totalExpense;

    // Saldo Consolidado Acumulado da Conta (Transportado + Fluxo Realizado do Mês)
    const currentBalance = carriedBalance + monthlyNet;

    // Totais de pendências acumuladas (do mês + contas que ficaram para trás em aberto se a chavinha estiver ativa)
    const totalPendingIncome = pendingIncome + (includeOverdue ? overduePendingIncome : 0);
    const totalPendingExpense = pendingExpense + (includeOverdue ? overduePendingExpense : 0);

    // Volume previsto (apenas o que está pendente de entrada/saída, sem somar o que já foi baixado)
    const totalExpectedIncome = totalPendingIncome;
    const totalExpectedExpense = totalPendingExpense;

    // Saldo previsto considera o saldo atual + entradas pendentes - contas a pagar
    const projectedBalance = currentBalance + totalPendingIncome - totalPendingExpense;

    // Agrupamento de despesas por categoria (incluindo as contas atrasadas se ativo)
    const categoryExpenses = {};
    const expenseList = includeOverdue ? [...transactions, ...overdueTransactions] : transactions;
    expenseList.filter(t => t.type === 'expense').forEach(tx => {
      const cat = tx.category || 'Outros';
      const amt = parseFloat(tx.amount) || 0;
      categoryExpenses[cat] = (categoryExpenses[cat] || 0) + amt;
    });

    return {
      carriedBalance,
      monthlyNet,
      totalIncome,
      totalExpense,
      pendingIncome,
      pendingExpense,
      overduePendingIncome,
      overduePendingExpense,
      overdueCount: overdueTransactions.length,
      overdueTransactions,
      totalPendingIncome,
      totalPendingExpense,
      totalExpectedIncome,
      totalExpectedExpense,
      currentBalance,
      projectedBalance,
      categoryExpenses,
      transactionCount: transactions.length + (includeOverdue ? overdueTransactions.length : 0),
      includeOverdue: includeOverdue
    };
  }

  // Histórico de fluxo dos últimos 6 meses para gráfico
  getSixMonthsFlow() {
    const now = new Date();
    const result = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      
      const metrics = this.getMonthlyMetrics(ym);
      result.push({
        yearMonth: ym,
        label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        income: metrics.totalIncome + metrics.pendingIncome,
        expense: metrics.totalExpense + metrics.pendingExpense
      });
    }

    return result;
  }

  // Radar Semanal: Análise de Fluxo (Esta Semana vs Semana Que Vem) e Orientação de Reserva
  getWeeklyRadar(refDate = new Date()) {
    const allTxs = window.db ? window.db.getTransactions() : [];
    
    // Converte Date para string YYYY-MM-DD local
    const toYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Determina o início da semana atual (Segunda-feira) e fim (Domingo)
    const curr = new Date(refDate);
    const dayOfWeek = curr.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const mondayThisWeek = new Date(curr);
    mondayThisWeek.setDate(curr.getDate() + diffToMonday);
    mondayThisWeek.setHours(0, 0, 0, 0);

    const sundayThisWeek = new Date(mondayThisWeek);
    sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
    sundayThisWeek.setHours(23, 59, 59, 999);

    const mondayNextWeek = new Date(mondayThisWeek);
    mondayNextWeek.setDate(mondayThisWeek.getDate() + 7);

    const sundayNextWeek = new Date(mondayNextWeek);
    sundayNextWeek.setDate(mondayNextWeek.getDate() + 6);
    sundayNextWeek.setHours(23, 59, 59, 999);

    const mondayLastWeek = new Date(mondayThisWeek);
    mondayLastWeek.setDate(mondayThisWeek.getDate() - 7);

    const sundayLastWeek = new Date(mondayLastWeek);
    sundayLastWeek.setDate(mondayLastWeek.getDate() + 6);
    sundayLastWeek.setHours(23, 59, 59, 999);

    const lastWeekStartStr = toYMD(mondayLastWeek);
    const lastWeekEndStr = toYMD(sundayLastWeek);
    const thisWeekStartStr = toYMD(mondayThisWeek);
    const thisWeekEndStr = toYMD(sundayThisWeek);
    const nextWeekStartStr = toYMD(mondayNextWeek);
    const nextWeekEndStr = toYMD(sundayNextWeek);

    const formatWeekLabel = (startD, endD) => {
      const sDay = String(startD.getDate()).padStart(2, '0');
      const sMonth = startD.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      const eDay = String(endD.getDate()).padStart(2, '0');
      const eMonth = endD.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      if (sMonth === eMonth) {
        return `${sDay} a ${eDay} de ${sMonth}`;
      }
      return `${sDay} ${sMonth} a ${eDay} ${eMonth}`;
    };

    // Calcula métricas para um intervalo de datas
    // isForecast = true: apenas pendentes / em aberto
    // isForecast = false: valores realizados (pagos)
    const calculateRange = (startStr, endStr, isForecast = true) => {
      let incomePaid = 0;
      let incomePending = 0;
      let expensePaid = 0;
      let expensePending = 0;
      const txs = [];

      allTxs.forEach(t => {
        if (t.date && t.date >= startStr && t.date <= endStr) {
          txs.push(t);
          const amt = parseFloat(t.amount) || 0;
          if (t.type === 'income') {
            if (t.status === 'paid') incomePaid += amt;
            else incomePending += amt;
          } else {
            if (t.status === 'paid') expensePaid += amt;
            else expensePending += amt;
          }
        }
      });

      // Se for previsão (atual/próxima), considera lançamentos em aberto / pendentes
      // Se for histórico realizado (semana passada), considera o que foi efetivamente recebido/pago
      const totalIncome = isForecast ? incomePending : incomePaid;
      const totalExpense = isForecast ? expensePending : expensePaid;
      const net = totalIncome - totalExpense; // > 0 Sobra, < 0 Falta

      return {
        incomePaid,
        incomePending,
        totalIncome,
        expensePaid,
        expensePending,
        totalExpense,
        net,
        txsCount: txs.length
      };
    };

    const lastWeek = {
      startStr: lastWeekStartStr,
      endStr: lastWeekEndStr,
      label: formatWeekLabel(mondayLastWeek, sundayLastWeek),
      ...calculateRange(lastWeekStartStr, lastWeekEndStr, false)
    };

    // Identifica contas vencidas que ficaram para trás: APENAS as que ficaram em aberto na semana passada!
    // Não soma contas antigas de meses anteriores se a chavinha do mês estiver desativada
    const settings = window.db ? window.db.getSettings() : {};
    const includePriorMonths = settings.includeOverdueInMetrics === true;

    let overdueBeforeThisWeek = lastWeek.expensePending;
    if (includePriorMonths) {
      allTxs.forEach(t => {
        if (t.status === 'pending' && t.type === 'expense' && t.date && t.date < lastWeekStartStr) {
          overdueBeforeThisWeek += (parseFloat(t.amount) || 0);
        }
      });
    }

    const thisWeekRange = calculateRange(thisWeekStartStr, thisWeekEndStr, true);
    const thisWeek = {
      startStr: thisWeekStartStr,
      endStr: thisWeekEndStr,
      label: formatWeekLabel(mondayThisWeek, sundayThisWeek),
      overdueExpense: overdueBeforeThisWeek,
      ...thisWeekRange,
      totalExpenseWithOverdue: thisWeekRange.totalExpense + overdueBeforeThisWeek,
      netWithOverdue: thisWeekRange.totalIncome - (thisWeekRange.totalExpense + overdueBeforeThisWeek)
    };

    const nextWeek = {
      startStr: nextWeekStartStr,
      endStr: nextWeekEndStr,
      label: formatWeekLabel(mondayNextWeek, sundayNextWeek),
      ...calculateRange(nextWeekStartStr, nextWeekEndStr, true)
    };

    // Diagnóstico e Recomendação Inteligente (Balanceando com o Saldo Real da Conta)
    let alertType = 'success';
    let alertTitle = '';
    let alertMessage = '';
    let recommendedSave = 0;

    const currentMetrics = this.getMonthlyMetrics ? this.getMonthlyMetrics() : null;
    const currentBal = currentMetrics ? currentMetrics.currentBalance : 0;
    const nextDeficit = nextWeek.net < 0 ? Math.abs(nextWeek.net) : 0;

    if (overdueBeforeThisWeek > 0) {
      if (currentBal >= overdueBeforeThisWeek) {
        const balAfterOverdue = currentBal - overdueBeforeThisWeek;
        if (nextDeficit > 0) {
          if (balAfterOverdue >= nextDeficit) {
            alertType = 'info';
            alertTitle = '✅ Saldo atual cobre as contas pendentes da semana passada e a próxima semana!';
            alertMessage = `Você possui **${this.formatMoney(overdueBeforeThisWeek)}** em contas em aberto da semana passada. Seu saldo atual em conta (**${this.formatMoney(currentBal)}**) é suficiente para quitá-las e ainda cobrir as contas previstas da próxima semana (${nextWeek.label}), restando **${this.formatMoney(balAfterOverdue - nextDeficit)}** em caixa!`;
          } else {
            const missingNext = nextDeficit - balAfterOverdue;
            alertType = 'warning';
            alertTitle = '⚠️ Saldo cobre as contas da semana passada, mas atenção à próxima semana';
            alertMessage = `Você possui **${this.formatMoney(overdueBeforeThisWeek)}** em contas em aberto da semana passada. Usando seu saldo atual de **${this.formatMoney(currentBal)}**, você quita essas contas e sobram **${this.formatMoney(balAfterOverdue)}** em conta. Como na próxima semana (${nextWeek.label}) há **${this.formatMoney(nextDeficit)}** em contas previstas, faltarão **${this.formatMoney(missingNext)}** para fechar as contas da próxima semana.`;
          }
        } else {
          alertType = 'info';
          alertTitle = '✅ Saldo atual cobre as contas pendentes da semana passada';
          alertMessage = `Você possui **${this.formatMoney(overdueBeforeThisWeek)}** em contas em aberto da semana passada. Seu saldo atual de **${this.formatMoney(currentBal)}** cobre essa quitação com sobra de **${this.formatMoney(balAfterOverdue)}** em conta.`;
        }
      } else {
        const missingOverdue = overdueBeforeThisWeek - currentBal;
        alertType = 'danger';
        alertTitle = '🚨 Alerta: Saldo insuficiente para cobrir contas em aberto da semana passada';
        alertMessage = `Você possui **${this.formatMoney(overdueBeforeThisWeek)}** em contas em aberto da semana passada, superando seu saldo atual (**${this.formatMoney(currentBal)}**). Faltam **${this.formatMoney(missingOverdue)}** apenas para quitar as contas atrasadas.` + (nextDeficit > 0 ? ` E na próxima semana há mais **${this.formatMoney(nextDeficit)}** em contas previstas.` : '');
      }
    } else if (thisWeek.net > 0 && nextWeek.net < 0) {
      alertType = 'warning';
      alertTitle = '⚠️ Sobra agora, mas faltará semana que vem!';
      const deficitNext = Math.abs(nextWeek.net);
      recommendedSave = Math.min(thisWeek.net, deficitNext);
      alertMessage = `Esta semana você terá uma sobra prevista de **${this.formatMoney(thisWeek.net)}**, porém na semana que vem (${nextWeek.label}) há contas em aberto que superam as entradas gerando um déficit de **${this.formatMoney(deficitNext)}**. Recomendamos **guardar ${this.formatMoney(recommendedSave)}** desta semana para cobrir as contas da próxima semana!`;
    } else if (thisWeek.net < 0 && nextWeek.net < 0) {
      alertType = 'danger';
      alertTitle = '🚨 Alerta: Déficit previsto nesta e na próxima semana!';
      const deficitThis = Math.abs(thisWeek.net);
      const deficitNext = Math.abs(nextWeek.net);
      alertMessage = `Atenção máxima: faltam **${this.formatMoney(deficitThis)}** em contas em aberto nesta semana e mais **${this.formatMoney(deficitNext)}** na próxima semana. Tente antecipar recebíveis ou negociar prazos.`;
    } else if (thisWeek.net < 0 && nextWeek.net >= 0) {
      alertType = 'danger';
      alertTitle = '⚠️ Aperto nesta semana, mas alívio na próxima!';
      const deficitThis = Math.abs(thisWeek.net);
      alertMessage = `Faltam **${this.formatMoney(deficitThis)}** para cobrir as contas em aberto desta semana (${thisWeek.label}), mas na próxima semana você terá uma recuperação positiva de **${this.formatMoney(nextWeek.net)}**.`;
    } else if (thisWeek.net >= 0 && nextWeek.net < 0) {
      const deficitNext = Math.abs(nextWeek.net);
      if (currentBal >= deficitNext) {
        alertType = 'info';
        alertTitle = '✅ Saldo em conta cobre as contas da próxima semana';
        alertMessage = `Na próxima semana (${nextWeek.label}) você possui **${this.formatMoney(deficitNext)}** em contas previstas a pagar, e seu saldo atual em conta (**${this.formatMoney(currentBal)}**) é suficiente para cobri-las!`;
      } else if (currentBal > 0) {
        const remainingDeficit = deficitNext - currentBal;
        alertType = 'warning';
        alertTitle = '⚠️ Saldo atual cobre parte das contas da próxima semana';
        alertMessage = `Na próxima semana (${nextWeek.label}) você possui **${this.formatMoney(deficitNext)}** em contas a pagar. Usando seu saldo atual de **${this.formatMoney(currentBal)}**, a diferença restante a cobrir será de apenas **${this.formatMoney(remainingDeficit)}**.`;
      } else {
        alertType = 'warning';
        alertTitle = '⚠️ Atenção: Contas previstas para a próxima semana!';
        alertMessage = `Esta semana não há contas pendentes em aberto, porém na próxima semana (${nextWeek.label}) você possui **${this.formatMoney(deficitNext)}** em contas a pagar.`;
      }
    } else if (thisWeek.net > 0 && nextWeek.net >= 0) {
      alertType = 'success';
      alertTitle = '🎉 Fluxo Semanal Seguro e Positivo!';
      alertMessage = `Suas entradas previstas cobrem todas as contas em aberto com sobra de **${this.formatMoney(thisWeek.net)}** nesta semana e mais **${this.formatMoney(nextWeek.net)}** na próxima semana. Ótimo momento para guardar uma reserva!`;
    } else {
      alertType = 'info';
      alertTitle = 'ℹ️ Fluxo Semanal Equilibrado';
      alertMessage = `Suas contas desta semana estão equilibradas sem pendências em aberto. Conforme você lançar novas receitas e despesas com suas datas, o radar calculará a previsão automática.`;
    }

    return {
      lastWeek,
      thisWeek,
      nextWeek,
      advice: {
        alertType,
        alertTitle,
        alertMessage,
        recommendedSave
      }
    };
  }

  // Liquidação de lançamento (Baixa Total ou Baixa Parcial)
  settleTransaction(txId, options = {}) {
    const tx = window.db.getTransactions().find(t => t.id === txId);
    if (!tx) return { success: false, error: 'Lançamento não encontrado' };

    const currentAmount = parseFloat(tx.amount) || 0;
    const paidAmount = options.paidAmount !== undefined ? parseFloat(options.paidAmount) : currentAmount;
    const paymentDate = options.date || new Date().toISOString().split('T')[0];
    const paymentMethod = options.paymentMethod || tx.paymentMethod || 'PIX';
    const notes = options.notes || '';

    if (isNaN(paidAmount) || paidAmount <= 0) {
      return { success: false, error: 'Valor da baixa deve ser maior que zero' };
    }

    const originalTotal = tx.originalTotal ? parseFloat(tx.originalTotal) : currentAmount;

    // Caso 1: Baixa Total (o valor pago cobre ou supera o saldo restante)
    if (paidAmount >= currentAmount - 0.001) {
      const updatedTotalPaid = (tx.totalPaid ? parseFloat(tx.totalPaid) : 0) + currentAmount;
      const updatedTx = window.db.updateTransaction(tx.id, {
        status: 'paid',
        date: paymentDate, // data real em que foi quitado
        dueDate: tx.dueDate || tx.date, // preserva vencimento original
        paymentMethod: paymentMethod,
        totalPaid: updatedTotalPaid,
        originalTotal: originalTotal
      });
      return {
        success: true,
        isPartial: false,
        paidTx: updatedTx,
        remainingAmount: 0
      };
    }

    // Caso 2: Baixa Parcial (amortização)
    const remainingAmount = Math.round((currentAmount - paidAmount) * 100) / 100;
    const accumulatedPaid = Math.round(((tx.totalPaid ? parseFloat(tx.totalPaid) : 0) + paidAmount) * 100) / 100;
    const partialCount = (tx.partialPaymentsCount || 0) + 1;

    // 1. Cria transação efetivada no valor pago (entra no fluxo de caixa na data do pagamento)
    const paidCopy = {
      type: tx.type,
      description: `${tx.description} (Baixa Parcial #${partialCount})`,
      amount: paidAmount,
      date: paymentDate,
      dueDate: tx.dueDate || tx.date,
      category: tx.category,
      paymentMethod: paymentMethod,
      status: 'paid',
      parentId: tx.id,
      originalTotal: originalTotal,
      notes: notes || `Baixa parcial de ${this.formatMoney(paidAmount)} referente a ${tx.description} (Original: ${this.formatMoney(originalTotal)})`
    };
    const createdPaidTx = window.db.addTransaction(paidCopy);

    // 2. Atualiza a transação original mantendo o saldo restante em aberto
    const updatedPendingTx = window.db.updateTransaction(tx.id, {
      amount: remainingAmount,
      originalTotal: originalTotal,
      totalPaid: accumulatedPaid,
      partialPaymentsCount: partialCount,
      status: 'pending'
    });

    return {
      success: true,
      isPartial: true,
      paidTx: createdPaidTx,
      pendingTx: updatedPendingTx,
      remainingAmount: remainingAmount,
      totalPaid: accumulatedPaid,
      originalTotal: originalTotal
    };
  }
}

// Instância global
window.finance = new FinanceModule();
