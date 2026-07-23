/* =========================================================
   TESTES DE REGRESSÃO E PERFORMANCE V13
   Execute no Apps Script antes da implantação.
========================================================= */

function executarRegressaoV13(dataInicio, dataFim) {
  dataInicio = dataInicio || Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), CONFIG.TIMEZONE, "yyyy-MM-dd");
  dataFim = dataFim || Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), CONFIG.TIMEZONE, "yyyy-MM-dd");

  const resultadoAntigo = obterDadosPortal(dataInicio, dataFim, true);
  const resumoNovo = obterResumoPortalV13Leve(dataInicio, dataFim, true);
  const modulos = {
    convocar: obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, false),
    pendencias: obterModuloPortalV13("PENDENCIAS", dataInicio, dataFim, false),
    prioridade: obterModuloPortalV13("PRIORIDADE", dataInicio, dataFim, false),
    vencidos: obterModuloPortalV13("VENCIDOS", dataInicio, dataFim, false),
    complementares: obterModuloPortalV13("COMPLEMENTARES", dataInicio, dataFim, false),
    colaboradores: obterModuloPortalV13("COLABORADORES", dataInicio, dataFim, false),
    indicadores: obterModuloPortalV13("INDICADORES", dataInicio, dataFim, false)
  };

  const testes = [];
  function comparar(nome, esperado, obtido) {
    const ok = JSON.stringify(esperado) === JSON.stringify(obtido);
    testes.push({ teste: nome, sucesso: ok, esperado: esperado, obtido: obtido });
  }
  function mats(lista) {
    return (lista || []).map(i => String(i.mat || i.matricula || "")).filter(Boolean).sort();
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
  dataInicio = dataInicio || Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), CONFIG.TIMEZONE, "yyyy-MM-dd");
  dataFim = dataFim || Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), CONFIG.TIMEZONE, "yyyy-MM-dd");

  function medir(nome, fn) {
    const inicio = Date.now();
    const valor = fn();
    return { etapa: nome, duracaoMs: Date.now() - inicio, valor: valor };
  }

  const medicoes = [];
  medicoes.push(medir("Resumo V13 - carga fria", () => obterResumoPortalV13Leve(dataInicio, dataFim, true).dashboard.totalColaboradores));
  medicoes.push(medir("Resumo V13 - cache", () => obterResumoPortalV13Leve(dataInicio, dataFim, false).dashboard.totalColaboradores));
  medicoes.push(medir("Convocar - primeira chamada", () => obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, false).convocar.todos.length));
  medicoes.push(medir("Convocar - cache", () => obterModuloPortalV13("CONVOCAR", dataInicio, dataFim, false).convocar.todos.length));
  medicoes.push(medir("Pendências - primeira chamada", () => obterModuloPortalV13("PENDENCIAS", dataInicio, dataFim, false).pendencias.operacionais.length));
  medicoes.push(medir("Indicadores - primeira chamada", () => obterModuloPortalV13("INDICADORES", dataInicio, dataFim, false).indicadores.resumoMensal.length));
  medicoes.push(medir("Gráfico Dashboard", () => obterGraficoPortalV13(dataInicio, dataFim).resumoMensal.length));

  const resumo = { periodo: dataInicio + " a " + dataFim, medicoes: medicoes };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}
