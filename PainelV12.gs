/* =========================================================
   PAINEL DE ASOS V12.2
   Interface nova, regras operacionais preservadas da V11.4.
   Desempenho: snapshot completo processado uma única vez e
   armazenado em caches independentes por módulo.
========================================================= */

const V12_CACHE_PREFIXO = "V12_2_";
const V12_CACHE_CHUNK = 85000;
const V12_CACHE_SEGUNDOS = 1800;
const V12_EMAIL_COPIA_FIXA = "thais.tpc@isgh.org.br";

function obterResumoPortalV12(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  const chave = chaveModuloV12("RESUMO", dataInicio, dataFim);

  if (!forcarAtualizacao) {
    const cacheado = obterCacheModuloV12(chave);
    if (cacheado) return cacheado;
  }

  // A visão geral não percorre a AGENDA. Isso permite abrir o painel rapidamente.
  const lista = lerFontePainel();
  prepararFlagsPortal(lista);

  const convocar = gerarListaConvocar(lista, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido);
  const prioridade = lista
    .filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
    .filter(c => !c.asoRealizadoValido);
  const vencidos = lista
    .filter(ehVencido)
    .filter(c => !c.asoRealizadoValido);
  const exames = gerarExamesComplementaresV12(lista, dataInicio, dataFim);
  const agendados = lista.filter(c => noPeriodo(c.dataAgendada, dataInicio, dataFim));
  const atrasadosAtivos = vencidos.filter(c => situacaoAtivoFeriasV12(c));

  const resultado = {
    meta: {
      versao: "12.2",
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      processamento: "resumo leve"
    },
    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: convocar.length,
      totalAgendados: agendados.length,
      totalRealizados: agendados.filter(ehAsoRealizado).length,
      totalPendencias: convocar.filter(c => !c.dataAgendada).length,
      totalPrioridade: prioridade.length,
      totalVencidos: vencidos.length,
      totalVencidosAtivos: atrasadosAtivos.length,
      totalAtrasadosAtivos: atrasadosAtivos.length,
      totalExamesComplementares: exames.length,
      examesSemAgendamentoAso: exames.filter(c => !c.dataAgendada).length
    }
  };

  salvarCacheModuloV12(chave, resultado);
  return resultado;
}

/**
 * Prepara os módulos completos sem bloquear a abertura da visão geral.
 * É chamada pelo navegador logo após renderizar o dashboard.
 */
function preaquecerDadosPortalV12(dataInicio, dataFim) {
  validarPeriodoV12(dataInicio, dataFim);
  construirSnapshotModularV12(dataInicio, dataFim, false);
  return true;
}

function obterModuloPortalV12(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  const nome = normalizarModuloV12(modulo);
  const chave = chaveModuloV12(nome, dataInicio, dataFim);

  if (!forcarAtualizacao) {
    const cacheado = obterCacheModuloV12(chave);
    if (cacheado !== null) return cacheado;
  }

  construirSnapshotModularV12(dataInicio, dataFim, !!forcarAtualizacao);
  const resultado = obterCacheModuloV12(chave);
  if (resultado === null) throw new Error("Não foi possível preparar o módulo " + nome + ".");
  return resultado;
}

function construirSnapshotModularV12(dataInicio, dataFim, forcarAtualizacao) {
  const chavePronto = chaveModuloV12("SNAPSHOT_PRONTO", dataInicio, dataFim);
  if (!forcarAtualizacao && CacheService.getScriptCache().get(chavePronto)) return true;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!forcarAtualizacao && CacheService.getScriptCache().get(chavePronto)) return true;

    // Esta é a função original do painel. Todas as regras da versão anterior permanecem aqui.
    const dados = obterDadosPortal(dataInicio, dataFim, !!forcarAtualizacao);

    const modulos = {
      CONVOCAR: (dados.convocar && dados.convocar.todos) || [],
      EXAMES: dados.examesComplementares || gerarExamesComplementaresV12(dados.colaboradores || [], dataInicio, dataFim),
      PRIORIDADES: {
        ativos: filtrarPrioridadesV12(dados.prioridadeAtivos || []),
        outros: filtrarPrioridadesV12(dados.prioridadeOutros || [])
      },
      VENCIDOS: {
        ativos: dados.vencidosAtivos || [],
        outros: dados.vencidosOutros || []
      },
      PENDENCIAS: montarPendenciasOperacionaisV12(dados),
      CONSULTA: dados.colaboradores || [],
      INDICADORES: dados.indicadores || {}
    };

    Object.keys(modulos).forEach(nome => {
      salvarCacheModuloV12(chaveModuloV12(nome, dataInicio, dataFim), modulos[nome]);
    });

    const d = dados.dashboard || {};
    const resumoCompleto = {
      meta: Object.assign({}, dados.meta || {}, { versao: "12.2", processamento: "snapshot completo" }),
      dashboard: {
        totalColaboradores: d.totalColaboradores || 0,
        totalConvocar: d.totalConvocar || 0,
        totalAgendados: d.totalAgendados || 0,
        totalRealizados: d.totalCompareceram || 0,
        totalPendencias: modulos.PENDENCIAS.ativos.length + modulos.PENDENCIAS.outros.length,
        totalPrioridade: modulos.PRIORIDADES.ativos.length + modulos.PRIORIDADES.outros.length,
        totalVencidos: d.totalVencidos || 0,
        totalVencidosAtivos: d.totalVencidosAtivos || 0,
        totalAtrasadosAtivos: d.totalAtrasadosAtivos || d.totalVencidosAtivos || 0,
        totalExamesComplementares: (modulos.EXAMES || []).length,
        examesSemAgendamentoAso: (modulos.EXAMES || []).filter(c => !c.dataAgendada).length
      }
    };
    salvarCacheModuloV12(chaveModuloV12("RESUMO", dataInicio, dataFim), resumoCompleto);
    CacheService.getScriptCache().put(chavePronto, "1", V12_CACHE_SEGUNDOS);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pendências exibidas:
 * 1. não compareceu e ainda não possui novo agendamento;
 * 2. colaborador do período que ainda não possui agendamento.
 * Reagendados com nova data e pendências já resolvidas não aparecem.
 */
