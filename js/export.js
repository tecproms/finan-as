// Módulo de Exportação e Backup - FinControl Pro

class ExportModule {
  constructor() {}

  // Exporta transações para planilha Excel / CSV formatado para o padrão brasileiro
  exportTransactionsToCSV() {
    const transactions = window.db.getTransactions();
    if (transactions.length === 0) {
      alert('Nenhuma transação encontrada para exportar.');
      return;
    }

    const headers = [
      'ID',
      'Tipo',
      'Descrição',
      'Valor (R$)',
      'Categoria',
      'Forma de Pagamento',
      'Data Lançamento',
      'Data Vencimento',
      'Status',
      'Parcelas',
      'Observações'
    ];

    const rows = transactions.map(t => [
      t.id,
      t.type === 'income' ? 'Receita' : 'Despesa',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      parseFloat(t.amount || 0).toFixed(2).replace('.', ','),
      t.category || '',
      t.paymentMethod || '',
      t.date || '',
      t.dueDate || '',
      t.status === 'paid' ? 'Pago' : 'Pendente',
      t.installments > 1 ? `${t.currentInstallment}/${t.installments}` : 'À vista',
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-financeiro-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Exporta backup completo em arquivo JSON
  downloadFullBackup() {
    const data = window.db.exportAll();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-fincontrol-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Importa backup a partir de arquivo JSON
  importBackupFile(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.transactions || parsed.appointments || parsed.notes) {
          const ok = confirm(`Deseja restaurar este backup?\n- ${parsed.transactions?.length || 0} transações\n- ${parsed.appointments?.length || 0} compromissos\n- ${parsed.notes?.length || 0} anotações\n\nIsso atualizará seus dados atuais.`);
          if (ok) {
            window.db.importAll(parsed);
            alert('Backup restaurado com sucesso!');
          }
        } else {
          alert('Arquivo de backup inválido.');
        }
      } catch (err) {
        alert('Erro ao ler o arquivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }
}

window.exporter = new ExportModule();
