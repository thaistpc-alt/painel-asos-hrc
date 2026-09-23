/* =========================================================
   LEITURA DA FONTE
========================================================= */

function lerFontePainel() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABA_FONTE);

  if (!aba) {
    throw new Error("Aba FONTEpainel não encontrada.");
  }

  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  const totalLinhas = ultimaLinha - 1;

  /* V14.7:
     P:R possuem fórmulas pesadas sobre a AGENDA e não são mais necessárias
     para montar o contexto. O painel reconstrói essas informações diretamente
     da AGENDA. A leitura principal fica limitada a A:O e S é lida separadamente. */
  const dadosBase = aba
    .getRange(2, 1, totalLinhas, COL.DIAS_PARA_VENCER)
    .getValues();
  const marcacoesConvocacao = aba
    .getRange(2, COL.CONVOCACAO_BAIXADA, totalLinhas, 1)
    .getDisplayValues();

  const hojeISO = obterHojeISO();
  const saida = [];

  for (let idx = 0; idx < dadosBase.length; idx++) {
    const l = dadosBase[idx];
    if (!valorTexto(l[COL.MAT - 1])) continue;

    const periodicidade = Number(l[COL.PERIODICIDADE - 1]) || 0;
    const dataPenultimoAso = formatarDataISO(l[COL.DATA_PENULTIMO_ASO - 1]);
    const dataUltimoAso = formatarDataISO(l[COL.DATA_ULTIMO_ASO - 1]);
    const proximoVencimento = formatarDataISO(l[COL.PROXIMO_VENCIMENTO - 1]);
    const dataPrevistaIndicador = adicionarMeses(dataPenultimoAso, periodicidade);

    const diasRaw = l[COL.DIAS_PARA_VENCER - 1];
    const diasParaVencer = diasRaw === "" || diasRaw === null
      ? calcularDiferencaDias(proximoVencimento, hojeISO)
      : Number(diasRaw) || 0;

    const situacao = valorTexto(l[COL.SITUACAO - 1]);

    saida.push({
      linha: idx + 2,

      mat: valorTexto(l[COL.MAT - 1]),
      matricula: valorTexto(l[COL.MAT - 1]),
      matriculaCompleta: valorTexto(l[COL.MATRICULA_COMPLETA - 1]),

      nome: valorTexto(l[COL.NOME - 1]),
      funcao: valorTexto(l[COL.FUNCAO - 1]),
      setor: valorTexto(l[COL.SETOR - 1]),

      situacao: situacao,
      situacaoNorm: normalizarTexto(situacao),

      tipoExame: valorTexto(l[COL.TIPO_EXAME - 1]),
      periodicidade: periodicidade,

      dataPenultimoAso: dataPenultimoAso,
      dataPenultimoAsoBR: formatarDataBR(dataPenultimoAso),

      dataUltimoAso: dataUltimoAso,
      dataUltimoAsoBR: formatarDataBR(dataUltimoAso),

      dataPrevistaIndicador: dataPrevistaIndicador,
      dataPrevistaIndicadorBR: formatarDataBR(dataPrevistaIndicador),

      proximoVencimento: proximoVencimento,
      proximoVencimentoBR: formatarDataBR(proximoVencimento),

      dataConvocar: formatarDataISO(l[COL.DATA_CONVOCAR - 1]),
      dataConvocarBR: formatarDataBR(l[COL.DATA_CONVOCAR - 1]),

      dataLimite: formatarDataISO(l[COL.DATA_LIMITE - 1]),
      dataLimiteBR: formatarDataBR(l[COL.DATA_LIMITE - 1]),

      diasParaVencer: diasParaVencer,
      prioridade: definirPrioridade(diasParaVencer),

      // Derivados da AGENDA em aplicarAsoRealizadoAgenda().
      dataAgendada: "",
      dataAgendadaBR: "",
      statusAgenda: "",
      statusAgendaNorm: "",
      informacoesAgenda: "",
      statusGeral: "",
      statusGeralNorm: "",

      convocacaoBaixada: valorTexto(
        marcacoesConvocacao[idx] && marcacoesConvocacao[idx][0]
      )
    });
  }

  return saida;
}

/* =========================================================
   REGRAS DE NEGÓCIO
========================================================= */

function definirPrioridade(dias) {
  const n = Number(dias);

  if (isNaN(n)) return "Normal";
  if (n < 0) return "Vencido";
  if (n <= 7) return "Alta";
  if (n <= 15) return "Média";
  if (n <= 30) return "Baixa";
  return "Normal";
}

function ehAtivo(c) {
  return c.situacaoNorm === "ATIVO";
}

function ehAsoRealizado(c) {
  return c.statusAgendaNorm.includes("ASO REALIZADO");
}

function ehNaoCompareceuAso(c) {
  return c.statusAgendaNorm === "NAO COMPARECEU ASO";
}

function ehReagendouAso(c) {
  const status = normalizarTexto(c && c.statusAgendaNorm || "");
  return status === "REAGENDOU" || status.includes("REAGENDOU");
}

function ehNaoCompareceuOuReagendou(c) {
  return ehNaoCompareceuAso(c) || ehReagendouAso(c);
}

function ehVencido(c) {
  const status = normalizarTexto(c && c.statusGeralNorm || "");
  return status.includes("VENCIDO") || Number(c && c.diasParaVencer) < 0;
}

function ehAtrasadoAtivo(c) {
  return ehAtivo(c) && ehVencido(c);
}

