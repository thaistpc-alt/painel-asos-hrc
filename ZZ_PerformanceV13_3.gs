/* =========================================================
   V13.3 - CACHE CONSOLIDADO E TELEMETRIA
   - CacheService é a camada principal;
   - PropertiesService é apenas contingência;
   - nenhuma escrita em planilha no caminho normal;
   - correção nativa da leitura gzip no Apps Script.
========================================================= */

const PERF133_PREFIXO = "ASOS_V13_3_";
const PERF133_PARTE_PROPRIEDADE = 8000;
const PERF133_MAX_PARTES = 55;
const PERF133_TTL_MS = 30 * 60 * 1000;

/* Substitui a versão incompatível do Apps Script. */
desserializarCacheV13_ = function(base64) {
  const bytes = Utilities.base64Decode(base64);
  const blobGzip = Utilities.newBlob(bytes, "application/gzip", "cache-v13.gz");
  const json = Utilities.ungzip(blobGzip).getDataAsString("UTF-8");
  return JSON.parse(json);
};

function chaveContextoV133_(dataInicio, dataFim) {
  return PERF133_PREFIXO + "CONTEXTO_" + dataInicio + "_" + dataFim;
}

function salvarContextoPropriedadesV133_(dataInicio, dataFim, contexto) {
  try {
    const propriedades = PropertiesService.getScriptProperties();
    const chave = chaveContextoV133_(dataInicio, dataFim);
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

function obterContextoPropriedadesV133_(dataInicio, dataFim) {
  try {
    const propriedades = PropertiesService.getScriptProperties();
    const chave = chaveContextoV133_(dataInicio, dataFim);
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
  const chave = "CONTEXTO_" + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV13_(chave);
    if (cacheado && Array.isArray(cacheado.lista) && cacheado.pendencias) {
      cacheado.origemCache = cacheado.__origemCacheV13 || "cache";
      return cacheado;
    }

    const propriedades = obterContextoPropriedadesV133_(dataInicio, dataFim);
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

  /* O CacheService comprovadamente comporta o contexto em três partes.
     Só usamos PropertiesService quando essa gravação falhar. */
  const salvoNoCache = salvarCacheV13_(chave, contexto);
  if (!salvoNoCache) {
    salvarContextoPropriedadesV133_(dataInicio, dataFim, contexto);
  }

  return contexto;
}

function diagnosticarCacheV13(dataInicio, dataFim) {
  const periodo = periodoPadraoTesteV13_(dataInicio, dataFim);
  dataInicio = periodo.inicio;
  dataFim = periodo.fim;

  PERF13_MEMORIA = {};
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
    chave: chaveContextoV133_(dataInicio, dataFim)
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

  medicoes.push(medir("Contexto - nova requisição", function () {
    const c = construirContextoV13_(dataInicio, dataFim, false);
    return { valor: (c.lista || []).length, origem: c.origemCache || "" };
  }));

  medicoes.push(medir("Resumo Dashboard", function () {
    const r = obterResumoPortalV13Leve(dataInicio, dataFim, false);
    return { valor: r.dashboard.totalColaboradores, origem: r.meta ? r.meta.origemCache : "" };
  }));

  medicoes.push(medir("Convocar", function () {
    const r = obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, false);
    return {
      valor: r.convocar.todos.length,
      origem: r.__cacheV13 ? "cache-modulo" : (r.__contextoV13 || "")
    };
  }));

  medicoes.push(medir("Pendências", function () {
    const r = obterModuloPortalV13("PENDENCIAS", dataInicio, dataFim, false);
    return {
      valor: r.pendencias.operacionais.length,
      origem: r.__cacheV13 ? "cache-modulo" : (r.__contextoV13 || "")
    };
  }));

  medicoes.push(medir("Indicadores", function () {
    const r = obterModuloPortalV13("INDICADORES", dataInicio, dataFim, false);
    return {
      valor: r.indicadores.resumoMensal.length,
      origem: r.__cacheV13 ? "cache-modulo" : (r.__contextoV13 || "")
    };
  }));

  medicoes.push(medir("Gráfico Dashboard", function () {
    const r = obterGraficoPortalV13(dataInicio, dataFim);
    return {
      valor: r.resumoMensal.length,
      origem: r.__origemCacheV13 ? "cache-modulo" : (r.origemContexto || "")
    };
  }));

  const diagnostico = diagnosticarCacheV13(dataInicio, dataFim);
  const resumo = {
    periodo: dataInicio + " a " + dataFim,
    diagnosticoCache: diagnostico,
    medicoes: medicoes
  };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}