function montarPendenciasOperacionaisV12(dados) {
  const pendencias = dados.pendencias || {};
  const naoCompareceramSemReagendamento = pendencias.necessitaReconvocacao || [];
  const semAgendamento = ((dados.convocar && dados.convocar.todos) || [])
    .filter(c => !c.dataAgendada)
    .filter(c => !c.asoRealizadoValido)
    .map(c => Object.assign({}, c, {
      grupoPendencia: "Sem agendamento",
      statusPendencia: "Sem agendamento",
      acaoPendencia: "Realizar agendamento"
    }));

  const mapa = new Map();
  naoCompareceramSemReagendamento.concat(semAgendamento).forEach(c => {
    const chave = String(c.mat || c.matricula || "").trim();
    if (!chave) return;
    const atual = mapa.get(chave);
    if (!atual || c.grupoPendencia === "Necessita reconvocação") mapa.set(chave, c);
  });

  const lista = Array.from(mapa.values()).sort((a, b) =>
    String(a.nome || "").localeCompare(String(b.nome || ""))
  );

  return {
    ativos: lista.filter(situacaoAtivoFeriasV12),
    outros: lista.filter(c => !situacaoAtivoFeriasV12(c))
  };
}

function filtrarPrioridadesV12(lista) {
  return (lista || [])
    .filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
    .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
}

function situacaoAtivoFeriasV12(c) {
  const s = normalizarTexto(c && (c.situacao || c.situacaoNorm) || "");
  return s === "ATIVO" || s === "FERIAS" || s.includes("FERIAS");
}

function validarPeriodoV12(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) throw new Error("Informe o período inicial e final.");
  if (String(dataInicio) > String(dataFim)) throw new Error("A data inicial não pode ser maior que a data final.");
}

function normalizarModuloV12(modulo) {
  const m = normalizarTexto(modulo || "");
  if (m === "PRIORIDADE") return "PRIORIDADES";
  if (m === "EXAMES COMPLEMENTARES") return "EXAMES";
  if (m === "COLABORADORES") return "CONSULTA";
  return m;
}

function chaveModuloV12(modulo, dataInicio, dataFim) {
  return V12_CACHE_PREFIXO + modulo + "_" + dataInicio + "_" + dataFim;
}

function gerarExamesComplementaresV12(lista, dataInicio, dataFim) {
  return (lista || [])
    .filter(situacaoAtivoFeriasV12)
    .filter(c => noPeriodo(c.dataConvocar, dataInicio, dataFim))
    .filter(c => !c.asoRealizadoValido)
    .map(c => {
      const grupo = obterGrupoExameComplementarV12(c);
      if (!grupo) return null;
      return Object.assign({}, c, {
        grupoComplementar: grupo,
        prioridadeComplementar: definirPrioridadeComplementarV12(c),
        situacaoAgendamentoAso: c.dataAgendada ? "ASO agendado" : "Sem agendamento de ASO",
        alertaComplementar: c.dataAgendada
          ? "Confirmar conclusão dos exames antes do ASO"
          : "Providenciar exames e agendamento do ASO"
      });
    })
    .filter(Boolean)
    .sort((a, b) => String(a.dataLimite || "").localeCompare(String(b.dataLimite || "")));
}