function situacaoExcluidaIndicador(situacaoNorm) {
  const s = normalizarTexto(situacaoNorm);

  // Para indicadores, considerar apenas situações que representam colaborador elegível
  // ao acompanhamento periódico, como Ativo, Férias, Aviso etc.
  // Exclui afastamentos, desligamentos, licenças, aposentadorias e suspensões.
  const excluidas = [
    "DEMIT",
    "DESLIG",
    "RESCIS",
    "AFAST",
    "AF.PREVIDENCIA",
    "AF PREVIDENCIA",
    "AF.AC.TRABALHO",
    "AF AC TRABALHO",
    "INSS",
    "BENEFICIO",
    "LICENCA",
    "LICENÇA",
    "MATERN",
    "APOS",
    "INCAPACIDADE",
    "SUSPENS"
  ];

  return excluidas.some(e => s.includes(e));
}


/* =========================================================
   API PRINCIPAL DO PORTAL
========================================================= */

function obterDadosPortal(dataInicio, dataFim, forcarAtualizacao) {
  const chaveCache = "DADOS_" + dataInicio + "_" + dataFim;
  const cacheado = forcarAtualizacao ? null : obterCachePortal(chaveCache);

  if (cacheado) {
    cacheado.meta = cacheado.meta || {};
    cacheado.meta.cache = "sim";
    cacheado.meta.geradoEm = cacheado.meta.geradoEm || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
    aplicarHistoricoEnviosPendencias(cacheado);
    return cacheado;
  }

  const lista = lerFontePainel();
  const eventosPorMatricula = montarEventosAgendaPorMatricula();

  aplicarOcorrenciasAgenda(lista, eventosPorMatricula);
  aplicarAsoRealizadoAgenda(lista, eventosPorMatricula);
  prepararFlagsPortal(lista);

  const convocarTodos = gerarListaConvocar(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido);
  const examesComplementares = gerarExamesComplementares(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido);

  const convocarPendentes = convocarTodos.filter(c => !ehAsoRealizado(c));
  const convocarRealizados = convocarTodos.filter(c => ehAsoRealizado(c));

  const agendadosPeriodo = lista
    .filter(c => noPeriodo(c.dataAgendada, dataInicio, dataFim))
    .sort(ordenarPorDataAgendada);

  const pendencias = gerarPendencias(lista, eventosPorMatricula);
  const faltosos = pendencias.operacionais;

  const prioridade = lista
    .filter(c => Number(c.diasParaVencer) <= 30 && Number(c.diasParaVencer) >= 0)
    .filter(c => !c.asoRealizadoAgendaAtual)
    .filter(c => !c.asoRealizadoValido)
    .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));

  const vencidos = lista
    .filter(ehVencido)
    .filter(c => !c.asoRealizadoAgendaAtual)
    .filter(c => !c.asoRealizadoValido)
    .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));

  const prioridadeAtivos = prioridade.filter(ehAtivo);
  const prioridadeOutros = prioridade.filter(c => !ehAtivo(c));

  const vencidosAtivos = vencidos.filter(ehAtivo);
  const vencidosOutros = vencidos.filter(c => !ehAtivo(c));

  const compareceramPeriodo = agendadosPeriodo.filter(ehAsoRealizado);

  const resultado = {
    meta: {
      versao: "11.4",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim,
      cache: "não",
      sincronizacaoAgenda: obterResumoSincronizacaoAgenda()
    },

    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: convocarTodos.length,
      totalConvocarPendentes: convocarPendentes.length,
      totalConvocarRealizados: convocarRealizados.length,
      totalAgendados: agendadosPeriodo.length,
      totalCompareceram: compareceramPeriodo.length,
      totalFaltosos: pendencias.operacionais.length,
      totalPrioridade: prioridade.length,
      totalVencidos: vencidos.length,
      totalVencidosAtivos: vencidosAtivos.length,
      totalAtrasadosAtivos: lista.filter(c => c.atrasadoAtivo && !c.asoRealizadoValido).length,
      totalExamesComplementares: examesComplementares.length
    },

    convocar: {
      todos: convocarTodos,
      pendentes: convocarPendentes,
      realizados: convocarRealizados
    },

    faltosos: faltosos,
    pendencias: pendencias,
    prioridadeAtivos: prioridadeAtivos,
    prioridadeOutros: prioridadeOutros,
    vencidosAtivos: vencidosAtivos,
    vencidosOutros: vencidosOutros,
    examesComplementares: examesComplementares,
    colaboradores: gerarColaboradoresPortal(lista),
    indicadores: gerarIndicadores(lista)
  };

  salvarCachePortal(chaveCache, resultado);
  aplicarHistoricoEnviosPendencias(resultado);
  return resultado;
}

function prepararFlagsPortal(lista) {
  (lista || []).forEach(c => {
    c.ativoAtual = ehAtivo(c);
    c.asoRealizadoAgendaAtual = !!c.temAsoRealizadoAgenda;
    c.asoRealizadoValido = temAsoRealizadoValido(c);
    c.eventoQueEncerrouCiclo = c.asoRealizadoValido
      ? {
          data: c.dataAsoRealizadoAgenda || "",
          dataBR: c.dataAsoRealizadoAgendaBR || formatarDataBR(c.dataAsoRealizadoAgenda),
          tipo: c.tipoAsoRealizadoAgenda || "Periódico",
          status: "ASO Realizado"
        }
      : null;
    c.vencidoAtual = ehVencido(c);
    c.atrasadoAtivo = c.ativoAtual && c.vencidoAtual;
  });
  return lista || [];
}

function ehEventoPeriodicoAgenda(evento) {
  const tipo = normalizarTexto(evento && (evento.tipoNorm || evento.tipo) || "");
  return tipo.includes("PERIODIC");
}

