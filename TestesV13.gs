/* =========================================================
   TESTES DE REGRESSÃO E PERFORMANCE V13.2
   Execute no Apps Script antes da implantação.
========================================================= */

function periodoPadraoTesteV13_(dataInicio, dataFim) {
  return {
    inicio: dataInicio || Utilities.formatDate(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    ),
    fim: dataFim || Utilities.formatDate(
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
      CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    )
  };
}

function executarRegressaoV13(dataInicio, dataFim) {
  const periodo = periodoPadraoTesteV13_(dataInicio, dataFim);
  dataInicio = periodo.inicio;
  dataFim = periodo.fim;

  const resultadoAntigo = obterDadosPortal(dataInicio, dataFim, true);
  const resumoNovo = obterResumoPortalV13Leve(dataInicio, dataFim, true);
  const modulos = {
    convocar: obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, true),
    pendencias: obterModuloPortalV13("PENDENCIAS", dataInicio, dataFim, true),
    prioridade: obterModuloPortalV13("PRIORIDADE", dataInicio, dataFim, true),
    vencidos: obterModuloPortalV13("VENCIDOS", dataInicio, dataFim, true),
    complementares: obterModuloPortalV13("COMPLEMENTARES", dataInicio, dataFim, true),
    colaboradores: obterModuloPortalV13("COLABORADORES", dataInicio, dataFim, true),
    indicadores: obterModuloPortalV13("INDICADORES", dataInicio, dataFim, true)
  };

  const testes = [];
  function comparar(nome, esperado, obtido) {
    const ok = JSON.stringify(esperado) === JSON.stringify(obtido);
    testes.push({ teste: nome, sucesso: ok, esperado: esperado, obtido: obtido });
  }
  function mats(lista) {
    return (lista || [])
      .map(i => String(i.mat || i.matricula || ""))
      .filter(Boolean)
      .sort();
  }

  comparar("dashboard.totalColaboradores", resultadoAntigo.dashboard.totalColaboradores, resumoNovo.dashboard.totalColaboradores);
  comparar("dashboard.totalConvocar", resultadoAntigo.dashboard.totalConvocar, resumoNovo.dashboard.totalConvocar);
  comparar("dashboard.totalFaltosos", resultadoAntigo.dashboard.totalFaltosos, resumoNovo.dashboard.totalFaltosos);
  comparar("dashboard.totalPrioridade", resultadoAntigo.dashboard.totalPrioridade, resumoNovo.dashboard.totalPrioridade);
  comparar("dashboard.totalVencidos", resultadoAntigo.dashboard.totalVencidos, resumoNovo.dashboard.totalVencidos);
  comparar("dashboard.totalExamesComplementares", resultadoAntigo.dashboard.totalExamesComplementares, resumoNovo.dashboard.totalExamesComplementares);
  comparar("matrículas Convocar", mats(resultadoAntigo.convocar.todos), mats(modulos.convocar.convocar.todos));
  comparar("matrículas Pendências", mats(resultadoAntigo.pendencias.operacionais), mats(modulos.pendencias.pendencias.operacionais));
  comparar("matrículas Prioridade ativos", mats(resultadoAntigo.prioridadeAtivos), mats(modulos.prioridade.prioridadeAtivos));
  comparar("matrículas Prioridade outros", mats(resultadoAntigo.prioridadeOutros), mats(modulos.prioridade.prioridadeOutros));
  comparar("matrículas Vencidos ativos", mats(resultadoAntigo.vencidosAtivos), mats(modulos.vencidos.vencidosAtivos));
  comparar("matrículas Vencidos outros", mats(resultadoAntigo.vencidosOutros), mats(modulos.vencidos.vencidosOutros));
  comparar("matrículas Complementares", mats(resultadoAntigo.examesComplementares), mats(modulos.complementares.examesComplementares));
  comparar("quantidade Geral", (resultadoAntigo.colaboradores || []).length, (modulos.colaboradores.colaboradores || []).length);
  comparar("ano Indicadores", resultadoAntigo.indicadores.ano, modulos.indicadores.indicadores.ano);
  comparar("resumo mensal Indicadores", resultadoAntigo.indicadores.resumoMensal, modulos.indicadores.indicadores.resumoMensal);

  const falhas = testes.filter(t => !t.sucesso);
  const resumo = {
    sucesso: falhas.length === 0,
    periodo: dataInicio + " a " + dataFim,
    total: testes.length,
    aprovados: testes.length - falhas.length,
    falhas: falhas.length,
    origemContexto: resumoNovo.meta ? resumoNovo.meta.origemCache : "",
    testesAprovados: testes.filter(t => t.sucesso).map(t => t.teste),
    divergencias: falhas.map(t => ({
      teste: t.teste,
      esperado: Array.isArray(t.esperado) ? t.esperado.length : t.esperado,
      obtido: Array.isArray(t.obtido) ? t.obtido.length : t.obtido,
      faltando: Array.isArray(t.esperado) && Array.isArray(t.obtido)
        ? t.esperado.filter(x => !t.obtido.includes(x))
        : [],
      excedentes: Array.isArray(t.esperado) && Array.isArray(t.obtido)
        ? t.obtido.filter(x => !t.esperado.includes(x))
        : []
    }))
  };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}

