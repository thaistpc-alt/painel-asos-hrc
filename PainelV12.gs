/* =========================================================
   PAINEL DE ASOS V12 - API MODULAR E CARREGAMENTO SOB DEMANDA
========================================================= */

function obterResumoPortalV12(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  const chave = "V12_RESUMO_" + dataInicio + "_" + dataFim;
  const cacheado = forcarAtualizacao ? null : obterCachePortal(chave);
  if (cacheado) return cacheado;

  const base = prepararBasePortalV12();
  const lista = base.lista;
  const convocar = gerarListaConvocar(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido);
  const exames = gerarExamesComplementaresV12(lista, dataInicio, dataFim);
  const pendencias = gerarPendencias(lista, base.eventosPorMatricula);
  const prioridade = lista.filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
    .filter(c => !c.asoRealizadoValido);
  const vencidos = lista.filter(ehVencido).filter(c => !c.asoRealizadoValido);
  const agendados = lista.filter(c => noPeriodo(c.dataAgendada, dataInicio, dataFim));

  const resultado = {
    meta: {
      versao: "12.0",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim
    },
    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: convocar.length,
      totalAgendados: agendados.length,
      totalRealizados: agendados.filter(ehAsoRealizado).length,
      totalPendencias: pendencias.operacionais.length,
      totalPrioridade: prioridade.length,
      totalVencidos: vencidos.length,
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
  const chave = "V12_MOD_" + modulo + "_" + dataInicio + "_" + dataFim;
  const cacheado = forcarAtualizacao ? null : obterCachePortal(chave);
  if (cacheado) return cacheado;

  const base = prepararBasePortalV12();
  const lista = base.lista;
  let resultado;

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
      resultado = lista.filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
        .filter(c => !c.asoRealizadoValido)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      break;
    case "VENCIDOS":
      resultado = lista.filter(ehVencido)
        .filter(c => !c.asoRealizadoValido)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      break;
    case "PENDENCIAS":
      resultado = gerarPendencias(lista, base.eventosPorMatricula);
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

  salvarCachePortal(chave, resultado);
  return resultado;
}

function prepararBasePortalV12() {
  const lista = lerFontePainel();
  const eventosPorMatricula = montarEventosAgendaPorMatricula();
  aplicarOcorrenciasAgenda(lista, eventosPorMatricula);
  aplicarAsoRealizadoAgenda(lista, eventosPorMatricula);
  prepararFlagsPortal(lista);
  return { lista: lista, eventosPorMatricula: eventosPorMatricula };
}

function validarPeriodoV12(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) throw new Error("Informe o período inicial e final.");
  if (String(dataInicio) > String(dataFim)) throw new Error("A data inicial não pode ser maior que a data final.");
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
  const s = normalizarTexto(c && c.situacao ? c.situacao : "");
  return s === "ATIVO" || s === "FERIAS" || s.includes("FERIAS");
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
