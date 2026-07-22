/* =========================================================
   PAINEL DE ASOS - CAMADA DE DESEMPENHO V13
   - preserva os geradores e regras existentes;
   - lê a AGENDA apenas nas colunas necessárias;
   - processa a base uma vez e armazena somente dados serializáveis;
   - entrega cada módulo sob demanda.
========================================================= */

const PERF13_PREFIXO = "ASOS_V13_";
const PERF13_TTL = 1800;
const PERF13_PARTE = 85000;

function obterResumoPortalV13(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV13_(dataInicio, dataFim);
  const chave = "RESUMO_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV13_(chave);
    if (cacheado) return cacheado;
  }

  const contexto = construirContextoV13_(dataInicio, dataFim, !!forcarAtualizacao);
  const lista = contexto.lista;
  const pendencias = contexto.pendencias;

  const convocar = gerarListaConvocar(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido)
    .filter(c => !ehNaoCompareceuAso(c));

  const complementares = gerarExamesComplementares(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido);

  const agendados = lista.filter(c => noPeriodo(c.dataAgendada, dataInicio, dataFim));
  const prioridade = lista.filter(c => {
    const dias = Number(c.diasParaVencer);
    return dias >= 0 && dias <= 30 && !c.asoRealizadoAgendaAtual && !c.asoRealizadoValido;
  });
  const vencidos = lista.filter(c => ehVencido(c) && !c.asoRealizadoAgendaAtual && !c.asoRealizadoValido);
  const indicadores = gerarIndicadores(lista);

  const resumo = {
    meta: {
      versao: "13.0",
      cache: "não",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim
    },
    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: convocar.length,
      totalConvocarPendentes: convocar.filter(c => !ehAsoRealizado(c)).length,
      totalConvocarRealizados: convocar.filter(ehAsoRealizado).length,
      totalAgendados: agendados.length,
      totalCompareceram: agendados.filter(ehAsoRealizado).length,
      totalFaltosos: (pendencias.operacionais || []).length,
      totalPrioridade: prioridade.length,
      totalVencidos: vencidos.length,
      totalVencidosAtivos: vencidos.filter(ehAtivo).length,
      totalAtrasadosAtivos: lista.filter(c => c.atrasadoAtivo && !c.asoRealizadoValido).length,
      totalExamesComplementares: complementares.length
    },
    indicadoresResumo: {
      ano: indicadores.ano,
      resumoMensal: indicadores.resumoMensal || []
    }
  };

  salvarCacheV13_(chave, resumo);
  return resumo;
}

function obterModuloPortalV13(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV13_(dataInicio, dataFim);
  const nome = normalizarTexto(modulo || "");
  const chave = "MOD_" + nome + "_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV13_(chave);
    if (cacheado) return cacheado;
  }

  const contexto = construirContextoV13_(dataInicio, dataFim, !!forcarAtualizacao);
  const lista = contexto.lista;
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
      const pendencias = contexto.pendencias;
      resultado = { pendencias: pendencias, faltosos: pendencias.operacionais || [] };
      aplicarHistoricoEnviosPendencias(resultado);
      break;
    }
    case "PRIORIDADE": {
      const itens = lista
        .filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
        .filter(c => !c.asoRealizadoAgendaAtual && !c.asoRealizadoValido)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      resultado = {
        prioridadeAtivos: itens.filter(ehAtivo),
        prioridadeOutros: itens.filter(c => !ehAtivo(c))
      };
      break;
    }
    case "VENCIDOS": {
      const itens = lista
        .filter(ehVencido)
        .filter(c => !c.asoRealizadoAgendaAtual && !c.asoRealizadoValido)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      resultado = {
        vencidosAtivos: itens.filter(ehAtivo),
        vencidosOutros: itens.filter(c => !ehAtivo(c))
      };
      break;
    }
    case "COMPLEMENTARES":
      resultado = {
        examesComplementares: gerarExamesComplementares(lista, dataInicio, dataFim)
          .filter(c => !c.asoRealizadoValido)
      };
      break;
    case "COLABORADORES":
      resultado = {
        colaboradores: gerarColaboradoresPortal(lista).sort((a, b) => {
          const diasA = Number(a.diasParaVencer);
          const diasB = Number(b.diasParaVencer);
          if (diasA !== diasB) return diasA - diasB;
          return String(a.nome || "").localeCompare(String(b.nome || ""));
        })
      };
      break;
    case "INDICADORES":
      resultado = { indicadores: gerarIndicadores(lista) };
      break;
    default:
      throw new Error("Módulo inválido: " + modulo);
  }

  salvarCacheV13_(chave, resultado);
  return resultado;
}

function construirContextoV13_(dataInicio, dataFim, forcarAtualizacao) {
  const chaveLista = "LISTA_" + dataInicio + "_" + dataFim;
  const chavePendencias = "PEND_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const listaCache = obterCacheV13_(chaveLista);
    const pendCache = obterCacheV13_(chavePendencias);
    if (listaCache && Array.isArray(listaCache.lista) && pendCache) {
      return { lista: listaCache.lista, pendencias: pendCache, cache: true };
    }
  }

  const lista = lerFontePainel();
  const eventos = montarEventosAgendaPorMatriculaV13_();
  aplicarOcorrenciasAgenda(lista, eventos);
  aplicarAsoRealizadoAgenda(lista, eventos);
  prepararFlagsPortal(lista);
  const pendencias = gerarPendencias(lista, eventos);

  salvarCacheV13_(chaveLista, { lista: lista });
  salvarCacheV13_(chavePendencias, pendencias);
  return { lista: lista, pendencias: pendencias, cache: false };
}