function aplicarHistoricoEnviosPendencias(dadosPortal) {
  if (!dadosPortal) return dadosPortal;

  const listas = [
    dadosPortal.convocar && dadosPortal.convocar.todos || [],
    dadosPortal.convocar && dadosPortal.convocar.pendentes || [],
    dadosPortal.convocar && dadosPortal.convocar.realizados || [],
    dadosPortal.pendencias && dadosPortal.pendencias.necessitaReconvocacao || [],
    dadosPortal.pendencias && dadosPortal.pendencias.agendadosReagendados || [],
    dadosPortal.pendencias && dadosPortal.pendencias.operacionais || [],
    dadosPortal.pendencias && dadosPortal.pendencias.todos || [],
    dadosPortal.faltosos || []
  ];

  const matriculas = [];
  listas.forEach(lista => {
    (lista || []).forEach(item => {
      const mat = String(item.mat || "").trim();
      if (mat) matriculas.push(mat);
    });
  });

  const historico = typeof obterResumoHistoricoEnviosConvocacao === "function"
    ? obterResumoHistoricoEnviosConvocacao(Array.from(new Set(matriculas)))
    : {};

  listas.forEach(lista => {
    (lista || []).forEach(item => {
      const h = historico[String(item.mat || "").trim()] || {};
      item.totalConvocacoesEnviadas = Number(h.totalEnvios) || 0;
      item.ultimoEnvioConvocacao = h.ultimoEnvioEm || "";
      item.destinatariosUltimaConvocacao = (h.destinatarios || []).join(", ");
      item.temThreadConvocacao = !!h.threadId;
    });
  });

  return dadosPortal;
}

/**
 * Aplica em todos os colaboradores a quantidade de ocorrências de pendência
 * (Não compareceu ASO ou Reagendou) apurada pela aba AGENDA.
 * Essa propriedade é usada nas abas Pendências e Prioridade.
 */
function aplicarOcorrenciasAgenda(lista, eventosPorMatricula) {
  const mapaOcorrencias = eventosPorMatricula && eventosPorMatricula.__ocorrenciasPorMatricula
    ? eventosPorMatricula.__ocorrenciasPorMatricula
    : new Map();

  (lista || []).forEach(c => {
    const chaves = obterChavesMatricula(c.mat, c.matriculaCompleta);
    let total = 0;

    // O mesmo evento é indexado por variações da matrícula. Por isso usamos o maior
    // total encontrado entre as chaves, evitando soma duplicada e deixando a busca rápida.
    chaves.forEach(chave => {
      total = Math.max(total, Number(mapaOcorrencias.get(chave)) || 0);
    });

    // Fallback: quando o histórico da agenda não traz a pendência,
    // mas a FONTEpainel já informa o status atual como pendente.
    if (total === 0 && ehNaoCompareceuOuReagendou(c)) total = 1;

    c.qtdOcorrencias = total;
    c.ocorrencias = total;
    
  });

  return lista || [];
}
function aplicarAsoRealizadoAgenda(lista, eventosPorMatricula) {
  const hojeISO = obterHojeISO();

  (lista || []).forEach(c => {
    const eventos = obterEventosPorColaborador(eventosPorMatricula, c);
    const eventosComData = eventos.filter(e => e.data);
    const periodicos = eventosComData.filter(ehEventoPeriodicoAgenda);
    const ultimoPeriodico = periodicos.length
      ? periodicos[periodicos.length - 1]
      : null;

    /* P (DATA AGENDADA) e o status operacional passam a ser derivados
       diretamente do último registro PERIÓDICO da AGENDA. */
    c.dataAgendada = ultimoPeriodico ? (ultimoPeriodico.data || "") : "";
    c.dataAgendadaBR = formatarDataBR(c.dataAgendada);
    c.statusAgenda = ultimoPeriodico ? valorTexto(ultimoPeriodico.status) : "";
    c.statusAgendaNorm = normalizarTexto(c.statusAgenda);

    const realizadosTodos = eventosComData.filter(e => e.ehAsoRealizado);
    const realizadosPeriodicos = realizadosTodos.filter(ehEventoPeriodicoAgenda);

    c.asosRealizadosTipoIncompleto = realizadosTodos
      .filter(e => !normalizarTexto(e.tipoNorm || e.tipo || ""))
      .map(e => ({
        data: e.data || "",
        dataBR: e.dataBR || formatarDataBR(e.data),
        status: e.status || ""
      }));

    c.asosRealizadosNaoPeriodicos = realizadosTodos
      .filter(e => !ehEventoPeriodicoAgenda(e))
      .map(e => ({
        data: e.data || "",
        dataBR: e.dataBR || formatarDataBR(e.data),
        tipo: e.tipo || "",
        status: e.status || ""
      }));

    // Q (informações da agenda) é reconstruída em memória, sem SORT/FILTER na planilha.
    const ultimosPorTipo = {
      DEMISSIONAL: null,
      RETORNO: null,
      PERIODICO: null
    };

    realizadosTodos.forEach(e => {
      const tipo = normalizarTexto(e.tipoNorm || e.tipo || "");
      if (tipo.includes("DEMISSIONAL")) ultimosPorTipo.DEMISSIONAL = e;
      else if (tipo.includes("RETORNO")) ultimosPorTipo.RETORNO = e;
      else if (tipo.includes("PERIODIC")) ultimosPorTipo.PERIODICO = e;
    });

    const informacoes = [];
    if (ultimosPorTipo.DEMISSIONAL) {
      informacoes.push(
        "ASO demissional realizado em " +
        (ultimosPorTipo.DEMISSIONAL.dataBR || formatarDataBR(ultimosPorTipo.DEMISSIONAL.data))
      );
    }
    if (ultimosPorTipo.RETORNO) {
      informacoes.push(
        "ASO de retorno realizado em " +
        (ultimosPorTipo.RETORNO.dataBR || formatarDataBR(ultimosPorTipo.RETORNO.data))
      );
    }
    if (ultimosPorTipo.PERIODICO) {
      informacoes.push(
        "ASO periódico realizado em " +
        (ultimosPorTipo.PERIODICO.dataBR || formatarDataBR(ultimosPorTipo.PERIODICO.data))
      );
    }

    if (!informacoes.length && realizadosTodos.length) {
      const ultimoRealizado = realizadosTodos[realizadosTodos.length - 1];
      informacoes.push(
        "ASO realizado" +
        (ultimoRealizado.data
          ? " em " + (ultimoRealizado.dataBR || formatarDataBR(ultimoRealizado.data))
          : "")
      );
    }
    c.informacoesAgenda = informacoes.join("\n");

    if (realizadosPeriodicos.length === 0) {
      c.temAsoRealizadoAgenda = false;
      c.dataAsoRealizadoAgenda = "";
      c.dataAsoRealizadoAgendaBR = "";
      c.tipoAsoRealizadoAgenda = "";
    } else {
      const ultimoRealizado = realizadosPeriodicos[realizadosPeriodicos.length - 1];
      c.temAsoRealizadoAgenda = true;
      c.dataAsoRealizadoAgenda = ultimoRealizado.data;
      c.dataAsoRealizadoAgendaBR =
        ultimoRealizado.dataBR || formatarDataBR(ultimoRealizado.data);
      c.tipoAsoRealizadoAgenda = ultimoRealizado.tipo || "Periódico";
    }

    // R (STATUS GERAL) também deixa de depender da fórmula da planilha.
    c.statusGeral = calcularStatusGeralPortalV15_(c, hojeISO);
    c.statusGeralNorm = normalizarTexto(c.statusGeral);
  });

  return lista || [];
}

