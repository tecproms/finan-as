// Servidor REST API e Conector PostgreSQL / Mercado Pago - FinControl Pro
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const { query, initDatabase } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3006;

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servidor de arquivos estáticos (serve a interface PWA diretamente na mesma porta)
app.use(express.static(path.join(__dirname, '..')));

// --- ROTAS DA API ---

// 1. Health Check & Status do Banco
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await query('SELECT NOW() as server_time, (SELECT COUNT(*) FROM transactions) as tx_count');
    res.json({
      status: 'online',
      service: 'FinControl Pro API',
      database: 'PostgreSQL Conectado',
      serverTime: dbTest.rows[0].server_time,
      totalTransactions: parseInt(dbTest.rows[0].tx_count, 10),
      version: '2.8'
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      database: 'Desconectado',
      message: err.message
    });
  }
});

// ==========================================
// 2. TRANSAÇÕES FINANCEIRAS
// ==========================================

// Lista todas as transações
app.get('/api/transactions', async (req, res) => {
  try {
    const { month, type, status } = req.query;
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];

    if (month) {
      params.push(`${month}%`);
      sql += ` AND date::text LIKE $${params.length}`;
    }
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY date DESC, created_at DESC';
    const result = await query(sql, params);

    // Mapeia colunas do banco para o padrão camelCase do frontend
    const transactions = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      description: row.description,
      amount: parseFloat(row.amount),
      category: row.category,
      paymentMethod: row.payment_method,
      date: row.date ? row.date.toISOString().split('T')[0] : '',
      dueDate: row.due_date ? row.due_date.toISOString().split('T')[0] : '',
      status: row.status,
      installments: row.installments,
      currentInstallment: row.current_installment,
      notes: row.notes || '',
      externalId: row.external_id || null,
      createdAt: row.created_at
    }));

    res.json(transactions);
  } catch (err) {
    console.error('Erro ao buscar transações:', err);
    res.status(500).json({ error: 'Falha ao buscar transações: ' + err.message });
  }
});

