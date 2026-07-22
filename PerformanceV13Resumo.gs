/* Dashboard leve: não calcula indicadores anuais durante a abertura. */
function obterResumoPortalV13Leve(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV13_(dataInicio, dataFim);
  const chave = "RESUMO_LEVE_" + dataInicio + "_" + dataFim;
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

  let totalAgendados = 0;
  let totalCompareceram = 0;
  let totalPrioridade = 0;
  let totalVencidos = 0;
  let totalVencidosAtivos = 0;
  let totalAtrasadosAtivos = 0;

  lista.forEach(c => {
    if (noPeriodo(c.dataAgendada, dataInicio, dataFim)) {
      totalAgendados++;
      if (ehAsoRealizado(c)) totalCompareceram++;
    }
    if (!c.asoRealizadoAgendaAtual && !c.asoRealizadoValido) {
      const dias = Number(c.diasParaVencer);
      if (dias >= 0 && dias <= 30) totalPrioridade++;
      if (ehVencido(c)) {
        totalVencidos++;
        if (ehAtivo(c)) totalVencidosAtivos++;
      }
    }
    if (c.atrasadoAtivo && !c.asoRealizadoValido) totalAtrasadosAtivos++;
  });

  const resumo = {
    meta: {
      versao: "13.0",
      cache: contexto.cache ? "sim" : "não",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim
    },
    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: convocar.length,
      totalConvocarPendentes: convocar.filter(c => !ehAsoRealizado(c)).length,
      totalConvocarRealizados: convocar.filter(ehAsoRealizado).length,
      totalAgendados: totalAgendados,
      totalCompareceram: totalCompareceram,
      totalFaltosos: (pendencias.operacionais || []).length,
      totalPrioridade: totalPrioridade,
      totalVencidos: totalVencidos,
      totalVencidosAtivos: totalVencidosAtivos,
      totalAtrasadosAtivos: totalAtrasadosAtivos,
      totalExamesComplementares: complementares.length
    }
  };
  salvarCacheV13_(chave, resumo);
  return resumo;
}

function obterGraficoPortalV13(dataInicio, dataFim) {
  validarPeriodoV13_(dataInicio, dataFim);
  const chave = "GRAFICO_" + dataInicio + "_" + dataFim;
  const cacheado = obterCacheV13_(chave);
  if (cacheado) return cacheado;
  const contexto = construirContextoV13_(dataInicio, dataFim, false);
  const indicadores = gerarIndicadores(contexto.lista || []);
  const resultado = { ano: indicadores.ano, resumoMensal: indicadores.resumoMensal || [] };
  salvarCacheV13_(chave, resultado);
  return resultado;
}