function calcularStatusGeralPortalV15_(c, hojeISO) {
  const dataPeriodico = c && c.dataAgendada ? String(c.dataAgendada) : "";
  const vencimento = c && c.proximoVencimento ? String(c.proximoVencimento) : "";

  if (temAsoRealizadoValido(c)) return "REALIZADO";

  if (dataPeriodico && dataPertenceAoCicloPeriodicoAtual(c, dataPeriodico)) {
    return "AGENDADO";
  }

  if (vencimento && vencimento < hojeISO) return "VENCIDO";
  if (c && c.dataLimite && c.dataLimite <= hojeISO) return "PRIORIDADE";
  if (c && c.dataConvocar && c.dataConvocar <= hojeISO) return "CONVOCAR";
  return "EM DIA";
}

function dataPertenceAoCicloPeriodicoAtual(c, dataEvento) {
  if (!c || !dataEvento) return false;

  const data = String(dataEvento);
  const dataUltimoFonte = String(c.dataUltimoAso || "");
  const dataConvocar = String(c.dataConvocar || "");
  const proximoVencimento = String(c.proximoVencimento || "");

  if (dataUltimoFonte && data <= dataUltimoFonte) return false;
  if (dataConvocar && data >= dataConvocar) return true;

  if (proximoVencimento) {
    const diasAntesDoVencimento = calcularDiferencaDias(proximoVencimento, data);
    return diasAntesDoVencimento !== null &&
      diasAntesDoVencimento >= 0 &&
      diasAntesDoVencimento <= 120;
  }

  return !!dataUltimoFonte && data > dataUltimoFonte;
}

function temAsoRealizadoValido(c) {
  if (!c) return false;
  return dataPertenceAoCicloPeriodicoAtual(c, c.dataAsoRealizadoAgenda || "");
}

function avaliarElegibilidadeConvocacao(c, dataInicio, dataFim) {
  const motivos = [];
  if (!c) {
    return {
      elegivel: false,
      motivos: ["Colaborador não encontrado"],
      grupoConvocacao: "",
      statusOperacional: "",
      revisaoDados: false,
      eventoQueEncerrouCiclo: null
    };
  }

  const realizadoValido = temAsoRealizadoValido(c);
  const eventoQueEncerrouCiclo = realizadoValido
    ? {
        data: c.dataAsoRealizadoAgenda || "",
        dataBR: c.dataAsoRealizadoAgendaBR || formatarDataBR(c.dataAsoRealizadoAgenda),
        tipo: c.tipoAsoRealizadoAgenda || "Periódico",
        status: "ASO Realizado"
      }
    : null;

  if (realizadoValido) motivos.push("ASO periódico do ciclo já realizado");

  const situacaoPermitida = situacaoPermiteBaixarConvocacao(c);
  if (!situacaoPermitida) {
    motivos.push("Situação funcional diferente de Ativo/Férias");
  }

  const revisaoDados = Array.isArray(c.asosRealizadosTipoIncompleto) &&
    c.asosRealizadosTipoIncompleto.length > 0;

  if (revisaoDados) {
    motivos.push("Há ASO realizado sem tipo de exame informado — revisar cadastro");
  }

  let grupo = "";
  let dataReferencia = "";

  if (noPeriodo(c.dataAgendada, dataInicio, dataFim)) {
    grupo = "Agendado no período";
    dataReferencia = c.dataAgendada;
  } else if (noPeriodo(c.dataConvocar, dataInicio, dataFim)) {
    grupo = "Convocação do período";
    dataReferencia = c.dataConvocar;
  } else if (c.dataConvocar && c.dataConvocar < dataInicio) {
    // Fila persistente: continua visível até existir periódico realizado válido,
    // mesmo quando o agendamento foi marcado para um mês futuro.
    grupo = "Pendência anterior";
    dataReferencia = c.dataConvocar;
  }

  let statusOperacional = "";
  if (realizadoValido) statusOperacional = "Realizado";
  else if (revisaoDados) statusOperacional = "Revisar dados";
  else if (normalizarTexto(c.situacao).includes("FERIAS")) {
    statusOperacional = c.dataAgendada ? "Adiado por férias / agendado" : "Adiado por férias";
  } else if (c.dataAgendada) statusOperacional = "Agendado";
  else if (grupo === "Pendência anterior") statusOperacional = "Pendente";
  else if (grupo) statusOperacional = "A convocar";

  return {
    elegivel: !!grupo && !realizadoValido && situacaoPermitida,
    motivos: motivos,
    grupoConvocacao: grupo,
    dataReferenciaConvocacao: dataReferencia,
    statusOperacional: statusOperacional,
    revisaoDados: revisaoDados,
    eventoQueEncerrouCiclo: eventoQueEncerrouCiclo
  };
}

