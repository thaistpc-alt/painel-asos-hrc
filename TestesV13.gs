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

function executarRegressaoRegrasConvocacaoV14() {
  const resultados = [];

  function testar(nome, condicao, detalhe) {
    resultados.push({
      teste: nome,
      ok: !!condicao,
      detalhe: detalhe || ""
    });
  }

  const colaborador = {
    mat: "TESTE_X",
    matriculaCompleta: "2009999",
    nome: "COLABORADOR TESTE",
    situacao: "Férias",
    situacaoNorm: "FERIAS",
    dataUltimoAso: "2025-11-03",
    dataConvocar: "2026-09-04",
    dataAgendada: "2026-10-05",
    proximoVencimento: "2026-11-03"
  };

  const eventos = new Map();
  eventos.set("TESTE_X", [
    {
      mat: "TESTE_X",
      data: "2026-08-07",
      dataBR: "07/08/2026",
      tipo: "DEMISSIONAL",
      tipoNorm: "DEMISSIONAL",
      status: "ASO Realizado",
      statusNorm: "ASO REALIZADO",
      ehAsoRealizado: true
    },
    {
      // Na V14.7 DATA AGENDADA é derivada da própria AGENDA.
      // O cenário setembro -> outubro precisa, portanto, simular o
      // agendamento periódico futuro na mesma fonte de verdade.
      mat: "TESTE_X",
      data: "2026-10-05",
      dataBR: "05/10/2026",
      tipo: "PERIÓDICO",
      tipoNorm: "PERIODICO",
      status: "",
      statusNorm: "",
      ehAsoRealizado: false,
      ehNaoCompareceu: false,
      ehReagendou: false,
      ehCancelado: false
    }
  ]);

  aplicarAsoRealizadoAgenda([colaborador], eventos);
  prepararFlagsPortal([colaborador]);

  testar(
    "Demissional não encerra ciclo periódico",
    colaborador.asoRealizadoValido === false,
    colaborador.asosRealizadosNaoPeriodicos
  );

  testar(
    "Data agendada é reconstruída a partir do periódico da AGENDA",
    colaborador.dataAgendada === "2026-10-05",
    colaborador.dataAgendada || "sem data"
  );



  const outubro = gerarListaConvocar([colaborador], "2026-10-01", "2026-10-31");
  testar(
    "Convocação de setembro agendada em outubro aparece em outubro",
    outubro.length === 1 && outubro[0].grupoConvocacao === "Agendado no período",
    outubro.length ? outubro[0].grupoConvocacao : "não listado"
  );

  const setembro = gerarListaConvocar([colaborador], "2026-09-01", "2026-09-30");
  testar(
    "Colaborador em férias permanece elegível no mês original",
    setembro.length === 1 && setembro[0].grupoConvocacao === "Convocação do período",
    setembro.length ? setembro[0].grupoConvocacao : "não listado"
  );

  const periodico = Object.assign({}, colaborador, {
    mat: "TESTE_PERIODICO",
    dataAgendada: "2026-10-06"
  });
  const eventosPeriodicos = new Map();
  eventosPeriodicos.set("TESTE_PERIODICO", [{
    mat: "TESTE_PERIODICO",
    data: "2026-10-06",
    dataBR: "06/10/2026",
    tipo: "PERIÓDICO",
    tipoNorm: "PERIODICO",
    status: "ASO Realizado",
    statusNorm: "ASO REALIZADO",
    ehAsoRealizado: true
  }]);
  aplicarAsoRealizadoAgenda([periodico], eventosPeriodicos);
  prepararFlagsPortal([periodico]);
  testar(
    "Periódico realizado encerra o ciclo",
    periodico.asoRealizadoValido === true,
    periodico.dataAsoRealizadoAgenda
  );

  const colaboradorFuturo = {
    mat: "TESTE_FUTURO",
    matriculaCompleta: "2009998",
    nome: "COLABORADOR FUTURO",
    situacao: "Ativo",
    situacaoNorm: "ATIVO",
    dataUltimoAso: "2025-11-03",
    dataConvocar: "2026-09-04",
    dataAgendada: "2026-11-05",
    proximoVencimento: "2026-11-03",
    asoRealizadoValido: false
  };
  prepararFlagsPortal([colaboradorFuturo]);
  const outubroPendente = gerarListaConvocar(
    [colaboradorFuturo],
    "2026-10-01",
    "2026-10-31"
  );
  testar(
    "Fila persiste entre mês de origem e agendamento futuro",
    outubroPendente.length === 1 &&
      outubroPendente[0].grupoConvocacao === "Pendência anterior",
    outubroPendente.length ? outubroPendente[0].grupoConvocacao : "não listado"
  );

  const afastado = Object.assign({}, colaboradorFuturo, {
    mat: "TESTE_AFASTADO",
    situacao: "Af.Previdência",
    situacaoNorm: "AF.PREVIDENCIA",
    dataAgendada: ""
  });
  prepararFlagsPortal([afastado]);
  const revisaoAfastado = gerarListaRevisaoConvocar(
    [afastado],
    "2026-10-01",
    "2026-10-31"
  );
  testar(
    "Exclusão funcional aparece com motivo em Revisão",
    revisaoAfastado.length === 1 &&
      (revisaoAfastado[0].motivos || []).some(m =>
        normalizarTexto(m).includes("SITUACAO FUNCIONAL")
      ),
    revisaoAfastado.length ? revisaoAfastado[0].motivos : "não listado"
  );

  const tipoIncompleto = Object.assign({}, colaboradorFuturo, {
    mat: "TESTE_TIPO_INCOMPLETO",
    dataAgendada: "2026-11-05",
    asosRealizadosTipoIncompleto: [{
      data: "2026-09-15",
      status: "ASO Realizado"
    }]
  });
  prepararFlagsPortal([tipoIncompleto]);
  const avaliacaoTipo = avaliarElegibilidadeConvocacao(
    tipoIncompleto,
    "2026-10-01",
    "2026-10-31"
  );
  testar(
    "ASO realizado sem tipo não encerra ciclo e exige revisão",
    avaliacaoTipo.eventoQueEncerrouCiclo === null &&
      avaliacaoTipo.revisaoDados === true,
    avaliacaoTipo.motivos
  );

  const falhas = resultados.filter(r => !r.ok);
  const resumo = {
    sucesso: falhas.length === 0,
    total: resultados.length,
    falhas: falhas.length,
    resultados: resultados
  };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
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

function medirPerformanceV13LegadoTeste_(dataInicio, dataFim) {
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


/* =========================================================
   REGRESSÃO V14.5 - falta seguida de ASO periódico realizado
========================================================= */

function executarRegressaoFaltaRealizadaV14_5() {
  const contexto = construirContextoV13_("2026-09-01", "2026-09-30", true);
  const colaborador = (contexto.lista || []).find(c =>
    obterChavesMatricula(c.mat, c.matriculaCompleta).includes("1883")
  ) || null;

  const geral = colaborador ? gerarColaboradoresPortal([colaborador])[0] : null;
  const pendente = !!((contexto.pendencias && contexto.pendencias.operacionais) || [])
    .find(item => obterChavesMatricula(item.mat, item.matriculaCompleta).includes("1883"));

  const proximoEsperado = colaborador
    ? adicionarMeses("2026-07-28", Number(colaborador.periodicidade) || 12)
    : "";
  const diasEsperados = proximoEsperado
    ? calcularDiferencaDias(proximoEsperado, obterHojeISO())
    : null;

  let statusEsperado = "Em dias";
  if (diasEsperados !== null && Number(diasEsperados) < 0) statusEsperado = "Em atraso";
  else if (diasEsperados !== null && Number(diasEsperados) <= 30) statusEsperado = "Prioridade";

  const testes = [
    {
      teste: "1883 - identifica periódico realizado em 28/07/2026",
      ok: !!colaborador &&
        colaborador.temAsoRealizadoAgenda === true &&
        colaborador.dataAsoRealizadoAgenda === "2026-07-28"
    },
    {
      teste: "1883 - falta anterior deixa de ser pendência operacional",
      ok: pendente === false
    },
    {
      teste: "1883 - Geral usa o ASO posterior como último ASO",
      ok: !!geral &&
        geral.dataUltimoAsoBR === "28/07/2026" &&
        geral.origemUltimoAso === "AGENDA"
    },
    {
      teste: "1883 - próximo vencimento é recalculado pela periodicidade",
      ok: !!geral &&
        geral.proximoVencimentoEfetivo === proximoEsperado &&
        Number(geral.diasStatusAso) === Number(diasEsperados)
    },
    {
      teste: "1883 - status do Geral usa o vencimento efetivo",
      ok: !!geral && geral.statusAso === statusEsperado
    }
  ];

  const falhas = testes.filter(t => !t.ok);
  const resultado = {
    sucesso: falhas.length === 0,
    matricula: "1883",
    total: testes.length,
    aprovados: testes.length - falhas.length,
    falhas: falhas.map(t => t.teste),
    dados: geral ? {
      ultimoAso: geral.dataUltimoAsoBR,
      proximoVencimento: geral.proximoVencimentoBR,
      dias: geral.diasStatusAso,
      status: geral.statusAso,
      origemUltimoAso: geral.origemUltimoAso,
      pendenteOperacional: pendente
    } : null,
    testes: testes
  };

  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


/* =========================================================
   V14.7 - DIAGNÓSTICO DETALHADO DE PERFORMANCE
   Mede as etapas do contexto sem depender do cache anterior.
========================================================= */
function diagnosticarPerformanceDetalhadaV14_7() {
  const etapas = [];
  const totalInicio = Date.now();

  function medirEtapa(nome, fn) {
    const inicio = Date.now();
    const valor = fn();
    etapas.push({
      etapa: nome,
      duracaoMs: Date.now() - inicio
    });
    return valor;
  }

  PERF13_MEMORIA = {};

  const lista = medirEtapa("1. Ler FONTEpainel", function() {
    return lerFontePainel();
  });

  const eventos = medirEtapa("2. Ler/indexar AGENDA", function() {
    return montarEventosAgendaPorMatriculaV13_();
  });

  medirEtapa("3. Aplicar ocorrências", function() {
    return aplicarOcorrenciasAgenda(lista, eventos);
  });

  medirEtapa("4. Aplicar ASOs realizados", function() {
    return aplicarAsoRealizadoAgenda(lista, eventos);
  });

  medirEtapa("5. Preparar flags", function() {
    return prepararFlagsPortal(lista);
  });

  const pendencias = medirEtapa("6. Gerar pendências", function() {
    return gerarPendencias(lista, eventos);
  });

  const contexto = {
    lista: lista,
    pendencias: pendencias,
    origemCache: "diagnostico"
  };

  const base64 = medirEtapa("7. Serializar contexto", function() {
    return serializarCacheV13_(contexto);
  });

  const indicadores = medirEtapa("8. Calcular indicadores", function() {
    return gerarIndicadores(lista);
  });

  const resultado = {
    versao: "14.7",
    duracaoTotalMs: Date.now() - totalInicio,
    colaboradores: lista.length,
    pendenciasOperacionais: (pendencias.operacionais || []).length,
    tamanhoContextoComprimido: base64.length,
    partesCacheEstimadas: Math.ceil(base64.length / PERF13_PARTE),
    mesesIndicadores: (indicadores.resumoMensal || []).length,
    etapas: etapas
  };

  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


/* =========================================================
   V14.7 - VALIDAÇÃO ÚNICA ANTES DA PUBLICAÇÃO
========================================================= */
function validarAntesPublicarV14_7() {
  const inicio = Date.now();

  const regrasConvocacao = executarRegressaoRegrasConvocacaoV14();
  const faltaPosterior = executarRegressaoFaltaRealizadaV14_5();
  const performanceDetalhada = diagnosticarPerformanceDetalhadaV14_7();

  const resultado = {
    sucesso:
      !!regrasConvocacao && regrasConvocacao.sucesso === true &&
      !!faltaPosterior && faltaPosterior.sucesso === true,
    versao: "14.7",
    duracaoTotalValidacaoMs: Date.now() - inicio,
    regrasConvocacao: {
      sucesso: !!regrasConvocacao && regrasConvocacao.sucesso === true,
      falhas: regrasConvocacao && regrasConvocacao.falhas !== undefined
        ? regrasConvocacao.falhas
        : null
    },
    faltaPosterior: {
      sucesso: !!faltaPosterior && faltaPosterior.sucesso === true,
      falhas: faltaPosterior && faltaPosterior.falhas
        ? faltaPosterior.falhas
        : []
    },
    performance: performanceDetalhada
  };

  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


/* =========================================================
   V15 - TESTES DA BASE, REGRAS E PERFORMANCE
========================================================= */
function validarEstruturaBaseV15() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fonte = ss.getSheetByName(CONFIG.ABA_FONTE);
  const indicador = ss.getSheetByName(BASE15_ABA_INDICADOR);
  const modelo = ss.getSheetByName(CONFIG.ABA_MODELO);
  const config = ss.getSheetByName(BASE15_ABA_CONFIG);

  const testes = [];
  function testar(nome, ok, detalhe) {
    testes.push({ teste: nome, ok: !!ok, detalhe: detalhe || "" });
  }

  const formulasPR = fonte
    ? fonte.getRange(2, 16, Math.max(1, fonte.getLastRow() - 1), 3)
        .getFormulas()
        .flat()
        .filter(Boolean)
    : ["aba ausente"];

  testar(
    "FONTEpainel P:R sem fórmulas pesadas",
    formulasPR.length === 0,
    formulasPR.length + " fórmula(s)"
  );

  const formulaA2 = fonte ? fonte.getRange("A2").getFormula() : "";
  const formulaT2 = fonte ? fonte.getRange("T2").getFormula() : "";
  const formulaU2 = fonte ? fonte.getRange("U2").getFormula() : "";
  testar("MAT consolidada em ARRAYFORMULA", formulaA2.includes("ARRAYFORMULA"), formulaA2);
  testar("Mês consolidado em ARRAYFORMULA", formulaT2.includes("ARRAYFORMULA"), formulaT2);
  testar("Ano consolidado em ARRAYFORMULA", formulaU2.includes("ARRAYFORMULA"), formulaU2);

  const formulasIndicador = indicador
    ? indicador.getDataRange().getFormulas().flat().filter(Boolean)
    : ["aba ausente"];
  testar(
    "BASE_INDICADOR_ASO materializada",
    formulasIndicador.length === 0,
    formulasIndicador.length + " fórmula(s)"
  );
  testar(
    "BASE_INDICADOR_ASO oculta",
    !!indicador && indicador.isSheetHidden(),
    indicador ? "aba encontrada" : "aba ausente"
  );

  const formulasModelo = modelo
    ? modelo.getDataRange().getFormulas().flat().filter(Boolean)
    : [];
  testar(
    "Modelo CONVOCAÇÃO totalmente preenchido por script",
    formulasModelo.length === 0,
    formulasModelo
  );
  testar(
    "Modelo CONVOCAÇÃO usa cidade correta do HRC",
    !!modelo && normalizarTexto(modelo.getRange("F27").getDisplayValue()).includes("JUAZEIRO DO NORTE"),
    modelo ? modelo.getRange("F27").getDisplayValue() : "aba ausente"
  );
  testar(
    "Cópia redundante de CONVOCAÇÃO removida",
    !ss.getSheetByName("Cópia de CONVOCAÇÃO"),
    ss.getSheetByName("Cópia de CONVOCAÇÃO") ? "ainda existe" : "removida"
  );
  testar("_CONFIG_ASOS criada", !!config, config ? "ok" : "ausente");

  const elegivelFuturo = {
    situacao: "Férias",
    situacaoNorm: "FERIAS",
    dataAgendada: "2026-10-05",
    asoRealizadoValido: false
  };
  testar(
    "PDF aceita agendamento futuro fora do mês de origem",
    motivoNaoBaixarConvocacao(elegivelFuturo, "2026-09-01", "2026-09-30") === "",
    motivoNaoBaixarConvocacao(elegivelFuturo, "2026-09-01", "2026-09-30")
  );

  const falhas = testes.filter(t => !t.ok);
  return {
    sucesso: falhas.length === 0,
    total: testes.length,
    aprovados: testes.length - falhas.length,
    falhas: falhas.map(t => t.teste),
    testes: testes
  };
}

function validarMaterializacaoAmostraV15() {
  const contexto = construirContextoV13_("2026-09-01", "2026-09-30", false);
  const fonte = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_FONTE);
  const amostras = ["1883"];
  const resultados = [];

  amostras.forEach(function(mat) {
    const c = (contexto.lista || []).find(function(item) {
      return obterChavesMatricula(item.mat, item.matriculaCompleta).includes(mat);
    });
    if (!c || !fonte) {
      resultados.push({ mat: mat, ok: false, motivo: "não encontrado" });
      return;
    }

    const valores = fonte.getRange(c.linha, 16, 1, 3).getDisplayValues()[0];
    resultados.push({
      mat: mat,
      ok:
        String(valores[0] || "") === String(c.dataAgendadaBR || "") &&
        String(valores[1] || "") === String(c.informacoesAgenda || "") &&
        normalizarTexto(valores[2] || "") === normalizarTexto(c.statusGeral || ""),
      planilha: {
        dataAgendada: valores[0] || "",
        informacoes: valores[1] || "",
        status: valores[2] || ""
      },
      memoria: {
        dataAgendada: c.dataAgendadaBR || "",
        informacoes: c.informacoesAgenda || "",
        status: c.statusGeral || ""
      }
    });
  });

  return {
    sucesso: resultados.every(r => r.ok),
    resultados: resultados
  };
}

function diagnosticarPerformanceDetalhadaV15() {
  const base = diagnosticarPerformanceDetalhadaV14_7();
  base.versao = "15.0";
  return base;
}

function validarAntesPublicarV15() {
  const inicio = Date.now();

  const atualizacaoBase = atualizarBasePainelCompletaV15();
  const estrutura = validarEstruturaBaseV15();
  const regrasConvocacao = executarRegressaoRegrasConvocacaoV14();
  const faltaPosterior = executarRegressaoFaltaRealizadaV14_5();
  const materializacao = validarMaterializacaoAmostraV15();
  const performance = diagnosticarPerformanceDetalhadaV15();

  const sucesso =
    atualizacaoBase && atualizacaoBase.sucesso === true &&
    estrutura.sucesso === true &&
    regrasConvocacao && regrasConvocacao.sucesso === true &&
    faltaPosterior && faltaPosterior.sucesso === true &&
    materializacao.sucesso === true;

  const resultado = {
    sucesso: sucesso,
    versao: "15.0",
    duracaoTotalValidacaoMs: Date.now() - inicio,
    atualizacaoBase: atualizacaoBase,
    estruturaBase: estrutura,
    regrasConvocacao: {
      sucesso: !!regrasConvocacao && regrasConvocacao.sucesso === true,
      falhas: regrasConvocacao && regrasConvocacao.falhas !== undefined
        ? regrasConvocacao.falhas
        : null
    },
    faltaPosterior: {
      sucesso: !!faltaPosterior && faltaPosterior.sucesso === true,
      falhas: faltaPosterior && faltaPosterior.falhas
        ? faltaPosterior.falhas
        : []
    },
    materializacao: materializacao,
    performance: performance,
    alertaPerformance: performance.duracaoTotalMs > 8000
      ? "Carga fria acima de 8 segundos; revisar gargalo antes de publicar."
      : ""
  };

  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
