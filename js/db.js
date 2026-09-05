// Camada de Banco de Dados Local (LocalStorage com Barramento Reativo) - FinControl Pro

const DB_KEYS = {
  TRANSACTIONS: 'fincontrol_transactions_v1',
  APPOINTMENTS: 'fincontrol_appointments_v1',
  NOTES: 'fincontrol_notes_v1',
  CHAT_MESSAGES: 'fincontrol_chat_messages_v1',
  SETTINGS: 'fincontrol_settings_v1'
};

class Database {
  constructor() {
    this.listeners = [];
    this.initDefaults();
  }

  // Registra ouvinte para atualiza��es no banco
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify(event, payload) {
    this.listeners.forEach(cb => {
      try {
        cb(event, payload);
      } catch (err) {
        console.error('Error in db subscriber:', err);
      }
    });
  }

  // Inicializa configurações padrão caso não existam
  initDefaults() {
    if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
      const defaultSettings = {
        groqApiKey: '',
        groqModel: 'llama-3.1-8b-instant',
        currency: 'BRL',
        userName: 'Usuário',
        theme: 'dark',
        autoBackup: true,
        includeOverdueInMetrics: true,
        dailyNotificationEnabled: true,
        dailyNotificationTime: '08:00',
        appointmentReminderEnabled: true
      };
      this.setSettings(defaultSettings);
    }

