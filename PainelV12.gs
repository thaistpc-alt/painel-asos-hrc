/* =========================================================
   PAINEL DE ASOS V12.1 - API MODULAR E CARREGAMENTO OTIMIZADO
========================================================= */

function obterResumoPortalV12(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  const chave = "V12_1_RESUMO_" + dataInicio + "_" + dataFim;
  const cacheado = forcarAtualizacao ? null : obterCachePortal(chave);
  if (cacheado) return cacheado;

  // O resumo não lê a AGENDA. Usa somente a fonte consolidada.
  const lista = prepararListaFonteV12();
  const convocar = gerarListaConvocar(lista, dataInicio, dataFim).filter(c => !c.asoRealizadoValido);
  const exames = gerarExamesComplementaresV12(lista, dataInicio, dataFim);
  const prioridade = gerarPrioridadesV12(lista);
  const vencidos = gerarVencidosV12(lista);
  const agendados = lista.filter(c => noPeriodo(c.dataAgendada, dataInicio, dataFim));
  const pendenciasFonte = lista.filter(c => ehNaoCompareceuOuReagendou(c) && !c.asoRealizadoValido);

  const resultado = {
    meta: {
      versao: "12.1",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim,
      leituraAgenda: false
    },
    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: convocar.length,
      totalAgendados: agendados.length,
      totalRealizados: agendados.filter(ehAsoRealizado).length,
      totalPendencias: pendenciasFonte.length,
      totalPrioridade: prioridade.todos.length,
      totalVencidos: vencidos.todos.length,
      totalExamesComplementares: exames.length,
      examesSemAgendamentoAso: exames.filter(c => !c.dataAgendada).length,
      examesAsoAgendado: exames.filter(c => !!c.dataAgendada).length
    }
  };

  salvarCachePortal(chave, resultado);
  return resultado;
}

function obterModuloPortalV12(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  modulo = normalizarTexto(modulo || "");
  const chave = "V12_1_MOD_" + modulo + "_" + dataInicio + "_" + dataFim;
  const cacheado = forcarAtualizacao ? null : obterCachePortal(chave);
  if (cacheado) return cacheado;

  let resultado;

  // Somente Pendências precisa percorrer toda a agenda histórica.
  if (modulo === "PENDENCIAS") {
    const base = prepararBasePortalV12(true);
    const pendencias = gerarPendencias(base.lista, base.eventosPorMatricula);
    resultado = separarPendenciasPorSituacaoV12(pendencias);
  } else {
    const lista = prepararListaFonteV12();

    switch (modulo) {
      case "CONVOCAR":
        resultado = gerarListaConvocar(lista, dataInicio, dataFim)
          .filter(c => !c.asoRealizadoValido);
        break;
      case "EXAMES":
      case "EXAMES COMPLEMENTARES":
        resultado = gerarExamesComplementaresV12(lista, dataInicio, dataFim);
        break;
      case "PRIORIDADES":
      case "PRIORIDADE":
        resultado = gerarPrioridadesV12(lista);
        break;
      case "VENCIDOS":
        resultado = gerarVencidosV12(lista);
        break;
      case "COLABORADORES":
      case "CONSULTA":
        resultado = gerarColaboradoresPortal(lista);
        break;
      case "INDICADORES":
        resultado = gerarIndicadores(lista);
        break;
      default:
        throw new Error("Módulo inválido: " + modulo);
    }
  }

  salvarCachePortal(chave, resultado);
  return resultado;
}

function prepararListaFonteV12() {
  const lista = lerFontePainel();
  prepararFlagsPortal(lista);
  return lista;
}

function prepararBasePortalV12(incluirAgenda) {
  const lista = lerFontePainel();
  let eventosPorMatricula = new Map();

  if (incluirAgenda) {
    eventosPorMatricula = montarEventosAgendaPorMatricula();
    aplicarOcorrenciasAgenda(lista, eventosPorMatricula);
    aplicarAsoRealizadoAgenda(lista, eventosPorMatricula);
  }

  prepararFlagsPortal(lista);
  return { lista: lista, eventosPorMatricula: eventosPorMatricula };
}

function validarPeriodoV12(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) throw new Error("Informe o período inicial e final.");
  if (String(dataInicio) > String(dataFim)) throw new Error("A data inicial não pode ser maior que a data final.");
}

function situacaoAtivoFeriasV12(c) {
  const s = normalizarTexto(c && (c.situacaoNorm || c.situacao) ? (c.situacaoNorm || c.situacao) : "");
  return s === "ATIVO" || s === "FERIAS" || s.includes("FERIAS");
}

function separarListaPorSituacaoV12(lista) {
  const todos = lista || [];
  return {
    ativosFerias: todos.filter(situacaoAtivoFeriasV12),
    outrosStatus: todos.filter(c => !situacaoAtivoFeriasV12(c)),
    todos: todos
  };
}