function obterGrupoExameComplementarV12(c) {
  const setor = normalizarTexto(c && c.setor || "");
  const funcao = normalizarTexto(c && c.funcao || "");
  if (setor.includes("MANUTEN")) return "Manutenção";
  const cme = setor === "CME" || setor.includes("CENTRAL DE MATERIAL") || setor.includes("MATERIAL E ESTERILIZ");
  if (cme && funcao.includes("TECNICO") && funcao.includes("ENFERMAGEM")) return "Técnico de Enfermagem - CME";
  const nutricao = setor.includes("NUTRICAO") || setor.includes("SND") || setor.includes("ALIMENTACAO");
  if (nutricao && funcao.includes("COPEIR")) return "Copeiro - Nutrição";
  const sesmt = setor.includes("SESMT") || (setor.includes("SEGURANCA") && setor.includes("TRABALHO"));
  if (sesmt && funcao.includes("TECNICO") && funcao.includes("SEGURANCA")) return "Técnico de Segurança do Trabalho - SESMT";
  if (sesmt && funcao.includes("ENGENHEIR") && funcao.includes("SEGURANCA")) return "Engenheiro de Segurança do Trabalho - SESMT";
  if (funcao.includes("TECNICO") && (funcao.includes("RADIOLOG") || funcao.includes("RAIO X") || funcao.includes("RAIOS X"))) return "Técnico em Radiologia";
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

function enviarConvocacoesSelecionadasGestorV12(matriculas, emailsGestor, dataInicio, dataFim) {
  const emails = validarEmailsGestor(emailsGestor);
  const selecionadas = (matriculas || []).map(String).map(s => s.trim()).filter(Boolean);
  if (!selecionadas.length) throw new Error("Selecione pelo menos uma convocação.");
  if (selecionadas.length > LIMITE_ANEXOS_EMAIL_GESTOR) throw new Error("Envie no máximo " + LIMITE_ANEXOS_EMAIL_GESTOR + " convocações por lote.");

  const lista = lerFontePainel();
  const dadosAgenda = lerAgendaDados();
  const turnosAgenda = montarUltimosTurnosAgenda(dadosAgenda);
  const mapa = new Map();
  lista.forEach(c => {
    mapa.set(String(c.mat || "").trim(), c);
    if (c.matriculaCompleta) mapa.set(String(c.matriculaCompleta).trim(), c);
  });

  const resultados = [], anexos = [], enviados = [];
  selecionadas.forEach(mat => {
    const c = mapa.get(mat);
    if (!c) return resultados.push({ sucesso: false, matricula: mat, erro: "Colaborador não encontrado" });
    const motivo = motivoNaoBaixarConvocacao(c, dataInicio, dataFim);
    if (motivo) return resultados.push({ sucesso: false, ignorado: true, matricula: c.mat, colaborador: c.nome, motivo: motivo });
    try {
      const pdf = gerarConvocacaoPorColaborador(c, dadosAgenda, { turnosAgenda: turnosAgenda, incluirAnexo: true });
      anexos.push(pdf.anexo); enviados.push(pdf);
      resultados.push({ sucesso: true, matricula: c.mat, colaborador: c.nome, arquivo: pdf.arquivo, url: pdf.url });
    } catch (e) {
      resultados.push({ sucesso: false, matricula: c.mat, colaborador: c.nome, erro: e.message });
    }
  });

  if (anexos.length) {
    const assunto = montarAssuntoEmailGestor(dataInicio, dataFim);
    const corpo = montarCorpoEmailGestor(enviados, dataInicio, dataFim, {});
    GmailApp.sendEmail(emails.join(","), assunto, corpo.texto, {
      htmlBody: corpo.html,
      attachments: anexos,
      cc: V12_EMAIL_COPIA_FIXA
    });
  }
  return resultados;
}

function salvarCacheModuloV12(chave, objeto) {
  const cache = CacheService.getScriptCache();
  const json = JSON.stringify(objeto);
  const gzip = Utilities.gzip(Utilities.newBlob(json, "application/json"));
  const base64 = Utilities.base64Encode(gzip.getBytes());
  const partes = [];
  for (let i = 0; i < base64.length; i += V12_CACHE_CHUNK) partes.push(base64.substring(i, i + V12_CACHE_CHUNK));
  cache.put(chave + "_META", String(partes.length), V12_CACHE_SEGUNDOS);
  partes.forEach((p, i) => cache.put(chave + "_" + i, p, V12_CACHE_SEGUNDOS));
}

function obterCacheModuloV12(chave) {
  try {
    const cache = CacheService.getScriptCache();
    const total = Number(cache.get(chave + "_META"));
    if (!total) return null;
    let base64 = "";
    for (let i = 0; i < total; i++) {
      const parte = cache.get(chave + "_" + i);
      if (!parte) return null;
      base64 += parte;
    }
    const bytes = Utilities.base64Decode(base64);
    const json = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString("UTF-8");
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function limparCachePortalV12() {
  CacheService.getScriptCache().removeAll([]);
  return true;
}
