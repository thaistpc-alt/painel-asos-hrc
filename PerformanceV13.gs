/* =========================================================
   PAINEL DE ASOS - CAMADA DE DESEMPENHO V13.2
   - preserva os geradores e regras existentes;
   - lê a AGENDA apenas nas colunas necessárias;
   - processa Fonte + Agenda uma única vez por contexto;
   - usa cache em memória, CacheService e fallback persistente;
   - entrega cada módulo sob demanda.
========================================================= */

const PERF13_PREFIXO = "ASOS_V13_2_";
const PERF13_TTL = 1800;
const PERF13_PARTE = 80000;
const PERF13_MAX_PARTES = 50;
const PERF13_ABA_CACHE = "_CACHE_ASOS_V13";
const PERF13_PARTE_PERSISTENTE = 45000;
var PERF13_MEMORIA = {};

function obterResumoPortalV13(dataInicio, dataFim, forcarAtualizacao) {
  const resumo = obterResumoPortalV13Leve(dataInicio, dataFim, forcarAtualizacao);
  const grafico = obterGraficoPortalV13(dataInicio, dataFim);
  resumo.indicadoresResumo = grafico;
  return resumo;
}

function obterModuloPortalV13(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV13_(dataInicio, dataFim);
  const nome = normalizarTexto(modulo || "");
  const chave = "MOD_" + nome + "_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV13_(chave);
    if (cacheado) {
      cacheado.__cacheV13 = "cache";
      return cacheado;
    }
  }

  /* Forçar o módulo não deve reconstruir Fonte + Agenda. O botão Atualizar
     já força o resumo/contexto antes de solicitar o módulo. */
  const contexto = construirContextoV13_(dataInicio, dataFim, false);
  const lista = contexto.lista || [];
  let resultado;

  switch (nome) {
    case "CONVOCAR": {
      const todos = gerarListaConvocar(lista, dataInicio, dataFim)
        .filter(c => !c.asoRealizadoValido);
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
      const pendencias = contexto.pendencias || { operacionais: [] };
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

  resultado.__contextoV13 = contexto.origemCache || "nova";
  salvarCacheV13_(chave, resultado);
  return resultado;
}

function construirContextoV13_(dataInicio, dataFim, forcarAtualizacao) {
  const chave = "CONTEXTO_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV13_(chave);
    if (cacheado && Array.isArray(cacheado.lista) && cacheado.pendencias) {
      cacheado.origemCache = cacheado.__origemCacheV13 || "cache";
      return cacheado;
    }

    const persistente = obterCachePersistenteV13_(chave);
    if (persistente && Array.isArray(persistente.lista) && persistente.pendencias) {
      persistente.origemCache = "persistente";
      salvarCacheV13_(chave, persistente);
      return persistente;
    }
  }

  const inicio = Date.now();
  const lista = lerFontePainel();
  const eventos = montarEventosAgendaPorMatriculaV13_();
  aplicarOcorrenciasAgenda(lista, eventos);
  aplicarAsoRealizadoAgenda(lista, eventos);
  prepararFlagsPortal(lista);
  const pendencias = gerarPendencias(lista, eventos);

  const contexto = {
    lista: lista,
    pendencias: pendencias,
    origemCache: "nova",
    processadoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
    duracaoProcessamentoMs: Date.now() - inicio
  };

  salvarCacheV13_(chave, contexto);
  salvarCachePersistenteV13_(chave, contexto);
  return contexto;
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
  const quantidadeLinhas = ultimaLinha - cfg.linhaDados;
  if (quantidadeLinhas <= 0) return mapaEventos;

  const valores = aba
    .getRange(cfg.linhaDados + 1, primeiraColuna + 1, quantidadeLinhas, largura)
    .getValues();

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
    if (Array.isArray(eventos)) {
      eventos.sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
    }
  });
  return mapaEventos;
}

function validarPeriodoV13_(inicio, fim) {
  if (!inicio || !fim) throw new Error("Informe a data inicial e a data final.");
  if (String(inicio) > String(fim)) {
    throw new Error("A data inicial não pode ser maior que a data final.");
  }
}

function chaveCacheV13_(sufixo) {
  return (PERF13_PREFIXO + String(sufixo || "").replace(/[^A-Za-z0-9_\-]/g, "_"))
    .substring(0, 220);
}

function serializarCacheV13_(objeto) {
  const json = JSON.stringify(objeto);
  const gzip = Utilities.gzip(Utilities.newBlob(json, "application/json"));
  return Utilities.base64Encode(gzip.getBytes());
}

function desserializarCacheV13_(base64) {
  const bytes = Utilities.base64Decode(base64);
  const json = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString("UTF-8");
  return JSON.parse(json);
}

function salvarCacheV13_(sufixo, objeto) {
  const chave = chaveCacheV13_(sufixo);
  PERF13_MEMORIA[chave] = objeto;

  try {
    const cache = CacheService.getScriptCache();
    const base64 = serializarCacheV13_(objeto);
    const qtd = Math.ceil(base64.length / PERF13_PARTE);
    if (qtd < 1 || qtd > PERF13_MAX_PARTES) return false;

    /* O manifesto é gravado por último. Assim nunca aponta para um conjunto
       de fragmentos parcialmente escrito. */
    for (let i = 0; i < qtd; i++) {
      cache.put(
        chave + "_" + i,
        base64.substring(i * PERF13_PARTE, (i + 1) * PERF13_PARTE),
        PERF13_TTL
      );
    }
    cache.put(chave + "_M", String(qtd), PERF13_TTL);
    return true;
  } catch (e) {
    return false;
  }
}

