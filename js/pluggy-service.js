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

  // Sincroniza contas e transações de um Item Conectado
  async syncItem(itemId) {
    try {
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
      let totalImported = 0;
      let latestBalance = null;

      for (const acc of accounts) {
        if (acc.balance !== undefined && acc.balance !== null) {
          latestBalance = acc.balance;
        }

        // 3. Busca transações da conta
        const txResp = await fetch(`${this.apiBase}/v2/transactions?accountId=${acc.id}&pageSize=500`, {
          headers: { 'X-API-KEY': apiKey }
        });

        if (!txResp.ok) continue;
        const txData = await txResp.json();
        const rawTransactions = txData.results || [];

        const structuredTxs = [];
        for (const t of rawTransactions) {
          const isExpense = t.type === 'DEBIT' || t.amount < 0;
          const type = isExpense ? 'expense' : 'income';
          const amount = Math.abs(t.amount || 0);
          if (amount === 0) continue;

          const dateStr = t.date ? t.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
          const desc = t.description || 'Movimentação Bancária';
          
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

        if (structuredTxs.length > 0) {
          const apiUrl = window.db.getApiUrl();
          if (apiUrl) {
            await fetch(`${apiUrl}/transactions/batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactions: structuredTxs })
            });
          } else {
            for (const st of structuredTxs) {
              window.db.addTransaction(st);
            }
          }
          totalImported += structuredTxs.length;
        }
      }

      // 4. Sincroniza banco local com o servidor
      await window.db.syncWithServer();
      if (window.app) {
        window.app.renderCurrentTab();
        window.app.updateHeaderStats();
      }

      if (window.confetti) window.confetti({ particleCount: 70, spread: 80 });

      let msg = `✅ ${bankName} sincronizado com sucesso!\n\nForam importadas ${totalImported} movimentações no seu banco de dados.`;
      if (latestBalance !== null) {
        msg += `\nSaldo atual na conta: R$ ${latestBalance.toFixed(2).replace('.', ',')}`;
      }
      alert(msg);
      return { success: true, count: totalImported };
    } catch (err) {
      console.error('Erro na sincronização Pluggy:', err);
      alert('❌ Falha ao sincronizar movimentações: ' + err.message);
      return { success: false, error: err.message };
    }
  }

  // Sincroniza todas as contas já conectadas
  async syncAll() {
    const settings = window.db.getSettings();
    const items = settings.pluggyItems || [];
    if (items.length === 0) {
      alert('Nenhuma conta bancária conectada via Pluggy ainda. Clique em "Conectar Banco (Pluggy)" para conectar!');
      return;
    }

    let total = 0;
    for (const it of items) {
      const res = await this.syncItem(it.id);
      if (res && res.count) total += res.count;
    }
  }
}

// Instância global do serviço Pluggy
window.pluggyService = new PluggyService();
