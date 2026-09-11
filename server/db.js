// Módulo de Conexão com PostgreSQL (pg Pool) - FinControl Pro
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'techprofinancas',
  password: process.env.DB_PASSWORD || 'yAmPnFzCGAnJnhkk',
  database: process.env.DB_NAME || 'techprofinancas',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

let pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool(dbConfig);

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

async function initDatabase() {
  let client;
  const candidateUsers = [
    process.env.DB_USER,
    'techprofinancas',
    'techprofinaças',
    'tecprofinancas',
    'tecprofinanças'
  ].filter(Boolean);

  const candidatePasswords = [
    process.env.DB_PASSWORD,
    'yAmPnFzCGAnJnhkk',
    'w4m25cdBHKmDNdXN'
  ].filter(Boolean);

  let connected = false;
  let lastErr = null;

  for (const u of [...new Set(candidateUsers)]) {
    for (const p of [...new Set(candidatePasswords)]) {
      try {
        await pool.end().catch(() => {});
        dbConfig.user = u;
        dbConfig.database = u;
        dbConfig.password = p;
        pool = new Pool(dbConfig);
        client = await pool.connect();
        console.log(`🔌 Conectado com sucesso ao PostgreSQL usando "${u}"!`);
        connected = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (connected) break;
  }

  if (!connected) {
    console.error('❌ Falha ao conectar ao PostgreSQL:', lastErr ? lastErr.message : 'Desconhecido');
    throw lastErr;
  }

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('✅ Tabelas e índices do FinControl Pro verificados/criados com sucesso!');
    }
  } catch (err) {
    console.error('❌ Falha ao aplicar schema.sql:', err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
}

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log('SQL executado:', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
}

module.exports = {
  get pool() { return pool; },
  query,
  initDatabase
};
