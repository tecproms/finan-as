-- Esquema Relacional FinControl Pro para PostgreSQL (PgSQL)
-- Otimizado para precisão monetária, segurança ACID e alta concorrência

-- 1. Tabela de Transações Financeiras (Receitas e Despesas)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    description VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
    category VARCHAR(80) NOT NULL DEFAULT 'Outros',
    payment_method VARCHAR(50) NOT NULL DEFAULT 'PIX',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    installments INTEGER NOT NULL DEFAULT 1,
    current_installment INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    external_id VARCHAR(100) UNIQUE, -- Anti-duplicação para Mercado Pago e Open Finance
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para buscas ultrarrápidas de relatórios e filtros
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_external ON transactions(external_id);

-- 2. Tabela de Agenda & Compromissos
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time VARCHAR(10) NOT NULL DEFAULT '09:00',
    cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    location VARCHAR(255) DEFAULT '',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_completed ON appointments(completed);

-- 3. Tabela de Anotações Ágeis
CREATE TABLE IF NOT EXISTS notes (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tag VARCHAR(50) NOT NULL DEFAULT 'Geral',
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    color VARCHAR(30) DEFAULT 'slate',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_notes_tag ON notes(tag);

-- 4. Tabela de Configurações Gerais do Sistema (Groq, Mercado Pago, etc)
CREATE TABLE IF NOT EXISTS app_settings (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'default',
    user_name VARCHAR(100) DEFAULT 'Usuário',
    groq_api_key TEXT DEFAULT '',
    groq_model VARCHAR(100) DEFAULT 'llama-3.1-8b-instant',
    security_pin_hash TEXT DEFAULT '',
    autolock_minutes INTEGER DEFAULT 5,
    mercado_pago_token TEXT DEFAULT '',
    mercado_pago_auto_sync BOOLEAN DEFAULT FALSE,
    mercado_pago_last_sync TIMESTAMP WITH TIME ZONE,
    inter_settings JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inserção de registro padrão de configurações se não existir
INSERT INTO app_settings (id, user_name) 
VALUES ('default', 'Usuário') 
ON CONFLICT (id) DO NOTHING;

-- 5. Logs de Sincronização do Mercado Pago
CREATE TABLE IF NOT EXISTS mp_sync_logs (
    id SERIAL PRIMARY KEY,
    sync_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    imported_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    details TEXT DEFAULT ''
);
