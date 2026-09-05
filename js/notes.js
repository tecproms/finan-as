// Módulo de Anotações - FinControl Pro

class NotesModule {
  constructor() {
    this.activeTag = 'Todos';
  }

  getTags() {
    const notes = window.db.getNotes();
    const tags = new Set(['Todos']);
    notes.forEach(n => {
      if (n.tag) tags.add(n.tag);
    });
    return Array.from(tags);
  }

  getFilteredNotes(searchQuery = '', tagFilter = this.activeTag) {
    let list = window.db.getNotes();

    // Ordena: primeiro os fixados (pinned), depois por data de atualização mais recente
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });

    if (tagFilter && tagFilter !== 'Todos') {
      list = list.filter(n => n.tag === tagFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n => 
        (n.title && n.title.toLowerCase().includes(q)) || 
        (n.content && n.content.toLowerCase().includes(q))
      );
    }

    return list;
  }
}

window.notes = new NotesModule();
