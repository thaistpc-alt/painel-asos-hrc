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

  testar(
    "PDF não é bloqueado quando convocação nasce em setembro e agenda é outubro",
    motivoNaoBaixarConvocacao(colaborador, "2026-09-01", "2026-09-30") === "",
    motivoNaoBaixarConvocacao(colaborador, "2026-09-01", "2026-09-30")
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
   V15.0 - VALIDAÇÃO DA BASE MATERIALIZADA
========================================================= */
function validarEstruturaBaseV15() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultados = [];

  function testar(nome, ok, detalhe) {
    resultados.push({ teste: nome, ok: !!ok, detalhe: detalhe === undefined ? "" : detalhe });
  }

  const fonte = ss.getSheetByName(CONFIG.ABA_FONTE);
  const agenda = ss.getSheetByName(CONFIG.ABA_AGENDA);
  const escala = ss.getSheetByName("Escala médica");
  const indicador = ss.getSheetByName(BASE_V15.ABA_INDICADOR);
  const config = ss.getSheetByName(BASE_V15.ABA_CONFIG);

  testar("FONTEpainel existe", !!fonte);
  testar("AGENDA existe", !!agenda);
  testar("Escala médica existe", !!escala);
  testar("BASE_INDICADOR_ASO existe", !!indicador);
  testar("_CONFIG_ASOS existe", !!config);

  if (fonte && fonte.getLastRow() >= 2) {
    const linhas = fonte.getLastRow() - 1;
    const formulasA = fonte.getRange(2, 1, linhas, 1).getFormulas().flat().filter(Boolean);
    const formulasJO = fonte.getRange(2, 10, linhas, 6).getFormulas().flat().filter(Boolean);
    const formulasPR = fonte.getRange(2, 16, linhas, 3).getFormulas().flat().filter(Boolean);
    const formulasTU = fonte.getRange(2, 20, linhas, 2).getFormulas().flat().filter(Boolean);

    testar("FONTEpainel A materializada", formulasA.length === 0, formulasA.length + " fórmula(s)");
    testar("FONTEpainel J:O materializadas", formulasJO.length === 0, formulasJO.length + " fórmula(s)");
    testar("FONTEpainel P:R materializadas", formulasPR.length === 0, formulasPR.length + " fórmula(s)");
    testar("FONTEpainel T:U materializadas", formulasTU.length === 0, formulasTU.length + " fórmula(s)");
  }

  if (agenda) {
    const formulasAgenda = agenda
      .getRange(1, 1, Math.max(1, agenda.getLastRow()), Math.min(20, agenda.getLastColumn()))
      .getFormulas()
      .flat()
      .filter(Boolean);
    testar("AGENDA sem IMPORTRANGE/fórmulas", formulasAgenda.length === 0, formulasAgenda.length + " fórmula(s)");
  }

  if (escala) {
    const formulasEscala = escala
      .getRange(1, 1, Math.max(1, escala.getLastRow()), Math.min(5, escala.getLastColumn()))
      .getFormulas()
      .flat()
      .filter(Boolean);
    testar("Escala médica sem IMPORTRANGE/fórmulas", formulasEscala.length === 0, formulasEscala.length + " fórmula(s)");
  }

  const cfg = typeof lerConfigBaseV15_ === "function" ? lerConfigBaseV15_() : {};
  testar("Config registra versão 15.0", String(cfg.VERSAO_BASE || "") === "15.0", cfg.VERSAO_BASE || "");
  testar("Config registra sincronização", !!String(cfg.ULTIMA_SINCRONIZACAO || ""), cfg.ULTIMA_SINCRONIZACAO || "");
  testar(
    "EDATE compatível - 29/02 + 12 meses",
    adicionarMeses("2024-02-29", 12) === "2025-02-28",
    adicionarMeses("2024-02-29", 12)
  );
  testar(
    "EDATE compatível - 31/08 + 6 meses",
    adicionarMeses("2025-08-31", 6) === "2026-02-28",
    adicionarMeses("2025-08-31", 6)
  );

  const origem = SpreadsheetApp.openById(cfg.ORIGEM_AGENDA_ID || BASE_V15.ORIGEM_AGENDA_ID);
  const fonteOrigem = origem.getSheetByName(BASE_V15.ORIGEM_FONTE_ABA);
  const agendaOrigem = origem.getSheetByName(cfg.ORIGEM_AGENDA_ABA || BASE_V15.ORIGEM_AGENDA_ABA);

  const totalFonteOrigem = fonteOrigem
    ? fonteOrigem.getRange(2, 2, Math.max(0, fonteOrigem.getLastRow() - 1), 1)
        .getDisplayValues().flat().filter(Boolean).length
    : 0;
  const totalFonteDestino = fonte ? Math.max(0, fonte.getLastRow() - 1) : 0;
  testar(
    "Quantidade de colaboradores confere com a origem",
    totalFonteOrigem === totalFonteDestino,
    { origem: totalFonteOrigem, destino: totalFonteDestino }
  );

  const linhasAgendaOrigem = agendaOrigem ? agendaOrigem.getLastRow() : 0;
  const linhasAgendaDestino = agenda ? agenda.getLastRow() : 0;
  testar(
    "Quantidade de linhas da AGENDA confere com a origem",
    linhasAgendaOrigem === linhasAgendaDestino,
    { origem: linhasAgendaOrigem, destino: linhasAgendaDestino }
  );

  const falhas = resultados.filter(r => !r.ok);
  const resumo = {
    sucesso: falhas.length === 0,
    total: resultados.length,
    aprovados: resultados.length - falhas.length,
    falhas: falhas.map(r => ({ teste: r.teste, detalhe: r.detalhe })),
    resultados: resultados
  };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}


