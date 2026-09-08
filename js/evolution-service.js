// Serviço de Integração com Evolution API (WhatsApp) - FinControl Pro
// Suporta Evolution API v1 e v2 (Conexão QR Code, Notificações, Lembretes e Chatbot Financeiro)

class EvolutionService {
  constructor() {
    this.status = 'disconnected'; // 'connected', 'connecting', 'disconnected', 'error'
    this.pollingInterval = null;
  }

  // Obtém configurações salvas
  getConfig() {
    const settings = window.db ? window.db.getSettings() : {};
    const evo = settings.evolution || {};
    return {
      apiUrl: evo.apiUrl || 'https://api.bascully.com.br',
      apiKey: evo.apiKey || 'MudeParaUmaSenhaForte123',
      instanceName: evo.instanceName || 'financeiro5',
      userPhone: evo.userPhone || '5511943137268',
      notifySummary: evo.notifySummary !== false,
      notifyAppointments: evo.notifyAppointments !== false,
      autoExecuteActions: evo.autoExecuteActions !== false
    };
  }

  // Salva configurações
  saveConfig(newConfig) {
    if (!window.db) return;
    const current = this.getConfig();
    const updated = { ...current, ...newConfig };
    window.db.setSettings({ evolution: updated });
    return updated;
  }

  // Normaliza o número de telefone (remove formatações e garante formato internacional)
  cleanPhone(phone) {
    if (!phone) return '';
    let digits = phone.toString().replace(/\D/g, '');
    if (!digits) return '';
    // Se digitou sem DDI (ex: 11999998888 ou 1188887777), adiciona 55 (Brasil)
    if (digits.length === 10 || digits.length === 11) {
      digits = '55' + digits;
    }
    return digits;
  }

  // Monta os headers de autenticação para a Evolution API
  getHeaders(customApiKey = null) {
    const config = this.getConfig();
    const key = (customApiKey !== null && customApiKey !== undefined && customApiKey !== '') 
      ? customApiKey 
      : (config.apiKey || 'MudeParaUmaSenhaForte123');
    return {
      'Content-Type': 'application/json',
      'apikey': key.trim()
    };
  }

  // Formata a URL base removendo barras finais
  getBaseUrl(customUrl = null) {
    const config = this.getConfig();
    let url = customUrl || config.apiUrl || 'https://api.bascully.com.br';
    return url.trim().replace(/\/+$/, '');
  }

