// Módulo de Integração Open Finance com Pluggy AI - FinControl Pro
// Suporta Mercado Pago, Nubank, Itaú, Bradesco, Inter, Santander, C6, etc.

class PluggyService {
  constructor() {
    this.apiBase = 'https://api.pluggy.ai';
    this.cdnScriptUrl = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js';
    this.apiKey = null;
    this.apiKeyExpiresAt = 0;
    this.isScriptLoaded = false;
  }

  // Carrega credenciais salvas no banco
  getCredentials() {
    const settings = window.db ? window.db.getSettings() : {};
    return {
      clientId: (settings.pluggyClientId || '050ca994-3522-47e6-8571-d7582767173f').trim(),
      clientSecret: (settings.pluggyClientSecret || '-kq-NqVfPS7Yt4IxRzHWrTixx2veW03aAvBLyj2OaME').trim()
    };
  }

  // Autentica na API da Pluggy e armazena o token de sessão (válido por 2h)
  async getApiKey() {
    const now = Date.now();
    if (this.apiKey && this.apiKeyExpiresAt > now + 60000) {
      return this.apiKey;
    }

    const { clientId, clientSecret } = this.getCredentials();
    if (!clientId || !clientSecret) {
      throw new Error('Credenciais da Pluggy (Client ID e Secret) não configuradas.');
    }

    const resp = await fetch(`${this.apiBase}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `Falha na autenticação com a Pluggy (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    this.apiKey = data.apiKey;
    this.apiKeyExpiresAt = now + (110 * 60 * 1000); // 110 minutos de validade segura
    return this.apiKey;
  }

  // Gera Connect Token para carregar o Widget oficial do Pluggy Connect
  async getConnectToken(options = {}) {
    const apiKey = await this.getApiKey();
    const resp = await fetch(`${this.apiBase}/connect_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify(options)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `Falha ao gerar Connect Token (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    return data.accessToken;
  }

  // Carrega dinamicamente a biblioteca JavaScript do Pluggy Connect no navegador
  loadConnectSDK() {
    if (this.isScriptLoaded && window.PluggyConnect) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src*="pluggy-connect"]`);
      if (existing) {
        this.isScriptLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = this.cdnScriptUrl;
      script.async = true;
      script.onload = () => {
        this.isScriptLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Não foi possível carregar o script do Pluggy Connect.'));
      document.head.appendChild(script);
    });
  }

  // Abre o modal do Pluggy Connect Widget para o usuário conectar o banco
  async openWidget(connectorId = null) {
    try {
      const btn = document.getElementById('btn-pluggy-connect');
      if (btn) btn.disabled = true;

      // 1. Carrega SDK e gera token
      await this.loadConnectSDK();
      const tokenOptions = {};
      if (connectorId) tokenOptions.connectorId = connectorId;
      const connectToken = await this.getConnectToken(tokenOptions);

      if (!window.PluggyConnect) {
        throw new Error('Componente PluggyConnect não inicializou no navegador.');
      }

      // 2. Inicializa Widget com eventos
      const pluggyConnect = new window.PluggyConnect({
        connectToken: connectToken,
        includeSandbox: true,
        onSuccess: async (itemData) => {
          console.log('✅ [Pluggy] Conexão bancária efetuada com sucesso:', itemData);
          const itemId = itemData.item ? itemData.item.id : itemData.id;
          if (itemId) {
            this.saveConnectedItem(itemData.item || { id: itemId });
            await this.syncItem(itemId);
          }
        },
        onError: (error) => {
          console.error('❌ [Pluggy] Erro no widget:', error);
          alert('⚠️ Ocorreu um erro no Pluggy Connect: ' + (error.message || JSON.stringify(error)));
        },
        onClose: () => {
          console.log('ℹ️ [Pluggy] Widget fechado.');
          if (btn) btn.disabled = false;
        }
      });

      pluggyConnect.init();
    } catch (err) {
      console.error('Erro ao abrir Pluggy Connect:', err);
      alert('❌ Falha ao iniciar Pluggy Connect: ' + err.message);
      const btn = document.getElementById('btn-pluggy-connect');
      if (btn) btn.disabled = false;
    }
  }

  // Salva ID da conta/item conectada
  saveConnectedItem(item) {
    const settings = window.db.getSettings();
    const items = settings.pluggyItems || [];
    const exists = items.find(i => i.id === item.id);
    if (!exists) {
      items.push({
        id: item.id,
        connector: item.connector ? item.connector.name : 'Banco Conectado',
        connectedAt: new Date().toISOString()
      });
      window.db.setSettings({ pluggyItems: items });
    }
  }

  // Calibra o saldo inicial do app com base no saldo real do banco
  calibrateBalance(latestBalance) {
    if (latestBalance === null || latestBalance === undefined || !window.finance || !window.db) return;
    const allTx = window.db.getTransactions();
    let totalNet = 0;
    allTx.forEach(tx => {
      if (tx.status === 'paid') {
        const val = parseFloat(tx.amount) || 0;
        if (tx.type === 'income') totalNet += val;
        else totalNet -= val;
      }
    });
    const calibratedInitial = (latestBalance - totalNet).toFixed(2);
    window.db.setSettings({ initialBalance: calibratedInitial });
  }

  // Busca contas e movimentações bancárias para conciliação
  async fetchItemTransactions(itemId) {
    const apiKey = await this.getApiKey();

    // 1. Busca detalhes do item e conector
    const itemResp = await fetch(`${this.apiBase}/items/${itemId}`, {
      headers: { 'X-API-KEY': apiKey }
    });
    const itemData = itemResp.ok ? await itemResp.json() : null;
    const bankName = itemData?.connector?.name || 'Open Finance';

    // 2. Busca contas bancárias vinculadas
    const accountsResp = await fetch(`${this.apiBase}/accounts?itemId=${itemId}`, {
      headers: { 'X-API-KEY': apiKey }
    });

    if (!accountsResp.ok) {
      throw new Error(`Falha ao buscar contas bancárias (HTTP ${accountsResp.status})`);
    }

    const accountsData = await accountsResp.json();
    const accounts = accountsData.results || [];
    let latestBalance = null;
    const rawTransactions = [];

    for (const acc of accounts) {
      if (acc.balance !== undefined && acc.balance !== null) {
        latestBalance = acc.balance;
      }

      // 3. Busca transações da conta via Pluggy v2 (cursor-based pagination)
      let txUrl = `${this.apiBase}/v2/transactions?accountId=${acc.id}`;
      while (txUrl) {
        const txResp = await fetch(txUrl, {
          headers: { 'X-API-KEY': apiKey }
        });

        if (!txResp.ok) {
          console.warn(`[Pluggy v2] Falha ao buscar transações (HTTP ${txResp.status}) na URL: ${txUrl}`);
          break;
        }

        const txData = await txResp.json();
        if (Array.isArray(txData.results)) {
          rawTransactions.push(...txData.results);
        }

        if (txData.next && rawTransactions.length < 2000) {
          txUrl = `${this.apiBase}/v2/transactions${txData.next}`;
        } else {
          txUrl = null;
        }
      }
    }

    const structuredTxs = [];
    const seenKeys = new Set();
    for (const t of rawTransactions) {
      const isExpense = t.type === 'DEBIT' || t.amount < 0;
      const type = isExpense ? 'expense' : 'income';
      const amount = Math.abs(t.amount || 0);
      if (amount === 0) continue;

      const dateStr = t.date ? t.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
      const desc = (t.description || 'Movimentação Bancária').trim();

      const dedupKey = `${dateStr}|${amount.toFixed(2)}|${type}|${desc.toLowerCase()}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      let category = t.category || (isExpense ? 'Outros' : 'Serviços');
      if (desc.toLowerCase().includes('pix') && type === 'income') category = 'Serviços';
      else if (desc.toLowerCase().includes('posto') || desc.toLowerCase().includes('combust')) category = 'Transporte';
      else if (desc.toLowerCase().includes('super') || desc.toLowerCase().includes('mercado')) category = 'Alimentação';

      structuredTxs.push({
        id: `tx_pluggy_${t.id}`,
        type: type,
        description: desc,
        amount: amount,
        category: category,
        paymentMethod: bankName,
        date: dateStr,
        dueDate: dateStr,
        status: 'paid',
        notes: `Sincronizado via Pluggy Open Finance (${bankName})`,
        externalId: `pluggy_${t.id}`
      });
    }

    // 4. Identifica o que já existe no banco de dados local
    const existingTxs = window.db ? window.db.getTransactions() : [];
    const settings = window.db ? window.db.getSettings() : {};
    const existingExtIds = new Set(settings.reconciledExternalIds || []);

    existingTxs.forEach(t => {
      if (t.externalId) existingExtIds.add(t.externalId);
      if (t.notes && t.notes.includes('pluggy_')) {
        const match = t.notes.match(/pluggy_[a-zA-Z0-9\-]+/);
        if (match) existingExtIds.add(match[0]);
      }
    });

    const existingPaidSignatures = new Set(
      existingTxs
        .filter(t => t.status === 'paid')
        .map(t => `${t.date}|${parseFloat(t.amount).toFixed(2)}|${t.type}|${(t.description || '').trim().toLowerCase()}`)
    );

    const unprocessedTxs = [];
    for (const st of structuredTxs) {
      if (existingExtIds.has(st.externalId)) continue;
      const sig = `${st.date}|${st.amount.toFixed(2)}|${st.type}|${st.description.toLowerCase()}`;
      if (existingPaidSignatures.has(sig)) continue;
      unprocessedTxs.push(st);
    }

    // 5. Cruza com as contas pendentes para sugerir conciliação inteligente
    const pendingTxs = existingTxs.filter(t => t.status === 'pending');
    const matchedPendingIds = new Set();

    const candidates = unprocessedTxs.map(cand => {
      let bestMatch = null;
      let minDiffDays = 999999;

      for (const p of pendingTxs) {
        if (matchedPendingIds.has(p.id)) continue;
        if (p.type !== cand.type) continue;

        const pAmt = parseFloat(p.amount) || 0;
        if (Math.abs(pAmt - cand.amount) > 0.01) continue;

        const pDate = new Date(p.dueDate || p.date);
        const cDate = new Date(cand.date);
        // diffDays positivo = vencimento no passado/hoje (atrasada/em dia)
        // diffDays negativo = vencimento no futuro (antecipada)
        const diffDays = (cDate - pDate) / (1000 * 60 * 60 * 24);

        // Aceita contas atrasadas (até 45 dias no passado) ou vencendo nos próximos 7 dias
        // Não sugere automaticamente parcelas de meses futuros para não confundir
        if (diffDays >= -7 && diffDays <= 45 && Math.abs(diffDays) < minDiffDays) {
          minDiffDays = Math.abs(diffDays);
          bestMatch = p;
        }
      }

      if (bestMatch) {
        matchedPendingIds.add(bestMatch.id);
      }

      return {
        ...cand,
        suggestedMatch: bestMatch
      };
    });

    return {
      bankName,
      latestBalance,
      candidates,
      totalRaw: rawTransactions.length
    };
  }

  // Sincroniza contas e abre modal de conciliação para um Item Conectado
  async syncItem(itemId) {
    try {
      const res = await this.fetchItemTransactions(itemId);
      if (!res) return { success: false };

      if (res.candidates && res.candidates.length > 0) {
        if (window.app && window.app.openReconciliationModal) {
          window.app.openReconciliationModal(res.candidates, res.bankName, res.latestBalance);
        }
        return { success: true, candidatesCount: res.candidates.length };
      } else {
        if (res.latestBalance !== null) {
          this.calibrateBalance(res.latestBalance);
          await window.db.syncWithServer().catch(() => {});
          if (window.app) {
            window.app.renderCurrentTab();
            window.app.updateHeaderStats();
          }
        }
        alert(`✅ ${res.bankName} sincronizado!\n\nTodas as movimentações já estão conciliadas e o saldo foi 100% atualizado.`);
        return { success: true, count: 0 };
      }
    } catch (err) {
      console.error('Erro na sincronização Pluggy:', err);
      alert('❌ Falha ao sincronizar movimentações: ' + err.message);
      return { success: false, error: err.message };
    }
  }

  // Sincroniza todas as contas já conectadas com conciliação inteligente
  async syncAll(btn) {
    const icon = btn ? btn.querySelector('[data-lucide="refresh-cw"], .lucide-refresh-cw') : null;
    if (icon) icon.classList.add('animate-spin');

    try {
      const settings = window.db ? window.db.getSettings() : {};
      let items = settings.pluggyItems || [];
      if (items.length === 0 && settings.pluggyItemId) {
        items = [{ id: settings.pluggyItemId, connector: 'Open Finance' }];
      }
      if (items.length === 0) {
        items = [{ id: '72fefe33-e3ec-46ad-9a76-76d5d8f87c3a', connector: 'MeuPluggy' }];
      }

      let allCandidates = [];
      let latestBankBalance = null;
      let bankNames = [];

      for (const it of items) {
        const res = await this.fetchItemTransactions(it.id);
        if (res) {
          if (res.candidates && res.candidates.length > 0) {
            allCandidates.push(...res.candidates);
          }
          if (res.latestBalance !== null) {
            latestBankBalance = res.latestBalance;
          }
          if (res.bankName && !bankNames.includes(res.bankName)) {
            bankNames.push(res.bankName);
          }
        }
      }

      const combinedBankName = bankNames.join(', ') || 'Open Finance';

      if (latestBankBalance !== null) {
        this.calibrateBalance(latestBankBalance);
        const subtext = document.getElementById('dash-balance-subtext');
        if (subtext) {
          subtext.innerHTML = `<span class="text-emerald-400 font-medium">✅ Saldo ${combinedBankName} sincronizado: R$ ${latestBankBalance.toFixed(2).replace('.', ',')}</span>`;
        }
        await window.db.syncWithServer().catch(() => {});
        if (window.app) {
          window.app.renderCurrentTab();
          window.app.updateHeaderStats();
        }
      }

      if (window.app && window.app.openReconciliationModal) {
        window.app.openReconciliationModal(allCandidates, combinedBankName, latestBankBalance);
      }
    } catch (err) {
      console.error('Erro na sincronização Pluggy:', err);
      alert('❌ Falha ao sincronizar movimentações: ' + err.message);
    } finally {
      if (icon) icon.classList.remove('animate-spin');
    }
  }

  // Sincroniza saldo e movimentações ao clicar no botão da carteira
  async syncBalanceOnly(btn) {
    return this.syncAll(btn);
  }
}

// Instância global do serviço Pluggy
window.pluggyService = new PluggyService();