function medirPerformanceV13(dataInicio, dataFim) {
  const periodo = periodoPadraoTesteV13_(dataInicio, dataFim);
  dataInicio = periodo.inicio;
  dataFim = periodo.fim;

  function medir(nome, fn) {
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

  const resumoFrio = obterResumoPortalV13Leve(dataInicio, dataFim, true);
  medicoes.push({
    etapa: "Resumo V13 - carga fria",
    duracaoMs: resumoFrio.meta && resumoFrio.meta.duracaoProcessamentoMs
      ? resumoFrio.meta.duracaoProcessamentoMs
      : 0,
    valor: resumoFrio.dashboard.totalColaboradores,
    origem: resumoFrio.meta ? resumoFrio.meta.origemCache : "nova"
  });

  /* Limpa somente a memória da execução. O CacheService e o fallback
     persistente permanecem, simulando uma nova requisição do navegador. */
  PERF13_MEMORIA = {};
  medicoes.push(medir("Resumo V13 - cache entre requisições", function () {
    const r = obterResumoPortalV13Leve(dataInicio, dataFim, false);
    return {
      valor: r.dashboard.totalColaboradores,
      origem: r.meta ? r.meta.origemCache : ""
    };
  }));

  PERF13_MEMORIA = {};
  medicoes.push(medir("Convocar - primeira chamada", function () {
    const r = obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, true);
    return { valor: r.convocar.todos.length, origem: r.__contextoV13 || "" };
  }));

  PERF13_MEMORIA = {};
  medicoes.push(medir("Convocar - cache entre requisições", function () {
    const r = obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, false);
    return {
      valor: r.convocar.todos.length,
      origem: r.__origemCacheV13 || r.__cacheV13 || r.__contextoV13 || ""
    };
  }));

  PERF13_MEMORIA = {};
  medicoes.push(medir("Pendências", function () {
    const r = obterModuloPortalV13("PENDENCIAS", dataInicio, dataFim, true);
    return { valor: r.pendencias.operacionais.length, origem: r.__contextoV13 || "" };
  }));

  PERF13_MEMORIA = {};
  medicoes.push(medir("Indicadores", function () {
    const r = obterModuloPortalV13("INDICADORES", dataInicio, dataFim, true);
    return { valor: r.indicadores.resumoMensal.length, origem: r.__contextoV13 || "" };
  }));

  PERF13_MEMORIA = {};
  medicoes.push(medir("Gráfico Dashboard", function () {
    const r = obterGraficoPortalV13(dataInicio, dataFim);
    return { valor: r.resumoMensal.length, origem: r.origemContexto || r.__origemCacheV13 || "" };
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