function montarEventosAgendaPorMatriculaV13_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_AGENDA);
  const mapaEventos = new Map();
  const mapaOcorrencias = new Map();
  mapaEventos.__ocorrenciasPorMatricula = mapaOcorrencias;
  if (!aba || aba.getLastRow() < 2) return mapaEventos;

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();
  const amostra = aba.getRange(1, 1, Math.min(8, ultimaLinha), ultimaColuna).getValues();
  const cfg = identificarColunasAgenda(amostra);
  if (!cfg) return mapaEventos;

  const colunas = [cfg.colMatricula, cfg.colStatus, cfg.colData, cfg.colTipoExame]
    .filter(i => i >= 0);
  const primeiraColuna = Math.min.apply(null, colunas);
  const ultimaColunaUsada = Math.max.apply(null, colunas);
  const largura = ultimaColunaUsada - primeiraColuna + 1;
  const valores = aba.getRange(cfg.linhaDados + 1, primeiraColuna + 1, ultimaLinha - cfg.linhaDados, largura).getValues();

  const idxMat = cfg.colMatricula - primeiraColuna;
  const idxStatus = cfg.colStatus - primeiraColuna;
  const idxData = cfg.colData - primeiraColuna;
  const idxTipo = cfg.colTipoExame >= 0 ? cfg.colTipoExame - primeiraColuna : -1;

  valores.forEach(linha => {
    const mat = String(linha[idxMat] || "").trim();
    if (!mat) return;
    const data = formatarDataISO(linha[idxData]);
    const status = valorTexto(linha[idxStatus]);
    const statusNorm = normalizarTexto(status);
    const tipo = idxTipo >= 0 ? valorTexto(linha[idxTipo]) : "";
    const tipoNorm = normalizarTexto(tipo);
    if (!data && !statusNorm && !tipoNorm) return;

    const ehAsoRealizado = statusNorm.includes("ASO REALIZADO");
    const ehNaoCompareceu = statusNorm.includes("NAO COMPARECEU ASO");
    const ehReagendou = statusNorm.includes("REAGENDOU");
    const ehCancelado = statusNorm.includes("CANCELAD");
    const tipoIndicaAso = tipoNorm.includes("PERIODICO") || tipoNorm.includes("ASO");
    const statusIndicaAso = statusNorm.includes("ASO") || ehNaoCompareceu || ehAsoRealizado;
    if (!(tipoIndicaAso || statusIndicaAso || !tipoNorm)) return;

    const evento = {
      mat: mat,
      data: data,
      dataBR: formatarDataBR(data),
      status: status,
      statusNorm: statusNorm,
      tipo: tipo,
      tipoNorm: tipoNorm,
      ehAsoRealizado: ehAsoRealizado,
      ehNaoCompareceu: ehNaoCompareceu,
      ehReagendou: ehReagendou,
      ehCancelado: ehCancelado
    };

    obterChavesMatricula(mat, "").forEach(chave => {
      if (!mapaEventos.has(chave)) mapaEventos.set(chave, []);
      mapaEventos.get(chave).push(evento);
      if (ehNaoCompareceu || ehReagendou) {
        mapaOcorrencias.set(chave, (Number(mapaOcorrencias.get(chave)) || 0) + 1);
      }
    });
  });

  mapaEventos.forEach(eventos => {
    if (Array.isArray(eventos)) eventos.sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
  });
  return mapaEventos;
}

function validarPeriodoV13_(inicio, fim) {
  if (!inicio || !fim) throw new Error("Informe a data inicial e a data final.");
  if (String(inicio) > String(fim)) throw new Error("A data inicial não pode ser maior que a data final.");
}

function chaveCacheV13_(sufixo) {
  return (PERF13_PREFIXO + String(sufixo || "").replace(/[^A-Za-z0-9_\-]/g, "_")).substring(0, 220);
}

function salvarCacheV13_(sufixo, objeto) {
  try {
    const cache = CacheService.getScriptCache();
    const chave = chaveCacheV13_(sufixo);
    const json = JSON.stringify(objeto);
    const gzip = Utilities.gzip(Utilities.newBlob(json, "application/json"));
    const base64 = Utilities.base64Encode(gzip.getBytes());
    const qtd = Math.ceil(base64.length / PERF13_PARTE);
    if (qtd < 1 || qtd > 10) return false;
    const itens = {};
    itens[chave + "_M"] = String(qtd);
    for (let i = 0; i < qtd; i++) {
      itens[chave + "_" + i] = base64.substring(i * PERF13_PARTE, (i + 1) * PERF13_PARTE);
    }
    cache.putAll(itens, PERF13_TTL);
    return true;
  } catch (e) {
    return false;
  }
}

function obterCacheV13_(sufixo) {
  try {
    const cache = CacheService.getScriptCache();
    const chave = chaveCacheV13_(sufixo);
    const qtd = Number(cache.get(chave + "_M"));
    if (!qtd || qtd > 10) return null;
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
