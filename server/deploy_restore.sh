#!/bin/bash
set -e

echo "=== 1. Verificando e Criando Usuário/Banco PostgreSQL ==="
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'techprofincas') THEN CREATE ROLE techprofincas WITH LOGIN PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; ELSE ALTER ROLE techprofincas WITH PASSWORD 'yAmPnFzCGAnJnhkk' SUPERUSER; END IF; END \$\$;"

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'techprofincas'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE techprofincas OWNER techprofincas;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE techprofincas TO techprofincas;"

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
PGPASSWORD='yAmPnFzCGAnJnhkk' psql -h localhost -U techprofincas -d techprofincas -f restore.sql

echo "=== 4. Reiniciando o Servidor Node.js na porta 3006 ==="
fuser -k 3006/tcp 2>/dev/null || true
sleep 2

npm install
pm2 delete techprofinancas 2>/dev/null || true
pm2 start index.js --name techprofinancas
pm2 save

sleep 3
echo "=== 5. Status da API e Banco de Dados ==="
curl -s http://localhost:3006/api/health
echo ""
echo "=== DEPLOY E RESTAURAÇÃO FINALIZADOS COM SUCESSO! ==="