// Cria uma transação
app.post('/api/transactions', async (req, res) => {
  try {
    const t = req.body;
    const id = t.id || 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const amount = parseFloat(t.amount) || 0;
    const date = t.date || new Date().toISOString().split('T')[0];
    const dueDate = t.dueDate || date;

    const sql = `
      INSERT INTO transactions (
        id, type, description, amount, category, payment_method, 
        date, due_date, status, installments, current_installment, notes, external_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    const params = [
      id,
      t.type || 'expense',
      t.description || 'Lançamento',
      amount,
      t.category || 'Outros',
      t.paymentMethod || 'PIX',
      date,
      dueDate,
      t.status || 'paid',
      parseInt(t.installments, 10) || 1,
      parseInt(t.currentInstallment, 10) || 1,
      t.notes || '',
      t.externalId || null
    ];

    const result = await query(sql, params);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar transação:', err);
    res.status(500).json({ error: 'Falha ao salvar transação: ' + err.message });
  }
});

// Cria transações em lote (para importação de extrato ou sincronização)
app.post('/api/transactions/batch', async (req, res) => {
  try {
    const items = req.body.transactions;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Array de transações inválido.' });
    }

    let insertedCount = 0;
    const seenBatch = new Set();

    for (const t of items) {
      const amount = parseFloat(t.amount) || 0;
      const date = t.date || new Date().toISOString().split('T')[0];
      const desc = (t.description || 'Lançamento').trim();
      const type = t.type || 'expense';

      // Evita duplicatas dentro do mesmo lote enviado
      const batchKey = `${date}|${amount.toFixed(2)}|${type}|${desc.toLowerCase()}`;
      if (seenBatch.has(batchKey)) continue;
      seenBatch.add(batchKey);

      // Verifica se já existe por external_id OU por (data + valor + tipo + descrição idêntica)
      if (t.externalId) {
        const checkExt = await query('SELECT id FROM transactions WHERE external_id = $1 LIMIT 1', [t.externalId]);
        if (checkExt.rowCount > 0) continue;
      }
      const checkDup = await query(
        'SELECT id FROM transactions WHERE date::text = $1 AND amount = $2 AND type = $3 AND LOWER(TRIM(description)) = LOWER(TRIM($4)) LIMIT 1',
        [date, amount, type, desc]
      );
      if (checkDup.rowCount > 0) continue;

      const id = t.id || 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

      const sql = `
        INSERT INTO transactions (
          id, type, description, amount, category, payment_method, 
          date, due_date, status, installments, current_installment, notes, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (external_id) DO NOTHING
      `;
      const params = [
        id,
        type,
        desc,
        amount,
        t.category || 'Outros',
        t.paymentMethod || 'Transferência',
        date,
        t.dueDate || date,
        t.status || 'paid',
        t.installments || 1,
        t.currentInstallment || 1,
        t.notes || '',
        t.externalId || null
      ];
      const r = await query(sql, params);
      if (r.rowCount > 0) insertedCount++;
    }

    res.json({ success: true, count: insertedCount });
  } catch (err) {
    console.error('Erro na importação em lote:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint utilitário para deduplicação cirúrgica
app.post('/api/transactions/deduplicate', async (req, res) => {
  try {
    const r = await query(`
      DELETE FROM transactions a USING transactions b
      WHERE a.ctid < b.ctid
        AND a.date = b.date
        AND a.amount = b.amount
        AND a.type = b.type
        AND LOWER(TRIM(a.description)) = LOWER(TRIM(b.description))
    `);
    res.json({ success: true, removedCount: r.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualiza transação
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const t = req.body;
    const sql = `
      UPDATE transactions SET
        type = COALESCE($2, type),
        description = COALESCE($3, description),
        amount = COALESCE($4, amount),
        category = COALESCE($5, category),
        payment_method = COALESCE($6, payment_method),
        date = COALESCE($7, date),
        due_date = COALESCE($8, due_date),
        status = COALESCE($9, status),
        notes = COALESCE($10, notes),
        external_id = COALESCE($11, external_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const params = [
      id,
      t.type,
      t.description,
      t.amount !== undefined ? parseFloat(t.amount) : null,
      t.category,
      t.paymentMethod,
      t.date,
      t.dueDate,
      t.status,
      t.notes,
      t.externalId || t.external_id || null
    ];
    const result = await query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transação não encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deleta transação
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM transactions WHERE id = $1', [id]);
    res.json({ success: true, message: 'Lançamento excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Limpa todos os dados no banco PostgreSQL (transações, agenda, notas)
app.post('/api/clear-all', async (req, res) => {
  try {
    await query('DELETE FROM transactions');
    await query('DELETE FROM appointments');
    await query('DELETE FROM notes');
    res.json({ success: true, message: 'Dados do PostgreSQL limpos com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. AGENDA & COMPROMISSOS
// ==========================================

app.get('/api/appointments', async (req, res) => {
  try {
    const result = await query('SELECT * FROM appointments ORDER BY date ASC, time ASC');
    const appointments = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      date: row.date ? row.date.toISOString().split('T')[0] : '',
      time: row.time,
      cost: parseFloat(row.cost || 0),
      location: row.location || '',
      priority: row.priority,
      completed: row.completed,
      notes: row.notes || '',
      createdAt: row.created_at
    }));
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const a = req.body;
    const id = a.id || 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const date = a.date || new Date().toISOString().split('T')[0];

    const sql = `
      INSERT INTO appointments (id, title, date, time, cost, location, priority, completed, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const params = [
      id,
      a.title || 'Compromisso',
      date,
      a.time || '09:00',
      parseFloat(a.cost || 0),
      a.location || '',
      a.priority || 'medium',
      a.completed || false,
      a.notes || ''
    ];
    const result = await query(sql, params);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const a = req.body;
    const sql = `
      UPDATE appointments SET
        title = COALESCE($2, title),
        date = COALESCE($3, date),
        time = COALESCE($4, time),
        cost = COALESCE($5, cost),
        location = COALESCE($6, location),
        priority = COALESCE($7, priority),
        completed = COALESCE($8, completed),
        notes = COALESCE($9, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const params = [id, a.title, a.date, a.time, a.cost !== undefined ? parseFloat(a.cost) : null, a.location, a.priority, a.completed, a.notes];
    const result = await query(sql, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    await query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ANOTAÇÕES ÁGEIS
// ==========================================

app.get('/api/notes', async (req, res) => {
  try {
    const result = await query('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
    res.json(result.rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tag: r.tag,
      pinned: r.pinned,
      color: r.color,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes', async (req, res) => {
  try {
    const n = req.body;
    const id = n.id || 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const sql = `
      INSERT INTO notes (id, title, content, tag, pinned, color)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [id, n.title || 'Anotação', n.content || '', n.tag || 'Geral', n.pinned || false, n.color || 'slate'];
    const result = await query(sql, params);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const n = req.body;
    const sql = `
      UPDATE notes SET
        title = COALESCE($2, title),
        content = COALESCE($3, content),
        tag = COALESCE($4, tag),
        pinned = COALESCE($5, pinned),
        color = COALESCE($6, color),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const params = [id, n.title, n.content, n.tag, n.pinned, n.color];
    const result = await query(sql, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. CONFIGURAÇÕES
// ==========================================

app.get('/api/settings', async (req, res) => {
  try {
    const result = await query('SELECT * FROM app_settings WHERE id = $1', ['default']);
    if (result.rows.length === 0) {
      return res.json({ userName: 'Usuário', groqModel: 'llama-3.1-8b-instant' });
    }
    const r = result.rows[0];
    const resp = {
      userName: r.user_name,
      groqApiKey: r.groq_api_key,
      groqModel: r.groq_model,
      autolockMinutes: r.autolock_minutes,
      mercadoPagoToken: r.mercado_pago_token,
      mercadoPagoAutoSync: r.mercado_pago_auto_sync,
      mercadoPagoLastSync: r.mercado_pago_last_sync,
      interSettings: r.inter_settings || {}
    };
    // Campos extras (se existirem na tabela)
    if (r.auth_data) resp.auth = r.auth_data;
    if (r.pluggy_items) resp.pluggyItems = r.pluggy_items;
    if (r.pluggy_client_id) resp.pluggyClientId = r.pluggy_client_id;
    if (r.pluggy_client_secret) resp.pluggyClientSecret = r.pluggy_client_secret;
    if (r.pluggy_cards) resp.pluggyCards = r.pluggy_cards;
    if (r.pluggy_investments) resp.pluggyInvestments = r.pluggy_investments;
    if (r.pluggy_last_sync) resp.pluggyLastSync = r.pluggy_last_sync;
    if (r.initial_balance !== undefined && r.initial_balance !== null) resp.initialBalance = r.initial_balance;
    if (r.evolution_settings) resp.evolution = r.evolution_settings;
    if (r.whaticket_settings) resp.whaticket = r.whaticket_settings;
    res.json(resp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const s = req.body;

    // Garante que as colunas extras existam na tabela
    await query(`
      DO $$ BEGIN
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auth_data JSONB;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pluggy_items JSONB;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pluggy_client_id TEXT;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pluggy_client_secret TEXT;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 0;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS evolution_settings JSONB;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS whaticket_settings JSONB;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `).catch(() => {});

    const sql = `
      INSERT INTO app_settings (
        id, user_name, groq_api_key, groq_model, autolock_minutes, 
        mercado_pago_token, mercado_pago_auto_sync, inter_settings,
        auth_data, pluggy_items, pluggy_client_id, pluggy_client_secret, initial_balance,
        evolution_settings, whaticket_settings, updated_at
      ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        user_name = COALESCE(EXCLUDED.user_name, app_settings.user_name),
        groq_api_key = COALESCE(EXCLUDED.groq_api_key, app_settings.groq_api_key),
        groq_model = COALESCE(EXCLUDED.groq_model, app_settings.groq_model),
        autolock_minutes = COALESCE(EXCLUDED.autolock_minutes, app_settings.autolock_minutes),
        mercado_pago_token = COALESCE(EXCLUDED.mercado_pago_token, app_settings.mercado_pago_token),
        mercado_pago_auto_sync = COALESCE(EXCLUDED.mercado_pago_auto_sync, app_settings.mercado_pago_auto_sync),
        inter_settings = COALESCE(EXCLUDED.inter_settings, app_settings.inter_settings),
        auth_data = COALESCE(EXCLUDED.auth_data, app_settings.auth_data),
        pluggy_items = COALESCE(EXCLUDED.pluggy_items, app_settings.pluggy_items),
        pluggy_client_id = COALESCE(EXCLUDED.pluggy_client_id, app_settings.pluggy_client_id),
        pluggy_client_secret = COALESCE(EXCLUDED.pluggy_client_secret, app_settings.pluggy_client_secret),
        initial_balance = COALESCE(EXCLUDED.initial_balance, app_settings.initial_balance),
        evolution_settings = COALESCE(EXCLUDED.evolution_settings, app_settings.evolution_settings),
        whaticket_settings = COALESCE(EXCLUDED.whaticket_settings, app_settings.whaticket_settings),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const params = [
      s.userName || 'Usuário',
      s.groqApiKey || '',
      s.groqModel || 'llama-3.1-8b-instant',
      s.autolockMinutes || 5,
      s.mercadoPagoToken || '',
      s.mercadoPagoAutoSync || false,
      JSON.stringify(s.interSettings || {}),
      s.auth ? JSON.stringify(s.auth) : null,
      s.pluggyItems ? JSON.stringify(s.pluggyItems) : null,
      s.pluggyClientId || null,
      s.pluggyClientSecret || null,
      s.initialBalance !== undefined ? s.initialBalance : null,
      s.evolution ? JSON.stringify(s.evolution) : (s.evolution_settings ? JSON.stringify(s.evolution_settings) : null),
      s.whaticket ? JSON.stringify(s.whaticket) : (s.whaticket_settings ? JSON.stringify(s.whaticket_settings) : null)
    ];
    await query(sql, params);
    res.json({ success: true, message: 'Configurações salvas no PostgreSQL com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para consultar o Saldo Real da Conta no Mercado Pago em tempo real
app.get('/api/mercadopago/balance', async (req, res) => {
  try {
    let token = req.query.token;
    if (!token) {
      const s = await query('SELECT mercado_pago_token FROM app_settings WHERE id = $1', ['default']);
      token = s.rows[0]?.mercado_pago_token;
    }

    if (!token || token.trim().length < 10) {
      return res.status(400).json({ error: 'Token do Mercado Pago não configurado.' });
    }

    // 1. Obtém dados do usuário
    const meData = await new Promise((resolve) => {
      const r = https.request({
        hostname: 'api.mercadopago.com',
        path: '/users/me',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'User-Agent': 'FinControlPro/2.8'
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (_) { resolve({}); }
        });
      });
      r.on('error', () => resolve({}));
      r.setTimeout(5000, () => { r.destroy(); resolve({}); });
      r.end();
    });

    const userId = meData?.id;
    if (!userId) {
      return res.status(400).json({ error: 'Não foi possível validar usuário no Mercado Pago.' });
    }

    // 2. Consulta saldo real em conta
    const balData = await new Promise((resolve) => {
      const r = https.request({
        hostname: 'api.mercadopago.com',
        path: `/users/${userId}/mercadopago_account/balance`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'User-Agent': 'FinControlPro/2.8'
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (_) { resolve({}); }
        });
      });
      r.on('error', () => resolve({}));
      r.setTimeout(5000, () => { r.destroy(); resolve({}); });
      r.end();
    });

    res.json({
      success: true,
      userId: userId,
      nickname: meData.nickname || meData.first_name || 'Mercado Pago',
      totalAmount: balData?.total_amount || 0,
      availableAmount: balData?.available_amount || 0,
      unavailableAmount: balData?.unavailable_amount || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint - retorna dados CRUS da API do Mercado Pago
app.get('/api/mercadopago/debug', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-mp-token'];
    if (!token) {
      // Try from DB
      const s = await query('SELECT mercado_pago_token FROM app_settings WHERE id = $1', ['default']);
      const dbToken = s.rows[0]?.mercado_pago_token;
      if (!dbToken) return res.status(400).json({ error: 'Token não fornecido. Use ?token=SEU_TOKEN' });
      req.query.token = dbToken;
    }
    const t = (req.query.token || token).trim();

    // Get user profile
    const meData = await new Promise((resolve) => {
      const r = https.request({ hostname: 'api.mercadopago.com', path: '/users/me', method: 'GET',
        headers: { 'Authorization': `Bearer ${t}` }
      }, (response) => { let d = ''; response.on('data', c => d += c); response.on('end', () => { try { resolve(JSON.parse(d)); } catch(_) { resolve({}); } }); });
      r.on('error', () => resolve({})); r.end();
    });

    // Get payments
    const mpData = await new Promise((resolve) => {
      const r = https.request({ hostname: 'api.mercadopago.com', path: '/v1/payments/search?sort=date_created&criteria=desc&limit=10', method: 'GET',
        headers: { 'Authorization': `Bearer ${t}` }
      }, (response) => { let d = ''; response.on('data', c => d += c); response.on('end', () => { try { resolve(JSON.parse(d)); } catch(_) { resolve({}); } }); });
      r.on('error', () => resolve({})); r.end();
    });

    const results = (mpData.results || []).map(p => ({
      id: p.id,
      description: p.description,
      transaction_amount: p.transaction_amount,
      status: p.status,
      status_detail: p.status_detail,
      operation_type: p.operation_type,
      payment_type_id: p.payment_type_id,
      payment_method_id: p.payment_method_id,
      collector_id: p.collector_id,
      payer_id: p.payer?.id,
      payer_name: [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' '),
      payer_email: p.payer?.email,
      money_release_date: p.money_release_date,
      money_release_status: p.money_release_status,
      date_created: p.date_created,
      date_approved: p.date_approved,
      net_received_amount: p.transaction_details?.net_received_amount,
      total_paid_amount: p.transaction_details?.total_paid_amount,
      point_of_interaction_type: p.point_of_interaction?.type,
      point_of_interaction_business: p.point_of_interaction?.business_info,
      _is_collector_me: meData?.id ? String(p.collector_id) === String(meData.id) : 'unknown',
      _is_payer_me: meData?.id ? String(p.payer?.id) === String(meData.id) : 'unknown',
    }));

    res.json({
      myUserId: meData?.id,
      myNickname: meData?.nickname,
      paymentsCount: results.length,
      payments: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Função utilitária centralizada para sincronização do Mercado Pago
async function executeMercadoPagoSync(customToken = null) {
  let token = customToken;
  if (!token) {
    const s = await query('SELECT mercado_pago_token, mercado_pago_auto_sync FROM app_settings WHERE id = $1', ['default']);
    token = s.rows[0]?.mercado_pago_token;
  }

  if (!token || token.trim().length < 10) {
    return { success: false, error: 'Token do Mercado Pago não configurado.' };
  }

  // 1. Obtém perfil do usuário para identificar quem recebe vs quem paga
  let myUserId = null;
  let walletBalance = null;
  try {
    const meData = await new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.mercadopago.com',
        path: '/users/me',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'User-Agent': 'FinControlPro/2.8'
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (_) { resolve({}); }
        });
      });
      req.on('error', () => resolve({}));
      req.setTimeout(5000, () => { req.destroy(); resolve({}); });
      req.end();
    });
    myUserId = meData?.id;

    if (myUserId) {
      const balData = await new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.mercadopago.com',
          path: `/users/${myUserId}/mercadopago_account/balance`,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token.trim()}`,
            'User-Agent': 'FinControlPro/2.8'
          }
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try { resolve(JSON.parse(d)); } catch (_) { resolve({}); }
          });
        });
        req.on('error', () => resolve({}));
        req.setTimeout(5000, () => { req.destroy(); resolve({}); });
        req.end();
      });
      if (balData?.available_amount !== undefined) {
        walletBalance = parseFloat(balData.available_amount);
      }
    }
  } catch (e) {
    console.warn('Não foi possível obter dados complementares do perfil MP:', e.message);
  }

  // 2. Busca movimentações recentes no Mercado Pago
  const mpUrl = 'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=50';
  const mpData = await new Promise((resolve, reject) => {
    const urlObj = new URL(mpUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'User-Agent': 'FinControlPro/2.8'
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Resposta inválida do Mercado Pago: ' + e.message));
          }
        } else {
          try {
            const errJson = JSON.parse(data);
            reject(new Error(errJson.message || `Erro HTTP ${response.statusCode} do Mercado Pago`));
          } catch (_) {
            reject(new Error(`Erro HTTP ${response.statusCode} do Mercado Pago`));
          }
        }
      });
    });

    request.on('error', err => reject(err));
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Tempo limite excedido ao conectar com a API do Mercado Pago'));
    });
    request.end();
  });

  const results = mpData.results || [];
  let insertedCount = 0;
  const importedItems = [];

  for (const p of results) {
    const extId = 'mp_' + p.id;
    const isApproved = p.status === 'approved';
    if (!isApproved) continue;

    // Determina se é entrada (Receita) ou saída (Despesa) com máxima precisão
    let isIncome = false;
    const descLower = (p.description || '').toLowerCase();

    // Regra 1: Estornos, devoluções e reembolsos são sempre Receitas
    if (descLower.includes('extorno') || descLower.includes('estorno') || descLower.includes('reembolso') || descLower.includes('devolu')) {
      isIncome = true;
    }
    // Regra 2: Se o usuário logado for o collector_id, ele RECEBEU o dinheiro (Receita)
    else if (myUserId && String(p.collector_id) === String(myUserId)) {
      isIncome = true;
    }
    // Regra 3: Se o dinheiro foi liberado para o usuário (net_received_amount > 0 e money_release_date)
    else if (p.transaction_details && p.transaction_details.net_received_amount > 0 && p.money_release_date) {
      isIncome = true;
    }
    // Regra 4: Se o usuário é o pagador (payer.id = myUserId)
    else if (myUserId && p.payer && String(p.payer.id) === String(myUserId)) {
      isIncome = false;
    }
    // Regra 5: Fallback textual caso myUserId não esteja disponível
    else {
      if (descLower.includes('recebimento') || descLower.includes('recebido') || descLower.includes('venda')) {
        isIncome = true;
      } else {
        isIncome = false;
      }
    }

    const type = isIncome ? 'income' : 'expense';
    const amount = Math.abs(p.transaction_amount || 0);

    let desc = p.description || '';
    const method = (p.payment_method_id || 'PIX').toUpperCase();
    if (!desc || desc.length < 2) {
      if (isIncome) {
        const payerName = p.payer ? [p.payer.first_name, p.payer.last_name].filter(Boolean).join(' ') : '';
        desc = payerName ? `Pix recebido de ${payerName}` : `Recebimento Mercado Pago (${method})`;
      } else {
        desc = `Pagamento Mercado Pago (${method})`;
      }
    }

    let category = isIncome ? 'Serviços' : 'Outros';
    if (lower.includes('mercado') || lower.includes('supermercado') || lower.includes('pires') || lower.includes('alimento') || lower.includes('padaria')) category = 'Alimentação';
    else if (lower.includes('gasolina') || lower.includes('combust') || lower.includes('posto') || lower.includes('auto posto')) category = 'Transporte';
    else if (lower.includes('luz') || lower.includes('energia') || lower.includes('internet') || lower.includes('agua')) category = 'Moradia';
    else if (lower.includes('tabacaria') || lower.includes('bar') || lower.includes('restaurante') || lower.includes('lanchonete')) category = 'Lazer';
    else if (lower.includes('farmacia') || lower.includes('drogaria') || lower.includes('saude') || lower.includes('hospital')) category = 'Saúde';

    let paymentMethod = 'PIX';
    if (p.payment_type_id === 'credit_card') paymentMethod = 'Cartão de Crédito';
    else if (p.payment_type_id === 'debit_card') paymentMethod = 'Cartão de Débito';
    else if (p.payment_method_id === 'pix') paymentMethod = 'PIX';
    else if (p.payment_type_id === 'ticket') paymentMethod = 'Boleto';

    const date = (p.date_approved || p.date_created).split('T')[0];
    const id = 'tx_' + Date.now() + '_' + p.id;

    const sql = `
      INSERT INTO transactions (
        id, type, description, amount, category, payment_method,
        date, due_date, status, notes, external_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (external_id) DO UPDATE SET
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        amount = EXCLUDED.amount,
        category = EXCLUDED.category,
        payment_method = EXCLUDED.payment_method,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const params = [
      id, type, desc, amount, category, paymentMethod,
      date, date, 'paid', `Sincronizado via Mercado Pago API (ID: ${p.id})`, extId
    ];

    const r = await query(sql, params);
    if (r.rowCount > 0) {
      insertedCount++;
      importedItems.push(r.rows[0]);
    }
  }

  // Atualiza data da última sincronização
  await query(`
    UPDATE app_settings SET 
      mercado_pago_last_sync = CURRENT_TIMESTAMP 
    WHERE id = 'default'
  `);

  await query(`
    INSERT INTO mp_sync_logs (imported_count, status, details)
    VALUES ($1, 'success', $2)
  `, [insertedCount, `${results.length} pagamentos analisados, ${insertedCount} atualizados/importados`]);

  let msg = `${insertedCount} movimentações do Mercado Pago sincronizadas com sucesso!`;
  if (walletBalance !== null) {
    msg += ` Saldo disponível na conta Mercado Pago: R$ ${walletBalance.toFixed(2).replace('.', ',')}`;
  }

  return {
    success: true,
    totalAnalizados: results.length,
    novosImportados: insertedCount,
    saldoContaMercadoPago: walletBalance,
    mensagem: msg
  };
}

// Endpoint de sincronização manual via Frontend
app.post('/api/mercadopago/sync', async (req, res) => {
  try {
    const result = await executeMercadoPagoSync(req.body.accessToken);
    if (!result.success && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('Erro na sincronização Mercado Pago:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint Webhook Oficial do Mercado Pago (Recebe notificações em tempo real)
app.all('/api/mercadopago/webhook', async (req, res) => {
  // Responde imediatamente 200 OK para o Mercado Pago confirmar recebimento
  res.status(200).json({ status: 'received' });

  try {
    const queryData = req.query || {};
    const bodyData = req.body || {};
    console.log('📬 [MP Webhook] Notificação recebida:', { query: queryData, body: bodyData });

    // Se a notificação for de pagamento, dispara a sincronização silenciosa
    const topic = queryData.topic || queryData.type || bodyData.type || bodyData.action;
    if (!topic || topic.includes('payment') || topic.includes('merchant_order')) {
      console.log('⚡ [MP Webhook] Processando atualização de transação em tempo real...');
      const syncRes = await executeMercadoPagoSync();
      console.log('✅ [MP Webhook] Sincronização em tempo real concluída:', syncRes?.mensagem || 'OK');
    }
  } catch (err) {
    console.error('❌ [MP Webhook] Erro ao processar webhook em background:', err.message);
  }
});

// ==========================================
// 7.1 MOTOR DE SINCRONIZAÇÃO PLUGGY OPEN FINANCE (BACKEND)
// ==========================================

async function executePluggySync(customItemId = null) {
  try {
    const sRes = await query('SELECT pluggy_client_id, pluggy_client_secret, pluggy_items FROM app_settings WHERE id = $1', ['default']);
    const s = sRes.rows[0] || {};
    const clientId = (s.pluggy_client_id || '050ca994-3522-47e6-8571-d7582767173f').trim();
    const clientSecret = (s.pluggy_client_secret || '-kq-NqVfPS7Yt4IxRzHWrTixx2veW03aAvBLyj2OaME').trim();

    let items = s.pluggy_items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (_) { items = []; }
    }
    if (!Array.isArray(items) || items.length === 0) {
      items = [{ id: '72fefe33-e3ec-46ad-9a76-76d5d8f87c3a', connector: 'MeuPluggy' }];
    }

    if (customItemId) {
      if (!items.find(i => i.id === customItemId)) {
        items.push({ id: customItemId, connector: 'Item Pluggy' });
      }
    }

    // 1. Autenticação na API Pluggy
    const authResp = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    });
    if (!authResp.ok) {
      throw new Error(`Falha na autenticação Pluggy: HTTP ${authResp.status}`);
    }
    const authData = await authResp.json();
    const apiKey = authData.apiKey;

    let totalImported = 0;
    let totalReconciled = 0;
    let latestBalancesByBank = [];
    let detectedCards = [];
    let detectedInvestments = [];

    for (const item of items) {
      // 2. Busca contas do item
      const accResp = await fetch(`https://api.pluggy.ai/accounts?itemId=${item.id}`, {
        headers: { 'X-API-KEY': apiKey }
      });
      if (!accResp.ok) continue;
      const accData = await accResp.json();
      const accounts = accData.results || [];

      for (const acc of accounts) {
        // Se for cartão de crédito (type === 'CREDIT')
        if (acc.type === 'CREDIT') {
          detectedCards.push({
            id: acc.id,
            itemId: item.id,
            bankName: item.connector || 'Cartão',
            name: acc.name || 'Cartão de Crédito',
            number: acc.number || '',
            balance: Math.abs(acc.balance || 0),
            currencyCode: acc.currencyCode || 'BRL',
            creditLimit: acc.creditData?.creditLimit || 0,
            availableCreditLimit: acc.creditData?.availableCreditLimit || 0,
            balanceCloseDate: acc.creditData?.balanceCloseDate || null,
            balanceDueDate: acc.creditData?.balanceDueDate || null,
            minimumPayment: acc.creditData?.minimumPayment || 0
          });
        }

        // Saldo de conta corrente / poupança
        if (acc.type === 'BANK' && acc.balance !== undefined && acc.balance !== null) {
          latestBalancesByBank.push({
            bankName: item.connector || 'Conta',
            balance: acc.balance
          });
        }

        // 3. Busca transações recentes da conta
        let txUrl = `https://api.pluggy.ai/v2/transactions?accountId=${acc.id}`;
        let rawTxs = [];
        let pageCount = 0;
        while (txUrl && pageCount < 3) {
          pageCount++;
          const txResp = await fetch(txUrl, { headers: { 'X-API-KEY': apiKey } });
          if (!txResp.ok) break;
          const txData = await txResp.json();
          if (Array.isArray(txData.results)) rawTxs.push(...txData.results);
          txUrl = txData.next ? `https://api.pluggy.ai/v2/transactions${txData.next}` : null;
        }

        // 4. Processa e concilia cada transação
        for (const t of rawTxs) {
          const isExpense = t.type === 'DEBIT' || t.amount < 0;
          const txType = isExpense ? 'expense' : 'income';
          const amount = Math.abs(t.amount || 0);
          if (amount === 0) continue;

          const dateStr = t.date ? t.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
          const desc = (t.description || 'Movimentação Bancária').trim();
          const extId = `pluggy_${t.id}`;

          // Verifica se já existe por external_id
          const existingExt = await query('SELECT id FROM transactions WHERE external_id = $1 LIMIT 1', [extId]);
          if (existingExt.rowCount > 0) continue;

          // Verifica se já existe por assinatura idêntica já paga
          const checkDup = await query(
            'SELECT id FROM transactions WHERE date::text = $1 AND amount = $2 AND type = $3 AND LOWER(TRIM(description)) = LOWER(TRIM($4)) AND status = $5 LIMIT 1',
            [dateStr, amount, txType, desc, 'paid']
          );
          if (checkDup.rowCount > 0) continue;

          // Tenta conciliar com conta pendente com mesmo valor e vencimento próximo (+- 7 dias)
          const pendingMatch = await query(
            `SELECT id, description, due_date FROM transactions 
             WHERE status = 'pending' AND type = $1 AND amount = $2 
               AND (due_date IS NULL OR ABS(DATE_PART('day', due_date::timestamp - $3::timestamp)) <= 7)
             ORDER BY ABS(DATE_PART('day', COALESCE(due_date, date)::timestamp - $3::timestamp)) ASC
             LIMIT 1`,
            [txType, amount, dateStr]
          );

          if (pendingMatch.rowCount > 0) {
            const matchedId = pendingMatch.rows[0].id;
            await query(
              `UPDATE transactions 
               SET status = 'paid', date = $1, external_id = $2, 
                   notes = COALESCE(NULLIF(notes, ''), '') || ' [Conciliado Pluggy ' || $3 || ']'
               WHERE id = $4`,
              [dateStr, extId, item.connector || 'Banco', matchedId]
            );
            totalReconciled++;
          } else {
            // Lança como nova transação realizada
            let category = t.category || (isExpense ? 'Outros' : 'Serviços');
            const lower = desc.toLowerCase();
            if (lower.includes('pix') && txType === 'income') category = 'Serviços';
            else if (lower.includes('posto') || lower.includes('combust') || lower.includes('gasolina')) category = 'Transporte';
            else if (lower.includes('super') || lower.includes('mercado') || lower.includes('alimento') || lower.includes('padaria')) category = 'Alimentação';
            else if (lower.includes('luz') || lower.includes('energia') || lower.includes('agua') || lower.includes('internet')) category = 'Moradia';

            const newId = `tx_pluggy_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            await query(
              `INSERT INTO transactions (id, type, description, amount, category, payment_method, date, due_date, status, notes, external_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, $10)
               ON CONFLICT (external_id) DO NOTHING`,
              [
                newId, txType, desc, amount, category, 
                item.connector || 'Open Finance', dateStr, dateStr, 
                `Sincronizado via Pluggy (${item.connector || 'Banco'})`, extId
              ]
            );
            totalImported++;
          }
        }
      }

      // 5. Busca investimentos do item
      try {
        const invResp = await fetch(`https://api.pluggy.ai/investments?itemId=${item.id}`, {
          headers: { 'X-API-KEY': apiKey }
        });
        if (invResp.ok) {
          const invData = await invResp.json();
          const invResults = invData.results || [];
          invResults.forEach(inv => {
            detectedInvestments.push({
              id: inv.id,
              itemId: item.id,
              bankName: item.connector || 'Banco',
              name: inv.name || 'Investimento',
              type: inv.type || 'FIXED_INCOME',
              balance: parseFloat(inv.balance || inv.amount || 0),
              currencyCode: inv.currencyCode || 'BRL',
              rate: inv.rate || null,
              rateType: inv.rateType || null
            });
          });
        }
      } catch (eInv) {
        console.warn(`[Pluggy Backend] Aviso ao buscar investimentos do item ${item.id}:`, eInv.message);
      }
    }

    // Salva cartões e investimentos em app_settings para acesso instantâneo pelo frontend
    await query(`
      DO $$ BEGIN
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pluggy_cards JSONB;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pluggy_investments JSONB;
        ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pluggy_last_sync TIMESTAMP;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `).catch(() => {});

    await query(`
      UPDATE app_settings SET 
        pluggy_cards = $1,
        pluggy_investments = $2,
        pluggy_last_sync = CURRENT_TIMESTAMP
      WHERE id = 'default'
    `, [JSON.stringify(detectedCards), JSON.stringify(detectedInvestments)]);

    // Se encontramos saldo de conta bancária, calibra o saldo inicial do banco
    if (latestBalancesByBank.length > 0) {
      const sumBankBalance = latestBalancesByBank.reduce((acc, b) => acc + (parseFloat(b.balance) || 0), 0);
      const allTxResult = await query("SELECT type, amount FROM transactions WHERE status = 'paid'");
      let totalNet = 0;
      allTxResult.rows.forEach(row => {
        const val = parseFloat(row.amount) || 0;
        if (row.type === 'income') totalNet += val;
        else totalNet -= val;
      });
      const calibratedInitial = (sumBankBalance - totalNet).toFixed(2);
      await query("UPDATE app_settings SET initial_balance = $1 WHERE id = 'default'", [calibratedInitial]);
    }

    console.log(`✅ [Pluggy Backend Sync] Sucesso: ${totalImported} novos, ${totalReconciled} conciliados, ${detectedCards.length} cartões, ${detectedInvestments.length} investimentos.`);
    return {
      success: true,
      totalImported,
      totalReconciled,
      cardsCount: detectedCards.length,
      investmentsCount: detectedInvestments.length,
      cards: detectedCards,
      investments: detectedInvestments,
      balancesByBank: latestBalancesByBank
    };
  } catch (err) {
    console.error('❌ [Pluggy Backend Sync] Erro:', err.message);
    return { success: false, error: err.message };
  }
}

// Endpoint de sincronização manual Pluggy no backend
app.post('/api/pluggy/sync', async (req, res) => {
  try {
    const result = await executePluggySync(req.body.itemId);
    if (!result.success && result.error) {
      return res.status(500).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para consultar Faturas de Cartão de Crédito
app.get('/api/pluggy/cards', async (req, res) => {
  try {
    const r = await query('SELECT pluggy_cards FROM app_settings WHERE id = $1', ['default']);
    const cards = r.rows[0]?.pluggy_cards || [];
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para consultar Reserva de Emergência e Investimentos
app.get('/api/pluggy/investments', async (req, res) => {
  try {
    const r = await query('SELECT pluggy_investments FROM app_settings WHERE id = $1', ['default']);
    const investments = r.rows[0]?.pluggy_investments || [];
    res.json(investments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint Webhook Oficial da Pluggy Open Finance (Recebe notificações em tempo real)
app.post('/api/pluggy/webhook', async (req, res) => {
  // Responde imediatamente 200 OK (requisito obrigatório da Pluggy em até 5s)
  res.status(200).json({ received: true });

  try {
    const event = req.body || {};
    console.log('📬 [Pluggy Webhook] Evento recebido:', event.event, 'Item ID:', event.itemId);

    if (event.event === 'item/created' || event.event === 'item/updated' || event.event === 'transactions/created') {
      const itemId = event.itemId;
      console.log(`⚡ [Pluggy Webhook] Disparando auto-sincronização do item ${itemId || 'geral'}...`);
      const syncRes = await executePluggySync(itemId);
      console.log('✅ [Pluggy Webhook] Sincronização em tempo real concluída:', syncRes);
    }
  } catch (err) {
    console.error('❌ [Pluggy Webhook] Erro ao processar:', err.message);
  }
});

// ==========================================
// 8. WHATICKET API (WHATSAPP)
// ==========================================

// Envio de mensagens de texto via Whaticket
app.post('/api/whaticket/send', async (req, res) => {
  try {
    const { number, body, targetUrl, token } = req.body;

    let sendUrl = targetUrl || 'https://api-whaticket.bascully.com.br/api/messages/send';
    let sendToken = token;

    if (!sendToken) {
      const sRes = await query('SELECT whaticket_settings FROM app_settings WHERE id = $1', ['default']).catch(() => ({ rows: [] }));
      const wSettings = (sRes.rows[0] && sRes.rows[0].whaticket_settings) || {};
      sendToken = wSettings.token;
      if (wSettings.apiUrl) {
        sendUrl = `${wSettings.apiUrl.replace(/\/+$/, '')}/api/messages/send`;
      }
    }

    // Garante prefixo api- caso a URL não contenha api-
    if (sendUrl.includes('whaticket.bascully.com.br') && !sendUrl.includes('api-whaticket.bascully.com.br')) {
      sendUrl = sendUrl.replace('whaticket.bascully.com.br', 'api-whaticket.bascully.com.br');
    }

    if (!sendToken) {
      return res.status(400).json({ success: false, error: 'Token do Whaticket não informado nem configurado.' });
    }

    if (!number || !body) {
      return res.status(400).json({ success: false, error: 'Campos "number" e "body" são obrigatórios.' });
    }

    const cleanNum = String(number).replace(/\D/g, '');

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sendToken.trim()}`
      },
      body: JSON.stringify({
        number: cleanNum,
        body: body
      })
    });

    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      data = await response.text().catch(() => '');
    }

    if (response.ok) {
      res.json({ success: true, status: response.status, data: data });
    } else {
      const errMsg = (typeof data === 'object' ? (data?.message || data?.error) : data) || 'Erro retornado pela API do Whaticket';
      res.status(response.status).json({ success: false, status: response.status, data: data, error: errMsg });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8.1. PROXY & WEBHOOK EVOLUTION API (WHATSAPP - LEGADO)
// ==========================================

// Proxy HTTP para Evolution API (evita bloqueios de CORS e SSL no navegador)
app.post('/api/evolution/proxy', async (req, res) => {
  try {
    const { targetUrl, method = 'GET', apiKey, payload } = req.body;
    if (!targetUrl) return res.status(400).json({ success: false, error: 'targetUrl é obrigatório' });

    const headers = {
      'Content-Type': 'application/json',
      'apikey': apiKey || 'MudeParaUmaSenhaForte123'
    };

    const options = {
      method: method,
      headers: headers
    };

    if (payload && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      data = await response.text().catch(() => '');
    }

    if (response.ok) {
      res.json({ success: true, status: response.status, data: data });
    } else {
      res.status(response.status).json({ success: false, status: response.status, data: data, error: data?.message || data?.error || 'Erro na Evolution API' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Processamento Inteligente de Mensagens do WhatsApp com a IA do Groq
async function processWhatsAppWithGroq(userText, settings) {
  const apiKey = (settings.groq_api_key || '').trim();
  if (!apiKey || apiKey.length < 10) {
    return null; // Sem chave Groq, cai para regras locais
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.toLocaleDateString('pt-BR', { weekday: 'long' });

  // 1. Métricas financeiras reais do mês
  const monthTxs = await query(
    "SELECT type, amount, status FROM transactions WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)"
  ).catch(() => ({ rows: [] }));

  let totalInc = 0, totalExp = 0, pendingExp = 0, pendingInc = 0;
  monthTxs.rows.forEach(t => {
    const val = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      if (t.status === 'paid' || t.status === 'received') totalInc += val;
      else pendingInc += val;
    } else if (t.type === 'expense') {
      if (t.status === 'paid') totalExp += val;
      else pendingExp += val;
    }
  });
  const currentBal = totalInc - totalExp;
  const projectedBal = (totalInc + pendingInc) - (totalExp + pendingExp);

  // 2. Contas dos próximos 15 dias e pendências
  const upcomingTxs = await query(
    "SELECT id, type, description, amount, date, status, category FROM transactions WHERE (status = 'pending') OR (date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '15 days') ORDER BY date ASC LIMIT 30"
  ).catch(() => ({ rows: [] }));

  let pendingListText = 'Nenhuma conta pendente ou prevista encontrada.';
  if (upcomingTxs.rows && upcomingTxs.rows.length > 0) {
    pendingListText = upcomingTxs.rows.map(t => {
      const dStr = t.date ? new Date(t.date).toLocaleDateString('pt-BR') : 'Sem data';
      const kind = t.type === 'income' ? '🟢 A Receber' : '🔴 A Pagar';
      const st = t.status === 'paid' ? 'Pago' : 'Pendente';
      return `• [ID:${t.id}] ${dStr} - ${kind}: ${t.description} - R$ ${parseFloat(t.amount || 0).toFixed(2)} (${st})`;
    }).join('\n');
  }

  // 3. Agenda dos próximos 7 dias
  const upcomingApps = await query(
    "SELECT id, title, date, time FROM appointments WHERE date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days' ORDER BY date ASC, time ASC LIMIT 15"
  ).catch(() => ({ rows: [] }));

  let agendaText = 'Nenhum compromisso agendado.';
  if (upcomingApps.rows && upcomingApps.rows.length > 0) {
    agendaText = upcomingApps.rows.map(a => {
      const dStr = a.date ? new Date(a.date).toLocaleDateString('pt-BR') : '';
      return `• ${dStr} às ${a.time || '--:--'} - ${a.title}`;
    }).join('\n');
  }

  const systemPrompt = `Você é o assistente financeiro pessoal de inteligência artificial do FinControl Pro no WhatsApp.
Hoje é ${dayOfWeek}, ${todayStr}.

DADOS FINANCEIROS REAIS DO USUÁRIO:
- Saldo Atual Realizado: R$ ${currentBal.toFixed(2)}
- Total Receitas Recebidas no Mês: R$ ${totalInc.toFixed(2)}
- Total Despesas Pagas no Mês: R$ ${totalExp.toFixed(2)}
- A Pagar Pendente no Mês: R$ ${pendingExp.toFixed(2)}
- A Receber Previsto no Mês: R$ ${pendingInc.toFixed(2)}
- Saldo Projetado do Mês: R$ ${projectedBal.toFixed(2)}

CONTAS PENDENTES E PREVISÃO DOS PRÓXIMOS 15 DIAS:
${pendingListText}

AGENDA DE COMPROMISSOS (PRÓXIMOS 7 DIAS):
${agendaText}

INSTRUÇÕES E REGRAS:
1. Responda em português brasileiro de forma direta, prestativa, ágil e contextualizada com os dados acima.
2. IMPORTANTE PARA WHATSAPP: Use negrito com apenas um asterisco (*assim*). NUNCA use dois asteriscos (**).
3. Se o usuário fizer uma pergunta (ex: "como tá a previsão dos próximos 10 dias", "quanto tenho de saldo", "o que tenho a pagar amanhã", "resumo da semana"), responda com clareza, somando os valores correspondentes ao período solicitado e listando os itens.
4. Se o usuário estiver informando um gasto, receita, agendamento ou baixa de conta, confirme o registro e inclua OBRIGATORIAMENTE no FINAL da resposta o bloco JSON:
\`\`\`action
{"action": "create_transaction", "data": {"type": "expense"|"income", "description": "...", "amount": 50, "category": "Outros", "date": "YYYY-MM-DD", "status": "paid"|"pending"}}
\`\`\`
ou para baixa em conta pendente:
\`\`\`action
{"action": "settle_transaction", "data": {"id": "ID_DA_CONTA"}}
\`\`\`
ou para compromisso:
\`\`\`action
{"action": "create_appointment", "data": {"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM"}}
\`\`\`
5. Responda DIRETAMENTE ao usuário. Nunca gere tags <think> ou raciocínio interno.`;

  // Modelos suportados no Groq
  let configuredModel = (settings.groq_model || '').trim();
  if (configuredModel.includes('llama-3.1-8b-instant')) configuredModel = 'openai/gpt-oss-120b';

  let modelsToTry = [configuredModel, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
  modelsToTry = [...new Set(modelsToTry.filter(m => m && !m.includes('llama-3.1-8b-instant')))];
  if (modelsToTry.length === 0) modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          temperature: 0.2,
          max_tokens: 700
        })
      });

      if (!response.ok) {
        console.warn(`[Groq AI WhatsApp] Modelo ${model} retornou HTTP ${response.status}`);
        continue;
      }

      const resJson = await response.json();
      let rawAnswer = resJson.choices && resJson.choices[0]?.message?.content;
      if (!rawAnswer) continue;

      // Limpa raciocínio interno caso o modelo emita
      rawAnswer = rawAnswer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // Detecta e processa bloco action se houver
      const actionMatch = rawAnswer.match(/```(?:action|json)?\s*(\{[\s\S]*?\})\s*```/i);
      if (actionMatch) {
        try {
          const actObj = JSON.parse(actionMatch[1]);
          if (actObj.action === 'create_transaction' && actObj.data) {
            const d = actObj.data;
            const txId = d.id || 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            await query(
              'INSERT INTO transactions (id, type, description, amount, category, payment_method, date, due_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
              [txId, d.type || 'expense', d.description || 'Lançamento via WhatsApp', parseFloat(d.amount || 0), d.category || 'Geral', d.paymentMethod || 'PIX', d.date || todayStr, d.date || todayStr, d.status || 'paid']
            );
            console.log(`✅ [Groq WhatsApp Action] Transação criada: ${d.description} R$ ${d.amount}`);
          } else if (actObj.action === 'settle_transaction' && actObj.data && actObj.data.id) {
            await query('UPDATE transactions SET status = $1 WHERE id = $2', ['paid', actObj.data.id]);
            console.log(`✅ [Groq WhatsApp Action] Baixa na conta ID ${actObj.data.id}`);
          } else if (actObj.action === 'create_appointment' && actObj.data) {
            const a = actObj.data;
            const appId = a.id || 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            await query(
              'INSERT INTO appointments (id, title, date, time, cost, location, priority, completed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
              [appId, a.title || 'Compromisso', a.date || todayStr, a.time || '09:00', parseFloat(a.cost || 0), a.location || '', a.priority || 'medium', false]
            );
            console.log(`✅ [Groq WhatsApp Action] Compromisso criado: ${a.title}`);
          }
        } catch (actErr) {
          console.warn('[Groq WhatsApp Action] Erro ao executar ação:', actErr.message);
        }
      }

      // Remove bloco action da mensagem para o WhatsApp ficar limpo e elegante
      let cleanMessage = rawAnswer.replace(/```(?:action|json)?\s*\{[\s\S]*?\}\s*```/gi, '').trim();
      return cleanMessage;
    } catch (err) {
      console.warn(`[Groq AI WhatsApp] Falha ao consultar modelo ${model}:`, err.message);
    }
  }

  return null;
}

const handleIncomingWhatsAppMessage = async (req, res, sourceName = 'WhatsApp') => {
  res.status(200).json({ received: true });

  try {
    const body = req.body || {};
    const event = body.event || body.type;

    // Se for formato Evolution e não for mensagem recebida, ignora
    if (event && event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return;
    }

    const data = body.data || body;
    const msgObj = data.message || (data.messages && data.messages[0]);
    if (!msgObj) return;

    const key = data.key || (data.messages && data.messages[0]?.key);
    if (!key || key.fromMe) return; // Ignora mensagens enviadas pelo próprio bot

    const remoteJid = key.remoteJid || '';
    const senderNumber = remoteJid.split('@')[0];

    // Texto da mensagem
    const textMessage = msgObj.conversation || 
      (msgObj.extendedTextMessage && msgObj.extendedTextMessage.text) || 
      '';

    if (!textMessage || typeof textMessage !== 'string') return;
    const trimmed = textMessage.trim();

    console.log(`💬 [${sourceName} Webhook] Mensagem recebida de ${senderNumber}: "${trimmed}"`);

    // Busca configurações do app
    const sRes = await query('SELECT * FROM app_settings WHERE id = $1', ['default']);
    const settings = sRes.rows[0] || {};
    const wSettings = settings.whaticket_settings || {};
    const evoSettings = settings.evolution_settings || {};
    const authPhone = (wSettings.userPhone || evoSettings.userPhone || '5567981203317').replace(/\D/g, '');

    // Se for grupo do WhatsApp (@g.us), ignora
    if (remoteJid.endsWith('@g.us')) return;

    // Se houver telefone configurado, valida autorização de forma flexível (suporta LIDs do WhatsApp)
    const isAuthorized = !authPhone || 
      senderNumber.endsWith(authPhone.slice(-8)) || 
      senderNumber.includes('81283117') || 
      senderNumber.includes('81203317') ||
      senderNumber.startsWith('203259948056671') ||
      senderNumber.length > 13;

    if (!isAuthorized) {
      console.warn(`[${sourceName} Webhook] Mensagem de número não autorizado: ${senderNumber}`);
      return;
    }

    // Se o remetente for um LID interno do WhatsApp Web/Multi-device, responde para o telefone real
    let targetSendNumber = senderNumber;
    if (senderNumber.length > 13 || senderNumber.startsWith('203259948056671') || !senderNumber.startsWith('55')) {
      targetSendNumber = authPhone || '5567981203317';
    }

    // 1. Tenta processar prioritariamente via Inteligência Artificial do Groq
    let reply = '';
    try {
      reply = await processWhatsAppWithGroq(trimmed, settings);
      if (reply) {
        console.log(`🤖 [Groq AI WhatsApp] Resposta gerada com sucesso pela IA.`);
      }
    } catch (groqErr) {
      console.warn(`[${sourceName} Webhook] Erro ao consultar Groq AI:`, groqErr.message);
    }

    // 2. Se a IA do Groq não respondeu ou não está configurada, utiliza o motor local de regras
    if (!reply) {
      const lower = trimmed.toLowerCase();

    // Resumo da Semana
    if (lower.includes('semana') || lower.includes('radar')) {
      const txs = await query("SELECT type, amount, status FROM transactions WHERE date >= date_trunc('week', CURRENT_DATE) AND date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'");
      let totalInc = 0, totalExp = 0, pendingExp = 0, pendingInc = 0;
      txs.rows.forEach(t => {
        const val = parseFloat(t.amount) || 0;
        if (t.type === 'income') {
          if (t.status === 'paid' || t.status === 'received') totalInc += val;
          else pendingInc += val;
        } else if (t.type === 'expense') {
          if (t.status === 'paid') totalExp += val;
          else pendingExp += val;
        }
      });
      const bal = totalInc - totalExp;
      reply = `📊 *Resumo da Semana • FinControl Pro*\n\n` +
        `• 💰 *Receitas Realizadas:* R$ ${totalInc.toFixed(2)}\n` +
        `• ⏳ *A Receber na Semana:* R$ ${pendingInc.toFixed(2)}\n` +
        `• 💸 *Despesas Pagas:* R$ ${totalExp.toFixed(2)}\n` +
        `• ⚠️ *A Pagar Pendente:* R$ ${pendingExp.toFixed(2)}\n` +
        `• 🏦 *Saldo Realizado:* *R$ ${bal.toFixed(2)}*`;
    }
    // Resumo do Mês / Saldo
    else if (lower.includes('saldo') || lower.includes('quanto tenho') || lower.includes('resumo') || lower.includes('mês') || lower.includes('mes')) {
      const txs = await query("SELECT type, amount, status FROM transactions WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)");
      let totalInc = 0, totalExp = 0, pendingExp = 0;
      txs.rows.forEach(t => {
        const val = parseFloat(t.amount) || 0;
        if (t.type === 'income') totalInc += val;
        else if (t.type === 'expense') {
          if (t.status === 'paid') totalExp += val;
          else pendingExp += val;
        }
      });
      const bal = totalInc - totalExp;
      reply = `📊 *Resumo Financeiro do Mês:*\n\n` +
        `• 💰 *Receitas:* R$ ${totalInc.toFixed(2)}\n` +
        `• 💸 *Despesas Pagas:* R$ ${totalExp.toFixed(2)}\n` +
        `• ⏳ *A Pagar em Aberto:* R$ ${pendingExp.toFixed(2)}\n` +
        `• 🏦 *Saldo Atual:* *R$ ${bal.toFixed(2)}*`;
    }
    // Lançamento de Gastos simples (ex: "gastei 50 no mercado", "paguei 30 no lanche")
    else if (lower.includes('gastei ') || lower.includes('comprei ') || lower.includes('paguei ')) {
      const valMatch = trimmed.match(/(\d+(?:[.,]\d{1,2})?)/);
      if (valMatch) {
        const amount = parseFloat(valMatch[1].replace(',', '.'));
        let desc = trimmed.replace(/\b(gastei|comprei|paguei|reais|r\$|hoje|no|na|de)\b/gi, '').trim();
        if (!desc) desc = 'Despesa via WhatsApp';
        
        await query(
          'INSERT INTO transactions (type, description, amount, category, payment_method, date, status) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6)',
          ['expense', desc, amount, 'Geral', 'WhatsApp', 'paid']
        );

        reply = `✅ *Despesa Registrada!*\n\n• 💸 *Descrição:* ${desc}\n• 💵 *Valor:* R$ ${amount.toFixed(2)}\n• 📅 *Data:* Hoje\n• 📌 *Status:* Pago ✅`;
      }
    }
    // Recebimento simples (ex: "recebi 1500 de salario", "recebi 100 via pix")
    else if (lower.includes('recebi ') || lower.includes('ganhei ')) {
      const valMatch = trimmed.match(/(\d+(?:[.,]\d{1,2})?)/);
      if (valMatch) {
        const amount = parseFloat(valMatch[1].replace(',', '.'));
        let desc = trimmed.replace(/\b(recebi|ganhei|reais|r\$|hoje|no|na|de|via|pix)\b/gi, '').trim();
        if (!desc) desc = 'Receita via WhatsApp';
        
        await query(
          'INSERT INTO transactions (type, description, amount, category, payment_method, date, status) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6)',
          ['income', desc, amount, 'Geral', 'PIX', 'paid']
        );

        reply = `✅ *Receita Registrada!*\n\n• 💰 *Descrição:* ${desc}\n• 💵 *Valor:* R$ ${amount.toFixed(2)}\n• 📅 *Data:* Hoje\n• 📌 *Status:* Recebido ✅`;
      }
    }

      if (!reply) {
        reply = `🤖 *FinControl Pro*\n\nVocê pode me enviar:\n• 📊 *"Resumo da semana"*\n• 🏦 *"Qual meu saldo atual?"*\n• 💸 *"Gastei 50 no almoço"*\n• 💰 *"Recebi 1500 de salário"*`;
      }
    }

    // 1. Envia resposta via Whaticket (padrão atual)
    const whaticketToken = (wSettings.token || 'fincontrol_token_2026').trim();
    let whaticketUrl = (wSettings.apiUrl || 'https://api-whaticket.bascully.com.br').trim();
    if (whaticketUrl.includes('whaticket.bascully.com.br') && !whaticketUrl.includes('api-whaticket.bascully.com.br')) {
      whaticketUrl = whaticketUrl.replace('whaticket.bascully.com.br', 'api-whaticket.bascully.com.br');
    }
    whaticketUrl = whaticketUrl.replace(/\/api\/messages\/send\/?$/i, '').replace(/\/api\/?$/i, '').replace(/\/+$/, '');

    let whaticketSent = false;
    if (whaticketToken) {
      try {
        const sendEndpoint = `${whaticketUrl}/api/messages/send`;
        const resSend = await fetch(sendEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${whaticketToken}`
          },
          body: JSON.stringify({ number: targetSendNumber, body: reply })
        });
        if (resSend.ok) {
          whaticketSent = true;
          console.log(`✅ [Whaticket Webhook] Resposta enviada com sucesso para ${targetSendNumber}`);
        } else {
          const errTxt = await resSend.text().catch(() => '');
          console.warn(`[Whaticket Webhook] Falha ao enviar resposta: HTTP ${resSend.status} - ${errTxt}`);
        }
      } catch (errWhaticket) {
        console.warn('Erro ao responder no WhatsApp via Whaticket:', errWhaticket.message);
      }
    }

    // 2. Se Whaticket não estiver ativo, tenta Evolution API legado
    if (!whaticketSent) {
      const evoUrl = (evoSettings.apiUrl || 'https://api.bascully.com.br').replace(/\/+$/, '');
      const evoKey = evoSettings.apiKey || 'MudeParaUmaSenhaForte123';
      const evoInst = evoSettings.instanceName || 'financeiro5';

      if (evoUrl && evoInst) {
        try {
          await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(evoInst)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evoKey },
            body: JSON.stringify({ number: targetSendNumber, text: reply })
          });
        } catch (errSend) {
          console.warn('Erro ao responder no WhatsApp via Evolution:', errSend.message);
        }
      }
    }
  } catch (err) {
    console.error(`❌ [${sourceName} Webhook] Erro ao processar:`, err.message);
  }
};

app.post('/api/whaticket/webhook', (req, res) => handleIncomingWhatsAppMessage(req, res, 'Whaticket'));
app.post('/api/evolution/webhook', (req, res) => handleIncomingWhatsAppMessage(req, res, 'Evolution'));

// Inicialização do servidor
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`\n==================================================`);
      console.log(`🚀 FINCONTROL PRO API RODANDO NA PORTA ${PORT}`);
      console.log(`🐘 Banco de Dados: PostgreSQL (Localhost:5432)`);
      console.log(`🌐 Painel aaPanel: Integrado e Ativo`);
      console.log(`⚡ Webhook MP: http://76.13.163.214/api/mercadopago/webhook`);
      console.log(`==================================================\n`);

      // Agenda auto-sincronização periódica em segundo plano (a cada 5 minutos)
      const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutos
      setInterval(async () => {
        try {
          const res = await executeMercadoPagoSync();
          if (res && res.success && res.novosImportados > 0) {
            console.log(`🔄 [Auto-Sync MP Background] ${res.novosImportados} novas movimentações importadas com sucesso.`);
          }
        } catch (e) {
          // Erro silencioso se token ainda não estiver configurado
        }
      }, SYNC_INTERVAL);

      // Agenda auto-sincronização periódica da Pluggy Open Finance (a cada 10 minutos)
      const PLUGGY_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutos
      setInterval(async () => {
        try {
          const res = await executePluggySync();
          if (res && res.success && (res.totalImported > 0 || res.totalReconciled > 0)) {
            console.log(`🔄 [Auto-Sync Pluggy Background] ${res.totalImported} novos, ${res.totalReconciled} conciliados.`);
          }
        } catch (e) {
          // Erro silencioso em caso de oscilação temporária da rede
        }
      }, PLUGGY_SYNC_INTERVAL);
    });
  } catch (err) {
    console.error('❌ Falha ao iniciar servidor:', err.message);
    console.log('Tentando rodar apenas servidor HTTP para diagnóstico...');
    app.listen(PORT, () => {
      console.log(`⚠️ Servidor HTTP rodando na porta ${PORT} (Aguardando ajuste de credenciais do banco)`);
    });
  }
}

startServer();
