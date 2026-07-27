/* =========================================================
   V13.4 - CONTEXTO GLOBAL COMPARTILHADO
   Fonte + Agenda não dependem do período selecionado.
   Os módulos continuam armazenados por período.
========================================================= */

const PERF133_PREFIXO = "ASOS_V13_4_";
const PERF133_PARTE_PROPRIEDADE = 8000;
const PERF133_MAX_PARTES = 55;
const PERF133_TTL_MS = 30 * 60 * 1000;
const PERF133_CHAVE_CONTEXTO = "CONTEXTO_GLOBAL";

/* Compatibilidade do Apps Script com gzip. */
desserializarCacheV13_ = function(base64) {
  const bytes = Utilities.base64Decode(base64);
  const blobGzip = Utilities.newBlob(bytes, "application/gzip", "cache-v13.gz");
  const json = Utilities.ungzip(blobGzip).getDataAsString("UTF-8");
  return JSON.parse(json);
};

function chaveContextoV133_() {
  return PERF133_PREFIXO + PERF133_CHAVE_CONTEXTO;
}

function salvarContextoPropriedadesV133_(contexto) {
  try {
    const propriedades = PropertiesService.getScriptProperties();
    const chave = chaveContextoV133_();
    const base64 = serializarCacheV13_(contexto);
    const total = Math.ceil(base64.length / PERF133_PARTE_PROPRIEDADE);
    if (total < 1 || total > PERF133_MAX_PARTES) return false;

    const valores = {};
    valores[chave + "_M"] = JSON.stringify({
      total: total,
      expiraEm: Date.now() + PERF133_TTL_MS,
      tamanho: base64.length
    });

    for (let i = 0; i < total; i++) {
      valores[chave + "_" + i] = base64.substring(
        i * PERF133_PARTE_PROPRIEDADE,
        (i + 1) * PERF133_PARTE_PROPRIEDADE
      );
    }

    propriedades.setProperties(valores, false);
    return true;
  } catch (e) {
    console.log("Fallback de propriedades não pôde ser salvo: " + (e.message || e));
    return false;
  }
}

function obterContextoPropriedadesV133_() {
  try {
    const propriedades = PropertiesService.getScriptProperties();
    const chave = chaveContextoV133_();
    const manifestoTexto = propriedades.getProperty(chave + "_M");
    if (!manifestoTexto) return null;

    const manifesto = JSON.parse(manifestoTexto);
    if (!manifesto.total || manifesto.total > PERF133_MAX_PARTES) return null;
    if (Number(manifesto.expiraEm) <= Date.now()) return null;

    const todas = propriedades.getProperties();
    let base64 = "";
    for (let i = 0; i < manifesto.total; i++) {
      const parte = todas[chave + "_" + i];
      if (!parte) return null;
      base64 += parte;
    }

    if (manifesto.tamanho && base64.length !== Number(manifesto.tamanho)) return null;
    const contexto = desserializarCacheV13_(base64);
    contexto.origemCache = "propriedades";
    return contexto;
  } catch (e) {
    console.log("Fallback de propriedades inválido: " + (e.message || e));
    return null;
  }
}

function construirContextoV13_(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV13_(dataInicio, dataFim);
  const chave = PERF133_CHAVE_CONTEXTO;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV13_(chave);
    if (cacheado && Array.isArray(cacheado.lista) && cacheado.pendencias) {
      cacheado.origemCache = cacheado.__origemCacheV13 || "cache";
      return cacheado;
    }

    const propriedades = obterContextoPropriedadesV133_();
    if (propriedades && Array.isArray(propriedades.lista) && propriedades.pendencias) {
      salvarCacheV13_(chave, propriedades);
      return propriedades;
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

  const salvoNoCache = salvarCacheV13_(chave, contexto);
  if (!salvoNoCache) salvarContextoPropriedadesV133_(contexto);
  return contexto;
}

function diagnosticarCacheV13(dataInicio, dataFim) {
  const periodo = periodoPadraoTesteV13_(dataInicio, dataFim);
  PERF13_MEMORIA = {};
  const inicio = Date.now();
  const contexto = construirContextoV13_(periodo.inicio, periodo.fim, false);
  const base64 = serializarCacheV13_(contexto);
  const resultado = {
    origem: contexto.origemCache || contexto.__origemCacheV13 || "desconhecida",
    duracaoMs: Date.now() - inicio,
    colaboradores: (contexto.lista || []).length,
    pendencias: contexto.pendencias && contexto.pendencias.operacionais
      ? contexto.pendencias.operacionais.length : 0,
    tamanhoComprimidoCaracteres: base64.length,
    partesCacheService: Math.ceil(base64.length / PERF13_PARTE),
    chave: chaveContextoV133_()
  };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function medirPerformanceV13(dataInicio, dataFim) {
  const periodo = periodoPadraoTesteV13_(dataInicio, dataFim);
  dataInicio = periodo.inicio;
  dataFim = periodo.fim;

  function medir(nome, fn) {
    PERF13_MEMORIA = {};
    const inicio = Date.now();
    const retorno = fn();
    return {
      etapa: nome,
      duracaoMs: Date.now() - inicio,
      valor: retorno.valor,
      origem: retorno.origem || ""
    };
  }

  const medicoes = [];
  const inicioFrio = Date.now();
  PERF13_MEMORIA = {};
  const contextoFrio = construirContextoV13_(dataInicio, dataFim, true);
  medicoes.push({
    etapa: "Contexto - carga fria",
    duracaoMs: Date.now() - inicioFrio,
    valor: (contextoFrio.lista || []).length,
    origem: "nova"
  });

  medicoes.push(medir("Contexto - nova requisição", function() {
    const c = construirContextoV13_(dataInicio, dataFim, false);
    return { valor: (c.lista || []).length, origem: c.origemCache || "" };
  }));

  medicoes.push(medir("Resumo Dashboard", function() {
    const r = obterResumoPortalV13Leve(dataInicio, dataFim, false);
    return { valor: r.dashboard.totalColaboradores, origem: r.meta ? r.meta.origemCache : "" };
  }));

  [
    ["Convocar", "CONVOCAR", r => r.convocar.todos.length],
    ["Pendências", "PENDENCIAS", r => r.pendencias.operacionais.length],
    ["Indicadores", "INDICADORES", r => r.indicadores.resumoMensal.length]
  ].forEach(function(item) {
    medicoes.push(medir(item[0], function() {
      const r = obterModuloPortalV13(item[1], dataInicio, dataFim, false);
      return { valor: item[2](r), origem: r.__cacheV13 ? "cache-modulo" : (r.__contextoV13 || "") };
    }));
  });

  medicoes.push(medir("Gráfico Dashboard", function() {
    const r = obterGraficoPortalV13(dataInicio, dataFim);
    return { valor: r.resumoMensal.length, origem: r.__origemCacheV13 ? "cache-modulo" : (r.origemContexto || "") };
  }));

  const resumo = {
    periodo: dataInicio + " a " + dataFim,
    diagnosticoCache: diagnosticarCacheV13(dataInicio, dataFim),
    medicoes: medicoes
  };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}
