// Serviço de Integração com Whaticket (WhatsApp) - FinControl Pro
// Responsável por envio de mensagens de texto, resumo diário e lembretes de agenda via Whaticket API

class WhaticketService {
  constructor() {
    this.status = 'ready';
  }

  // Obtém configurações salvas
  getConfig() {
    const settings = window.db ? window.db.getSettings() : {};
    const w = settings.whaticket || settings.evolution || {};
    return {
      apiUrl: w.apiUrl || 'https://api-whaticket.bascully.com.br',
      token: w.token || '',
      userPhone: w.userPhone || '5511943137268',
      notifySummary: w.notifySummary !== false,
      notifyAppointments: w.notifyAppointments !== false,
      autoExecuteActions: w.autoExecuteActions !== false
    };
  }

  // Salva configurações
  saveConfig(newConfig) {
    if (!window.db) return;
    const current = this.getConfig();
    const updated = { ...current, ...newConfig };
    window.db.setSettings({ whaticket: updated });
    return updated;
  }

  // Normaliza o número de telefone (remove formatações e garante formato internacional 55...)
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

  // Formata a URL base removendo barras finais
  getBaseUrl(customUrl = null) {
    const config = this.getConfig();
    let url = (customUrl || config.apiUrl || 'https://api-whaticket.bascully.com.br').trim();
    // Se o usuário digitou sem o prefixo api- (ex: whaticket.bascully.com.br), ajusta para api-whaticket
    if (url.includes('whaticket.bascully.com.br') && !url.includes('api-whaticket.bascully.com.br')) {
      url = url.replace('whaticket.bascully.com.br', 'api-whaticket.bascully.com.br');
    }
    // Remove sufixos que o usuário possa ter copiado da documentação
    url = url.replace(/\/api\/messages\/send\/?$/i, '')
             .replace(/\/api\/messages\/?$/i, '')
             .replace(/\/api\/?$/i, '')
             .replace(/\/+$/, '');
    return url;
  }

  // Envia mensagem de texto via Whaticket API
  async sendTextMessage(targetPhone, textMessage) {
    const config = this.getConfig();
    const cleanNumber = this.cleanPhone(targetPhone || config.userPhone);

    if (!cleanNumber) {
      return { success: false, message: 'Número de telefone do WhatsApp não configurado!' };
    }
    if (!textMessage) {
      return { success: false, message: 'Mensagem vazia!' };
    }

    const token = config.token ? config.token.trim() : '';
    const baseUrl = this.getBaseUrl();
    const endpoint = `${baseUrl}/api/messages/send`;

    // 1. Tenta enviar via endpoint proxy do servidor backend (evita bloqueios de CORS no navegador)
    try {
      const apiUrl = (window.db && window.db.getApiUrl) ? window.db.getApiUrl() : '/api';
      const proxyResp = await fetch(`${apiUrl}/whaticket/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: cleanNumber,
          body: textMessage,
          token: token,
          targetUrl: endpoint
        })
      });

      if (proxyResp.ok) {
        const proxyJson = await proxyResp.json();
        if (proxyJson.success) {
          return { success: true, data: proxyJson.data };
        } else {
          return {
            success: false,
            message: proxyJson.error || proxyJson.message || 'Erro retornado pela API do Whaticket'
          };
        }
      } else if (proxyResp.status === 404) {
        return {
          success: false,
          message: 'O endpoint do Whaticket ainda não está ativo no seu VPS. Atualize o servidor executando no terminal do VPS:\ncd /www/wwwroot/financeirotechpro && git pull origin main && pm2 restart all'
        };
      }
    } catch (proxyErr) {
      console.warn('[Whaticket] Proxy local não respondeu, tentando envio direto:', proxyErr);
    }

    // 2. Fallback: chamada direta ao Whaticket (se permitido por CORS)
    if (!token) {
      return {
        success: false,
        message: 'Token de autenticação do Whaticket não configurado. Adicione o token nas configurações.'
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          number: cleanNumber,
          body: textMessage
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        const errMsg = data?.message || data?.error || `HTTP ${resp.status}: ${resp.statusText}`;
        return { success: false, message: `Erro ao enviar WhatsApp (${resp.status}): ${errMsg}` };
      }

      return { success: true, data: data };
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return { success: false, message: 'Tempo limite ao enviar mensagem para o Whaticket (timeout).' };
      }
      return { success: false, message: 'Falha de conexão com o Whaticket: ' + fetchErr.message };
    }
  }

  // Envia mensagem de teste
  async sendTestMessage() {
    const config = this.getConfig();
    const phoneInput = document.getElementById('setting-whaticket-phone')?.value.trim();
    const targetPhone = phoneInput || config.userPhone;

    if (!targetPhone) {
      alert('Por favor, preencha o seu número de WhatsApp nas configurações.');
      return { success: false, message: 'Telefone não informado' };
    }

    const testMsg = `🚀 *FinControl Pro • Teste Whaticket*\n\nSeu assistente financeiro no WhatsApp via *Whaticket* está *conectado e pronto*!\n\nPor aqui você receberá:\n• ☀️ Resumo matinal de contas e compromissos\n• ⏰ Lembretes 15 min antes da agenda`;

    return await this.sendTextMessage(targetPhone, testMsg);
  }

  // Envia o Resumo Diário Matinal via WhatsApp
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

    msg += `━━━━━━━━━━━━━━━━━━━━\n_FinControl Pro • Gestão Financeira Inteligente_`;

    const res = await this.sendTextMessage(config.userPhone, msg);
    return res.success;
  }

  // Envia Lembrete de Compromisso da Agenda (15 min antes) via WhatsApp
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
}

// Instância global do Whaticket Service
window.whaticketService = new WhaticketService();
// Alias para manter compatibilidade com chamadas legadas
window.evolutionService = window.whaticketService;
