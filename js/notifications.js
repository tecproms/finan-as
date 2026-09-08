// Módulo de Notificações Nativas e Lembretes Diários - FinControl Pro

class NotificationManager {
  constructor() {
    this.checkInterval = null;
    this.init();
  }

  init() {
    this.startScheduler();
    this.bindEvents();
  }

  isSupported() {
    return (typeof window !== 'undefined' && 'Notification' in window);
  }

  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    return window.Notification.permission; // 'default', 'granted', 'denied'
  }

  // Solicita permissão nativa para exibir notificações
  async requestPermission() {
    if (!this.isSupported()) {
      alert('Seu navegador não suporta notificações nativas da Web.');
      return false;
    }

    try {
      const permission = await window.Notification.requestPermission();
      this.updateUI();

      if (permission === 'granted') {
        // Envia notifica��o imediata de confirma��o
        this.sendNotification(
          '?? Notificações Ativadas!',
          {
            body: 'O FinControl Pro agora vai te avisar diariamente sobre contas a pagar, valores a receber e compromissos da agenda.',
            icon: './icons/icon-192.png',
            tag: 'welcome-notification'
          }
        );
        return true;
      } else if (permission === 'denied') {
        alert('As notificações foram bloqueadas nas configurações do seu navegador. Para ativar, clique no cadeado ao lado do endereço do site e permita as notificações.');
        return false;
      }
      return false;
    } catch (e) {
      console.warn('Erro ao solicitar permissão de notifica��o:', e);
      return false;
    }
  }

  // Dispara uma notifica��o nativa (via Service Worker se dispon�vel ou Notification API direta)
  async sendNotification(title, options = {}) {
    if (this.getPermission() !== 'granted') return false;

    const defaultOptions = {
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: './index.html' },
      ...options
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, defaultOptions);
          return true;
        }
      }
      if (typeof window.Notification === 'function') {
        new window.Notification(title, defaultOptions);
        return true;
      }
      return false;
    } catch (err) {
      try {
        if (typeof window.Notification === 'function') {
          new window.Notification(title, defaultOptions);
          return true;
        }
      } catch (e) {
        console.warn('Falha ao enviar notifica��o nativa:', e);
        return false;
      }
      return false;
    }
  }

  // Obt�m os dados consolidados do dia para montar o resumo
  getDailyDigestData() {
    const today = new Date().toISOString().split('T')[0];
    const transactions = window.db ? window.db.getTransactions() : [];
    const appointments = window.agenda ? window.db.getAppointments() : [];

    // Contas a pagar hoje ou em atraso
    const pendingExpenses = transactions.filter(t => 
      t.type === 'expense' && 
      t.status === 'pending' && 
      t.date && t.date <= today
    );
    const dueTodayExpenses = pendingExpenses.filter(t => t.date === today);
    const overdueExpenses = pendingExpenses.filter(t => t.date < today);
    const totalExpenseAmount = pendingExpenses.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    // Contas a receber hoje ou pendentes
    const pendingIncomes = transactions.filter(t => 
      t.type === 'income' && 
      t.status === 'pending' && 
      t.date && t.date <= today
    );
    const totalIncomeAmount = pendingIncomes.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    // Compromissos da agenda hoje não concluídos
    const todayAppointments = appointments.filter(a => 
      a.date === today && !a.completed
    ).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    return {
      today,
      pendingExpenses,
      dueTodayExpenses,
      overdueExpenses,
      totalExpenseAmount,
      pendingIncomes,
      totalIncomeAmount,
      todayAppointments
    };
  }

  getStorageItem(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (_) { return null; }
  }

  setStorageItem(key, val) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, val);
    } catch (_) {}
  }

  getSessionItem(key) {
    try {
      return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
    } catch (_) { return null; }
  }

  setSessionItem(key, val) {
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(key, val);
    } catch (_) {}
  }

  // Envia o resumo diário
  async sendDailyDigest() {
    const data = this.getDailyDigestData();
    const moneyFmt = (window.finance && window.finance.formatMoney) ? window.finance.formatMoney : (val => `R$ ${parseFloat(val).toFixed(2)}`);

    const parts = [];

    if (data.pendingExpenses.length > 0) {
      const label = data.overdueExpenses.length > 0 ? `${data.pendingExpenses.length} a pagar (${data.overdueExpenses.length} atrasadas)` : `${data.pendingExpenses.length} a pagar`;
      parts.push(`?? ${label}: ${moneyFmt(data.totalExpenseAmount)}`);
    }

    if (data.pendingIncomes.length > 0) {
      parts.push(`?? ${data.pendingIncomes.length} a receber: ${moneyFmt(data.totalIncomeAmount)}`);
    }

    if (data.todayAppointments.length > 0) {
      const firstApp = data.todayAppointments[0];
      parts.push(`?? ${data.todayAppointments.length} compromisso(s) (1� às ${firstApp.time}: ${firstApp.title})`);
    }

    let title = '?? Resumo do Dia é FinControl Pro';
    let body = '';

    if (parts.length === 0) {
      body = 'Tudo em dia por hoje! Nenhuma conta pendente ou compromisso agendado. Bom proveito!';
    } else {
      body = parts.join(' é ') + '. Clique para conferir.';
    }

    const sent = await this.sendNotification(title, {
      body: body,
      tag: `daily-digest-${data.today}`,
      renotify: true
    });

    // Envia também via WhatsApp através do Whaticket se configurado
    const waService = window.whaticketService || window.evolutionService;
    if (waService) {
      try {
        await waService.sendDailyDigestWhatsApp(data);
      } catch (waErr) {
        console.warn('Falha ao enviar resumo pelo WhatsApp:', waErr);
      }
    }

    if (sent || (waService && waService.getConfig().userPhone)) {
      this.setStorageItem('fincontrol_last_daily_notification', data.today);
    }
    return sent;
  }

  // Disparo manual para teste imediato
  async testNotification() {
    const perm = this.getPermission();
    if (perm !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        // Se permissão do navegador foi negada mas tem WhatsApp, envia pelo WhatsApp
        const waService = window.whaticketService || window.evolutionService;
        if (waService && waService.getConfig().userPhone) {
          return this.sendDailyDigest();
        }
        return false;
      }
    }

    return this.sendDailyDigest();
  }

  // Verifica se chegou o horário programado do resumo diário
  checkScheduledDailyDigest() {
    const settings = window.db ? window.db.getSettings() : {};
    const waService = window.whaticketService || window.evolutionService;
    const waConfig = waService ? waService.getConfig() : null;
    const hasWhatsAppSummary = waConfig && waConfig.notifySummary && waConfig.userPhone;

    if (settings.dailyNotificationEnabled === false && !hasWhatsAppSummary) return;
    if (this.getPermission() !== 'granted' && !hasWhatsAppSummary) return;

    const today = new Date().toISOString().split('T')[0];
    const lastSent = this.getStorageItem('fincontrol_last_daily_notification');
    if (lastSent === today) return; // Já enviou hoje

    const scheduledTime = settings.dailyNotificationTime || '08:00';
    const [targetHour, targetMinute] = scheduledTime.split(':').map(Number);

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Se já passou ou atingiu o horário agendado, dispara
    if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute)) {
      this.sendDailyDigest();
    }
  }

  // Verifica compromissos da agenda que vão ocorrer nos próximos 15 minutos
  checkUpcomingAppointments() {
    const settings = window.db ? window.db.getSettings() : {};
    const waService = window.whaticketService || window.evolutionService;
    const waConfig = waService ? waService.getConfig() : null;
    const hasWhatsAppReminders = waConfig && waConfig.notifyAppointments && waConfig.userPhone;

    if (settings.appointmentReminderEnabled === false && !hasWhatsAppReminders) return;
    if (this.getPermission() !== 'granted' && !hasWhatsAppReminders) return;

    if (!window.agenda) return;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMinutesOfDay = now.getHours() * 60 + now.getMinutes();

    const appointments = window.db.getAppointments();
    appointments.forEach(app => {
      if (app.date === today && !app.completed && app.time) {
        const parts = app.time.split(':').map(Number);
        const appMinutes = parts[0] * 60 + (parts[1] || 0);
        const diff = appMinutes - currentMinutesOfDay;

        // Avisa se faltar entre 0 e 15 minutos e ainda não tiver avisado nesta sessão
        const alertedKey = `notified_app_${app.id}_${today}`;
        if (diff >= 0 && diff <= 15 && !this.getSessionItem(alertedKey)) {
          this.setSessionItem(alertedKey, 'true');
          const timeDesc = diff === 0 ? 'acontecendo agora' : `em ${diff} minuto(s)`;
          
          // Notificação no navegador
          this.sendNotification(
            `🔔 Compromisso ${timeDesc}!`,
            {
              body: `${app.title} às ${app.time}${app.location ? ' • ' + app.location : ''}`,
              tag: `app-${app.id}`
            }
          );

          // Lembrete no WhatsApp
          if (waService && hasWhatsAppReminders) {
            waService.sendAppointmentReminderWhatsApp(app, diff);
          }
        }
      }
    });
  }

  // Inicia o temporizador de verificação a cada 60 segundos
  startScheduler() {
    if (this.checkInterval) clearInterval(this.checkInterval);

    // Verificação inicial rápida
    setTimeout(() => {
      this.checkScheduledDailyDigest();
      this.checkUpcomingAppointments();
      this.updateUI();
    }, 2500);

    // Ciclo constante a cada 1 minuto
    this.checkInterval = setInterval(() => {
      this.checkScheduledDailyDigest();
      this.checkUpcomingAppointments();
    }, 60000);
  }

  bindEvents() {
    // Ao voltar para a tela/aba do aplicativo, checa imediatamente
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkScheduledDailyDigest();
        this.checkUpcomingAppointments();
        this.updateUI();
      }
    });
  }

  // Atualiza indicadores visuais da interface (botão de sino e badge)
  updateUI() {
    const perm = this.getPermission();
    const badge = document.getElementById('notif-status-badge');
    const headerDot = document.getElementById('header-bell-dot');
    const btnRequest = document.getElementById('btn-request-notifications');

    if (badge) {
      if (perm === 'granted') {
        badge.textContent = '?? Ativadas';
        badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else if (perm === 'denied') {
        badge.textContent = '?? Bloqueadas no Navegador';
        badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30';
      } else {
        badge.textContent = '? Não ativadas';
        badge.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-slate-700 text-slate-300';
      }
    }

    if (btnRequest) {
      if (perm === 'granted') {
        btnRequest.classList.add('hidden');
      } else {
        btnRequest.classList.remove('hidden');
      }
    }

    if (headerDot) {
      // Exibe ponto pulsante se ainda não tiver ativado para chamar a atenção
      if (perm !== 'granted') {
        headerDot.classList.remove('hidden');
      } else {
        headerDot.classList.add('hidden');
      }
    }
  }

  // Ao clicar no sino do cabeçalho
  promptPermissionOrOpenSettings() {
    const perm = this.getPermission();
    if (perm === 'granted') {
      if (window.app) window.app.openSettingsModal();
      // Rola suavemente até a seção de notificações no modal
      setTimeout(() => {
        const el = document.getElementById('settings-notif-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      this.requestPermission();
    }
  }
}

// Inicialização Global
window.notifications = new NotificationManager();