function gerarPrioridadesV12(lista) {
  const dados = (lista || [])
    .filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
    .filter(c => !c.asoRealizadoValido)
    .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
  return separarListaPorSituacaoV12(dados);
}

function gerarVencidosV12(lista) {
  const dados = (lista || [])
    .filter(ehVencido)
    .filter(c => !c.asoRealizadoValido)
    .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
  return separarListaPorSituacaoV12(dados);
}

function separarPendenciasPorSituacaoV12(pendencias) {
  pendencias = pendencias || {};
  const operacionais = pendencias.operacionais || pendencias.todos || [];
  const separados = separarListaPorSituacaoV12(operacionais);
  return {
    ativosFerias: separados.ativosFerias,
    outrosStatus: separados.outrosStatus,
    todos: separados.todos,
    necessitaReconvocacao: pendencias.necessitaReconvocacao || [],
    agendadosReagendados: pendencias.agendadosReagendados || []
  };
}

function gerarExamesComplementaresV12(lista, dataInicio, dataFim) {
  return (lista || [])
    .filter(situacaoOperacionalExamesV12)
    .filter(c => noPeriodo(c.dataConvocar, dataInicio, dataFim))
    .filter(c => !c.asoRealizadoValido)
    .map(c => {
      const grupo = obterGrupoExameComplementarV12(c);
      if (!grupo) return null;
      return Object.assign({}, c, {
        grupoComplementar: grupo,
        prioridadeComplementar: definirPrioridadeComplementarV12(c),
        situacaoAgendamentoAso: c.dataAgendada ? "ASO agendado" : "Sem agendamento de ASO",
        alertaComplementar: montarAlertaComplementarV12(c)
      });
    })
    .filter(Boolean)
    .sort((a, b) => {
      const dataA = a.dataLimite || a.dataConvocar || "";
      const dataB = b.dataLimite || b.dataConvocar || "";
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });
}

function situacaoOperacionalExamesV12(c) {
  return situacaoAtivoFeriasV12(c);
}

function obterGrupoExameComplementarV12(c) {
  const setor = normalizarTexto(c && c.setor ? c.setor : "");
  const funcao = normalizarTexto(c && c.funcao ? c.funcao : "");

  const setorManutencao = setor.includes("MANUTEN") ||
    (setor.includes("ENGENHARIA") && setor.includes("MANUT"));
  if (setorManutencao) return "Manutenção";

  const setorCme = setor === "CME" || setor.includes("CME ") ||
    setor.includes("CENTRAL DE MATERIAL") || setor.includes("MATERIAL E ESTERILIZ");
  const tecnicoEnfermagem = funcao.includes("TECNICO") && funcao.includes("ENFERMAGEM");
  if (setorCme && tecnicoEnfermagem) return "Técnico de Enfermagem - CME";

  const setorNutricao = setor.includes("NUTRICAO") || setor.includes("SND") ||
    setor.includes("ALIMENTACAO") || setor.includes("SERVICO DE NUTRICAO");
  if (setorNutricao && funcao.includes("COPEIR")) return "Copeiro - Nutrição";

  const setorSesmt = setor.includes("SESMT") ||
    (setor.includes("SEGURANCA") && setor.includes("TRABALHO")) ||
    setor.includes("MEDICINA DO TRABALHO");
  if (setorSesmt && funcao.includes("TECNICO") && funcao.includes("SEGURANCA")) {
    return "Técnico de Segurança do Trabalho - SESMT";
  }
  if (setorSesmt && funcao.includes("ENGENHEIR") && funcao.includes("SEGURANCA")) {
    return "Engenheiro de Segurança do Trabalho - SESMT";
  }

  const tecnicoRadiologia = funcao.includes("TECNICO") &&
    (funcao.includes("RADIOLOG") || funcao.includes("RAIO X") || funcao.includes("RAIOS X"));
  if (tecnicoRadiologia) return "Técnico em Radiologia";

  return "";
}

function definirPrioridadeComplementarV12(c) {
  const hoje = obterHojeISO();
  const diasLimite = c && c.dataLimite ? calcularDiferencaDias(c.dataLimite, hoje) : null;
  const diasVencimento = Number(c && c.diasParaVencer);

  if (!isNaN(diasVencimento) && diasVencimento < 0) return "Crítico";
  if (diasLimite !== null && diasLimite < 0) return "Crítico";
  if (diasLimite !== null && diasLimite <= 15) return "Urgente";
  if (diasLimite !== null && diasLimite <= 30) return "Atenção";
  return "Programado";
}

function montarAlertaComplementarV12(c) {
  const prioridade = definirPrioridadeComplementarV12(c);
  if (!c.dataAgendada && (prioridade === "Crítico" || prioridade === "Urgente")) {
    return "Priorizar agendamento dos exames e do ASO";
  }
  if (!c.dataAgendada) return "Providenciar exames antes de definir o ASO";
  return "Confirmar conclusão dos exames antes do ASO";
}

function limparCachePortalV12() {
  CacheService.getScriptCache().removeAll([]);
  return true;
}