function obterCacheV13_(sufixo) {
  const chave = chaveCacheV13_(sufixo);
  if (Object.prototype.hasOwnProperty.call(PERF13_MEMORIA, chave)) {
    const memoria = PERF13_MEMORIA[chave];
    if (memoria && typeof memoria === "object") memoria.__origemCacheV13 = "memoria";
    return memoria;
  }

  try {
    const cache = CacheService.getScriptCache();
    const qtd = Number(cache.get(chave + "_M"));
    if (!qtd || qtd > PERF13_MAX_PARTES) return null;

    const chaves = [];
    for (let i = 0; i < qtd; i++) chaves.push(chave + "_" + i);
    const partes = cache.getAll(chaves);
    let base64 = "";
    for (let i = 0; i < qtd; i++) {
      const parte = partes[chave + "_" + i];
      if (!parte) return null;
      base64 += parte;
    }

    const objeto = desserializarCacheV13_(base64);
    if (objeto && typeof objeto === "object") objeto.__origemCacheV13 = "cache";
    PERF13_MEMORIA[chave] = objeto;
    return objeto;
  } catch (e) {
    return null;
  }
}

function obterAbaCachePersistenteV13_(criar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(PERF13_ABA_CACHE);
  if (!aba && criar) {
    aba = ss.insertSheet(PERF13_ABA_CACHE);
    aba.getRange(1, 1, 1, 5).setValues([["CHAVE", "EXPIRA_EM", "PARTE", "TOTAL", "CONTEUDO"]]);
    aba.hideSheet();
  }
  return aba;
}

function salvarCachePersistenteV13_(sufixo, objeto) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return false;

  try {
    const aba = obterAbaCachePersistenteV13_(true);
    const chave = chaveCacheV13_(sufixo);
    const base64 = serializarCacheV13_(objeto);
    const total = Math.ceil(base64.length / PERF13_PARTE_PERSISTENTE);
    const expira = Date.now() + PERF13_TTL * 1000;
    const linhas = [];

    for (let i = 0; i < total; i++) {
      linhas.push([
        chave,
        expira,
        i,
        total,
        base64.substring(i * PERF13_PARTE_PERSISTENTE, (i + 1) * PERF13_PARTE_PERSISTENTE)
      ]);
    }

    /* A aba técnica mantém somente o contexto mais recente. Isso evita
       crescimento contínuo e torna a leitura previsível. */
    aba.clearContents();
    aba.getRange(1, 1, 1, 5).setValues([["CHAVE", "EXPIRA_EM", "PARTE", "TOTAL", "CONTEUDO"]]);
    if (linhas.length) aba.getRange(2, 1, linhas.length, 5).setValues(linhas);
    if (!aba.isSheetHidden()) aba.hideSheet();
    return true;
  } catch (e) {
    return false;
  } finally {
    lock.releaseLock();
  }
}

function obterCachePersistenteV13_(sufixo) {
  try {
    const aba = obterAbaCachePersistenteV13_(false);
    if (!aba || aba.getLastRow() < 2) return null;

    const chave = chaveCacheV13_(sufixo);
    const valores = aba.getRange(2, 1, aba.getLastRow() - 1, 5).getValues();
    const linhas = valores
      .filter(l => String(l[0] || "") === chave && Number(l[1]) > Date.now())
      .sort((a, b) => Number(a[2]) - Number(b[2]));

    if (!linhas.length) return null;
    const total = Number(linhas[0][3]);
    if (linhas.length !== total) return null;
    return desserializarCacheV13_(linhas.map(l => String(l[4] || "")).join(""));
  } catch (e) {
    return null;
  }
}

function diagnosticarCacheV13(dataInicio, dataFim) {
  dataInicio = dataInicio || Utilities.formatDate(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    CONFIG.TIMEZONE,
    "yyyy-MM-dd"
  );
  dataFim = dataFim || Utilities.formatDate(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    CONFIG.TIMEZONE,
    "yyyy-MM-dd"
  );

  const chave = "CONTEXTO_" + dataInicio + "_" + dataFim;
  const inicio = Date.now();
  const contexto = construirContextoV13_(dataInicio, dataFim, false);
  const base64 = serializarCacheV13_(contexto);
  const resultado = {
    origem: contexto.origemCache || contexto.__origemCacheV13 || "desconhecida",
    duracaoMs: Date.now() - inicio,
    colaboradores: (contexto.lista || []).length,
    pendencias: contexto.pendencias && contexto.pendencias.operacionais
      ? contexto.pendencias.operacionais.length
      : 0,
    tamanhoComprimidoCaracteres: base64.length,
    partesCacheService: Math.ceil(base64.length / PERF13_PARTE),
    partesPersistentes: Math.ceil(base64.length / PERF13_PARTE_PERSISTENTE),
    chave: chaveCacheV13_(chave)
  };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
