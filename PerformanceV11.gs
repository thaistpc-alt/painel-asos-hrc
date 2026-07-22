/* =========================================================
   OTIMIZACAO DE DESEMPENHO V11.4
   Mantem todas as regras e geradores originais.
========================================================= */

const PERF_CACHE_PREFIXO = "PERF_V11_4_2_";
const PERF_CACHE_SEGUNDOS = 1800;
const PERF_CACHE_PARTE = 80000;

function obterResumoPortalOtimizado(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoPerformance_(dataInicio, dataFim);
  const base = obterBaseProcessadaPerformance_(dataInicio, dataFim, !!forcarAtualizacao);
  const lista = base.lista || [];
  const eventosPorMatricula = base.eventosPorMatricula || {};

  const convocarTodos = gerarListaConvocar(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido)
    .filter(c => !ehNaoCompareceuAso(c));
  const examesComplementares = gerarExamesComplementares(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido);
  const agendadosPeriodo = lista
    .filter(c => noPeriodo(c.dataAgendada, dataInicio, dataFim))
    .sort(ordenarPorDataAgendada);
  const pendencias = gerarPendencias(lista, eventosPorMatricula);
  aplicarHistoricoEnviosPendencias({ pendencias: pendencias, faltosos: pendencias.operacionais });

  const prioridade = lista
    .filter(c => Number(c.diasParaVencer) <= 30 && Number(c.diasParaVencer) >= 0)
    .filter(c => !c.asoRealizadoAgendaAtual)
    .filter(c => !c.asoRealizadoValido);
  const vencidos = lista
    .filter(ehVencido)
    .filter(c => !c.asoRealizadoAgendaAtual)
    .filter(c => !c.asoRealizadoValido);

  const dashboard = {
    totalColaboradores: lista.length,
    totalConvocar: convocarTodos.length,
    totalConvocarPendentes: convocarTodos.filter(c => !ehAsoRealizado(c)).length,
    totalConvocarRealizados: convocarTodos.filter(ehAsoRealizado).length,
    totalAgendados: agendadosPeriodo.length,
    totalCompareceram: agendadosPeriodo.filter(ehAsoRealizado).length,
    totalFaltosos: pendencias.operacionais.length,
    totalPrioridade: prioridade.length,
    totalVencidos: vencidos.length,
    totalVencidosAtivos: vencidos.filter(ehAtivo).length,
    totalAtrasadosAtivos: lista.filter(c => c.atrasadoAtivo && !c.asoRealizadoValido).length,
    totalExamesComplementares: examesComplementares.length
  };

  return {
    meta: {
      versao: "11.4",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim,
      cache: base.cache ? "sim" : "não",
      sincronizacaoAgenda: obterResumoSincronizacaoAgenda()
    },
    dashboard: dashboard
  };
}

