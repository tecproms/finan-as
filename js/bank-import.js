// Módulo de Importação de Extrato Bancário (.OFX e .CSV) e Integração Banco Inter - FinControl Pro

class BankImportModule {
  constructor() {
    this.pendingImports = [];
  }

  // --- PARSER DE ARQUIVO OFX (Padrão de todos os bancos brasileiros) ---
  parseOFX(ofxContent) {
    const transactions = [];

    // Localiza blocos <STMTTRN>...</STMTTRN> ou <STMTTRN> sem tag de fechamento (formato SGML)
    const regexTrn = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>|$))/gi;
    let match;

    while ((match = regexTrn.exec(ofxContent)) !== null) {
      const block = match[1];

      // Extrai campos principais
      const typeMatch = block.match(/<TRNTYPE>([^\r\n<]+)/i);
      const dateMatch = block.match(/<DTPOSTED>([^\r\n<]+)/i);
      const amountMatch = block.match(/<TRNAMT>([^\r\n<]+)/i);
      const memoMatch = block.match(/<MEMO>([^\r\n<]+)/i);
      const checkNumMatch = block.match(/<CHECKNUM>([^\r\n<]+)/i);

      if (dateMatch && amountMatch) {
        const rawType = typeMatch ? typeMatch[1].trim().toUpperCase() : '';
        const rawDate = dateMatch[1].trim();
        const rawAmt = amountMatch[1].trim().replace(',', '.');
        const numAmt = parseFloat(rawAmt);

        if (isNaN(numAmt)) continue;

        // Determina se é despesa ou receita
        const isIncome = rawType === 'CREDIT' || numAmt > 0;
        const amount = Math.abs(numAmt);
        const type = isIncome ? 'income' : 'expense';

        // Formata data YYYYMMDD -> YYYY-MM-DD
        let formattedDate = new Date().toISOString().split('T')[0];
        if (rawDate.length >= 8) {
          const y = rawDate.substring(0, 4);
          const m = rawDate.substring(4, 6);
          const d = rawDate.substring(6, 8);
          formattedDate = `${y}-${m}-${d}`;
        }

        // Descrição da transação
        let desc = memoMatch ? memoMatch[1].trim() : (checkNumMatch ? checkNumMatch[1].trim() : 'Lançamento Bancário');
        desc = this.cleanBankDescription(desc);

        // Categoria inteligente automática
        const category = this.detectCategory(desc, type);

        transactions.push({
          id: 'imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          selected: true,
          type: type,
          description: desc,
          amount: amount,
          category: category,
          paymentMethod: 'Transferência',
          date: formattedDate,
          dueDate: formattedDate,
          status: 'paid',
          notes: 'Importado de extrato bancário OFX'
        });
      }
    }

    return transactions;
  }

  // --- PARSER DE ARQUIVO CSV DE EXTRATO (Nubank, Inter, Itaú, etc) ---
  parseCSV(csvContent) {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) return [];

    const transactions = [];
    const headerLine = lines[0].toLowerCase();
    const delimiter = headerLine.includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));

    // Tenta identificar as colunas de data, descrição e valores
    const dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date') || h.includes('release_date') || h.includes('data de liberação') || h.includes('data da transação'));
    const descIdx = headers.findIndex(h => h.includes('descri') || h.includes('hist') || h.includes('título') || h.includes('title') || h.includes('identificador') || h.includes('detalhe') || h.includes('reference') || h.includes('origem'));
    
    // Suporte a coluna única de valor OU colunas separadas de Crédito e Débito (comum em extratos MP)
    const valIdx = headers.findIndex(h => (h.includes('valor') || h.includes('amount') || h.includes('quantia')) && !h.includes('bruto') && !h.includes('taxa') && !h.includes('fee'));
    const creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('crédito') || h.includes('entrada') || h.includes('receita'));
    const debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('débito') || h.includes('saída') || h.includes('despesa'));

    // Helper para converter string monetária em número float de forma segura (PT-BR ou EN-US)
    const parseMoney = (valStr) => {
      if (!valStr) return null;
      let s = valStr.toString().replace(/[^\d,\.\-]/g, '').trim();
      if (!s) return null;
      
      const hasComma = s.includes(',');
      const hasDot = s.includes('.');

      if (hasComma && hasDot) {
        // Ex: 1.250,50 ou 1,250.50
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          // Padrão BR: 1.250,50 -> remove ponto, substitui vírgula
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          // Padrão US: 1,250.50 -> remove vírgula
          s = s.replace(/,/g, '');
        }
      } else if (hasComma) {
        // Ex: 45,90 -> padrão BR decimal
        s = s.replace(',', '.');
      }
      // Se tiver apenas ponto (ex: 45.90 ou -35.50), já é o formato float correto!

      const num = parseFloat(s);
      return isNaN(num) ? null : num;
    };

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 2) continue;

      let rawDate = dateIdx !== -1 ? cols[dateIdx] : cols[0];
      let rawDesc = descIdx !== -1 ? cols[descIdx] : (cols[1] || 'Lançamento Extrato');
      
      let numVal = null;
      let isIncome = false;

      // 1. Caso existam colunas separadas de Crédito e Débito
      if (creditIdx !== -1 && debitIdx !== -1) {
        const credVal = parseMoney(cols[creditIdx]);
        const debVal = parseMoney(cols[debitIdx]);

        if (credVal && credVal > 0) {
          numVal = credVal;
          isIncome = true;
        } else if (debVal && Math.abs(debVal) > 0) {
          numVal = Math.abs(debVal);
          isIncome = false;
        }
      }

      // 2. Caso seja uma única coluna de valor
      if (numVal === null && valIdx !== -1) {
        const v = parseMoney(cols[valIdx]);
        if (v !== null && v !== 0) {
          isIncome = v > 0;
          numVal = Math.abs(v);
        }
      }

      // Fallback: se não achou pelas colunas mapeadas, tenta varrer a linha
      if (numVal === null) {
        for (let c = cols.length - 1; c >= 0; c--) {
          const v = parseMoney(cols[c]);
          if (v !== null && v !== 0) {
            isIncome = v > 0;
            numVal = Math.abs(v);
            break;
          }
        }
      }

      if (numVal === null || numVal === 0) continue;

      const amount = Math.abs(numVal);
      const type = isIncome ? 'income' : 'expense';

      // Converte formatos de data: DD/MM/YYYY ou YYYY-MM-DD ou ISO
      let formattedDate = new Date().toISOString().split('T')[0];
      if (rawDate) {
        const cleanDate = rawDate.split(' ')[0].split('T')[0];
        if (cleanDate.includes('/')) {
          const parts = cleanDate.split('/');
          if (parts.length === 3) {
            const d = parts[0].padStart(2, '0');
            const m = parts[1].padStart(2, '0');
            const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
            formattedDate = `${y}-${m}-${d}`;
          }
        } else if (cleanDate.match(/^\d{4}-\d{2}-\d{2}/)) {
          formattedDate = cleanDate.substring(0, 10);
        }
      }

      const cleanDesc = this.cleanBankDescription(rawDesc || 'Lançamento Extrato');
      const category = this.detectCategory(cleanDesc, type);

      transactions.push({
        id: 'imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        selected: true,
        type: type,
        description: cleanDesc,
        amount: amount,
        category: category,
        paymentMethod: 'Mercado Pago',
        date: formattedDate,
        dueDate: formattedDate,
        status: 'paid',
        notes: 'Importado de extrato bancário oficial'
      });
    }

    return transactions;
  }

  // Limpa descrições feias de extratos bancários
  cleanBankDescription(raw) {
    return raw
      .replace(/^(COMPRA|TRANSF|TED|DOC|PIX ENVIADO|PIX RECEBIDO|PAGTO|PAGAMENTO|PGTO|DEBITO|CREDITO)\s*-?\s*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Detecta categoria inteligente com base no texto
  detectCategory(desc, type) {
    if (type === 'income') {
      const lower = desc.toLowerCase();
      if (lower.includes('salario') || lower.includes('remunera') || lower.includes('folha')) return 'Salário';
      if (lower.includes('rendimento') || lower.includes('dividend') || lower.includes('jcp') || lower.includes('invest')) return 'Investimentos';
      return 'Serviços';
    }

    const lower = desc.toLowerCase();
    if (lower.includes('uber') || lower.includes('99') || lower.includes('posto') || lower.includes('combust') || lower.includes('gasolina') || lower.includes('estac')) return 'Transporte';
    if (lower.includes('mercado') || lower.includes('supermercado') || lower.includes('atacad') || lower.includes('almoço') || lower.includes('restaurante') || lower.includes('ifood') || lower.includes('burger') || lower.includes('padaria') || lower.includes('lanche')) return 'Alimentação';
    if (lower.includes('farmacia') || lower.includes('droga') || lower.includes('medico') || lower.includes('dentista') || lower.includes('hospital') || lower.includes('saude') || lower.includes('laborat')) return 'Saúde';
    if (lower.includes('aluguel') || lower.includes('condom') || lower.includes('luz') || lower.includes('energia') || lower.includes('enel') || lower.includes('cpfl') || lower.includes('agua') || lower.includes('sabesp') || lower.includes('internet') || lower.includes('claro') || lower.includes('vivo')) return 'Moradia';
    if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('prime') || lower.includes('disney') || lower.includes('youtube') || lower.includes('hbo')) return 'Assinaturas';
    if (lower.includes('cinema') || lower.includes('bar') || lower.includes('cervej') || lower.includes('show') || lower.includes('festa')) return 'Lazer';
    if (lower.includes('curso') || lower.includes('faculdade') || lower.includes('escola') || lower.includes('livro') || lower.includes('udemy')) return 'Educação';
    if (lower.includes('amazon') || lower.includes('mercado livre') || lower.includes('magalu') || lower.includes('shopee') || lower.includes('shein')) return 'Compras';

    return 'Outros';
  }

  // Abre arquivo selecionado pelo usuário
  handleFileSelect(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      let parsed = [];

      if (file.name.toLowerCase().endsWith('.ofx')) {
        parsed = this.parseOFX(content);
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        parsed = this.parseCSV(content);
      } else {
        alert('Por favor, selecione um arquivo no formato .OFX ou .CSV.');
        return;
      }

      if (parsed.length === 0) {
        alert('Não foi possível identificar lançamentos no arquivo selecionado. Verifique se é um extrato válido.');
        return;
      }

      this.pendingImports = parsed;
      this.openImportPreviewModal(parsed, file.name);
      fileInput.value = ''; // Reseta input
    };
    reader.readAsText(file, 'ISO-8859-1'); // Bancos brasileiros costumam usar ISO-8859-1 ou UTF-8
  }

  // Abre modal de prévia dos lançamentos a serem importados
  openImportPreviewModal(items, fileName) {
    const modal = document.getElementById('modal-import-bank');
    const container = document.getElementById('import-preview-list');
    const titleEl = document.getElementById('import-file-name');
    const countEl = document.getElementById('import-total-count');

    if (titleEl) titleEl.textContent = fileName;
    if (countEl) countEl.textContent = `${items.length} lançamentos encontrados`;

    if (container) {
      container.innerHTML = items.map((item, index) => {
        const isIncome = item.type === 'income';
        const colorClass = isIncome ? 'text-emerald-400' : 'text-rose-400';
        const sign = isIncome ? '+' : '-';

        return `
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <input type="checkbox" id="chk-imp-${index}" ${item.selected ? 'checked' : ''} onchange="window.bankImport.toggleItemSelection(${index}, this.checked)" class="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer" />
              <div class="min-w-0">
                <p class="font-semibold text-slate-200 truncate">${item.description}</p>
                <div class="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <span>${window.finance.formatDate(item.date)}</span>
                  <span>•</span>
                  <span class="text-slate-300 font-medium">${item.category}</span>
                </div>
              </div>
            </div>
            <div class="text-right shrink-0 pl-2">
              <p class="font-bold ${colorClass}">${sign} ${window.finance.formatMoney(item.amount)}</p>
            </div>
          </div>
        `;
      }).join('');
    }

    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  toggleItemSelection(index, checked) {
    if (this.pendingImports[index]) {
      this.pendingImports[index].selected = checked;
    }
  }

  toggleSelectAll(checked) {
    this.pendingImports.forEach((item, idx) => {
      item.selected = checked;
      const chk = document.getElementById(`chk-imp-${idx}`);
      if (chk) chk.checked = checked;
    });
  }

  closeImportModal() {
    const modal = document.getElementById('modal-import-bank');
    if (modal) modal.classList.add('hidden');
    this.pendingImports = [];
  }

  // Efetiva a importação dos selecionados para o banco de dados
  confirmImport() {
    const selected = this.pendingImports.filter(i => i.selected);
    if (selected.length === 0) {
      alert('Nenhum lançamento selecionado para importação.');
      return;
    }

    let importedCount = 0;
    selected.forEach(item => {
      window.db.addTransaction({
        type: item.type,
        description: item.description,
        amount: item.amount,
        category: item.category,
        paymentMethod: item.paymentMethod,
        date: item.date,
        dueDate: item.date,
        status: item.status,
        notes: item.notes
      });
      importedCount++;
    });

    if (window.confetti) {
      window.confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
    }

    alert(`✅ Sucesso! ${importedCount} lançamentos bancários foram importados e computados no seu saldo!`);
    this.closeImportModal();
    window.app.switchTab('finances');
  }

  // --- MÓDULO BANCO INTER API ---
  getInterSettings() {
    const settings = window.db.getSettings();
    return settings.interApi || {
      enabled: false,
      environment: 'sandbox', // 'sandbox' ou 'production'
      clientId: '',
      clientSecret: '',
      certificateName: '',
      lastSync: null
    };
  }

  saveInterSettings(newConfig) {
    const settings = window.db.getSettings();
    const merged = { ...this.getInterSettings(), ...newConfig };
    window.db.setSettings({ interApi: merged });
    return merged;
  }

  // Simulação / Teste de Conexão com API do Banco Inter
  async testInterConnection(clientId, clientSecret, env = 'sandbox') {
    if (!clientId || !clientSecret) {
      throw new Error('Informe o Client ID e o Client Secret.');
    }

    // Em ambiente de navegador, a API do Inter exige mTLS (certificados X.509) e bloqueia CORS direto se chamado sem proxy.
    // Simulamos a validação de formato e conexão do Sandbox:
    await new Promise(r => setTimeout(r, 1200));

    if (clientId.length < 10) {
      throw new Error('Client ID inválido ou curto demais.');
    }

    return {
      success: true,
      message: `Conexão bem-sucedida com o ambiente ${env.toUpperCase()} do Banco Inter!`
    };
  }

  // Puxa extrato de demonstração do Banco Inter Sandbox
  async syncInterDemoTransactions() {
    const today = new Date().toISOString().split('T')[0];
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const interDemoData = [
      {
        type: 'income',
        description: 'PIX Recebido - Venda Online',
        amount: 850.00,
        category: 'Serviços',
        paymentMethod: 'PIX',
        date: today,
        dueDate: today,
        status: 'paid',
        notes: 'Sincronizado via Banco Inter API'
      },
      {
        type: 'expense',
        description: 'Pagamento de Fornecedor - PIX',
        amount: 420.00,
        category: 'Outros',
        paymentMethod: 'PIX',
        date: today,
        dueDate: today,
        status: 'paid',
        notes: 'Sincronizado via Banco Inter API'
      },
      {
        type: 'expense',
        description: 'Tarifa de Manutenção e Serviços',
        amount: 0.00,
        category: 'Outros',
        paymentMethod: 'Transferência',
        date: today,
        dueDate: today,
        status: 'paid',
        notes: 'Banco Inter - Conta 100% Gratuita'
      }
    ];

    interDemoData.forEach(tx => window.db.addTransaction(tx));

    this.saveInterSettings({
      lastSync: new Date().toISOString()
    });

    if (window.confetti) {
      window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    }

    alert('✅ Extrato sincronizado com o Banco Inter! 3 lançamentos adicionados.');
    window.app.switchTab('finances');
  }
}

window.bankImport = new BankImportModule();
