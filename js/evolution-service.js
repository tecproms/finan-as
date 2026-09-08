// Compatibilidade: Evolution API foi substituída pelo Whaticket
// Redireciona chamadas para o serviço Whaticket
if (typeof WhaticketService !== 'undefined' && window.whaticketService) {
  window.evolutionService = window.whaticketService;
}