function dataMaiorQue(dataA, dataB) {
  if (!dataA || !dataB) return false;
  return String(dataA) > String(dataB);
}

function obterChavesMatricula(mat, matriculaCompleta) {
  const chaves = new Set();

  [mat, matriculaCompleta].forEach(valor => {
    const texto = String(valor || "").trim();
    if (!texto) return;

    chaves.add(texto);

    const digitos = somenteDigitos(texto);
    if (digitos) {
      chaves.add(digitos);
      chaves.add(String(Number(digitos))); // remove zeros à esquerda

      // Compatibilidade quando a agenda usa matrícula completa e a FONTE usa matrícula curta.
      if (digitos.length > 4) chaves.add(digitos.slice(-4));
      if (digitos.length > 5) chaves.add(digitos.slice(-5));
    }
  });

  return Array.from(chaves).filter(Boolean);
}

function obterEventosPorColaborador(eventosPorMatricula, colaborador) {
  const mapa = eventosPorMatricula || new Map();
  const chaves = obterChavesMatricula(colaborador.mat, colaborador.matriculaCompleta);
  const chaveCache = chaves.slice().sort().join("|");

  // A mesma consolidação era refeita em aplicarAsoRealizadoAgenda e gerarPendencias.
  // O cache existe somente durante a execução atual e não é serializado.
  if (!mapa.__eventosResolvidos) mapa.__eventosResolvidos = new Map();
  if (mapa.__eventosResolvidos.has(chaveCache)) {
    return mapa.__eventosResolvidos.get(chaveCache);
  }

  const vistos = new Set();
  const eventos = [];

  chaves.forEach(chave => {
    (mapa.get(chave) || []).forEach(e => {
      const idEvento = [e.mat || "", e.data || "", e.statusNorm || "", e.tipoNorm || ""].join("|");
      if (!vistos.has(idEvento)) {
        vistos.add(idEvento);
        eventos.push(e);
      }
    });
  });

  eventos.sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
  mapa.__eventosResolvidos.set(chaveCache, eventos);
  return eventos;
}

