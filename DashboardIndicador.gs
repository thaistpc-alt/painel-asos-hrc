/* =========================================================
   GRÁFICO LEVE DO DASHBOARD
   Usa as mesmas regras do indicador original e retorna apenas
   o resumo mensal necessário para o gráfico.
========================================================= */

function obterGraficoMetaDashboardOtimizado(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoPerformance_(dataInicio, dataFim);

  const chave = "GRAFICO_META_" + dataInicio + "_" + dataFim;
  if (!forcarAtualizacao) {
    const cacheado = obterCacheComprimidoPerformance_(chave);
    if (cacheado !== null) return cacheado;
  }

  const base = obterBaseProcessadaPerformance_(dataInicio, dataFim, !!forcarAtualizacao);
  const indicadores = gerarIndicadores(base.lista || []);
  const resultado = {
    ano: indicadores.ano,
    resumoMensal: indicadores.resumoMensal || []
  };

  salvarCacheComprimidoPerformance_(chave, resultado);
  return resultado;
}