  // Método resiliente de chamada HTTP: usa proxy local primeiro (evita CORS/timeout do browser), fallback direto
  async apiCall(url, method = 'GET', customHeaders = {}, bodyPayload = null) {
    // 1. Tenta via Proxy da API (evita CORS e bloqueios de rede no navegador)
    try {
      const apiUrl = (window.db && window.db.getApiUrl) ? window.db.getApiUrl() : '/api';
      const proxyResp = await fetch(`${apiUrl}/evolution/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          method: method,
          apiKey: customHeaders['apikey'] || this.getConfig().apiKey,
          payload: bodyPayload
        })
      });
      if (proxyResp.ok) {
        const proxyJson = await proxyResp.json();
        if (proxyJson.success) {
          return {
            ok: true,
            status: 200,
            json: async () => proxyJson.data,
            text: async () => JSON.stringify(proxyJson.data)
          };
        } else {
          return {
            ok: false,
            status: 400,
            json: async () => proxyJson,
            text: async () => (proxyJson.error || 'Erro retornado pela Evolution API')
          };
        }
      }
    } catch (proxyErr) {
      console.warn('[Evolution] Proxy local indisponível, tentando chamada direta:', proxyErr);
    }

    // 2. Fallback: chamada direta com timeout de 12 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const options = {
        method: method,
        headers: customHeaders,
        signal: controller.signal
      };
      if (bodyPayload && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(bodyPayload);
      }
      const resp = await fetch(url, options);
      clearTimeout(timeoutId);
      return resp;
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          json: async () => ({ error: 'O tempo limite da operação foi atingido' }),
          text: async () => 'O tempo limite da operação foi atingido'
        };
      }
      throw fetchErr;
    }
  }

  // 1. Verifica estado da conexão com a Evolution API
  async checkConnectionState(customUrl = null, customKey = null, customInstance = null) {
    const baseUrl = this.getBaseUrl(customUrl);
    const config = this.getConfig();
    const instance = (customInstance || config.instanceName || 'teste').trim();
    const headers = this.getHeaders(customKey);

    try {
      const resp = await this.apiCall(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, 'GET', headers);

      if (!resp.ok) {
        if (resp.status === 404) {
          this.status = 'not_found';
          return { connected: false, state: 'not_found', message: 'Instância não criada' };
        }
        return { connected: false, state: 'error', message: `HTTP ${resp.status}: ${resp.statusText}` };
      }

      const data = await resp.json();
      const state = (data.instance && data.instance.state) || data.state || (data.connectionStatus);
      const isConnected = state === 'open' || state === 'connected';

      this.status = isConnected ? 'connected' : (state === 'connecting' ? 'connecting' : 'disconnected');
      return {
        connected: isConnected,
        state: state || 'disconnected',
        raw: data
      };
    } catch (err) {
      console.warn('Erro ao conectar com Evolution API:', err);
      this.status = 'error';
      return {
        connected: false,
        state: 'unreachable',
        message: 'Não foi possível alcançar a Evolution API: ' + err.message
      };
    }
  }

  // 2. Cria ou recria a instância se não existir
  async createInstance(customUrl = null, customKey = null, customInstance = null) {
    const baseUrl = this.getBaseUrl(customUrl);
    const config = this.getConfig();
    const instance = (customInstance || config.instanceName || 'financeiro5').trim();
    const headers = this.getHeaders(customKey);

    const payload = {
      instanceName: instance,
      token: customKey || config.apiKey || '',
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    };

    try {
      const resp = await this.apiCall(`${baseUrl}/instance/create`, 'POST', headers, payload);
      const resData = await resp.json();
      return { success: resp.ok, data: resData, status: resp.status };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 3. Obtém o QR Code para pareamento
  async fetchQrCode(customUrl = null, customKey = null, customInstance = null) {
    const baseUrl = this.getBaseUrl(customUrl);
    const config = this.getConfig();
    const instance = (customInstance || config.instanceName || 'teste').trim();
    const headers = this.getHeaders(customKey);

    try {
      let resp = await this.apiCall(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, 'GET', headers);

      if (resp.status === 404) {
        const createRes = await this.createInstance(baseUrl, customKey, instance);
        if (createRes.success) {
          resp = await this.apiCall(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, 'GET', headers);
        } else {
          return {
            success: false,
            message: `A instância "${instance}" não existe na sua Evolution API.\n\n👉 Acesse o painel Manager (https://api.bascully.com.br/manager) e crie a instância com o nome "${instance}" (Integração: WHATSAPP-BAILEYS). Ou, se preferir, informe a Chave Global Admin da sua Evolution API nas configurações para criar automaticamente.`
          };
        }
      }

      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, message: `Erro ao gerar QR Code (${resp.status}): ${errText}` };
      }

      const data = await resp.json();
      let base64 = data.base64 || (data.qrcode && data.qrcode.base64) || null;
      let pairingCode = data.pairingCode || (data.qrcode && data.qrcode.pairingCode) || null;
      let code = data.code || (data.qrcode && data.qrcode.code) || null;

      return {
        success: true,
        base64: base64,
        pairingCode: pairingCode,
        code: code,
        raw: data
      };
    } catch (err) {
      console.error('Falha ao obter QR Code da Evolution API:', err);
      return { success: false, message: err.message };
    }
  }

  // 4. Desconecta a sessão do WhatsApp
  async logoutInstance() {
    const baseUrl = this.getBaseUrl();
    const config = this.getConfig();
    const instance = (config.instanceName || 'teste').trim();
    const headers = this.getHeaders();

    try {
      const resp = await this.apiCall(`${baseUrl}/instance/logout/${encodeURIComponent(instance)}`, 'DELETE', headers);
      this.status = 'disconnected';
      return { success: resp.ok };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 5. Envia mensagem de texto via WhatsApp
  async sendTextMessage(targetPhone, textMessage) {
    const baseUrl = this.getBaseUrl();
    const config = this.getConfig();
    const instance = (config.instanceName || 'teste').trim();
    const headers = this.getHeaders();

    const cleanNumber = this.cleanPhone(targetPhone || config.userPhone);
    if (!cleanNumber) {
      return { success: false, message: 'Número de telefone do WhatsApp não configurado!' };
    }

    const payload = {
      number: cleanNumber,
      text: textMessage
    };

    try {
      const resp = await this.apiCall(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, 'POST', headers, payload);

      if (!resp.ok) {
        const errBody = await resp.text();
        return { success: false, message: `Erro ao enviar WhatsApp (${resp.status}): ${errBody}` };
      }

      const resData = await resp.json();
      return { success: true, data: resData };
    } catch (err) {
      console.error('Erro ao enviar mensagem WhatsApp:', err);
      return { success: false, message: err.message };
    }
  }

  // 6. Envia mensagem de teste
  async sendTestMessage() {
    const config = this.getConfig();
    const phoneInput = document.getElementById('setting-evolution-phone')?.value.trim();
    const targetPhone = phoneInput || config.userPhone;
    if (!targetPhone) {
      alert('Por favor, preencha o seu número de WhatsApp nas configurações.');
      return false;
    }

    const testMsg = `🚀 *FinControl Pro • Teste de Notificação*\n\nSeu assistente financeiro no WhatsApp está *conectado e pronto*!\n\nPor aqui você receberá:\n• ☀️ Resumo matinal de contas e compromissos\n• ⏰ Lembretes 15 min antes da agenda\n• 💬 Chat financeiro para lançar gastos e consultar saldos`;

    const result = await this.sendTextMessage(targetPhone, testMsg);
    return result;
  }

  // 7. Envia o Resumo Diário Matinal via WhatsApp
  async sendDailyDigestWhatsApp(data = null) {
    const config = this.getConfig();
    if (!config.notifySummary || !config.userPhone) return false;

    if (!data && window.notifications) {
      data = window.notifications.getDailyDigestData();
    }
    if (!data) return false;

    const moneyFmt = (window.finance && window.finance.formatMoney) 
      ? window.finance.formatMoney 
      : (val => `R$ ${parseFloat(val || 0).toFixed(2)}`);

    const dateToday = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

    let msg = `☀️ *BOM DIA! RESUMO DO DIA • FINCONTROL PRO*\n📅 *${dateToday.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Contas a Pagar
    if (data.pendingExpenses && data.pendingExpenses.length > 0) {
      const overdueCount = data.overdueExpenses ? data.overdueExpenses.length : 0;
      msg += `💸 *CONTAS A PAGAR:* ${data.pendingExpenses.length} conta(s)\n`;
      msg += `• *Total a Pagar:* ${moneyFmt(data.totalExpenseAmount)}\n`;
      if (overdueCount > 0) {
        msg += `⚠️ *Atenção:* ${overdueCount} conta(s) em atraso!\n`;
      }
      data.pendingExpenses.slice(0, 3).forEach(tx => {
        msg += `  ▫️ ${tx.description}: ${moneyFmt(tx.amount)}\n`;
      });
      if (data.pendingExpenses.length > 3) {
        msg += `  ▫️ _(+${data.pendingExpenses.length - 3} outra(s))...\n`;
      }
      msg += `\n`;
    } else {
      msg += `💸 *CONTAS A PAGAR:* Nenhuma conta pendente para hoje! 🟢\n\n`;
    }

    // Contas a Receber
    if (data.pendingIncomes && data.pendingIncomes.length > 0) {
      msg += `💰 *VALORES A RECEBER:* ${data.pendingIncomes.length} receita(s)\n`;
      msg += `• *Total a Receber:* ${moneyFmt(data.totalIncomeAmount)}\n`;
      data.pendingIncomes.slice(0, 3).forEach(tx => {
        msg += `  ▫️ ${tx.description}: ${moneyFmt(tx.amount)}\n`;
      });
      msg += `\n`;
    }

    // Compromissos da Agenda
    if (data.todayAppointments && data.todayAppointments.length > 0) {
      msg += `📅 *AGENDA DE HOJE:* ${data.todayAppointments.length} compromisso(s)\n`;
      data.todayAppointments.forEach(app => {
        msg += `• ⏰ *${app.time || '--:--'}* - ${app.title}\n`;
      });
      msg += `\n`;
    } else {
      msg += `📅 *AGENDA:* Nenhum compromisso agendado para hoje.\n\n`;
    }

    // Radar Semanal de Caixa
    if (window.finance && window.finance.getWeeklyRadar) {
      try {
        const radar = window.finance.getWeeklyRadar();
        const thisNetFmt = (radar.thisWeek.net >= 0 ? '+' : '') + moneyFmt(radar.thisWeek.net);
        msg += `🧭 *RADAR DA SEMANA:* Balanço de *${thisNetFmt}* ${radar.thisWeek.net >= 0 ? '🟢' : '🔴'}\n`;
        if (radar.advice && radar.advice.alertMessage) {
          msg += `💡 _${radar.advice.alertMessage}_\n`;
        }
      } catch (_) {}
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n_Responda esta mensagem com suas despesas ou dúvidas a qualquer momento!_ 💬`;

    const res = await this.sendTextMessage(config.userPhone, msg);
    return res.success;
  }

  // 8. Envia Lembrete de Compromisso da Agenda (15 min antes) via WhatsApp
  async sendAppointmentReminderWhatsApp(appointment, diffMinutes = 15) {
    const config = this.getConfig();
    if (!config.notifyAppointments || !config.userPhone) return false;

    const timeDesc = diffMinutes <= 0 ? 'começando agora' : `em cerca de *${diffMinutes} minutos*`;
    const costText = appointment.cost ? `\n💰 *Custo previsto:* R$ ${parseFloat(appointment.cost).toFixed(2)}` : '';
    const noteText = appointment.notes ? `\n📝 *Detalhes:* ${appointment.notes}` : '';

    const msg = `⏰ *LEMBRETE DE COMPROMISSO*\n\nSeu compromisso está ${timeDesc}:\n📌 *${appointment.title}*\n🕒 *Horário:* ${appointment.time || 'Não especificado'}${costText}${noteText}\n\n_FinControl Pro_`;

    const res = await this.sendTextMessage(config.userPhone, msg);
    return res.success;
  }

  // 9. Processa Mensagens Recebidas via WhatsApp (Chatbot com NLP / Groq)
  async processIncomingWhatsAppMessage(incomingText, senderPhone) {
    if (!incomingText || typeof incomingText !== 'string') return null;
    const config = this.getConfig();

    const cleanSender = this.cleanPhone(senderPhone);
    const authorizedPhone = this.cleanPhone(config.userPhone);

    if (authorizedPhone && cleanSender && !cleanSender.endsWith(authorizedPhone.slice(-8))) {
      console.warn(`[Evolution] Mensagem ignorada de remetente não autorizado: ${cleanSender}`);
      return null;
    }

    const trimmed = incomingText.trim();
    if (!trimmed) return null;

    if (window.db) {
      window.db.addChatMessage({
        sender: 'user',
        text: `[WhatsApp] ${trimmed}`
      });
    }

    const lower = trimmed.toLowerCase();
    const moneyFmt = (window.finance && window.finance.formatMoney) 
      ? window.finance.formatMoney 
      : (val => `R$ ${parseFloat(val || 0).toFixed(2)}`);

    let reply = '';

    // A. Consultas de Saldo / Resumo Financeiro
    if (lower.includes('saldo') || lower.includes('quanto tenho') || lower.includes('resumo financeiro')) {
      if (window.finance) {
        const metrics = window.finance.getMonthlyMetrics();
        reply = `📊 *Seu Resumo Financeiro deste Mês:*\n\n` +
          `• 💰 *Receitas Realizadas:* ${moneyFmt(metrics.totalIncome)}\n` +
          `• 💸 *Despesas Pagas:* ${moneyFmt(metrics.totalExpense)}\n` +
          `• ⏳ *A Pagar em Aberto:* ${moneyFmt(metrics.pendingExpense)}\n` +
          `• 🏦 *Saldo Atual:* *${moneyFmt(metrics.currentBalance)}*\n` +
          `• 🎯 *Saldo Previsto no Fim do Mês:* *${moneyFmt(metrics.projectedBalance)}*`;
      }
    }
    // B. Consultas do Radar Semanal
    else if (lower.includes('semana') || lower.includes('vai faltar') || lower.includes('guardar dinheiro') || lower.includes('sobrando') || lower.includes('radar')) {
      if (window.finance && window.finance.getWeeklyRadar) {
        const radar = window.finance.getWeeklyRadar();
        const lastNetFmt = (radar.lastWeek.net >= 0 ? '+' : '') + moneyFmt(radar.lastWeek.net);
        const thisNetFmt = (radar.thisWeek.net >= 0 ? '+' : '') + moneyFmt(radar.thisWeek.net);
        const nextNetFmt = (radar.nextWeek.net >= 0 ? '+' : '') + moneyFmt(radar.nextWeek.net);

        reply = `🧭 *Radar Semanal de Caixa:*\n\n` +
          `• *Semana Passada (${radar.lastWeek.label}):*\n` +
          `  - Entradas: ${moneyFmt(radar.lastWeek.totalIncome)}\n` +
          `  - Despesas: ${moneyFmt(radar.lastWeek.totalExpense)}\n` +
          `  - Balanço: *${lastNetFmt}* ${radar.lastWeek.net >= 0 ? '🟢 (Sobra)' : '🔴 (Déficit)'}\n\n` +
          `• *Semana Atual (${radar.thisWeek.label}):*\n` +
          `  - Entradas Previstas: ${moneyFmt(radar.thisWeek.totalIncome)}\n` +
          `  - Contas Previstas: ${moneyFmt(radar.thisWeek.totalExpense)}\n` +
          `  - Previsão: *${thisNetFmt}* ${radar.thisWeek.net >= 0 ? '🟢 (Sobra)' : '🔴 (Falta)'}\n\n` +
          `• *Próxima Semana (${radar.nextWeek.label}):*\n` +
          `  - Entradas Previstas: ${moneyFmt(radar.nextWeek.totalIncome)}\n` +
          `  - Contas Previstas: ${moneyFmt(radar.nextWeek.totalExpense)}\n` +
          `  - Previsão: *${nextNetFmt}* ${radar.nextWeek.net >= 0 ? '🟢 (Sobra)' : '🔴 (Faltará)'}\n\n` +
          `💡 *Orientação:* ${radar.advice.alertMessage}`;
      }
    }
    // C. Consultas da Agenda
    else if (lower.includes('agenda') || (lower.includes('compromisso') && lower.includes('hoje'))) {
      if (window.agenda) {
        const groups = window.agenda.getGroupedAppointments();
        if (groups.today.length === 0) {
          reply = `📅 Você não tem nenhum compromisso agendado para hoje!`;
        } else {
          const list = groups.today.map(a => `• ⏰ *${a.time || '--:--'}* - ${a.title}`).join('\n');
          reply = `📅 *Seus Compromissos de Hoje:*\n\n${list}`;
        }
      }
    }
    // D. Criação ou Baixa via NLP do FinControl
    else if (window.chatNLP) {
      const txDetected = window.chatNLP.extractTransactionDetails(trimmed);
      if (txDetected) {
        if (config.autoExecuteActions !== false && window.db) {
          window.db.addTransaction({
            type: txDetected.type,
            description: txDetected.description,
            amount: txDetected.amount,
            category: txDetected.category || 'Geral',
            paymentMethod: txDetected.paymentMethod || 'Dinheiro / PIX',
            date: txDetected.date || new Date().toISOString().split('T')[0],
            status: txDetected.status || 'paid'
          });

          const typeIcon = txDetected.type === 'income' ? '💰' : '💸';
          const typeName = txDetected.type === 'income' ? 'Receita' : 'Despesa';
          reply = `✅ *${typeName} Registrada com Sucesso!*\n\n` +
            `• ${typeIcon} *Descrição:* ${txDetected.description}\n` +
            `• 💵 *Valor:* ${moneyFmt(txDetected.amount)}\n` +
            `• 📁 *Categoria:* ${txDetected.category || 'Geral'}\n` +
            `• 📅 *Data:* ${txDetected.date}\n` +
            `• 💳 *Forma:* ${txDetected.paymentMethod || 'PIX'}\n` +
            `• 📌 *Status:* ${txDetected.status === 'paid' ? 'Pago / Concluído ✅' : 'Pendente ⏳'}`;
          
          if (window.app && window.app.renderAll) window.app.renderAll();
        } else {
          reply = `Identifiquei uma nova transação: *${txDetected.description}* de *${moneyFmt(txDetected.amount)}*.`;
        }
      }
      else if (lower.includes('às ') || lower.includes('as ') || lower.includes('amanhã') || lower.includes('amanha')) {
        const dateMatch = window.chatNLP.extractDate(trimmed);
        const timeMatch = window.chatNLP.extractTime(trimmed);

        if (dateMatch && timeMatch) {
          let cleanTitle = trimmed
            .replace(new RegExp(dateMatch.matchText, 'gi'), '')
            .replace(new RegExp(timeMatch.matchText, 'gi'), '')
            .replace(/\b(agendar|marcar|compromisso|lembrete|lembrar de)\b/gi, '')
            .trim();
          if (!cleanTitle) cleanTitle = 'Compromisso';

          if (config.autoExecuteActions !== false && window.db) {
            window.db.addAppointment({
              title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
              date: dateMatch.dateStr,
              time: timeMatch.timeStr,
              cost: 0
            });
            reply = `📅 *Compromisso Agendado com Sucesso!*\n\n` +
              `• 📌 *Título:* ${cleanTitle}\n` +
              `• 🗓️ *Data:* ${dateMatch.dateStr}\n` +
              `• ⏰ *Horário:* ${timeMatch.timeStr}\n\n` +
              `Você receberá um lembrete no WhatsApp 15 minutos antes!`;

            if (window.app && window.app.renderAll) window.app.renderAll();
          }
        }
      }
    }

    if (!reply) {
      reply = `🤖 *Assistente FinControl Pro*\n\nNão consegui entender completamente o comando. Você pode me enviar:\n\n` +
        `• 💸 *"Gastei 45 no almoço hoje no cartão"*\n` +
        `• 💰 *"Recebi 1500 de salário via pix"*\n` +
        `• 📅 *"Dentista amanhã às 14:30"*\n` +
        `• 🏦 *"Qual meu saldo atual?"*\n` +
        `• 🧭 *"Vai faltar dinheiro essa semana?"*`;
    }

    if (window.db) {
      window.db.addChatMessage({
        sender: 'bot',
        text: `[WhatsApp] ${reply}`
      });
    }

    await this.sendTextMessage(senderPhone, reply);
    return reply;
  }
}

// Instância global
window.evolutionService = new EvolutionService();