function gerarPendencias(lista, eventosPorMatriculaParam) {
  const eventosPorMatricula = eventosPorMatriculaParam || montarEventosAgendaPorMatricula();
  const necessitaReconvocacao = [];
  const agendadosReagendados = [];
  const resolvidos = [];
  const processadas = new Set();

  (lista || []).forEach(colaborador => {
    const mat = String(colaborador.mat || "").trim();
    if (!mat || processadas.has(mat)) return;
    processadas.add(mat);

    // A lista já vem consolidada, sem duplicidades e em ordem cronológica.
    const eventos = obterEventosPorColaborador(eventosPorMatricula, colaborador);
    const eventosPendencia = eventos.filter(e => e.ehNaoCompareceu || e.ehReagendou);

    // Fallback: quando a aba AGENDA não possui histórico/status legível, usa o status atual da FONTEpainel.
    if (eventosPendencia.length === 0 && ehNaoCompareceuOuReagendou(colaborador)) {
      eventosPendencia.push({
        mat: mat,
        data: colaborador.dataAgendada || colaborador.dataConvocar || "",
        dataBR: colaborador.dataAgendadaBR || colaborador.dataConvocarBR || "",
        status: colaborador.statusAgenda,
        statusNorm: colaborador.statusAgendaNorm,
        ehNaoCompareceu: ehNaoCompareceuAso(colaborador),
        ehReagendou: ehReagendouAso(colaborador)
      });
    }

    if (eventosPendencia.length === 0) return;

    const ultimaPendencia = eventosPendencia[eventosPendencia.length - 1];

    const realizadosPosteriores = eventos
      .filter(e => e.ehAsoRealizado)
      .filter(ehEventoPeriodicoAgenda)
      .filter(e => dataMaiorQue(e.data, ultimaPendencia.data));

    /* Fallback baseado no periódico validado pela própria rotina da AGENDA.
       Evita que retorno/demissional/consulta resolvam uma pendência periódica. */
    if (
      colaborador.temAsoRealizadoAgenda &&
      colaborador.dataAsoRealizadoAgenda &&
      dataMaiorQue(colaborador.dataAsoRealizadoAgenda, ultimaPendencia.data)
    ) {
      const jaExiste = realizadosPosteriores.some(e =>
        String(e.data || "") === String(colaborador.dataAsoRealizadoAgenda || "")
      );

      if (!jaExiste) {
        realizadosPosteriores.push({
          mat: mat,
          data: colaborador.dataAsoRealizadoAgenda,
          dataBR: colaborador.dataAsoRealizadoAgendaBR || formatarDataBR(colaborador.dataAsoRealizadoAgenda),
          status: "ASO Realizado",
          statusNorm: "ASO REALIZADO",
          tipo: colaborador.tipoAsoRealizadoAgenda || "Periódico",
          tipoNorm: normalizarTexto(colaborador.tipoAsoRealizadoAgenda || "Periódico"),
          ehAsoRealizado: true
        });
      }
    }

    const itemBase = montarItemPendencia(colaborador, ultimaPendencia, eventosPendencia.length);

    if (realizadosPosteriores.length > 0) {
      const realizado = realizadosPosteriores[realizadosPosteriores.length - 1];

      resolvidos.push(Object.assign({}, itemBase, {
        grupoPendencia: "Resolvido",
        dataResolucao: realizado.data || "",
        dataResolucaoBR: realizado.dataBR || formatarDataBR(realizado.data),
        diasAteResolucao: calcularDiferencaDias(realizado.data, ultimaPendencia.data),
        acaoPendencia: "Resolvido por ASO realizado posteriormente"
      }));
      return;
    }

    let novaData = "";
    let novaDataBR = "";

    const proximoAgendamento = eventos.find(e =>
      e.data &&
      dataMaiorQue(e.data, ultimaPendencia.data) &&
      !e.ehNaoCompareceu &&
      !e.ehReagendou &&
      !e.ehCancelado &&
      !e.ehAsoRealizado
    );

    if (proximoAgendamento) {
      novaData = proximoAgendamento.data;
      novaDataBR = proximoAgendamento.dataBR || formatarDataBR(proximoAgendamento.data);
    } else if (colaborador.dataAgendada && dataMaiorQue(colaborador.dataAgendada, ultimaPendencia.data)) {
      novaData = colaborador.dataAgendada;
      novaDataBR = colaborador.dataAgendadaBR || formatarDataBR(colaborador.dataAgendada);
    }

    if (novaData) {
      agendadosReagendados.push(Object.assign({}, itemBase, {
        grupoPendencia: "Agendado/Reagendado",
        novaDataAgendada: novaData,
        novaDataAgendadaBR: novaDataBR || formatarDataBR(novaData),
        acaoPendencia: "Baixar nova convocação"
      }));
    } else {
      necessitaReconvocacao.push(Object.assign({}, itemBase, {
        grupoPendencia: "Necessita reconvocação",
        novaDataAgendada: "",
        novaDataAgendadaBR: "",
        acaoPendencia: "Gerar reconvocação"
      }));
    }
  });

  const ordenar = (a, b) => {
    const dataA = a.dataUltimaPendencia || "";
    const dataB = b.dataUltimaPendencia || "";
    if (dataA !== dataB) return dataB.localeCompare(dataA);
    return String(a.nome || "").localeCompare(String(b.nome || ""));
  };

  necessitaReconvocacao.sort(ordenar);
  agendadosReagendados.sort(ordenar);

  const operacionais = necessitaReconvocacao.concat(agendadosReagendados);

  return {
    necessitaReconvocacao: necessitaReconvocacao,
    agendadosReagendados: agendadosReagendados,
    operacionais: operacionais,
    todos: operacionais
  };
}
function montarItemPendencia(colaborador, evento, qtdOcorrencias) {
  return Object.assign({}, colaborador, {
    dataUltimaPendencia: evento.data || "",
    dataUltimaPendenciaBR: evento.dataBR || formatarDataBR(evento.data),
    statusPendencia: evento.status || colaborador.statusAgenda || "",
    tipoRegistroFaltoso: evento.ehReagendou ? "Reagendamento" : "Não compareceu",
    qtdOcorrencias: qtdOcorrencias || 1,
    ocorrencias: qtdOcorrencias || 1,
    observacaoFaltoso: evento.ehReagendou
      ? "Status agenda: REAGENDOU. Gerar nova convocação com a nova data agendada exibida."
      : "Status agenda: NÃO COMPARECEU ASO. Gerar reconvocação."
  });
}

function montarEventosAgendaPorMatricula() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABA_AGENDA);
  const mapaEventos = new Map();
  const mapaOcorrencias = new Map();

  // Propriedade auxiliar para cálculo rápido da coluna OCORR.
  mapaEventos.__ocorrenciasPorMatricula = mapaOcorrencias;

  if (!aba) return mapaEventos;

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();
  if (ultimaLinha < 2 || ultimaColuna < 1) return mapaEventos;

  const valores = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getValues();
  const cfg = identificarColunasAgenda(valores);
  if (!cfg) return mapaEventos;

  for (let i = cfg.linhaDados; i < valores.length; i++) {
    const l = valores[i];
    const mat = String(l[cfg.colMatricula] || "").trim();
    if (!mat) continue;

    const data = formatarDataISO(l[cfg.colData]);
    const status = valorTexto(l[cfg.colStatus]);
    const statusNorm = normalizarTexto(status);
    const linhaNorm = l.map(celula => normalizarTexto(celula)).join(" | ");
    if (!data && !statusNorm && !linhaNorm) continue;

    const tipo = cfg.colTipoExame >= 0 ? valorTexto(l[cfg.colTipoExame]) : "";
    const tipoNorm = normalizarTexto(tipo);

    const ehAsoRealizado = statusNorm.includes("ASO REALIZADO") || linhaNorm.includes("ASO REALIZADO");
    const ehNaoCompareceu =
      statusNorm === "NAO COMPARECEU ASO" ||
      statusNorm.includes("NAO COMPARECEU ASO") ||
      linhaNorm.includes("NAO COMPARECEU ASO");
    const ehReagendou =
      statusNorm === "REAGENDOU" ||
      statusNorm.includes("REAGENDOU") ||
      linhaNorm.includes("REAGENDOU");
      const ehCancelado =
  statusNorm.includes("CANCELADO") ||
  statusNorm.includes("CANCELADA") ||
  linhaNorm.includes("CANCELADO") ||
  linhaNorm.includes("CANCELADA");

    // Mantém o portal focado em ASO, mas não deixa de contar ocorrências quando
    // a coluna tipo está em branco ou mal preenchida e o próprio status já informa ASO.
    const tipoIndicaAso =
      tipoNorm.includes("PERIODICO") ||
      tipoNorm.includes("PERIÓDICO") ||
      tipoNorm.includes("ASO");

    const statusIndicaAso =
      statusNorm.includes("ASO") ||
      linhaNorm.includes("ASO") ||
      ehNaoCompareceu ||
      ehAsoRealizado;

    const ehRegistroAso = tipoIndicaAso || statusIndicaAso || !tipoNorm;
    if (!ehRegistroAso) continue;

    const evento = {
  mat: mat,
  data: data,
  dataBR: formatarDataBR(data),
  status: status,
  statusNorm: statusNorm,
  tipo: tipo,
  tipoNorm: tipoNorm,
  ehAsoRealizado: ehAsoRealizado,
  ehNaoCompareceu: ehNaoCompareceu,
  ehReagendou: ehReagendou,
  ehCancelado: ehCancelado
};

    const chaves = obterChavesMatricula(mat, "");

    chaves.forEach(chave => {
      if (!mapaEventos.has(chave)) mapaEventos.set(chave, []);
      mapaEventos.get(chave).push(evento);
    });

    if (ehNaoCompareceu || ehReagendou) {
      chaves.forEach(chave => {
        mapaOcorrencias.set(chave, (Number(mapaOcorrencias.get(chave)) || 0) + 1);
      });
    }
  }

  mapaEventos.forEach(eventos => {
    if (Array.isArray(eventos)) {
      eventos.sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
    }
  });

  return mapaEventos;
}

