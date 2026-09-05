// Módulo de Agenda e Compromissos - FinControl Pro

class AgendaModule {
  constructor() {}

  // Retorna a lista organizada em: Hoje, Amanhã, Próximos e Anteriores
  getGroupedAppointments() {
    const list = window.db.getAppointments();
    const today = new Date().toISOString().split('T')[0];
    
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];

    // Ordena por data e hora crescente
    const sorted = [...list].sort((a, b) => {
      const dateTimeA = `${a.date} ${a.time || '00:00'}`;
      const dateTimeB = `${b.date} ${b.time || '00:00'}`;
      return dateTimeA.localeCompare(dateTimeB);
    });

    const groups = {
      today: [],
      tomorrow: [],
      upcoming: [],
      past: []
    };

    sorted.forEach(app => {
      if (app.date === today) {
        groups.today.push(app);
      } else if (app.date === tomorrow) {
        groups.tomorrow.push(app);
      } else if (app.date > tomorrow) {
        groups.upcoming.push(app);
      } else {
        groups.past.push(app);
      }
    });

    return groups;
  }

  // Conta compromissos pendentes de hoje
  getTodayPendingCount() {
    const today = new Date().toISOString().split('T')[0];
    return window.db.getAppointments().filter(app => app.date === today && !app.completed).length;
  }

  // Converte compromisso com custo em lançamento financeiro
  convertAppointmentToTransaction(appId) {
    const app = window.db.getAppointments().find(a => a.id === appId);
    if (!app || !app.cost || app.cost <= 0) return null;

    const tx = window.db.addTransaction({
      type: 'expense',
      description: `Compromisso: ${app.title}`,
      amount: app.cost,
      category: 'Saúde', // Categoria padrão adaptável
      paymentMethod: 'PIX',
      date: app.date,
      dueDate: app.date,
      status: app.completed ? 'paid' : 'pending',
      notes: `Gerado a partir do compromisso de ${app.time} em ${app.location || 'Local não informado'}`
    });

    return tx;
  }
}

window.agenda = new AgendaModule();