    // Aplicativo não carrega mais dados de demonstração automaticamente.
    if (!localStorage.getItem('fincontrol_initialized')) {
      localStorage.setItem('fincontrol_initialized', 'true');
    }
  }

  // --- Transações Financeiras ---
  getTransactions() {
    try {
      const data = localStorage.getItem(DB_KEYS.TRANSACTIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveTransactions(transactions) {
    localStorage.setItem(DB_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    this.notify('transactions_updated', transactions);
  }

  // Obtém URL do servidor backend PostgreSQL se configurado
  getApiUrl() {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && !window.location.protocol.startsWith('file')) {
        return `${window.location.origin}/api`;
      }
    }
    return 'http://76.13.163.214/api';
  }

  // Sincroniza todos os dados com o banco de dados PostgreSQL na VPS
  async syncWithServer() {
    const apiUrl = this.getApiUrl();
    if (!apiUrl) return { success: false, message: 'Nenhuma URL de servidor PostgreSQL configurada.' };

    try {
      const healthResp = await fetch(`${apiUrl}/health`, { method: 'GET' });
      if (!healthResp.ok) throw new Error(`Servidor retornou HTTP ${healthResp.status}`);
      const healthData = await healthResp.json();

      // Busca transações
      const txResp = await fetch(`${apiUrl}/transactions`);
      if (txResp.ok) {
        const serverTx = await txResp.json();
        if (Array.isArray(serverTx)) {
          localStorage.setItem(DB_KEYS.TRANSACTIONS, JSON.stringify(serverTx));
          this.notify('transactions_updated', serverTx);
        }
      }

      // Busca compromissos
      const appResp = await fetch(`${apiUrl}/appointments`);
      if (appResp.ok) {
        const serverApp = await appResp.json();
        if (Array.isArray(serverApp)) {
          localStorage.setItem(DB_KEYS.APPOINTMENTS, JSON.stringify(serverApp));
          this.notify('appointments_updated', serverApp);
        }
      }

      // Busca anotações
      const noteResp = await fetch(`${apiUrl}/notes`);
      if (noteResp.ok) {
        const serverNotes = await noteResp.json();
        if (Array.isArray(serverNotes)) {
          localStorage.setItem(DB_KEYS.NOTES, JSON.stringify(serverNotes));
          this.notify('notes_updated', serverNotes);
        }
      }

      // Busca configurações da VPS (PIN, Groq API, Pluggy items, etc)
      const settingsResp = await fetch(`${apiUrl}/settings`);
      if (settingsResp.ok) {
        const serverSettings = await settingsResp.json();
        if (serverSettings && typeof serverSettings === 'object') {
          const current = this.getSettings();
          const merged = { ...current };
          // Mescla campos do servidor que existam e não sejam vazios
          if (serverSettings.groqApiKey) merged.groqApiKey = serverSettings.groqApiKey;
          if (serverSettings.groqModel) merged.groqModel = serverSettings.groqModel;
          if (serverSettings.userName) merged.userName = serverSettings.userName;
          if (serverSettings.autolockMinutes !== undefined) merged.autolockMinutes = serverSettings.autolockMinutes;
          if (serverSettings.mercadoPagoToken) merged.mercadoPagoToken = serverSettings.mercadoPagoToken;
          if (serverSettings.auth) merged.auth = serverSettings.auth;
          if (serverSettings.pluggyItems) merged.pluggyItems = serverSettings.pluggyItems;
          if (serverSettings.initialBalance !== undefined) merged.initialBalance = serverSettings.initialBalance;
          localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(merged));
          this.notify('settings_updated', merged);
        }
      }

      return {
        success: true,
        serverInfo: healthData,
        message: 'Dados sincronizados com o PostgreSQL com sucesso!'
      };
    } catch (err) {
      console.warn('Falha na sincroniza��o com PostgreSQL:', err);
      return { success: false, error: err.message };
    }
  }

  addTransaction(tx) {
    const list = this.getTransactions();
    const newTx = {
      id: tx.id || 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: tx.type || 'expense', // 'income' ou 'expense'
      description: tx.description || 'Sem descrição',
      amount: parseFloat(tx.amount) || 0,
      category: tx.category || 'Outros',
      paymentMethod: tx.paymentMethod || 'PIX',
      date: tx.date || new Date().toISOString().split('T')[0],
      dueDate: tx.dueDate || tx.date || new Date().toISOString().split('T')[0],
      status: tx.status || 'paid', // 'paid' ou 'pending'
      installments: tx.installments || 1,
      currentInstallment: tx.currentInstallment || 1,
      notes: tx.notes || '',
      createdAt: new Date().toISOString()
    };

    list.unshift(newTx);
    this.saveTransactions(list);

    // Sincroniza em segundo plano com PostgreSQL se conectado
    const apiUrl = this.getApiUrl();
    if (apiUrl) {
      fetch(`${apiUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTx)
      }).catch(e => console.warn('Sync PostgreSQL error (add):', e));
    }

    return newTx;
  }

  updateTransaction(id, updatedFields) {
    const list = this.getTransactions();
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updatedFields, updatedAt: new Date().toISOString() };
      this.saveTransactions(list);

      const apiUrl = this.getApiUrl();
      if (apiUrl) {
        fetch(`${apiUrl}/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFields)
        }).catch(e => console.warn('Sync PostgreSQL error (update):', e));
      }

      return list[index];
    }
    return null;
  }

  deleteTransaction(id) {
    let list = this.getTransactions();
    list = list.filter(item => item.id !== id);
    this.saveTransactions(list);

    const apiUrl = this.getApiUrl();
    if (apiUrl) {
      fetch(`${apiUrl}/transactions/${id}`, {
        method: 'DELETE'
      }).catch(e => console.warn('Sync PostgreSQL error (delete):', e));
    }
  }

  // --- Agenda / Compromissos ---
  getAppointments() {
    try {
      const data = localStorage.getItem(DB_KEYS.APPOINTMENTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveAppointments(appointments) {
    localStorage.setItem(DB_KEYS.APPOINTMENTS, JSON.stringify(appointments));
    this.notify('appointments_updated', appointments);
  }

  addAppointment(app) {
    const list = this.getAppointments();
    const newApp = {
      id: app.id || 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: app.title || 'Compromisso',
      date: app.date || new Date().toISOString().split('T')[0],
      time: app.time || '09:00',
      endTime: app.endTime || '',
      location: app.location || '',
      notes: app.notes || '',
      cost: parseFloat(app.cost) || 0,
      completed: !!app.completed,
      priority: app.priority || 'medium', // 'low', 'medium', 'high'
      createdAt: new Date().toISOString()
    };
    list.unshift(newApp);
    this.saveAppointments(list);
    return newApp;
  }

  updateAppointment(id, updatedFields) {
    const list = this.getAppointments();
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updatedFields };
      this.saveAppointments(list);
      return list[index];
    }
    return null;
  }

  deleteAppointment(id) {
    let list = this.getAppointments();
    list = list.filter(item => item.id !== id);
    this.saveAppointments(list);
  }

  // --- Anotações ---
  getNotes() {
    try {
      const data = localStorage.getItem(DB_KEYS.NOTES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveNotes(notes) {
    localStorage.setItem(DB_KEYS.NOTES, JSON.stringify(notes));
    this.notify('notes_updated', notes);
  }

  addNote(note) {
    const list = this.getNotes();
    const newNote = {
      id: note.id || 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: note.title || 'Sem título',
      content: note.content || '',
      tag: note.tag || 'Geral',
      color: note.color || '#3b82f6', // cor de destaque
      pinned: !!note.pinned,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.unshift(newNote);
    this.saveNotes(list);
    return newNote;
  }

  updateNote(id, updatedFields) {
    const list = this.getNotes();
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updatedFields, updatedAt: new Date().toISOString() };
      this.saveNotes(list);
      return list[index];
    }
    return null;
  }

  deleteNote(id) {
    let list = this.getNotes();
    list = list.filter(item => item.id !== id);
    this.saveNotes(list);
  }

  // --- Mensagens do Chat ---
  getChatMessages() {
    try {
      const data = localStorage.getItem(DB_KEYS.CHAT_MESSAGES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveChatMessages(msgs) {
    // Guarda as Últimas 60 mensagens
    const trimmed = msgs.slice(-60);
    localStorage.setItem(DB_KEYS.CHAT_MESSAGES, JSON.stringify(trimmed));
  }

  addChatMessage(msg) {
    const list = this.getChatMessages();
    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      sender: msg.sender || 'bot', // 'user' ou 'bot'
      text: msg.text || '',
      actionCard: msg.actionCard || null,
      timestamp: new Date().toISOString()
    };
    list.push(newMsg);
    this.saveChatMessages(list);
    this.notify('chat_updated', newMsg);
    return newMsg;
  }

  clearChat() {
    localStorage.removeItem(DB_KEYS.CHAT_MESSAGES);
    this.notify('chat_cleared');
  }

  // --- Configurações (Groq API, etc) ---
  getSettings() {
    try {
      const data = localStorage.getItem(DB_KEYS.SETTINGS);
      const settings = data ? JSON.parse(data) : {
        groqApiKey: '',
        groqModel: 'llama-3.1-8b-instant',
        userName: 'Usuário',
        serverApiUrl: '',
        pluggyClientId: '050ca994-3522-47e6-8571-d7582767173f',
        pluggyClientSecret: '-kq-NqVfPS7Yt4IxRzHWrTixx2veW03aAvBLyj2OaME',
        pluggyItems: [],
        includeOverdueInMetrics: true,
        dailyNotificationEnabled: true,
        dailyNotificationTime: '08:00',
        appointmentReminderEnabled: true
      };
      
      // Auto-limpa IP offline do banco (evita travamento do navegador)
      if (settings.serverApiUrl && settings.serverApiUrl.includes('76.13.163.214')) {
        settings.serverApiUrl = '';
        try { localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(settings)); } catch (_) {}
      }

      if (!settings.serverApiUrl) settings.serverApiUrl = '';
      if (!settings.pluggyClientId) settings.pluggyClientId = '050ca994-3522-47e6-8571-d7582767173f';
      if (!settings.pluggyClientSecret) settings.pluggyClientSecret = '-kq-NqVfPS7Yt4IxRzHWrTixx2veW03aAvBLyj2OaME';
      if (!settings.pluggyItems) settings.pluggyItems = [];
      if (settings.includeOverdueInMetrics === undefined) settings.includeOverdueInMetrics = true;
      if (settings.dailyNotificationEnabled === undefined) settings.dailyNotificationEnabled = true;
      if (!settings.dailyNotificationTime) settings.dailyNotificationTime = '08:00';
      if (settings.appointmentReminderEnabled === undefined) settings.appointmentReminderEnabled = true;
      // Auto-migra modelo obsoleto ou inacess�vel no plano gratuito
      if (!settings.groqModel || settings.groqModel === 'llama-3.3-70b-versatile') {
        settings.groqModel = 'llama-3.1-8b-instant';
        try { localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(settings)); } catch (_) {}
      }
      return settings;
    } catch (e) {
      return { 
        groqApiKey: '', 
        groqModel: 'llama-3.1-8b-instant', 
        userName: 'Usuário', 
        serverApiUrl: '',
        pluggyClientId: '050ca994-3522-47e6-8571-d7582767173f',
        pluggyClientSecret: '-kq-NqVfPS7Yt4IxRzHWrTixx2veW03aAvBLyj2OaME',
        pluggyItems: [],
        includeOverdueInMetrics: true,
        dailyNotificationEnabled: true,
        dailyNotificationTime: '08:00',
        appointmentReminderEnabled: true
      };
    }
  }

  setSettings(newSettings) {
    const current = this.getSettings();
    const merged = { ...current, ...newSettings };
    localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(merged));
    this.notify('settings_updated', merged);

    // Envia configurações para a VPS em segundo plano
    const apiUrl = this.getApiUrl();
    if (apiUrl) {
      fetch(`${apiUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: merged.userName,
          groqApiKey: merged.groqApiKey,
          groqModel: merged.groqModel,
          autolockMinutes: merged.autolockMinutes,
          mercadoPagoToken: merged.mercadoPagoToken,
          auth: merged.auth,
          pluggyItems: merged.pluggyItems,
          pluggyClientId: merged.pluggyClientId,
          pluggyClientSecret: merged.pluggyClientSecret,
          initialBalance: merged.initialBalance,
          includeOverdueInMetrics: merged.includeOverdueInMetrics,
          dailyNotificationEnabled: merged.dailyNotificationEnabled,
          dailyNotificationTime: merged.dailyNotificationTime,
          appointmentReminderEnabled: merged.appointmentReminderEnabled
        })
      }).catch(e => console.warn('Sync settings to VPS error:', e));
    }

    return merged;
  }

  // --- Exportar / Importar / Resetar ---
  exportAll() {
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      transactions: this.getTransactions(),
      appointments: this.getAppointments(),
      notes: this.getNotes(),
      settings: this.getSettings(),
      chat: this.getChatMessages()
    };
  }

  importAll(data) {
    if (!data) return false;
    this._isImporting = true;
    if (Array.isArray(data.transactions)) {
      localStorage.setItem(DB_KEYS.TRANSACTIONS, JSON.stringify(data.transactions));
      this.notify('transactions_updated', data.transactions);
    }
    if (Array.isArray(data.appointments)) {
      localStorage.setItem(DB_KEYS.APPOINTMENTS, JSON.stringify(data.appointments));
      this.notify('appointments_updated', data.appointments);
    }
    if (Array.isArray(data.notes)) {
      localStorage.setItem(DB_KEYS.NOTES, JSON.stringify(data.notes));
      this.notify('notes_updated', data.notes);
    }
    if (Array.isArray(data.chat)) {
      localStorage.setItem(DB_KEYS.CHAT_MESSAGES, JSON.stringify(data.chat));
    }
    if (data.settings) {
      localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(data.settings));
      this.notify('settings_updated', data.settings);
    }
    this.notify('data_imported');
    this._isImporting = false;
    return true;
  }

  loadDemoData(overwrite = true) {
    const today = new Date().toISOString().split('T')[0];
    const d = new Date();
    
    // Mês atual formatado
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    
    const demoTransactions = [
      {
        id: 'tx_demo_1',
        type: 'income',
        description: 'Salário Mensal',
        amount: 5800.00,
        category: 'Salário',
        paymentMethod: 'Transferência',
        date: `${year}-${month}-05`,
        dueDate: `${year}-${month}-05`,
        status: 'paid',
        installments: 1,
        currentInstallment: 1
      },
      {
        id: 'tx_demo_2',
        type: 'expense',
        description: 'Aluguel do Apartamento',
        amount: 1450.00,
        category: 'Moradia',
        paymentMethod: 'PIX',
        date: `${year}-${month}-10`,
        dueDate: `${year}-${month}-10`,
        status: 'paid',
        installments: 1,
        currentInstallment: 1
      },
      {
        id: 'tx_demo_3',
        type: 'expense',
        description: 'Supermercado Mensal',
        amount: 680.50,
        category: 'Alimentação',
        paymentMethod: 'Cartão de Crédito',
        date: `${year}-${month}-12`,
        dueDate: `${year}-${month}-12`,
        status: 'paid',
        installments: 1,
        currentInstallment: 1
      },
      {
        id: 'tx_demo_4',
        type: 'income',
        description: 'Projeto Freelance Web',
        amount: 1200.00,
        category: 'Serviços',
        paymentMethod: 'PIX',
        date: `${year}-${month}-18`,
        dueDate: `${year}-${month}-18`,
        status: 'paid',
        installments: 1,
        currentInstallment: 1
      },
      {
        id: 'tx_demo_5',
        type: 'expense',
        description: 'Combustível Posto Ipiranga',
        amount: 220.00,
        category: 'Transporte',
        paymentMethod: 'Cartão de Débito',
        date: `${year}-${month}-20`,
        dueDate: `${year}-${month}-20`,
        status: 'paid',
        installments: 1,
        currentInstallment: 1
      },
      {
        id: 'tx_demo_6',
        type: 'expense',
        description: 'Internet Fibra 500MB',
        amount: 129.90,
        category: 'Moradia',
        paymentMethod: 'Boleto',
        date: `${year}-${month}-25`,
        dueDate: `${year}-${month}-25`,
        status: 'pending',
        installments: 1,
        currentInstallment: 1
      },
      {
        id: 'tx_demo_7',
        type: 'expense',
        description: 'Jantar Restaurante Italiano',
        amount: 175.00,
        category: 'Lazer',
        paymentMethod: 'Cartão de Crédito',
        date: today,
        dueDate: today,
        status: 'paid',
        installments: 1,
        currentInstallment: 1
      }
    ];

    const demoAppointments = [
      {
        id: 'app_demo_1',
        title: 'Consulta Médica de Rotina',
        date: today,
        time: '14:30',
        endTime: '15:30',
        location: 'Clínica Vida Bem',
        cost: 250.00,
        completed: false,
        priority: 'high'
      },
      {
        id: 'app_demo_2',
        title: 'Reunião de Planejamento Financeiro',
        date: today,
        time: '17:00',
        endTime: '18:00',
        location: 'Google Meet',
        cost: 0,
        completed: false,
        priority: 'medium'
      },
      {
        id: 'app_demo_3',
        title: 'Revis�o do Carro',
        date: `${year}-${month}-28`,
        time: '08:30',
        endTime: '11:00',
        location: 'Oficina Central',
        cost: 380.00,
        completed: false,
        priority: 'medium'
      }
    ];

    const demoNotes = [
      {
        id: 'note_demo_1',
        title: 'Metas Financeiras do Ano',
        content: '1. Guardar R$ 10.000 na reserva de emergência\n2. Reduzir gastos com delivery aos finais de semana\n3. Iniciar aporte mensal em Tesouro Selic.',
        tag: 'Finanças',
        color: '#10b981',
        pinned: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'note_demo_2',
        title: 'Lista de Compras para o Escritório',
        content: '- Segundo monitor 27 polegadas\n- Suporte articulado para notebook\n- Teclado mecânico silencioso',
        tag: 'Ideias',
        color: '#8b5cf6',
        pinned: false,
        createdAt: new Date().toISOString()
      }
    ];

    if (overwrite) {
      this.saveTransactions(demoTransactions);
      this.saveAppointments(demoAppointments);
      this.saveNotes(demoNotes);
    }
  }

  async clearAll() {
    localStorage.setItem('fincontrol_initialized', 'true');
    this.saveTransactions([]);
    this.saveAppointments([]);
    this.saveNotes([]);
    localStorage.setItem(DB_KEYS.CHAT_MESSAGES, '[]');
    this.notify('all_cleared');

    // Se estiver conectado ao PostgreSQL, limpa também no servidor PostgreSQL da VPS
    const apiUrl = this.getApiUrl();
    if (apiUrl) {
      try {
        // 1. Limpa transações do PostgreSQL
        const txResp = await fetch(`${apiUrl}/transactions`).catch(() => null);
        if (txResp && txResp.ok) {
          const txs = await txResp.json().catch(() => []);
          if (Array.isArray(txs) && txs.length > 0) {
            await Promise.all(txs.map(t => fetch(`${apiUrl}/transactions/${t.id}`, { method: 'DELETE' }).catch(() => {})));
          }
        }

        // 2. Limpa compromissos do PostgreSQL
        const appResp = await fetch(`${apiUrl}/appointments`).catch(() => null);
        if (appResp && appResp.ok) {
          const apps = await appResp.json().catch(() => []);
          if (Array.isArray(apps) && apps.length > 0) {
            await Promise.all(apps.map(a => fetch(`${apiUrl}/appointments/${a.id}`, { method: 'DELETE' }).catch(() => {})));
          }
        }

        // 3. Limpa anotações do PostgreSQL
        const noteResp = await fetch(`${apiUrl}/notes`).catch(() => null);
        if (noteResp && noteResp.ok) {
          const notes = await noteResp.json().catch(() => []);
          if (Array.isArray(notes) && notes.length > 0) {
            await Promise.all(notes.map(n => fetch(`${apiUrl}/notes/${n.id}`, { method: 'DELETE' }).catch(() => {})));
          }
        }
      } catch (e) {
        console.warn('Erro ao limpar dados no PostgreSQL:', e);
      }
    }
  }
}

// Instância global do banco de dados
window.db = new Database();