/* =========================================================
   V15.0 - CASOS REAIS CRÍTICOS
========================================================= */
function validarCasosCriticosV15() {
  const lista = lerFontePainel();
  const eventos = montarEventosAgendaPorMatriculaV13_();

  aplicarOcorrenciasAgenda(lista, eventos);
  aplicarAsoRealizadoAgenda(lista, eventos);
  prepararFlagsPortal(lista);

  const pendencias = gerarPendencias(lista, eventos);
  const resultados = [];

  function porMat(mat) {
    return lista.find(c => obterChavesMatricula(c.mat, c.matriculaCompleta).includes(String(mat))) || null;
  }

  function testar(nome, ok, detalhe) {
    resultados.push({ teste: nome, ok: !!ok, detalhe: detalhe === undefined ? "" : detalhe });
  }

  const c1883 = porMat("1883");
  const geral1883 = c1883 ? gerarColaboradoresPortal([c1883])[0] : null;
  const pend1883 = (pendencias.operacionais || []).some(i =>
    obterChavesMatricula(i.mat, i.matriculaCompleta).includes("1883")
  );
  testar(
    "1883 - falta anterior resolvida por periódico posterior",
    !!c1883 &&
      c1883.dataAsoRealizadoAgenda === "2026-07-28" &&
      pend1883 === false &&
      !!geral1883 &&
      geral1883.dataUltimoAsoBR === "28/07/2026",
    geral1883 ? {
      ultimoAso: geral1883.dataUltimoAsoBR,
      proximoVencimento: geral1883.proximoVencimentoBR,
      pendente: pend1883
    } : "não encontrado"
  );

  const c3738 = porMat("3738");
  const pend3738 = (pendencias.operacionais || []).some(i =>
    obterChavesMatricula(i.mat, i.matriculaCompleta).includes("3738")
  );
  testar(
    "3738 - demissional não encerra ciclo e periódico cancelado exige nova ação",
    !!c3738 &&
      c3738.temAsoRealizadoAgenda === false &&
      c3738.dataAgendada === "" &&
      normalizarTexto(c3738.statusAgenda).includes("CANCELAD") &&
      pend3738 === true &&
      (c3738.asosRealizadosNaoPeriodicos || []).some(e => normalizarTexto(e.tipo).includes("DEMISSIONAL")),
    c3738 ? {
      dataAgendada: c3738.dataAgendada,
      ultimoEventoPeriodico: c3738.dataUltimoEventoPeriodico,
      statusAgenda: c3738.statusAgenda,
      pendenteOperacional: pend3738,
      naoPeriodicos: c3738.asosRealizadosNaoPeriodicos
    } : "não encontrado"
  );

  const c2644 = porMat("2644");
  testar(
    "2644 - retorno não é tratado como periódico realizado",
    !!c2644 &&
      c2644.temAsoRealizadoAgenda === false &&
      (c2644.asosRealizadosNaoPeriodicos || []).some(e => normalizarTexto(e.tipo).includes("RETORNO")),
    c2644 ? {
      situacao: c2644.situacao,
      dataPeriodicoRealizado: c2644.dataAsoRealizadoAgenda,
      naoPeriodicos: c2644.asosRealizadosNaoPeriodicos
    } : "não encontrado"
  );

  const falhas = resultados.filter(r => !r.ok);
  const resumo = {
    sucesso: falhas.length === 0,
    total: resultados.length,
    aprovados: resultados.length - falhas.length,
    falhas: falhas.map(r => r.teste),
    resultados: resultados
  };
  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}


/* =========================================================
   V15.0 - PERFORMANCE
========================================================= */
function diagnosticarPerformanceV15() {
  const base = diagnosticarPerformanceDetalhadaV14_7();
  base.versao = "15.0";
  base.baseMaterializada = true;
  console.log(JSON.stringify(base, null, 2));
  return base;
}


/* =========================================================
   V15.0 - VALIDAÇÃO ÚNICA ANTES DA PUBLICAÇÃO
========================================================= */
function validarAntesPublicarV15() {
  const inicio = Date.now();

  const sincronizacao = atualizarBaseCompletaV15();
  const base = validarEstruturaBaseV15();
  const regras = executarRegressaoRegrasConvocacaoV14();
  const casos = validarCasosCriticosV15();
  const performance = diagnosticarPerformanceV15();

  const resultado = {
    sucesso:
      sincronizacao && sincronizacao.sucesso === true &&
      base && base.sucesso === true &&
      regras && regras.sucesso === true &&
      casos && casos.sucesso === true,
    versao: "15.0",
    duracaoTotalValidacaoMs: Date.now() - inicio,
    sincronizacao: sincronizacao,
    estruturaBase: {
      sucesso: base ? base.sucesso : false,
      falhas: base ? base.falhas : []
    },
    regrasConvocacao: {
      sucesso: regras ? regras.sucesso : false,
      falhas: regras ? regras.falhas : null
    },
    casosCriticos: {
      sucesso: casos ? casos.sucesso : false,
      falhas: casos ? casos.falhas : []
    },
    performance: performance
  };

  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