function obterModuloPortalOtimizado(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoPerformance_(dataInicio, dataFim);
  const nome = normalizarTexto(modulo || "");
  const chave = "MOD_" + nome + "_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheComprimidoPerformance_(chave);
    if (cacheado !== null) return cacheado;
  }

  const base = obterBaseProcessadaPerformance_(dataInicio, dataFim, !!forcarAtualizacao);
  const lista = base.lista || [];
  const eventosPorMatricula = base.eventosPorMatricula || {};
  let resultado;

  switch (nome) {
    case "CONVOCAR": {
      const todos = gerarListaConvocar(lista, dataInicio, dataFim)
        .filter(c => !c.asoRealizadoValido)
        .filter(c => !ehNaoCompareceuAso(c));
      resultado = {
        convocar: {
          todos: todos,
          pendentes: todos.filter(c => !ehAsoRealizado(c)),
          realizados: todos.filter(ehAsoRealizado)
        }
      };
      break;
    }
    case "FALTOSOS":
    case "PENDENCIAS": {
      const pendencias = gerarPendencias(lista, eventosPorMatricula);
      resultado = { pendencias: pendencias, faltosos: pendencias.operacionais };
      aplicarHistoricoEnviosPendencias(resultado);
      break;
    }
    case "PRIORIDADE": {
      const prioridade = lista
        .filter(c => Number(c.diasParaVencer) <= 30 && Number(c.diasParaVencer) >= 0)
        .filter(c => !c.asoRealizadoAgendaAtual)
        .filter(c => !c.asoRealizadoValido)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      resultado = {
        prioridadeAtivos: prioridade.filter(ehAtivo),
        prioridadeOutros: prioridade.filter(c => !ehAtivo(c))
      };
      break;
    }
    case "VENCIDOS": {
      const vencidos = lista
        .filter(ehVencido)
        .filter(c => !c.asoRealizadoAgendaAtual)
        .filter(c => !c.asoRealizadoValido)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      resultado = {
        vencidosAtivos: vencidos.filter(ehAtivo),
        vencidosOutros: vencidos.filter(c => !ehAtivo(c))
      };
      break;
    }
    case "COMPLEMENTARES":
      resultado = {
        examesComplementares: gerarExamesComplementares(lista, dataInicio, dataFim)
          .filter(c => !c.asoRealizadoValido)
      };
      break;
    case "COLABORADORES": {
      const ordenada = lista.slice().sort((a, b) => {
        const atrasoA = ehVencido(a) && !a.asoRealizadoValido ? 0 : 1;
        const atrasoB = ehVencido(b) && !b.asoRealizadoValido ? 0 : 1;
        if (atrasoA !== atrasoB) return atrasoA - atrasoB;
        const diasA = Number(a.diasParaVencer);
        const diasB = Number(b.diasParaVencer);
        if (!isNaN(diasA) && !isNaN(diasB) && diasA !== diasB) return diasA - diasB;
        return String(a.nome || "").localeCompare(String(b.nome || ""));
      });
      resultado = { colaboradores: gerarColaboradoresPortal(ordenada) };
      break;
    }
    case "INDICADORES":
      resultado = { indicadores: gerarIndicadores(lista) };
      break;
    default:
      throw new Error("Módulo inválido: " + modulo);
  }

  salvarCacheComprimidoPerformance_(chave, resultado);
  return resultado;
}

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
  lock.waitLock(30000);
  try {
    if (!forcarAtualizacao) {
      const cacheado = obterCacheComprimidoPerformance_(chave);
      if (cacheado) {
        cacheado.cache = true;
        return cacheado;
      }
    }

    const lista = lerFontePainel();
    const eventosPorMatricula = montarEventosAgendaPorMatricula();
    aplicarOcorrenciasAgenda(lista, eventosPorMatricula);
    aplicarAsoRealizadoAgenda(lista, eventosPorMatricula);
    prepararFlagsPortal(lista);

    const base = { lista: lista, eventosPorMatricula: eventosPorMatricula, cache: false };
    salvarCacheComprimidoPerformance_(chave, base);
    return base;
  } finally {
    lock.releaseLock();
  }
}

function validarPeriodoPerformance_(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) throw new Error("Informe a data inicial e a data final.");
  if (String(dataInicio) > String(dataFim)) throw new Error("A data inicial não pode ser maior que a data final.");
}

function chaveCachePerformance_(sufixo) {
  return (PERF_CACHE_PREFIXO + String(sufixo || "").replace(/[^A-Za-z0-9_\-]/g, "_")).substring(0, 220);
}

function salvarCacheComprimidoPerformance_(sufixo, objeto) {
  try {
    const cache = CacheService.getScriptCache();
    const chave = chaveCachePerformance_(sufixo);
    const json = JSON.stringify(objeto);
    const gzip = Utilities.gzip(Utilities.newBlob(json, "application/json"));
    const base64 = Utilities.base64Encode(gzip.getBytes());
    const qtd = Math.ceil(base64.length / PERF_CACHE_PARTE);
    const itens = {};
    itens[chave + "_M"] = String(qtd);
    for (let i = 0; i < qtd; i++) {
      itens[chave + "_" + i] = base64.substring(i * PERF_CACHE_PARTE, (i + 1) * PERF_CACHE_PARTE);
    }
    cache.putAll(itens, PERF_CACHE_SEGUNDOS);
  } catch (e) {
    // Cache é aceleração; falha de cache não pode impedir o painel.
  }
}

function obterCacheComprimidoPerformance_(sufixo) {
  try {
    const cache = CacheService.getScriptCache();
    const chave = chaveCachePerformance_(sufixo);
    const qtd = Number(cache.get(chave + "_M"));
    if (!qtd) return null;
    const chaves = [];
    for (let i = 0; i < qtd; i++) chaves.push(chave + "_" + i);
    const partes = cache.getAll(chaves);
    let base64 = "";
    for (let i = 0; i < qtd; i++) {
      const parte = partes[chave + "_" + i];
      if (!parte) return null;
      base64 += parte;
    }
    const bytes = Utilities.base64Decode(base64);
    const json = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString("UTF-8");
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}