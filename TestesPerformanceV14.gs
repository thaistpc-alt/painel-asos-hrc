/* =========================================================
   TESTES DE PERFORMANCE V14
========================================================= */

function medirPerformanceV14(dataInicio, dataFim) {
  validarPeriodoV14_(dataInicio, dataFim);
  const medicoes = [];

  function medir(etapa, fn) {
    const inicio = Date.now();
    const r = fn();
    medicoes.push({ etapa: etapa, duracaoMs: Date.now() - inicio, valor: r });
  }

  V14_MEMORIA = {};
  medir("Contexto global - leitura/cache", function () {
    const c = construirContextoPortalV14_(false);
    return { colaboradores: (c.lista || []).length, origem: c.origemCache || "" };
  });

  V14_MEMORIA = {};
  medir("Resumo do período", function () {
    const r = obterResumoPortalV14Leve(dataInicio, dataFim, false);
    return { totalConvocar: r.dashboard.totalConvocar, revisao: r.meta.revisaoDados };
  });

  V14_MEMORIA = {};
  medir("Módulo Convocar", function () {
    const r = obterModuloPortalV14("CONVOCAR", dataInicio, dataFim, false);
    return { total: r.convocar.todos.length, revisao: r.convocar.revisao.length };
  });

  const resultado = { periodo: dataInicio + " a " + dataFim, medicoes: medicoes };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
