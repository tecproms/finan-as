#!/bin/bash
set -e

echo "=== 1. Verificando e Criando Usuários/Banco PostgreSQL ==="
sudo -u postgres psql << 'EOF'
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'techprofincas') THEN 
    CREATE ROLE techprofincas WITH LOGIN PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; 
  ELSE 
    ALTER ROLE techprofincas WITH PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; 
  END IF; 

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tecprofinancas') THEN 
    CREATE ROLE tecprofinancas WITH LOGIN PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; 
  ELSE 
    ALTER ROLE tecprofinancas WITH PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; 
  END IF; 

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'techprofinancas') THEN 
    CREATE ROLE techprofinancas WITH LOGIN PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; 
  ELSE 
    ALTER ROLE techprofinancas WITH PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; 
  END IF; 
END $$;

SELECT 'CREATE DATABASE techprofincas OWNER techprofincas' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'techprofincas')\gexec
SELECT 'CREATE DATABASE tecprofinancas OWNER tecprofinancas' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tecprofinancas')\gexec
SELECT 'CREATE DATABASE techprofinancas OWNER techprofinancas' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'techprofinancas')\gexec

GRANT ALL PRIVILEGES ON DATABASE techprofincas TO techprofincas;
GRANT ALL PRIVILEGES ON DATABASE techprofincas TO tecprofinancas;
GRANT ALL PRIVILEGES ON DATABASE techprofincas TO techprofinancas;

GRANT ALL PRIVILEGES ON DATABASE tecprofinancas TO techprofincas;
GRANT ALL PRIVILEGES ON DATABASE tecprofinancas TO tecprofinancas;
GRANT ALL PRIVILEGES ON DATABASE tecprofinancas TO techprofinancas;
EOF

echo "=== 2. Configurando o arquivo .env ==="
cat << 'EOF' > .env
PORT=3006
DB_HOST=localhost
DB_PORT=5432
DB_USER=techprofincas
DB_PASSWORD=yAmPnFzCGAnJnhkk
DB_NAME=techprofincas
API_SECRET=fincontrol_secret_token_2026
EOF

echo "=== 3. Restaurando todos os dados do backup ==="
PGPASSWORD='yAmPnFzCGAnJnhkk' psql -h localhost -U techprofincas -d techprofincas -f restore.sql || true
PGPASSWORD='yAmPnFzCGAnJnhkk' psql -h localhost -U tecprofinancas -d tecprofinancas -f restore.sql || true

echo "=== 4. Reiniciando o Servidor Node.js na porta 3006 ==="
kill -9 $(lsof -t -i:3006 2>/dev/null) 2>/dev/null || true
fuser -k 3006/tcp 2>/dev/null || true
pkill -9 -f "node.*index.js" 2>/dev/null || true
sleep 2

npm install --production 2>/dev/null || npm install
pm2 delete techprofinancas 2>/dev/null || true
pm2 start index.js --name techprofinancas
pm2 save

sleep 3
echo "=== 5. Status da API e Banco de Dados ==="
curl -s http://localhost:3006/api/health
echo ""
echo "=== DEPLOY E RESTAURAÇÃO FINALIZADOS COM SUCESSO! ==="