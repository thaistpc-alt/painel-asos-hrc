/* Evita timeout quando duas abas solicitam a mesma base simultaneamente. */
function obterBaseProcessadaPerformance_(dataInicio, dataFim, forcarAtualizacao) {
  const chave = "BASE_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheComprimidoPerformance_(chave);
    if (cacheado) {
      cacheado.cache = true;
      return cacheado;
    }
  }

  const lock = LockService.getScriptLock();
  const obteveLock = lock.tryLock(1200);

  if (!obteveLock) {
    // Outro processo está preparando a base. Aguarda brevemente o cache,
    // sem lançar erro de timeout para o usuário.
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      Utilities.sleep(250);
      const pronto = obterCacheComprimidoPerformance_(chave);
      if (pronto) {
        pronto.cache = true;
        return pronto;
      }
    }

    // Contingência: processa em paralelo. É preferível duplicar uma leitura
    // ocasional a interromper o painel com erro de bloqueio.
    return construirBaseProcessadaSemLock_(chave);
  }

  try {
    if (!forcarAtualizacao) {
      const cacheado = obterCacheComprimidoPerformance_(chave);
      if (cacheado) {
        cacheado.cache = true;
        return cacheado;
      }
    }
    return construirBaseProcessadaSemLock_(chave);
  } finally {
    lock.releaseLock();
  }
}

function construirBaseProcessadaSemLock_(chave) {
  const lista = lerFontePainel();
  const eventosPorMatricula = montarEventosAgendaPorMatricula();
  aplicarOcorrenciasAgenda(lista, eventosPorMatricula);
  aplicarAsoRealizadoAgenda(lista, eventosPorMatricula);
  prepararFlagsPortal(lista);

  const base = {
    lista: lista,
    eventosPorMatricula: eventosPorMatricula,
    cache: false
  };
  salvarCacheComprimidoPerformance_(chave, base);
  return base;
}
