class AsaasService {
  constructor() {
    this.status = 'disconnected';
    this.config = this.getConfig();
  }

  getConfig() {
    const settings = window.db ? window.db.getSettings() : {};
    const asaas = settings.asaas || {};
    return {
      apiKey: asaas.apiKey || '',
      environment: asaas.environment || 'sandbox', // sandbox | production
    };
  }

  getBaseUrl() {
    const config = this.getConfig();
    return config.environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  getHeaders(customApiKey = null) {
    const key = customApiKey || this.getConfig().apiKey;
    return {
      'Content-Type': 'application/json',
      'access_token': key.trim()
    };
  }

  // Local Proxy para evitar CORS
  async apiCall(url, method = 'GET', headers = {}, payload = null) {
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.');
      if (!isLocalhost) {
        // Se estiver no VPS, chama direto (ou via server.ps1 se for Windows)
        // Por via das dúvidas vamos usar o proxy local do powershell se disponivel
      }

      const proxyUrl = '/api/evolution/proxy'; // Reaproveitando o proxy endpoint, mas cuidado que ele espera payload especifico
      // Precisamos ajustar o server.ps1 para aceitar outras URLs livremente
      
      const reqObj = {
        targetUrl: url,
        method: method,
        headers: headers,
        payload: payload
      };

      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqObj)
      });

      if (!res.ok) {
        throw new Error(`Proxy error: ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
         throw new Error(`Erro Asaas: ${JSON.stringify(data.data)}`);
      }
      return { success: true, data: data.data };
    } catch (err) {
      console.error('Erro na chamada Asaas:', err);
      return { success: false, message: err.message };
    }
  }

  async checkBalance(customApiKey = null, customEnv = null) {
    let baseUrl = 'https://sandbox.asaas.com/api/v3';
    if (customEnv) {
        baseUrl = customEnv === 'production' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
    } else {
        baseUrl = this.getBaseUrl();
    }
    
    const headers = this.getHeaders(customApiKey);
    if (!headers.access_token) return { success: false, message: 'Chave de API nÃ£o configurada' };

    const result = await this.apiCall(`${baseUrl}/finance/balance`, 'GET', headers);
    return result;
  }
}

window.asaasService = new AsaasService();