function identificarColunasAgenda(valores) {
  const maxLinhasCabecalho = Math.min(8, valores.length);

  for (let i = 0; i < maxLinhasCabecalho; i++) {
    const cab = valores[i].map(normalizarTexto);
    const colMatricula = procurarColuna(cab, ["MATRICULA", "MAT", "CHAPA"]);
    const colStatus = procurarColuna(cab, ["STATUS", "SITUACAO", "SITUAÇÃO"]);
    const colData = procurarColuna(cab, ["DATA", "AGENDA", "AGENDADA"]);
    const colTipoExame = procurarColuna(cab, [
      "TIPO DO EXAME",
      "TIPO_DE_EXAME",
      "TIPO EXAME",
      "TIPO"
    ]);

    if (colMatricula >= 0 && colStatus >= 0 && colData >= 0) {
      return {
        linhaDados: i + 1,
        colMatricula: colMatricula,
        colStatus: colStatus,
        colData: colData,
        colTipoExame: colTipoExame
      };
    }
  }

  // Fallback compatível com a estrutura visual da aba AGENDA:
  // Data: coluna D, Tipo do exame/atendimento: coluna G, Matrícula: coluna H, Status: coluna M.
  return {
    linhaDados: 2,
    colData: 3,
    colTipoExame: 6,
    colMatricula: 7,
    colStatus: 12
  };
}

function procurarColuna(cabecalhoNormalizado, termos) {
  for (let i = 0; i < cabecalhoNormalizado.length; i++) {
    const nome = cabecalhoNormalizado[i] || "";
    if (termos.some(t => nome.includes(normalizarTexto(t)))) return i;
  }
  return -1;
}

function gerarListaNaoCompareceram(lista, dataInicio, dataFim) {
  // Mantida apenas para compatibilidade com versões anteriores.
  return gerarPendencias(lista).operacionais;
}

function obterResumoSincronizacaoAgenda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABA_AGENDA);

  if (!aba) {
    return "Aba " + CONFIG.ABA_AGENDA + " não encontrada.";
  }

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();

  return "Fonte: " + CONFIG.ABA_AGENDA + " | Linhas: " + ultimaLinha + " | Colunas: " + ultimaColuna + " | Leitura: " +
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
}

function gerarListaConvocar(lista, dataInicio, dataFim) {
  return (lista || [])
    .map(c => {
      const avaliacao = avaliarElegibilidadeConvocacao(c, dataInicio, dataFim);
      if (!avaliacao.elegivel) return null;

      return Object.assign({}, c, {
        grupoConvocacao: avaliacao.grupoConvocacao,
        dataReferenciaConvocacao: avaliacao.dataReferenciaConvocacao,
        dataReferenciaConvocacaoBR: formatarDataBR(avaliacao.dataReferenciaConvocacao),
        statusOperacional: avaliacao.statusOperacional,
        revisaoDados: avaliacao.revisaoDados,
        motivosElegibilidade: avaliacao.motivos
      });
    })
    .filter(Boolean)
    .sort((a, b) => {
      const dataA = a.dataReferenciaConvocacao || a.dataConvocar || "";
      const dataB = b.dataReferenciaConvocacao || b.dataConvocar || "";
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });
}

function gerarListaRevisaoConvocar(lista, dataInicio, dataFim) {
  return (lista || [])
    .map(function(c) {
      const avaliacao = avaliarElegibilidadeConvocacao(c, dataInicio, dataFim);
      if (!avaliacao.grupoConvocacao) return null;
      if (avaliacao.eventoQueEncerrouCiclo) return null;
      if (avaliacao.elegivel && !avaliacao.revisaoDados) return null;

      return {
        mat: c.mat || "",
        nome: c.nome || "",
        funcao: c.funcao || "",
        setor: c.setor || "",
        situacao: c.situacao || "",
        grupoConvocacao: avaliacao.grupoConvocacao,
        statusOperacional: avaliacao.statusOperacional || "Revisar",
        motivos: avaliacao.motivos || [],
        revisaoDados: !!avaliacao.revisaoDados,
        dataConvocar: c.dataConvocar || "",
        dataConvocarBR: c.dataConvocarBR || "",
        dataAgendada: c.dataAgendada || "",
        dataAgendadaBR: c.dataAgendadaBR || ""
      };
    })
    .filter(Boolean)
    .sort(function(a, b) {
      const dataA = a.dataConvocar || "";
      const dataB = b.dataConvocar || "";
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });
}

