// Módulo de Chat Inteligente, NLP em Português e Integração Groq API - FinControl Pro

class ChatNLPModule {
  constructor() {
    this.recognition = null;
    this.isRecording = false;
    this.initSpeechRecognition();
  }

  // Inicializa suporte a voz pelo navegador (Web Speech API)
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'pt-BR';
      this.recognition.continuous = false;
      this.recognition.interimResults = false;

      this.recognition.onstart = () => {
        this.isRecording = true;
        this.updateMicUI(true);
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('chat-input');
        if (input) {
          input.value = transcript;
          input.focus();
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        this.isRecording = false;
        this.updateMicUI(false);
      };

      this.recognition.onend = () => {
        this.isRecording = false;
        this.updateMicUI(false);
      };
    }
  }

  toggleVoiceRecording() {
    if (!this.recognition) {
      alert('Reconhecimento de voz não suportado neste navegador. Tente no Google Chrome ou Edge.');
      return;
    }
    if (this.isRecording) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        console.error('Falha ao iniciar microfone:', e);
      }
    }
  }

  updateMicUI(recording) {
    const btn = document.getElementById('btn-chat-mic');
    if (!btn) return;
    if (recording) {
      btn.classList.add('bg-red-500', 'text-white', 'recording-pulse');
      btn.classList.remove('text-slate-400', 'hover:text-emerald-400');
    } else {
      btn.classList.remove('bg-red-500', 'text-white', 'recording-pulse');
      btn.classList.add('text-slate-400', 'hover:text-emerald-400');
    }
  }

  // Processa a mensagem do usuário (Roteamento entre Groq API e Motor NLP Local)
  async processMessage(userText) {
    const trimmed = userText.trim();
    if (!trimmed) return;

    // Registra a mensagem do usuário
    window.db.addChatMessage({
      sender: 'user',
      text: trimmed
    });

    const settings = window.db.getSettings();
    
    // Se tiver chave Groq configurada, utiliza o modelo do Groq
    if (settings.groqApiKey && settings.groqApiKey.trim().length > 10) {
      try {
        await this.processWithGroq(trimmed, settings.groqApiKey, settings.groqModel);
        return;
      } catch (err) {
        console.warn('Erro na chamada ao Groq, caindo para NLP Local:', err);
        // Fallback para motor local caso a API falhe
      }
    }

    // Processa com o motor local offline
    this.processWithLocalNLP(trimmed);
  }

  // --- Motor NLP Local (Offline / Regex Semântico em Português) ---
  processWithLocalNLP(text) {
    const lower = text.toLowerCase();

    // 1. Consulta de Saldo e Finanças
    if (lower.includes('saldo') || lower.includes('quanto tenho') || lower.includes('resumo financeiro')) {
      const metrics = window.finance.getMonthlyMetrics();
      const totalIncomePrevisto = metrics.totalIncome + metrics.pendingIncome;
      const totalExpensePrevisto = metrics.totalExpense + metrics.pendingExpense;
      const reply = `📊 **Seu Resumo Financeiro deste mês:**\n- **Receitas Previstas:** ${window.finance.formatMoney(totalIncomePrevisto)} (Realizado: ${window.finance.formatMoney(metrics.totalIncome)})\n- **Despesas Previstas:** ${window.finance.formatMoney(totalExpensePrevisto)} (Pago: ${window.finance.formatMoney(metrics.totalExpense)})\n- **Saldo Consolidado:** ${window.finance.formatMoney(metrics.currentBalance)}\n- **Saldo Previsto:** ${window.finance.formatMoney(metrics.projectedBalance)}`;
      window.db.addChatMessage({ sender: 'bot', text: reply });
      return;
    }

    if (lower.includes('quanto gastei') || lower.includes('total de despesas') || lower.includes('total gasto')) {
      const metrics = window.finance.getMonthlyMetrics();
      const reply = `💸 Você já gastou **${window.finance.formatMoney(metrics.totalExpense)}** este mês (${metrics.transactionCount} lançamentos totais).`;
      window.db.addChatMessage({ sender: 'bot', text: reply });
      return;
    }

    // Consulta de Radar Semanal de Caixa (Sobra, Falta e Previsão para guardar dinheiro)
    if (lower.includes('semana') || lower.includes('vai faltar') || lower.includes('guardar dinheiro') || lower.includes('sobrando') || lower.includes('radar')) {
      const radar = window.finance.getWeeklyRadar();
      const lastNetFmt = (radar.lastWeek.net >= 0 ? '+' : '') + window.finance.formatMoney(radar.lastWeek.net);
      const thisNetFmt = (radar.thisWeek.net >= 0 ? '+' : '') + window.finance.formatMoney(radar.thisWeek.net);
      const nextNetFmt = (radar.nextWeek.net >= 0 ? '+' : '') + window.finance.formatMoney(radar.nextWeek.net);

      const reply = `🧭 **Radar Semanal de Caixa & Previsão:**\n\n• **Semana Passada (${radar.lastWeek.label}):**\n  - Entradas: ${window.finance.formatMoney(radar.lastWeek.totalIncome)}\n  - Saídas: ${window.finance.formatMoney(radar.lastWeek.totalExpense)}\n  - Balanço: **${lastNetFmt}** ${radar.lastWeek.net >= 0 ? '🟢 (Sobra)' : '🔴 (Déficit)'}\n\n• **Semana Atual (${radar.thisWeek.label}):**\n  - Entradas Previstas: ${window.finance.formatMoney(radar.thisWeek.totalIncome)}\n  - Contas Previstas: ${window.finance.formatMoney(radar.thisWeek.totalExpense)}\n  - Previsão: **${thisNetFmt}** ${radar.thisWeek.net >= 0 ? '🟢 (Sobra)' : '🔴 (Falta)'}\n\n• **Próxima Semana (${radar.nextWeek.label}):**\n  - Entradas Previstas: ${window.finance.formatMoney(radar.nextWeek.totalIncome)}\n  - Contas Previstas: ${window.finance.formatMoney(radar.nextWeek.totalExpense)}\n  - Previsão: **${nextNetFmt}** ${radar.nextWeek.net >= 0 ? '🟢 (Sobra)' : '🔴 (Faltará)'}\n\n💡 **Diagnóstico do Assistente:**\n${radar.advice.alertMessage}`;

      window.db.addChatMessage({ sender: 'bot', text: reply });
      return;
    }

    // 2. Consulta de Compromissos de Hoje
    if (lower.includes('compromisso') && (lower.includes('hoje') || lower.includes('tenho hoje') || lower.includes('agenda'))) {
      const groups = window.agenda.getGroupedAppointments();
      if (groups.today.length === 0) {
        window.db.addChatMessage({ sender: 'bot', text: '📅 Você não tem nenhum compromisso agendado para hoje!' });
      } else {
        const listText = groups.today.map(a => `• **${a.time}** - ${a.title}${a.cost ? ` (Custo: ${window.finance.formatMoney(a.cost)})` : ''}`).join('\n');
        window.db.addChatMessage({ sender: 'bot', text: `📅 **Seus compromissos de hoje:**\n${listText}` });
      }
      return;
    }

    // 3. Detecção de Anotações ("anotar ...", "lembrar de ...", "nota: ...")
    if (lower.startsWith('anotar ') || lower.startsWith('lembrar ') || lower.startsWith('lembrar de ') || lower.startsWith('nota:')) {
      let content = text.replace(/^(anotar|lembrar de|lembrar|nota:)\s+/i, '').trim();
      let title = content.length > 30 ? content.substring(0, 30) + '...' : content;
      
      const actionData = {
        type: 'note',
        title: title.charAt(0).toUpperCase() + title.slice(1),
        content: content,
        tag: 'Geral'
      };

      window.db.addChatMessage({
        sender: 'bot',
        text: `📝 Entendi! Preparei a seguinte anotação para você:`,
        actionCard: {
          action: 'create_note',
          data: actionData,
          confirmed: false
        }
      });
      return;
    }

    // 4. Detecção de Compromisso / Agenda / Lembrete ("visita técnica dia 4 as 13:02", "dentista amanhã 14h", "reunião sexta às 10:30")
    if (this.isAppointmentText(text)) {
      const appDetected = this.extractAppointmentDetails(text);
      if (appDetected) {
        window.db.addChatMessage({
          sender: 'bot',
          text: `📅 Detectei um compromisso para sua agenda:`,
          actionCard: {
            action: 'create_appointment',
            data: appDetected,
            confirmed: false
          }
        });
        return;
      }
    }

    // 5. Detecção Inteligente de Baixa em Lançamento Pendente (Total ou Parcial)
    const pendingMatch = this.findMatchingPendingTransaction(text);
    if (pendingMatch) {
      const isIncome = pendingMatch.type === 'income';
      const extractedAmount = this.extractAmount(text);
      const isPartial = extractedAmount > 0 && extractedAmount < pendingMatch.amount - 0.001;
      const settleAmount = isPartial ? extractedAmount : pendingMatch.amount;
      const remainingAmount = isPartial ? Math.round((pendingMatch.amount - extractedAmount) * 100) / 100 : 0;

      const actionData = {
        id: pendingMatch.id,
        description: pendingMatch.description,
        amount: settleAmount,
        type: pendingMatch.type,
        date: new Date().toISOString().split('T')[0],
        category: pendingMatch.category,
        paymentMethod: pendingMatch.paymentMethod,
        isPartial: isPartial,
        originalAmount: pendingMatch.amount,
        remainingAmount: remainingAmount
      };

      const replyText = isPartial
        ? `🎯 Encontrei a **${isIncome ? 'Receita' : 'Despesa'} Pendente** compatível:\n• **${pendingMatch.description}** (Valor em aberto: **${window.finance.formatMoney(pendingMatch.amount)}**)\n\nDeseja registrar a **Baixa Parcial de ${window.finance.formatMoney(settleAmount)}** hoje?\n(O saldo restante de **${window.finance.formatMoney(remainingAmount)}** continuará pendente).`
        : `🎯 Encontrei uma **${isIncome ? 'Receita' : 'Despesa'} Pendente** compatível no seu planejamento:\n• **${pendingMatch.description}** no valor de **${window.finance.formatMoney(pendingMatch.amount)}** (prevista para ${window.finance.formatDate(pendingMatch.date)})\n\nDeseja **dar baixa total** e marcar como **${isIncome ? 'Recebida' : 'Paga'}**?`;

      window.db.addChatMessage({
        sender: 'bot',
        text: replyText,
        actionCard: {
          action: 'settle_transaction',
          data: actionData,
          confirmed: false
        }
      });
      return;
    }

    // 6. Detecção de Lançamento Financeiro Novo (Receita ou Despesa)
    const txDetected = this.extractTransactionDetails(text);
    if (txDetected) {
      const typeLabel = txDetected.type === 'income' ? 'Receita' : 'Despesa';
      window.db.addChatMessage({
        sender: 'bot',
        text: `💰 Identifiquei o lançamento de uma **${typeLabel}**:`,
        actionCard: {
          action: 'create_transaction',
          data: txDetected,
          confirmed: false
        }
      });
      return;
    }

    // Se não identificou padrão específico
    window.db.addChatMessage({
      sender: 'bot',
      text: `Olá! Sou seu assistente do **FinControl Pro**. Posso ajudar você a lançar gastos, receitas, compromissos e anotações por aqui!\n\n💡 **Experimente dizer ou digitar:**\n• *"Gastei 45 no almoço hoje no cartão"*\n• *"Recebi 3500 de salário via pix"*\n• *"Dentista amanhã às 14:30"*\n• *"Anotar comprar novo monitor"*\n• *"Qual meu saldo atual?"*`
    });
  }

  // Extrai data em português (hoje, ontem, amanhã, "dia 5", "pa dia 5", "pra dia 10", "15/09", etc)
  extractDate(text) {
    const lower = text.toLowerCase();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // 1. Ontem
    if (lower.includes('ontem')) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return { dateStr: `${yStr}-${mStr}-${dStr}`, matchText: 'ontem' };
    }

    // 2. Depois de amanhã
    if (lower.includes('depois de amanhã') || lower.includes('depois de amanha')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return {
        dateStr: `${yStr}-${mStr}-${dStr}`,
        matchText: lower.includes('depois de amanhã') ? 'depois de amanhã' : 'depois de amanha'
      };
    }

    // 3. Amanhã
    if (lower.includes('amanhã') || lower.includes('amanha')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return {
        dateStr: `${yStr}-${mStr}-${dStr}`,
        matchText: lower.includes('amanhã') ? 'amanhã' : 'amanha'
      };
    }

    // 4. Hoje
    if (lower.includes('hoje')) {
      const yStr = now.getFullYear();
      const mStr = String(now.getMonth() + 1).padStart(2, '0');
      const dStr = String(now.getDate()).padStart(2, '0');
      return { dateStr: `${yStr}-${mStr}-${dStr}`, matchText: 'hoje' };
    }

    // 5. Data no formato DD/MM/YYYY, DD/MM, DD-MM-YYYY ou DD-MM (ex: "15/09", "5-09", "dia 5-09", "iniciando em dia 5-09")
    const dateSlashMatch = text.match(/(?:(?:iniciando|a\s+partir|começando|comecando|com\s+in[ií]cio|in[ií]cio)\s+(?:de|em|no|na)\s+)?(?:(?:pa|pra|pro|para|p\/|no|na|em|vence|vencimento)\s+)?(?:o\s+)?(?:dia\s+)?\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/i);
    if (dateSlashMatch) {
      const d = parseInt(dateSlashMatch[1], 10);
      const m = parseInt(dateSlashMatch[2], 10) - 1;
      let y = dateSlashMatch[3] ? parseInt(dateSlashMatch[3], 10) : currentYear;
      if (y < 100) y += 2000;
      const target = new Date(y, m, d);
      const yStr = target.getFullYear();
      const mStr = String(target.getMonth() + 1).padStart(2, '0');
      const dStr = String(target.getDate()).padStart(2, '0');
      return { dateStr: `${yStr}-${mStr}-${dStr}`, matchText: dateSlashMatch[0] };
    }

    // 6. Expressões com dia do mês ou mês explícito: "todo dia 5", "pa dia 5", "pra dia 5", "dia 5", "iniciando dia 5", "dia 15 de setembro", "comece mes 10", "a partir de outubro"
    const monthNames = {
      'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3, 'maio': 4,
      'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
    };

    // Detecção de mês explícito em qualquer lugar do texto (ex: "comece mes 10", "a partir do mes 10", "no mes 10", "mes 10", "em outubro", "a partir de outubro")
    const explicitMonthNumMatch = text.match(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na)\s+)?m[eê]s\s+(\d{1,2})\b/i);
    const explicitMonthNameMatch = text.match(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na|em)\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i);

    const dayMatch = text.match(/(?:(?:iniciando|a\s+partir|começando|comecando|com\s+in[ií]cio|in[ií]cio)\s+(?:de|em|no|na)\s+)?(?:(?:pa|pra|pro|para|p\/|no|na|em|vence|vencimento|todo|cada|a\s+cada)\s+)?(?:o\s+)?dia\s+(\d{1,2})(?:\s+de\s+([a-zç]+))?/i);

    if (dayMatch || explicitMonthNumMatch || explicitMonthNameMatch) {
      const targetDay = dayMatch ? parseInt(dayMatch[1], 10) : 1;
      if (targetDay >= 1 && targetDay <= 31) {
        let month = currentMonth;
        let year = currentYear;
        let matchedParts = [];
        if (dayMatch) matchedParts.push(dayMatch[0]);

        if (explicitMonthNumMatch) {
          const mIdx = parseInt(explicitMonthNumMatch[1], 10) - 1;
          if (mIdx >= 0 && mIdx <= 11) {
            month = mIdx;
            if (month < currentMonth) year += 1;
            matchedParts.push(explicitMonthNumMatch[0]);
          }
        } else if (explicitMonthNameMatch && monthNames[explicitMonthNameMatch[1].toLowerCase()] !== undefined) {
          month = monthNames[explicitMonthNameMatch[1].toLowerCase()];
          if (month < currentMonth) year += 1;
          matchedParts.push(explicitMonthNameMatch[0]);
        } else if (dayMatch && dayMatch[2] && monthNames[dayMatch[2].toLowerCase()] !== undefined) {
          month = monthNames[dayMatch[2].toLowerCase()];
          if (month < currentMonth) year += 1;
        } else {
          // Se for menção explícita de recorrência (ex: "todo dia 1", "recorrente todo dia 1"), começa no mês atual!
          const isRecurringMention = /\b(todo|cada|a\s+cada|todo\s+m[eê]s|mensal|recorrente|ind?er?terminad[ao])\b/i.test(text);
          if (!isRecurringMention && targetDay < currentDay) {
            month = currentMonth + 1;
            if (month > 11) {
              month = 0;
              year += 1;
            }
          }
        }

        const target = new Date(year, month, targetDay);
        const yStr = target.getFullYear();
        const mStr = String(target.getMonth() + 1).padStart(2, '0');
        const dStr = String(target.getDate()).padStart(2, '0');
        return { 
          dateStr: `${yStr}-${mStr}-${dStr}`, 
          matchText: matchedParts.join(' '),
          matchedParts: matchedParts
        };
      }
    }

    // 7. Dias da semana (ex: "segunda", "terça", "nessa quarta", "próxima sexta")
    const weekDays = {
      'domingo': 0, 'segunda': 1, 'segunda-feira': 1, 'terça': 2, 'terca': 2, 'terça-feira': 2,
      'quarta': 3, 'quarta-feira': 3, 'quinta': 4, 'quinta-feira': 4, 'sexta': 5, 'sexta-feira': 5,
      'sábado': 6, 'sabado': 6
    };
    for (const [wName, wIndex] of Object.entries(weekDays)) {
      const regexW = new RegExp(`\\b(?:na\\s+|no\\s+|próxima\\s+|proxima\\s+)?${wName}\\b`, 'i');
      const wMatch = text.match(regexW);
      if (wMatch) {
        const todayDayOfWeek = now.getDay();
        let diff = wIndex - todayDayOfWeek;
        if (diff <= 0) diff += 7;
        const target = new Date(now);
        target.setDate(target.getDate() + diff);
        const yStr = target.getFullYear();
        const mStr = String(target.getMonth() + 1).padStart(2, '0');
        const dStr = String(target.getDate()).padStart(2, '0');
        return { dateStr: `${yStr}-${mStr}-${dStr}`, matchText: wMatch[0] };
      }
    }

    // Padrão: hoje
    const yStr = now.getFullYear();
    const mStr = String(now.getMonth() + 1).padStart(2, '0');
    const dStr = String(now.getDate()).padStart(2, '0');
    return { dateStr: `${yStr}-${mStr}-${dStr}`, matchText: null };
  }

  // Verifica se o texto tem intenção predominante de compromisso / lembrete de agenda
  isAppointmentText(text) {
    const lower = text.toLowerCase();
    const appKeywords = [
      'visita', 'visita técnica', 'visita tecnica', 'lembrete', 'lembrar', 'me lembra', 'lembre',
      'reunião', 'reuniao', 'dentista', 'médico', 'medico', 'consulta', 'agendar', 'marcar',
      'compromisso', 'agenda', 'encontro', 'entrevista', 'horário', 'horario'
    ];
    if (appKeywords.some(k => lower.includes(k))) return true;

    // Horário explícito (ex: "às 14h", "as 13:02", "14:30") sem termos financeiros explícitos de compra/pagamento
    const hasTime = /(?:às|as)\s+\d{1,2}|\b\d{1,2}:\d{2}\b|\b\d{1,2}h(?:\d{2})?\b/i.test(text);
    const hasMoneyVerb = /\b(gastei|paguei|comprei|recebi|salário|salario|despe[sz]as?|receitas?|parcelado|parcelas|\d+x)\b/i.test(text);
    if (hasTime && !hasMoneyVerb) return true;

    return false;
  }

  // Extrai valor numérico e o trecho de texto correspondente com proteção contra datas e horários
  extractAmountInfo(text, contextText = '') {
    const fullCtx = contextText ? `${text} ${contextText}` : text;
    // 1. Remove qualquer menção a horários (ex: "13:02", "14h", "às 10:30") para não confundir com valores monetários
    let clean = text.replace(/(?:às|as)?\s*\b\d{1,2}(?::\d{2}|h(?:\d{2})?)\b/gi, ' ');
    // 2. Remove qualquer menção a dias do mês (ex: "dia 4", "dia 15", "04/09") para não confundir com valores monetários
    clean = clean.replace(/(?:(?:iniciando|a\s+partir|começando|comecando|com\s+in[ií]cio|in[ií]cio)\s+(?:de|em|no|na)\s+)?(?:(?:pa|pra|pro|para|p\/|no|na|em|vence|vencimento|todo|cada|a\s+cada)\s+)?(?:o\s+)?dia\s+\d{1,2}\b/gi, ' ');
    clean = clean.replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/gi, ' ');
    // 3. Remove menção explícita a meses numéricos (ex: "comece mes 10", "mes 10") para não confundir o número do mês com valor em R$
    clean = clean.replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na)\s+)?m[eê]s\s+\d{1,2}\b/gi, ' ');

    const regex = /(?:r\$\s*|valor\s*de\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:\.\d{1,2})?)(?:\s*reais|\s*conto|\s*pila)?/i;
    const match = clean.match(regex);
    if (match && match[1]) {
      // 1. Indicação explícita de moeda (R$, reais, conto, pila, valor de)
      const hasCurrency = /(?:r\$|reais|conto|pila|valor\s*de)/i.test(match[0]);

      // 2. Mensagem começa com valor numérico (ex: "95 remedio da duda dia 18", "50 pizza", "33 celular dia 5")
      const startsWithNumber = /^\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)\b/i.test(fullCtx.trim());

      // 3. Vocabulário abrangente de finanças, produtos, serviços, comércio, saúde, etc.
      const hasFinancialContext = /\b(gastei|paguei|comprei|recebi|sal[aá]rio|despe[sz]as?|receitas?|custou|custo|almo[cç]o|jantar|comida|lanche|pizza|ifood|mercado|supermercado|mercearia|feira|a[cç]ougue|padaria|uber|99|gasolina|combust[ií]vel|posto|etanol|diesel|farm[aá]cia|rem[eé]dio|drogaria|m[eé]dico|dentista|consulta|exame|hospital|vacina|luz|energia|[aá]gua|internet|wifi|aluguel|condom[ií]nio|iptu|ipva|seguro|g[aá]s|compras?|parcelas?|\d+x|celular|telefone|recarga|plano|escola|curso|faculdade|livro|pet|ra[cç][aã]o|veterin[aá]rio|roupa|sapato|t[eê]nis|bar|cerveja|churrasco|di[aá]ria|faxina|obra|pedreiro|pintor|mecanico|mec[aá]nico|oficina|boleto|fatura|cart[aã]o|taxa|mensal|mensalidade|academia|personal|treino|nata[cç][aã]o|crossfit|recorrente|recorr[eê]ncia|ind?er?terminad[ao]|fix[ao]|pagar|comprar|vence|vencimento|entrada|sa[ií]da)\b/i.test(fullCtx);

      // 4. Contexto com data associada a valor (ex: "95 ... dia 18", "amanhã 50", "15/09 120")
      const hasDateContext = /\b(?:dia\s+\d{1,2}|\d{1,2}[\/\-]\d{1,2}|amanh[aã]|hoje|ontem|m[eê]s\s+\d{1,2})\b/i.test(fullCtx);

      if (!hasCurrency && !startsWithNumber && !hasFinancialContext && !hasDateContext) {
        return { amount: 0, rawMatch: '' };
      }

      let cleanVal = match[1].replace(/\./g, '').replace(',', '.');
      const val = parseFloat(cleanVal);
      if (!isNaN(val) && val > 0) {
        return {
          amount: val,
          rawMatch: match[0]
        };
      }
    }
    return { amount: 0, rawMatch: '' };
  }

  extractAmount(text) {
    return this.extractAmountInfo(text).amount;
  }

  // Extrai parcelas ("5x", "5 x", "em 5x", "5 parcelas", "5 vezes", "5x de 70", "1200 em 5x")
  extractInstallments(text) {
    // 1. "5x de 70", "5 parcelas de 70", "5x de R$ 70,00"
    const perMatch = text.match(/(?:em\s+|parcelado\s+(?:em\s+)?|dividido\s+(?:em\s+)?)?(\d{1,2})\s*(?:x|vezes|parcelas)\s*(?:de\s+)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:\.\d{1,2})?)/i);
    if (perMatch) {
      const count = parseInt(perMatch[1], 10);
      const val = parseFloat(perMatch[2].replace(/\./g, '').replace(',', '.'));
      if (count >= 2 && count <= 72 && !isNaN(val) && val > 0) {
        return {
          installments: count,
          installmentAmount: val,
          totalAmount: val * count,
          isPerInstallment: true,
          matchText: perMatch[0]
        };
      }
    }

    // 2. "1200 em 5x" ou "1200 reais parcelado em 10x" ou "70 em 5x"
    const totalMatch = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:\.\d{1,2})?)\s*(?:reais)?\s*(?:em|parcelado\s+(?:em\s+)?|dividido\s+(?:em\s+)?)\s*(\d{1,2})\s*(?:x|vezes|parcelas)\b/i);
    if (totalMatch) {
      const tot = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
      const count = parseInt(totalMatch[2], 10);
      if (count >= 2 && count <= 72 && !isNaN(tot) && tot > 0) {
        const isRecurrentOrSmall = /recorrente|mensal|cada|por\s+m[eê]s/i.test(text) || (tot < 150 && !/total/i.test(text));
        if (isRecurrentOrSmall) {
          return {
            installments: count,
            installmentAmount: tot,
            totalAmount: tot * count,
            isPerInstallment: true,
            matchText: totalMatch[0]
          };
        }
        return {
          installments: count,
          installmentAmount: tot / count,
          totalAmount: tot,
          isPerInstallment: false,
          matchText: totalMatch[0]
        };
      }
    }

    // 3. Menção geral de parcelas no texto: "5x", "5 x", "em 5x", "5 parcelas", "5 vezes"
    const generalMatch = text.match(/\b(?:(?:em|parcelado\s+(?:em\s+)?|dividido\s+(?:em\s+)?)\s*)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/i);
    if (generalMatch) {
      const count = parseInt(generalMatch[1], 10);
      if (count >= 2 && count <= 72) {
        return {
          installments: count,
          installmentAmount: 0,
          totalAmount: 0,
          isPerInstallment: true,
          matchText: generalMatch[0]
        };
      }
    }

    return null;
  }

  // Extrai detalhes de transação financeira
  extractTransactionDetails(text) {
    const lower = text.toLowerCase();
    
    // Identifica se é entrada ou saída
    const incomeKeywords = ['recebi', 'ganhei', 'salário', 'salario', 'freela', 'vendi', 'entrada', 'rendimento', 'depósito', 'deposito', 'receita'];
    const isIncome = incomeKeywords.some(k => lower.includes(k));
    const type = isIncome ? 'income' : 'expense';

    // 1. Extrai a data primeiro (ex: "todo dia 5", "pa dia 5", "ontem", "amanhã")
    // Isso é crucial para evitar que o dia (ex: 5) seja confundido com valor ou parcela em "dia 5 em 6x"
    const dateInfo = this.extractDate(text);
    let remaining = text;
    if (dateInfo.matchedParts && dateInfo.matchedParts.length > 0) {
      dateInfo.matchedParts.forEach(p => {
        if (p) remaining = remaining.replace(p, ' ');
      });
    } else if (dateInfo.matchText) {
      remaining = remaining.replace(dateInfo.matchText, ' ');
    }
    remaining = remaining
      .replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na)\s+)?m[eê]s\s+\d{1,2}\b/gi, ' ')
      .replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na|em)\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi, ' ');

    // 2. Extrai parcelamento do texto restante (ex: "5x", "em 6x", "70 reais em 6x")
    const instInfo = this.extractInstallments(remaining);
    if (instInfo && instInfo.matchText) {
      remaining = remaining.replace(instInfo.matchText, ' ');
    }

    // 3. Extrai valor
    let amount = 0;
    if (instInfo && instInfo.installmentAmount > 0) {
      amount = instInfo.installmentAmount;
    } else {
      const amountInfo = this.extractAmountInfo(remaining, text);
      if (amountInfo.amount > 0) {
        amount = amountInfo.amount;
        if (amountInfo.rawMatch) {
          remaining = remaining.replace(amountInfo.rawMatch, ' ');
        }
      }
    }
    if (amount <= 0) return null;

    const date = dateInfo.dateStr;

    // Cálculo das parcelas ou recorrência
    let installments = 1;
    let isPerInstallment = true;
    let totalAmount = amount;
    let installmentAmount = amount;
    const isRecurring = /\b(recorrente|recorr[eê]ncia|ind?er?terminad[ao]|fix[ao]|todo\s+m[eê]s|mensal|mensalmente|todo\s+dia\s+\d{1,2}|cada\s+m[eê]s)\b/i.test(lower);

    if (instInfo && instInfo.installments > 1) {
      installments = instInfo.installments;
      isPerInstallment = instInfo.isPerInstallment;
      if (isPerInstallment) {
        installmentAmount = amount;
        totalAmount = amount * installments;
      } else {
        totalAmount = instInfo.totalAmount || (amount * installments);
        installmentAmount = instInfo.installmentAmount || (totalAmount / installments);
      }
    } else if (isRecurring) {
      // Recorrência contínua/indeterminada: projeta os próximos 12 meses
      installments = 12;
      isPerInstallment = true;
      installmentAmount = amount;
      totalAmount = amount;
    }

    // 4. Detecta forma de pagamento (se parcelado de compra, padrão é Cartão de Crédito; se recorrente, PIX)
    let paymentMethod = (installments > 1 && !isRecurring) ? 'Cartão de Crédito' : 'PIX';
    if (lower.includes('débito') || lower.includes('debito')) {
      paymentMethod = 'Cartão de Débito';
    } else if (lower.includes('cartão') || lower.includes('cartao') || lower.includes('crédito') || lower.includes('credito')) {
      paymentMethod = 'Cartão de Crédito';
    } else if (lower.includes('dinheiro') || lower.includes('espécie') || lower.includes('especie')) {
      paymentMethod = 'Dinheiro';
    } else if (lower.includes('boleto')) {
      paymentMethod = 'Boleto';
    } else if (lower.includes('ted') || lower.includes('doc') || lower.includes('transferência') || lower.includes('transferencia')) {
      paymentMethod = 'Transferência';
    } else if (lower.includes('pix')) {
      paymentMethod = 'PIX';
    }

    // 5. Dicionário inteligente de produtos e serviços comuns (Preserva nomes como "Máquina de lavar")
    const canonicalProducts = [
      { regex: /\bm[aá]quina\s+(?:de\s+)?lav(?:ar?)\b/i, canonical: 'Máquina de lavar', category: 'Moradia' },
      { regex: /\bm[aá]quina\s+(?:de\s+)?sec(?:ar?)\b/i, canonical: 'Máquina de secar', category: 'Moradia' },
      { regex: /\blava[ -]?lou[cç]as?\b/i, canonical: 'Lava-louças', category: 'Moradia' },
      { regex: /\bar[ -]condicionado\b/i, canonical: 'Ar-condicionado', category: 'Moradia' },
      { regex: /\bgeladeira\b/i, canonical: 'Geladeira', category: 'Moradia' },
      { regex: /\bfog[aã]o\b/i, canonical: 'Fogão', category: 'Moradia' },
      { regex: /\bmicro[ -]?ondas\b/i, canonical: 'Micro-ondas', category: 'Moradia' },
      { regex: /\btelevis[aã]o\b|\btv\b/i, canonical: 'Smart TV', category: 'Lazer' },
      { regex: /\bcelular\b|\bsmartphone\b/i, canonical: 'Celular', category: 'Outros' },
      { regex: /\bnotebook\b|\bcomputador\b/i, canonical: 'Notebook', category: 'Educação' },
      { regex: /\b(?:conta\s+(?:de\s+)?)?luz\b|\benergia\b/i, canonical: 'Conta de Luz', category: 'Moradia' },
      { regex: /\b(?:conta\s+(?:de\s+)?)?[aá]gua\b/i, canonical: 'Conta de Água', category: 'Moradia' },
      { regex: /\b(?:conta\s+(?:de\s+)?)?g[aá]s\b/i, canonical: 'Gás', category: 'Moradia' },
      { regex: /\binternet\b|\bwifi\b/i, canonical: 'Internet', category: 'Moradia' },
      { regex: /\baluguel\b/i, canonical: 'Aluguel', category: 'Moradia' },
      { regex: /\bcondom[ií]nio\b/i, canonical: 'Condomínio', category: 'Moradia' },
      { regex: /\bfatura\s+(?:do\s+)?cart[aã]o\b/i, canonical: 'Fatura do Cartão', category: 'Outros' },
      { regex: /\bsal[aá]rio\b/i, canonical: 'Salário', category: 'Salário' }
    ];

    let detectedCanonical = null;
    for (const item of canonicalProducts) {
      if (item.regex.test(text)) {
        detectedCanonical = item;
        break;
      }
    }

    // Detecta categoria
    let category = type === 'income' ? 'Outras Receitas' : 'Outros';
    if (detectedCanonical) {
      category = detectedCanonical.category;
    } else if (lower.includes('almoço') || lower.includes('almoco') || lower.includes('jantar') || lower.includes('comida') || lower.includes('lanche') || lower.includes('restaurante') || lower.includes('mercado') || lower.includes('supermercado') || lower.includes('padaria') || lower.includes('ifood')) {
      category = 'Alimentação';
    } else if (lower.includes('uber') || lower.includes('99') || lower.includes('gasolina') || lower.includes('combustível') || lower.includes('combustivel') || lower.includes('posto') || lower.includes('onibus') || lower.includes('estacionamento') || lower.includes('pedágio') || lower.includes('pedagio')) {
      category = 'Transporte';
    } else if (lower.includes('aluguel') || lower.includes('condomínio') || lower.includes('condominio') || lower.includes('luz') || lower.includes('energia') || lower.includes('água') || lower.includes('agua') || lower.includes('internet') || lower.includes('wifi') || lower.includes('iptu') || lower.includes('móvel') || lower.includes('sofa') || lower.includes('sofá') || lower.includes('cama')) {
      category = 'Moradia';
    } else if (lower.includes('farmácia') || lower.includes('farmacia') || lower.includes('remédio') || lower.includes('remedio') || lower.includes('médico') || lower.includes('medico') || lower.includes('dentista') || lower.includes('hospital') || lower.includes('exame') || lower.includes('consulta')) {
      category = 'Saúde';
    } else if (lower.includes('cinema') || lower.includes('show') || lower.includes('bar') || lower.includes('cerveja') || lower.includes('viagem') || lower.includes('festa')) {
      category = 'Lazer';
    } else if (lower.includes('salário') || lower.includes('salario') || lower.includes('adiantamento') || lower.includes('folha') || lower.includes('pagamento da empresa')) {
      category = 'Salário';
    } else if (lower.includes('freela') || lower.includes('consultoria') || lower.includes('serviço') || lower.includes('servico') || lower.includes('comissão') || lower.includes('comissao')) {
      category = 'Serviços';
    } else if (lower.includes('curso') || lower.includes('faculdade') || lower.includes('livro') || lower.includes('escola')) {
      category = 'Educação';
    }

    // 6. Limpeza e construção da descrição
    let desc = '';
    if (detectedCanonical) {
      desc = detectedCanonical.canonical;
    } else {
      desc = remaining
        .replace(/\b(crie|criar|adicione|adicionar|registre|registrar|inserir|cadastre|cadastrar|lançar|lancar)\b/gi, '')
        .replace(/\b(despe[sz]as?|receitas?|gasto|gastos|custo|custos|lançamento|lancamento|lançamentos|lancamentos|pagamento|pagamentos|entrada|entradas|saída|saídas|saida|saidas)\b/gi, '')
        .replace(/\b(gastei|paguei|comprei|recebi|ganhei|pagar|comprar|receber|vence|vencimento|agendar)\b/gi, '')
        .replace(/\b(vencid[ao]s?|n[aã]o\s+pag[ao]s?|atrasad[ao]s?|em\s+aberto|pendentes?|a\s+pagar|devendo)\b/gi, '')
        .replace(/\b(recorrente|recorr[eê]ncia|ind?er?terminad[ao]|fix[ao]|mensal|mensalmente|todo\s+m[eê]s)\b/gi, '')
        .replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na)\s+)?m[eê]s\s+\d{1,2}\b/gi, '')
        .replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na|em)\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi, '')
        .replace(/\b(comece|começar|comecar|começando|comecando|iniciando|iniciar|a\s+partir)\b/gi, '')
        .replace(/\b(no\s+cartão\s+de\s+crédito|no\s+cartao\s+de\s+credito|no\s+cartão|no\s+cartao|no\s+crédito|no\s+credito|no\s+débito|no\s+debito|no\s+pix|via\s+pix|em\s+dinheiro|no\s+dinheiro|no\s+boleto)\b/gi, '')
        .replace(/\b(cartão|cartao|crédito|credito|débito|debito|pix|dinheiro|boleto)\b(?!\s+(?:de|do|da|dos|das))/gi, '')
        .replace(/\b(reais|r\$|conto|pila)\b/gi, '')
        .replace(/[.,!?:;]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Remove preposições e termos de transição nas bordas
      desc = desc.replace(/^(?:pa|pra|pro|para|p\/|no|na|nos|nas|em|de|do|da|dos|das|o|a|os|as|um|uma|com|por|iniciando|a\s+partir|comece|começar|comecar)\s+/i, '');
      desc = desc.replace(/\s+(?:pa|pra|pro|para|p\/|no|na|nos|nas|em|de|do|da|dos|das|o|a|os|as|um|uma|com|por|iniciando|a\s+partir|comece|começar|comecar)$/i, '');
      desc = desc.trim();

      const strippedDesc = desc.replace(/\b(de|do|da|em|no|na|recorrente|mensal|iniciando)\b/gi, '').trim();
      if (desc.length < 2 || strippedDesc.length === 0) {
        if (lower.includes('recorrente') || lower.includes('mensal')) {
          desc = type === 'income' ? 'Receita Recorrente' : 'Despesa Recorrente';
        } else if (category !== 'Outros' && category !== 'Outras Receitas') {
          desc = category;
        } else {
          desc = type === 'income' ? 'Receita' : 'Despesa';
        }
      } else {
        // Formatação inteligente com Title Case (ex: "Remédio da Duda")
        const lowerWords = ['da', 'de', 'do', 'das', 'dos', 'e', 'em', 'para', 'pra', 'com', 'por'];
        desc = desc.split(' ').filter(Boolean).map((word, idx) => {
          const wLower = word.toLowerCase();
          if (idx > 0 && lowerWords.includes(wLower)) return wLower;
          if (wLower === 'remedio') return 'Remédio';
          return wLower.charAt(0).toUpperCase() + wLower.slice(1);
        }).join(' ');
      }
    }

    // 7. Determina Status: se for data futura, parcelado ou se o usuário indicar que está vencida/não paga/pendente, fica como 'pending'
    const todayStr = new Date().toISOString().split('T')[0];
    let status = 'paid';
    const isExplicitUnpaid = /\b(vencid[ao]s?|n[aã]o\s+pag[ao]s?|atrasad[ao]s?|em\s+aberto|pendentes?|a\s+pagar|devendo|pagar|vence|vencimento|agendar)\b/i.test(lower);
    if (date > todayStr || installments > 1 || lower.includes('todo dia') || lower.includes('cada dia') || isExplicitUnpaid) {
      status = 'pending';
    }

    return {
      type,
      amount: installmentAmount,
      installments,
      isPerInstallment,
      isRecurring: isRecurring,
      totalAmount,
      installmentAmount,
      category,
      paymentMethod,
      date,
      dueDate: date,
      status,
      description: desc
    };
  }

  // Procura se existe uma transação pendente compatível para dar baixa
  findMatchingPendingTransaction(text) {
    const lower = text.toLowerCase().trim();
    const pendingTxs = (window.db ? window.db.getTransactions() : []).filter(t => t.status === 'pending');
    if (pendingTxs.length === 0) return null;

    // Palavras que indicam baixa, liquidação, recebimento ou pagamento efetivado
    const isSettleIntent = /\b(recebi|paguei|quitei|pago|recebido|liquidado|dei\s+baixa|dar\s+baixa|da\s+baixa|baixa|caiu|entrou|compensou)\b/i.test(lower);
    if (!isSettleIntent) return null;

    const isIncomeIntent = /\b(recebi|recebido|ganhei|salário|salario|rendimento|receita|caiu|entrou|compensou)\b/i.test(lower);
    const isExpenseIntent = /\b(paguei|quitei|pago|liquidado|gastei|despe[sz]as?)\b/i.test(lower);
    const targetType = isIncomeIntent ? 'income' : (isExpenseIntent ? 'expense' : null);

    const amount = this.extractAmount(text);

    // 1. Tenta correspondência exata de valor E nome (ex: "700 da grsul" ou "33 do celular")
    for (const tx of pendingTxs) {
      if (targetType && tx.type !== targetType) continue;
      const txAmt = parseFloat(tx.amount) || 0;
      const txDesc = (tx.description || '').toLowerCase();
      const cleanDesc = txDesc.replace(/\s*\(\d+\/\d+\)/g, '').trim();
      
      const hasDescMatch = cleanDesc.length >= 3 && lower.includes(cleanDesc);
      const hasAmtMatch = amount > 0 && Math.abs(txAmt - amount) < 0.01;

      if (hasDescMatch && hasAmtMatch) {
        return tx;
      }
    }

    // 2. Se mencionou o nome explicitamente na frase (ex: "dar baixa na grsul", "recebi da grsul", "paguei o celular")
    for (const tx of pendingTxs) {
      if (targetType && tx.type !== targetType) continue;
      const txDesc = (tx.description || '').toLowerCase();
      const cleanDesc = txDesc.replace(/\s*\(\d+\/\d+\)/g, '').trim();
      if (cleanDesc.length >= 3 && lower.includes(cleanDesc)) {
        return tx;
      }
    }

    // 3. Se mencionou o valor exato e há um único lançamento pendente com esse valor (ex: "recebi 700" ou "paguei 33")
    if (amount > 0) {
      const candidates = pendingTxs.filter(tx => {
        if (targetType && tx.type !== targetType) return false;
        const txAmt = parseFloat(tx.amount) || 0;
        return Math.abs(txAmt - amount) < 0.01;
      });
      if (candidates.length === 1) {
        return candidates[0];
      }
    }

    return null;
  }

  // Extrai detalhes de compromisso na agenda
  extractAppointmentDetails(text) {
    const lower = text.toLowerCase();
    
    // Data (utiliza o extrator inteligente unificado)
    const dateInfo = this.extractDate(text);
    const date = dateInfo.dateStr;

    // Horário (ex: "14:30", "14h", "às 10h", "16:00")
    let time = '09:00';
    let timeMatchStr = '';
    const timeMatch = text.match(/(?:às|as)?\s*(\d{1,2})(?::(\d{2})|h(?:(\d{2}))?)/i);
    if (timeMatch) {
      const hours = String(timeMatch[1]).padStart(2, '0');
      const mins = String(timeMatch[2] || timeMatch[3] || '00').padStart(2, '0');
      time = `${hours}:${mins}`;
      timeMatchStr = timeMatch[0];
    }

    // Remove data e hora do texto para extrair valor e título
    let remaining = text;
    if (dateInfo.matchText) remaining = remaining.replace(dateInfo.matchText, ' ');
    if (timeMatchStr) remaining = remaining.replace(timeMatchStr, ' ');
    // Remove também expressões de dias residuais ("dia 4", "de hoje", etc.)
    remaining = remaining.replace(/(?:(?:pa|pra|pro|para|p\/|no|na|em|todo|cada)\s+)?(?:o\s+)?dia\s+\d{1,2}\b/gi, ' ');
    remaining = remaining.replace(/\b(?:de\s+hoje|de\s+amanhã|de\s+amanha|hoje|amanhã|amanha)\b/gi, ' ');

    // Custo associado se houver (ex: "Consulta médica 200 reais")
    let cost = 0;
    const costMatch = remaining.match(/(?:custo\s+(?:de\s+)?|valor\s+(?:de\s+)?|por\s+)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais|r\$|conto)/i);
    if (costMatch) {
      cost = parseFloat(costMatch[1].replace(',', '.'));
      remaining = remaining.replace(costMatch[0], ' ');
    }

    // Título do compromisso / lembrete
    let title = remaining
      .replace(/\b(amanhã|amanha|hoje|ontem|de\s+hoje|de\s+amanhã|de\s+amanha|às|as)\b/gi, ' ')
      .replace(/\b(agendar|marcar|compromisso|lembrete|lembrar(?:\s+de)?|me\s+lembra(?:\s+de)?|lembre(?:\s+de)?)\b/gi, ' ')
      .replace(/\b(pa|pra|pro|para|p\/|no|na|em|de|do|da|com)\b/gi, ' ')
      .replace(/[.,!?:;]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Normalizações inteligentes de título
    if (/\bvisita\s+t[eé]cnica\b/i.test(title) || (lower.includes('visita') && lower.includes('tecnica'))) {
      title = 'Visita Técnica';
    } else if (/\bvisita\b/i.test(title)) {
      title = 'Visita';
    } else if (lower.includes('dentista')) {
      title = 'Dentista';
    } else if (lower.includes('médico') || lower.includes('medico') || lower.includes('consulta')) {
      title = 'Consulta Médica';
    } else if (lower.includes('reunião') || lower.includes('reuniao')) {
      title = title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Reunião';
    } else if (!title || title.length < 2) {
      title = 'Lembrete';
    } else {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    return {
      title,
      date,
      time,
      cost,
      location: '',
      priority: 'medium',
      completed: false
    };
  }

  // --- Integração com a API do Groq (Llama 3.1 8B Instant / 70B) ---
  async processWithGroq(userText, apiKey, model = 'llama-3.1-8b-instant') {
    // Indicador visual de digitação
    const typingId = 'typing_' + Date.now();
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
      const typingEl = document.createElement('div');
      typingEl.id = typingId;
      typingEl.className = 'flex items-center gap-2 text-slate-400 text-xs py-2 px-3 italic';
      typingEl.innerHTML = '<span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Groq IA pensando...';
      chatContainer.appendChild(typingEl);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const currentMetrics = window.finance.getMonthlyMetrics();
      const pendingTxs = (window.db ? window.db.getTransactions() : []).filter(t => t.status === 'pending');
      const pendingListText = pendingTxs.length > 0 
        ? pendingTxs.map(t => `- ID: "${t.id}" | ${t.type === 'income' ? 'Receita' : 'Despesa'}: "${t.description}" | Valor: R$ ${t.amount} | Vencimento: ${t.date}`).join('\n')
        : 'Nenhuma conta pendente no momento.';

      const systemPrompt = `Você é o assistente inteligente do aplicativo FinControl Pro (gestão financeira, agenda e anotações).
Hoje é dia ${todayStr}.
O usuário atual possui saldo de ${window.finance.formatMoney(currentMetrics.currentBalance)}, receitas de ${window.finance.formatMoney(currentMetrics.totalIncome)} e despesas de ${window.finance.formatMoney(currentMetrics.totalExpense)}.

LISTA DE CONTAS PENDENTES ATUAIS (PREVISTAS):
${pendingListText}

Instruções fundamentais:
1. Seja educado, conciso, útil e em português brasileiro.
2. NUNCA mostre notas internas, raciocínio ou chain-of-thought (NUNCA escreva "Here's a thinking process" ou "<think>"). Responda DIRETAMENTE ao usuário apenas com a mensagem final em português.
3. Regras de Classificação de Ação:
   - BAIXA EM CONTA PENDENTE (TOTAL OU PARCIAL) ("recebi 700", "recebi da grsul", "paguei o celular", "paguei 200 da luz de 500", "dei baixa de 300 no aluguel"): Se o usuário estiver confirmando que pagou ou recebeu algo que já consta na lista de contas pendentes acima, use OBRIGATORIAMENTE a ação "settle_transaction" com o ID correspondente. NUNCA crie uma nova transação duplicada para algo que já estava previsto!
     - Se o usuário pagou/recebeu apenas uma parte do valor (ex: conta de 500 e pagou 200), defina "amount": 200, "isPartial": true, "originalAmount": 500, "remainingAmount": 300.
     - Se pagou o valor total, defina "amount" como o valor integral da conta.
   - LANÇAMENTO FINANCEIRO NOVO: Use "create_transaction" sempre que o usuário informar uma despesa, receita, compra ou lançamento rápido com valor e item/serviço (ex: "95 remedio da duda dia 18", "agua 15/08 vencida nao paga 192,13", "internet 120 recorrente indeterminado todo dia 1", "50 pizza", "33 celular dia 5", "gastei 45 no almoço", "recebi 700"). O usuário costuma registrar de forma rápida apenas dizendo o valor e o nome do produto/serviço ou usando variações coloquiais como "despeza" (com z)!
     Exemplo comum: "95 remedio da duda dia 18" -> action: "create_transaction", data: {"type": "expense", "description": "Remédio da Duda", "amount": 95, "category": "Saúde", "date": "${todayStr.substring(0, 8)}18", "status": "pending", "paymentMethod": "PIX"}
     Exemplo de conta atrasada: "agua 15/08 vencida nao paga 192,13" -> action: "create_transaction", data: {"type": "expense", "description": "Conta de Água", "amount": 192.13, "category": "Moradia", "date": "2026-08-15", "status": "pending", "paymentMethod": "PIX"}
     Exemplo de conta fixa/recorrente contínua: "internet 120 recorrente indeterminado todo dia 1" -> action: "create_transaction", data: {"type": "expense", "description": "Internet", "amount": 120, "isRecurring": true, "installments": 12, "isPerInstallment": true, "totalAmount": 120, "category": "Moradia", "paymentMethod": "PIX", "date": "${todayStr.substring(0, 8)}01", "status": "pending"}
     Exemplo com início em mês futuro: "internet 120 recorrente inderterminado todo dia 1 comece mes 10" -> action: "create_transaction", data: {"type": "expense", "description": "Internet", "amount": 120, "isRecurring": true, "installments": 12, "isPerInstallment": true, "totalAmount": 120, "category": "Moradia", "paymentMethod": "PIX", "date": "2026-10-01", "status": "pending"}
     Se o usuário indicar explicitamente o mês de início ("comece mes 10", "a partir de outubro", "iniciando mes 11"), use OBRIGATORIAMENTE o mês solicitado e status "pending"!
     Se for parcelado ("5x de 70" ou "70 em 5x"), amount: 70, installments: 5, isPerInstallment: true, totalAmount: 350, paymentMethod: "Cartão de Crédito".
   - COMPROMISSO / AGENDA / LEMBRETE: Se o usuário mencionar "visita", "visita técnica", "lembrete", "lembrar", "me lembra", "reunião", "dentista", "médico", "consulta", "marcar", "agendar", ou citar um horário (ex: "13:02", "14h", "às 15:30"), use OBRIGATORIAMENTE a ação "create_appointment". NUNCA gere despesa para compromissos ou lembretes, e NUNCA confunda horários ou dias com valores em dinheiro!
   - ANOTAÇÃO: Se o usuário disser "anotar...", "nota:...", "ideia:...", use "create_note".
4. Compreenda gírias e expressões informais do Brasil:
   - "pa dia 5", "pra dia 5", "pro dia 5" = dia 5 do mês.
   - "conto", "pila", "reais" = moeda R$.
   - Eletrodomésticos ("máquina de lavar", "geladeira", etc.) pertencem à categoria "Moradia".
5. REGRAS CRÍTICAS DE STATUS E DESCRIÇÃO:
   - STATUS PENDENTE ("pending"): Use OBRIGATORIAMENTE "pending" se:
     a) A data for futura (após ${todayStr});
     b) OU se o usuário mencionar que a conta NÃO ESTÁ PAGA, está VENCIDA, ATRASADA, EM ABERTO, PENDENTE, A PAGAR ou DEVENDO (ex: "vencida nao paga", "não paga", "vencida", "atrasada", "em aberto"). Uma conta vencida no passado que ainda não foi paga é uma pendência atrasada, logo o status É OBRIGATORIAMENTE "pending"!
   - STATUS REALIZADO ("paid"): Use "paid" SOMENTE quando o usuário informar que já pagou/recebeu ("paguei", "pago", "já paga", "quitei") ou para compras normais já concluídas.
   - LIMPEZA DA DESCRIÇÃO (description): A descrição DEVE conter APENAS o nome do item/serviço (ex: "Conta de Água", "Conta de Luz", "Aluguel", "Remédio da Duda"). NUNCA inclua palavras de status como "vencida", "nao paga", "não paga", "atrasada", "pendente" na descrição!
6. Se o usuário estiver informando um compromisso, lançamento, baixa ou anotação, inclua OBRIGATORIAMENTE no final da sua resposta o bloco JSON:
\`\`\`action
{
  "action": "settle_transaction" | "create_transaction" | "create_appointment" | "create_note",
  "data": { ... }
}
\`\`\`
- settle_transaction: {"id": "ID_DA_CONTA", "description": "...", "amount": 200, "type": "income"|"expense", "date": "YYYY-MM-DD", "isPartial": true, "remainingAmount": 300}
- create_transaction: {"type": "expense"|"income", "description": "...", "amount": 70, "installments": 5, "isPerInstallment": true, "totalAmount": 350, "category": "Outros", "paymentMethod": "Cartão de Crédito", "date": "YYYY-MM-DD", "status": "paid"|"pending"}
- create_appointment: {"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "cost": 0, "location": ""}
- create_note: {"title": "...", "content": "...", "tag": "Geral"}

Se for apenas uma dúvida, conselho financeiro ou saudação, responda diretamente e educadamente sem o bloco action.`;

      let activeModel = model || 'llama-3.1-8b-instant';

      const buildGroqPayload = (mId) => {
        // Define limite dinâmico seguro: Qwen/DeepSeek no plano gratuito do Groq possuem limite estrito de 1000 OTPM
        let tokenLimit = 500;
        if (mId.includes('qwen') || mId.includes('deepseek') || mId.includes('r1')) {
          tokenLimit = 350;
        }
        const payload = {
          model: mId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          temperature: 0.2,
          max_tokens: tokenLimit
        };
        if (mId.includes('r1') || mId.includes('deepseek') || mId.includes('reasoning')) {
          payload.reasoning_format = 'hidden';
        }
        return JSON.stringify(payload);
      };

      let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: buildGroqPayload(activeModel)
      });

      // Se falhar (ex: limite OTPM, modelo indisponível, rate limit ou erro de tokens), tenta fallback suave para llama-3.1-8b-instant
      if (!response.ok && activeModel !== 'llama-3.1-8b-instant') {
        console.warn(`Groq com modelo ${activeModel} retornou status ${response.status}. Tentando fallback automático para llama-3.1-8b-instant...`);
        activeModel = 'llama-3.1-8b-instant';
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: buildGroqPayload(activeModel)
        });
      }

      // Remove elemento de digitação
      const el = document.getElementById(typingId);
      if (el) el.remove();

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erro HTTP ${response.status}`);
      }

      const resJson = await response.json();
      const botResponseText = resJson.choices[0]?.message?.content || 'Não foi possível processar a resposta.';

      // Limpeza de texto: remove raciocínio interno do modelo (<think> ou "Here's a thinking process")
      let cleanText = botResponseText;
      cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      
      // Remove blocos de raciocínio tipo "Here's a thinking process: ..."
      if (/here'?s a thinking process/i.test(cleanText)) {
        const readyMatch = cleanText.match(/(?:Ready\..*?✅|Output matches.*?\n)([\s\S]*)$/i);
        if (readyMatch && readyMatch[1] && readyMatch[1].trim()) {
          cleanText = readyMatch[1].trim();
        } else {
          // Corta desde "Here's a thinking process" até o início de uma frase de resposta em português
          cleanText = cleanText.replace(/here'?s a thinking process:?[\s\S]*?(?=(?:Olá|Ola|Com certeza|Perfeito|Identifiquei|Preparei|Entendi|Criei|Agendei|```action|```json|$))/i, '').trim();
        }
      }
      cleanText = cleanText.replace(/^here'?s a thinking process:?/gi, '').trim();

      // Verifica se há bloco de ação estruturada no formato ```action { ... } ``` ou ```json { ... } ```
      let actionCard = null;
      const actionMatch = botResponseText.match(/```(?:action|json)?\s*([\s\S]*?)\s*```/i);

      if (actionMatch && actionMatch[1]) {
        try {
          const actionObj = JSON.parse(actionMatch[1]);
          const actionType = actionObj.action || (actionObj.type ? 'create_transaction' : null);
          if (actionType && actionObj.data) {
            const d = actionObj.data;
            if (d.installments && d.installments > 1) {
              if (!d.totalAmount) {
                d.totalAmount = d.isPerInstallment !== false ? (d.amount * d.installments) : d.amount;
              }
              if (!d.installmentAmount) {
                d.installmentAmount = d.isPerInstallment !== false ? d.amount : (d.totalAmount / d.installments);
              }
            }

            // Salvaguarda infalível de status, descrição e recorrência
            if (actionType === 'create_transaction') {
              const lowerUser = userText.toLowerCase();
              const isUnpaid = /\b(vencid[ao]s?|n[aã]o\s+pag[ao]s?|atrasad[ao]s?|em\s+aberto|pendentes?|a\s+pagar|devendo)\b/i.test(lowerUser);
              if (isUnpaid) {
                d.status = 'pending';
              }
              const isRec = /\b(recorrente|recorr[eê]ncia|ind?er?terminad[ao]|fix[ao]|todo\s+m[eê]s|mensal|mensalmente|todo\s+dia\s+\d{1,2}|cada\s+m[eê]s)\b/i.test(lowerUser);
              if (isRec) {
                d.isRecurring = true;
                if (!d.installments || d.installments <= 1) {
                  d.installments = 12;
                  d.isPerInstallment = true;
                  d.totalAmount = d.amount;
                }
                // Detecta se o usuário especificou explicitamente um mês inicial (ex: "comece mes 10", "a partir de outubro")
                const monthNamesMap = {
                  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4, 'maio': 5,
                  'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
                };
                const explicitMonthNum = lowerUser.match(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na)\s+)?m[eê]s\s+(\d{1,2})\b/i);
                const explicitMonthName = lowerUser.match(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na|em)\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i);

                const dayMatch = lowerUser.match(/\b(?:todo\s+dia|dia|cada\s+dia)\s+(\d{1,2})\b/i);
                let dayNum = dayMatch ? String(parseInt(dayMatch[1], 10)).padStart(2, '0') : (d.date ? d.date.split('-')[2] : '01');

                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonthNum = now.getMonth() + 1; // 1-12

                if (explicitMonthNum) {
                  const mNum = parseInt(explicitMonthNum[1], 10);
                  if (mNum >= 1 && mNum <= 12) {
                    let tYear = currentYear;
                    if (mNum < currentMonthNum) tYear += 1;
                    d.date = `${tYear}-${String(mNum).padStart(2, '0')}-${dayNum}`;
                    d.dueDate = d.date;
                  }
                } else if (explicitMonthName && monthNamesMap[explicitMonthName[1].toLowerCase()]) {
                  const mNum = monthNamesMap[explicitMonthName[1].toLowerCase()];
                  let tYear = currentYear;
                  if (mNum < currentMonthNum) tYear += 1;
                  d.date = `${tYear}-${String(mNum).padStart(2, '0')}-${dayNum}`;
                  d.dueDate = d.date;
                } else {
                  // Se o usuário NÃO informou mês específico, mantém o mês de início conforme o Groq ou inicia no mês atual
                  const currentYM = todayStr.substring(0, 8); // "YYYY-MM-"
                  if (!d.date || d.date < `${currentYM}01` || !dayMatch) {
                    d.date = `${currentYM}${dayNum}`;
                    d.dueDate = d.date;
                  } else if (dayMatch) {
                    // Mantém o ano/mês que o Groq já tinha colocado se for igual ou posterior ao mês atual
                    const ym = d.date.substring(0, 8);
                    d.date = `${ym}${dayNum}`;
                    d.dueDate = d.date;
                  }
                }

                // Recalcula status: se a data for futura, é pendente (previsto)!
                if (d.date > todayStr) {
                  d.status = 'pending';
                }
              }
              if (d.description) {
                d.description = d.description.replace(/\b(vencid[ao]s?|n[aã]o\s+pag[ao]s?|atrasad[ao]s?|em\s+aberto|pendentes?|a\s+pagar|devendo)\b/gi, '').trim();
                d.description = d.description.replace(/\b(recorrente|recorr[eê]ncia|ind?er?terminad[ao]|fix[ao]|mensal|mensalmente|todo\s+m[eê]s|todo\s+dia\s+\d{1,2}|cada\s+dia\s+\d{1,2})\b/gi, '').trim();
                d.description = d.description.replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na)\s+)?m[eê]s\s+\d{1,2}\b/gi, '').trim();
                d.description = d.description.replace(/\b(?:(?:comece|começar|comecar|começando|comecando|a\s+partir|iniciando|iniciar|com\s+in[ií]cio|in[ií]cio|pra|pro|para|em|no)\s+(?:de|do|da|no|na|em)\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi, '').trim();
                d.description = d.description.replace(/\b(comece|começar|comecar|começando|comecando|iniciando|iniciar|a\s+partir)\b/gi, '').trim();
                if (/^([aá]gua|conta\s+(?:de\s+)?[aá]gua)$/i.test(d.description)) d.description = 'Conta de Água';
                if (/^(luz|energia|conta\s+(?:de\s+)?luz)$/i.test(d.description)) d.description = 'Conta de Luz';
                if (/^(g[aá]s|conta\s+(?:de\s+)?g[aá]s)$/i.test(d.description)) d.description = 'Gás';
                if (/^(internet|wifi)$/i.test(d.description)) d.description = 'Internet';
              }
            } else if (actionType === 'settle_transaction') {
              const d = actionObj.data;
              const targetPending = (window.db ? window.db.getTransactions() : []).find(t => t.id === d.id);
              if (targetPending) {
                const origAmt = parseFloat(targetPending.amount) || 0;
                const paidAmt = parseFloat(d.amount) || origAmt;
                if (paidAmt < origAmt - 0.001) {
                  d.isPartial = true;
                  d.originalAmount = origAmt;
                  d.remainingAmount = Math.round((origAmt - paidAmt) * 100) / 100;
                }
              }
            }

            actionCard = {
              action: actionType,
              data: actionObj.data,
              confirmed: false
            };
          }
        } catch (e) {
          console.error('Falha ao interpretar JSON de ação do Groq:', e);
        }
      }

      // Remove bloco de código cru do texto visível
      cleanText = cleanText.replace(/```(?:action|json)?[\s\S]*?```/gi, '').trim();

      // Se o Groq não produziu o card, usa o motor local como garantia 100% infalível
      if (!actionCard) {
        if (this.isAppointmentText(userText)) {
          const localApp = this.extractAppointmentDetails(userText);
          if (localApp) {
            actionCard = {
              action: 'create_appointment',
              data: localApp,
              confirmed: false
            };
          }
        }

        if (!actionCard) {
          const localTx = this.extractTransactionDetails(userText);
          if (localTx) {
            actionCard = {
              action: 'create_transaction',
              data: localTx,
              confirmed: false
            };
          } else {
            const localApp = this.extractAppointmentDetails(userText);
            if (localApp) {
              actionCard = {
                action: 'create_appointment',
                data: localApp,
                confirmed: false
              };
            }
          }
        }
      }

      // Se o texto ficou vazio ou só com resquício de thinking process
      if (!cleanText || cleanText.length < 3 || /here'?s a thinking process/i.test(cleanText)) {
        if (actionCard && actionCard.data) {
          if (actionCard.action === 'create_transaction') {
            const typeLabel = actionCard.data.type === 'income' ? 'Receita' : 'Despesa';
            cleanText = `💰 Identifiquei o lançamento de uma **${typeLabel}**:`;
          } else if (actionCard.action === 'create_appointment') {
            cleanText = `📅 Identifiquei um compromisso para sua agenda:`;
          }
        } else {
          cleanText = `Entendi seu pedido! Como posso ajudar a concluir este lançamento?`;
        }
      }

      window.db.addChatMessage({
        sender: 'bot',
        text: cleanText,
        actionCard: actionCard
      });

    } catch (error) {
      const el = document.getElementById(typingId);
      if (el) el.remove();

      console.warn('Groq API error, caindo suavemente para o motor NLP local:', error);
      if (error.message && (error.message.includes('API key') || error.message.includes('401'))) {
        window.db.addChatMessage({
          sender: 'bot',
          text: `⚠️ Verifique sua chave da API do Groq nas Configurações. Ativando o motor local inteligente...`
        });
      }
      // Fallback para motor local
      this.processWithLocalNLP(userText);
    }
  }

  // Executa a ação sugerida pelo card do chat quando o usuário clica em "Confirmar"
  confirmAction(actionCard, msgId) {
    if (!actionCard || !actionCard.data) return;

    if (actionCard.action === 'create_transaction') {
      const data = actionCard.data;
      if (data.installments && parseInt(data.installments) > 1) {
        window.finance.createInstallments(data, data.installments);
      } else {
        window.db.addTransaction(data);
      }
      if (window.confetti) {
        window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
      }
    } else if (actionCard.action === 'create_appointment') {
      window.db.addAppointment(actionCard.data);
      if (window.confetti) {
        window.confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
      }
    } else if (actionCard.action === 'settle_transaction') {
      const id = actionCard.data.id;
      window.finance.settleTransaction(id, {
        paidAmount: actionCard.data.amount,
        date: actionCard.data.date,
        paymentMethod: actionCard.data.paymentMethod
      });
      if (window.confetti) {
        window.confetti({ particleCount: 60, spread: 70, origin: { y: 0.8 } });
      }
    } else if (actionCard.action === 'create_note') {
      window.db.addNote(actionCard.data);
    }

    // Atualiza status do card para confirmado
    const messages = window.db.getChatMessages();
    const target = messages.find(m => m.id === msgId);
    if (target && target.actionCard) {
      target.actionCard.confirmed = true;
      window.db.saveChatMessages(messages);
      window.db.notify('chat_updated');
    }
  }
}

window.chatNLP = new ChatNLPModule();
