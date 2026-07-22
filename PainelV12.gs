/* =========================================================
   PAINEL DE ASOS V12 - NOVO LAYOUT COM REGRAS DA V11.4
   A camada visual é nova, mas os dados operacionais vêm de
   obterDadosPortal(), preservando todas as regras existentes.
========================================================= */

const V12_CACHE_PREFIXO = "V12_CONSOLIDADO_";
const V12_CACHE_CHUNK = 80000;
const V12_CACHE_SEGUNDOS = 1800;
const V12_EMAIL_COPIA_FIXA = "thais.tpc@isgh.org.br";

function obterDadosConsolidadosV12(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV12(dataInicio, dataFim);
  const chave = V12_CACHE_PREFIXO + dataInicio + "_" + dataFim;

  if (!forcarAtualizacao) {
    const cacheado = obterCacheGrandeV12(chave);
    if (cacheado) {
      cacheado.meta = cacheado.meta || {};
      cacheado.meta.cacheV12 = "sim";
      return cacheado;
    }
  }

  const dados = obterDadosPortal(dataInicio, dataFim, !!forcarAtualizacao);
  salvarCacheGrandeV12(chave, dados);
  return dados;
}

function preaquecerDadosPortalV12(dataInicio, dataFim) {
  obterDadosConsolidadosV12(dataInicio, dataFim, false);
  return true;
}

function obterResumoPortalV12(dataInicio, dataFim, forcarAtualizacao) {
  const dados = obterDadosConsolidadosV12(dataInicio, dataFim, forcarAtualizacao);
  const d = dados.dashboard || {};
  return {
    meta: dados.meta || {},
    dashboard: {
      totalColaboradores: d.totalColaboradores || 0,
      totalConvocar: d.totalConvocar || 0,
      totalAgendados: d.totalAgendados || 0,
      totalRealizados: d.totalCompareceram || 0,
      totalPendencias: d.totalFaltosos || 0,
      totalPrioridade: d.totalPrioridade || 0,
      totalVencidos: d.totalVencidos || 0,
      totalExamesComplementares: d.totalExamesComplementares || 0,
      examesSemAgendamentoAso: (dados.examesComplementares || []).filter(c => !c.dataAgendada).length,
      examesAsoAgendado: (dados.examesComplementares || []).filter(c => !!c.dataAgendada).length
    }
  };
}

function obterModuloPortalV12(modulo, dataInicio, dataFim, forcarAtualizacao) {
  const dados = obterDadosConsolidadosV12(dataInicio, dataFim, forcarAtualizacao);
  const m = normalizarTexto(modulo || "");

  switch (m) {
    case "CONVOCAR":
      return (dados.convocar && dados.convocar.todos) || [];

    case "EXAMES":
    case "EXAMES COMPLEMENTARES":
      return gerarExamesComplementaresV12(dados.colaboradores || [], dataInicio, dataFim);

    case "PRIORIDADE":
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
      return separarPendenciasSituacaoV12(dados.pendencias || {});

    case "CONSULTA":
    case "COLABORADORES":
      return dados.colaboradores || [];

    case "INDICADORES":
      return dados.indicadores || {};

    default:
      throw new Error("Módulo inválido: " + modulo);
  }
}

function filtrarPrioridadesV12(lista) {
  return (lista || [])
    .filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
    .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
}

function separarPendenciasSituacaoV12(pendencias) {
  const lista = pendencias.operacionais || pendencias.todos || [];
  return {
    ativos: lista.filter(situacaoAtivoFeriasV12),
    outros: lista.filter(c => !situacaoAtivoFeriasV12(c)),
    necessitaReconvocacao: pendencias.necessitaReconvocacao || [],
    agendadosReagendados: pendencias.agendadosReagendados || []
  };
}

function situacaoAtivoFeriasV12(c) {
  const s = normalizarTexto(c && (c.situacao || c.situacaoNorm) || "");
  return s === "ATIVO" || s === "FERIAS" || s.includes("FERIAS");
}

function validarPeriodoV12(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) throw new Error("Informe o período inicial e final.");
  if (String(dataInicio) > String(dataFim)) throw new Error("A data inicial não pode ser maior que a data final.");
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

  if (funcao.includes("TECNICO") && (funcao.includes("RADIOLOG") || funcao.includes("RAIO X") || funcao.includes("RAIOS X"))) {
    return "Técnico em Radiologia";
  }
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
  if (selecionadas.length > LIMITE_ANEXOS_EMAIL_GESTOR) {
    throw new Error("Envie no máximo " + LIMITE_ANEXOS_EMAIL_GESTOR + " convocações por lote.");
  }

  const lista = lerFontePainel();
  const dadosAgenda = lerAgendaDados();
  const turnosAgenda = montarUltimosTurnosAgenda(dadosAgenda);
  const mapa = new Map();
  lista.forEach(c => {
    mapa.set(String(c.mat || "").trim(), c);
    if (c.matriculaCompleta) mapa.set(String(c.matriculaCompleta).trim(), c);
  });

  const resultados = [];
  const anexos = [];
  const enviados = [];

  selecionadas.forEach(mat => {
    const c = mapa.get(mat);
    if (!c) {
      resultados.push({ sucesso: false, matricula: mat, erro: "Colaborador não encontrado" });
      return;
    }
    const motivo = motivoNaoBaixarConvocacao(c, dataInicio, dataFim);
    if (motivo) {
      resultados.push({ sucesso: false, ignorado: true, matricula: c.mat, colaborador: c.nome, motivo: motivo });
      return;
    }
    try {
      const pdf = gerarConvocacaoPorColaborador(c, dadosAgenda, { turnosAgenda: turnosAgenda, incluirAnexo: true });
      anexos.push(pdf.anexo);
      enviados.push(pdf);
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

function salvarCacheGrandeV12(chave, objeto) {
  const cache = CacheService.getScriptCache();
  const json = JSON.stringify(objeto);
  const gzip = Utilities.gzip(Utilities.newBlob(json, "application/json"));
  const base64 = Utilities.base64Encode(gzip.getBytes());
  const partes = [];
  for (let i = 0; i < base64.length; i += V12_CACHE_CHUNK) partes.push(base64.substring(i, i + V12_CACHE_CHUNK));
  cache.put(chave + "_META", String(partes.length), V12_CACHE_SEGUNDOS);
  partes.forEach((p, i) => cache.put(chave + "_" + i, p, V12_CACHE_SEGUNDOS));
}

function obterCacheGrandeV12(chave) {
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