function ordenarPorDataAgendada(a, b) {
  const dataA = a.dataAgendada || "";
  const dataB = b.dataAgendada || "";

  if (dataA !== dataB) return dataA.localeCompare(dataB);

  return String(a.nome || "").localeCompare(String(b.nome || ""));
}

function gerarExamesComplementares(lista, dataInicio, dataFim) {
  return gerarListaConvocar(lista, dataInicio, dataFim)
    .filter(c => colaboradorExigeExameComplementar(c))
    .map(c => Object.assign({}, c, {
      grupoComplementar: obterGrupoExameComplementar(c),
      prioridadeComplementar: definirPrioridadeComplementar(c)
    }))
    .sort((a, b) => {
      const dataA = a.dataLimite || a.dataConvocar || "";
      const dataB = b.dataLimite || b.dataConvocar || "";
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });
}

function colaboradorExigeExameComplementar(c) {
  return !!obterGrupoExameComplementar(c);
}

function obterGrupoExameComplementar(c) {
  const setor = normalizarTexto(c && c.setor ? c.setor : "");
  const funcao = normalizarTexto(c && c.funcao ? c.funcao : "");

  if (setor.includes("MANUTENCAO")) return "Manutencao";
  if (setor.includes("CME") && funcao.includes("TECNICO") && funcao.includes("ENFERMAGEM")) return "Tecnico enfermagem - CME";
  if (setor.includes("NUTRICAO") && funcao.includes("COPEIR")) return "Copeiro - Nutricao";
  if (setor.includes("SESMT") && funcao.includes("TECNICO") && funcao.includes("SEGURANCA")) return "Tecnico seguranca - SESMT";
  if (setor.includes("SESMT") && funcao.includes("ENGENHEIRO") && funcao.includes("SEGURANCA")) return "Engenheiro seguranca - SESMT";
  if (funcao.includes("RADIOLOGIA") || funcao.includes("RAIOS X")) return "Radiologia";

  return "";
}

function definirPrioridadeComplementar(c) {
  const dias = Number(c && c.diasParaVencer);
  if (isNaN(dias)) return "Normal";
  if (dias < 0) return "Atrasado";
  if (dias <= 7) return "Agendar agora";
  if (dias <= 30) return "Prioritario";
  return "Programado";
}



/* =========================================================
   ABA COLABORADORES - V9.0
========================================================= */

function gerarColaboradoresPortal(lista) {
  const hojeISO = obterHojeISO();

  return (lista || [])
    .map(c => {
      /* A FONTEpainel pode manter por algum tempo a data do ASO anterior.
         Quando a AGENDA já possui um PERIÓDICO realizado posteriormente,
         esse evento passa a ser a referência efetiva da aba Geral. */
      const dataPeriodicoRealizado = c && c.temAsoRealizadoAgenda
        ? String(c.dataAsoRealizadoAgenda || "")
        : "";
      const usarAgendaComoUltimoAso =
        !!dataPeriodicoRealizado &&
        (!c.dataUltimoAso || dataMaiorQue(dataPeriodicoRealizado, c.dataUltimoAso));

      const dataUltimoAsoEfetiva = usarAgendaComoUltimoAso
        ? dataPeriodicoRealizado
        : (c.dataUltimoAso || "");

      const proximoVencimentoEfetivo =
        usarAgendaComoUltimoAso && Number(c.periodicidade) > 0
          ? adicionarMeses(dataUltimoAsoEfetiva, Number(c.periodicidade))
          : (c.proximoVencimento || "");

      const colaboradorExibicao = Object.assign({}, c, {
        dataUltimoAsoEfetiva: dataUltimoAsoEfetiva,
        dataUltimoAsoBR: formatarDataBR(dataUltimoAsoEfetiva),
        proximoVencimentoEfetivo: proximoVencimentoEfetivo,
        proximoVencimentoBR: formatarDataBR(proximoVencimentoEfetivo),
        origemUltimoAso: usarAgendaComoUltimoAso ? "AGENDA" : "FONTE"
      });

      const dias = calcularDiferencaDias(proximoVencimentoEfetivo, hojeISO);
      const statusAso = definirStatusAsoColaborador(colaboradorExibicao, dias);

      return Object.assign({}, colaboradorExibicao, {
        statusAso: statusAso.texto,
        statusAsoClasse: statusAso.classe,
        diasStatusAso: dias === null ? "" : dias
      });
    })
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
}

function calcularDiasStatusColaborador(c, hojeISO) {
  if (!c || !c.proximoVencimento) return null;
  return calcularDiferencaDias(c.proximoVencimento, hojeISO);
}

function definirStatusAsoColaborador(c, dias) {
  const statusGeral = normalizarTexto(c && c.statusGeral ? c.statusGeral : "");

  if (statusGeral.includes("VENCIDO") || (dias !== null && Number(dias) < 0)) {
    return { texto: "Em atraso", classe: "vencido" };
  }

  if (dias !== null && Number(dias) <= 30) {
    return { texto: "Prioridade", classe: "media" };
  }

  return { texto: "Em dias", classe: "baixa" };
}

