/* =========================================================
   CORREÇÃO DE ESTABILIDADE V12.3
   O cache modular passa a ser opcional. Os módulos são
   retornados diretamente a partir das regras consolidadas.
========================================================= */

function extrairModuloSeguroV12(nome, dados, dataInicio, dataFim) {
  switch (nome) {
    case "CONVOCAR":
      return (dados.convocar && dados.convocar.todos) || [];

    case "EXAMES":
      return dados.examesComplementares ||
        gerarExamesComplementaresV12(dados.colaboradores || [], dataInicio, dataFim);

    case "PRIORIDADES":
      return {
        ativos: filtrarPrioridadesV12(dados.prioridadeAtivos || []),
        outros: filtrarPrioridadesV12(dados.prioridadeOutros || [])
      };

    case "VENCIDOS":
      return {
        ativos: dados.vencidosAtivos || [],
        outros: dados.vencidosOutros || []
      };

    case "PENDENCIAS":
      return montarPendenciasOperacionaisV12(dados);

    case "CONSULTA":
      return dados.colaboradores || [];

    case "INDICADORES":
      return dados.indicadores || {};

    default:
      throw new Error("Módulo inválido: " + nome);
  }
}

/*
 * Substitui em tempo de execução a função V12.2.
 * Não exige que o módulo seja salvo e relido do CacheService.
 */
obterModuloPortalV12 = function(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  const nome = normalizarModuloV12(modulo);
  const chave = chaveModuloV12(nome, dataInicio, dataFim);

  if (!forcarAtualizacao) {
    const cacheado = obterCacheModuloV12(chave);
    if (cacheado !== null) return cacheado;
  }

  const dados = obterDadosPortal(dataInicio, dataFim, !!forcarAtualizacao);
  const resultado = extrairModuloSeguroV12(nome, dados, dataInicio, dataFim);

  // Tenta acelerar a próxima abertura, mas falha de cache não impede o retorno.
  try {
    salvarCacheModuloV12(chave, resultado);
  } catch (e) {
    console.log("Cache V12 ignorado para " + nome + ": " + e.message);
  }

  return resultado;
};

/*
 * Pré-aquecimento passa a preparar apenas o cache consolidado original.
 * Evita gravar simultaneamente vários módulos e ultrapassar a cota total.
 */
preaquecerDadosPortalV12 = function(dataInicio, dataFim) {
  validarPeriodoV12(dataInicio, dataFim);
  obterDadosPortal(dataInicio, dataFim, false);
  return true;
};
