/* =========================================================
   CONVOCAÇÕES V14
   Usa a mesma elegibilidade da fila e reutiliza um único modelo temporário por lote.
========================================================= */

const V14_PREFIXO_TEMP_CONVOCACAO = "TEMP_CONVOCACAO_V14_";
const V14_IDADE_LIMPEZA_TEMP_MS = 2 * 60 * 60 * 1000;

function obterColaboradorV14PorMatricula_(mat) {
  const chave = String(mat || "").trim();
  const contexto = construirContextoPortalV14_(false);
  return (contexto.lista || []).find(c => obterChavesMatricula(c.mat, c.matriculaCompleta).includes(chave)) || null;
}

function periodoPadraoConvocacaoV14_(dataInicio, dataFim) {
  if (dataInicio && dataFim) return { inicio: dataInicio, fim: dataFim };
  const hoje = new Date();
  return {
    inicio: Utilities.formatDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1), CONFIG.TIMEZONE, "yyyy-MM-dd"),
    fim: Utilities.formatDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0), CONFIG.TIMEZONE, "yyyy-MM-dd")
  };
}

function validarGeracaoConvocacaoV14_(colaborador, dataInicio, dataFim) {
  const periodo = periodoPadraoConvocacaoV14_(dataInicio, dataFim);
  const avaliacao = avaliarElegibilidadeConvocacaoV14_(colaborador, periodo.inicio, periodo.fim);
  if (!avaliacao.elegivel) {
    return { ok: false, motivo: (avaliacao.motivos || []).join(" ") || "Colaborador não elegível para convocação." };
  }
  if (!avaliacao.podeGerarConvocacao) {
    return { ok: false, motivo: (avaliacao.motivosGeracao || []).join(" ") || "Convocação exige revisão antes da geração." };
  }
  return { ok: true, avaliacao: avaliacao };
}

function limparAbasTemporariasConvocacaoV14_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const agora = Date.now();
  const removidas = [];

  ss.getSheets().forEach(aba => {
    const nome = aba.getName();
    if (nome.indexOf("TEMP_CONVOCACAO_") !== 0) return;
    const partes = nome.split("_");
    const timestamp = Number(partes[partes.length - 1]);
    if (!timestamp || agora - timestamp < V14_IDADE_LIMPEZA_TEMP_MS) return;
    try {
      ss.deleteSheet(aba);
      removidas.push(nome);
    } catch (e) {}
  });
  return removidas;
}

function criarModeloTemporarioConvocacaoV14_(ss) {
  const modelo = ss.getSheetByName(CONFIG.ABA_MODELO);
  if (!modelo) throw new Error("Aba CONVOCAÇÃO não encontrada.");
  return modelo.copyTo(ss).setName(V14_PREFIXO_TEMP_CONVOCACAO + Date.now());
}

function gerarConvocacaoNoModeloV14_(ss, modeloTemp, colaborador, incluirAnexo) {
  modeloTemp.getRange("C10:C13").setValues([
    [colaborador.nome],
    [colaborador.mat],
    [colaborador.funcao],
    [colaborador.setor]
  ]);
  modeloTemp.getRange("C18").setValue(colaborador.dataAgendadaBR || colaborador.dataAgendada || "");
  modeloTemp.getRange("E18").setValue(colaborador.turnoAgenda || "");
  SpreadsheetApp.flush();

  const nomeArquivo = limparNomeArquivo(`${colaborador.setor} - ${colaborador.funcao} - ${colaborador.nome}`);
  const pdf = exportarAbaComoPDF(ss.getId(), modeloTemp.getSheetId(), nomeArquivo);
  const arquivo = DriveApp.getFolderById(CONFIG.PASTA_PDFS_ID).createFile(pdf).setName(nomeArquivo + ".pdf");

  const resultado = {
    sucesso: true,
    ignorado: false,
    nome: colaborador.nome,
    colaborador: colaborador.nome,
    matricula: colaborador.mat,
    dataAgendadaBR: colaborador.dataAgendadaBR || "",
    dataConvocarBR: colaborador.dataConvocarBR || "",
    dataLimiteBR: colaborador.dataLimiteBR || "",
    arquivo: arquivo.getName(),
    url: arquivo.getUrl()
  };
  if (incluirAnexo) resultado.anexo = arquivo.getBlob().setName(arquivo.getName());
  return resultado;
}

function gerarConvocacaoIndividualV14(mat, dataInicio, dataFim) {
  const colaborador = obterColaboradorV14PorMatricula_(mat);
  if (!colaborador) throw new Error("Colaborador não encontrado: " + mat);
  const validacao = validarGeracaoConvocacaoV14_(colaborador, dataInicio, dataFim);
  if (!validacao.ok) throw new Error(validacao.motivo);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Existe outra geração de convocação em andamento. Tente novamente após a conclusão.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let temp = null;
  try {
    limparAbasTemporariasConvocacaoV14_();
    temp = criarModeloTemporarioConvocacaoV14_(ss);
    return gerarConvocacaoNoModeloV14_(ss, temp, colaborador, false);
  } finally {
    if (temp) {
      try { ss.deleteSheet(temp); } catch (e) {}
    }
    lock.releaseLock();
  }
}

function mapearColaboradoresSelecionadosV14_(matriculas) {
  const contexto = construirContextoPortalV14_(false);
  const mapa = new Map();
  (contexto.lista || []).forEach(c => {
    obterChavesMatricula(c.mat, c.matriculaCompleta).forEach(chave => mapa.set(chave, c));
  });
  return (matriculas || []).map(m => ({ solicitada: String(m || "").trim(), colaborador: mapa.get(String(m || "").trim()) || null }));
}

function gerarConvocacoesSelecionadasLoteV14(matriculas, dataInicio, dataFim) {
  const selecionadas = [...new Set((matriculas || []).map(m => String(m || "").trim()).filter(Boolean))];
  if (!selecionadas.length) return [];

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Existe outra geração de convocação em andamento. Tente novamente após a conclusão.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let temp = null;
  const resultados = [];

  try {
    limparAbasTemporariasConvocacaoV14_();
    temp = criarModeloTemporarioConvocacaoV14_(ss);

    mapearColaboradoresSelecionadosV14_(selecionadas).forEach(item => {
      const c = item.colaborador;
      if (!c) {
        resultados.push({ sucesso: false, ignorado: false, matricula: item.solicitada, colaborador: "", erro: "Colaborador não encontrado" });
        return;
      }
      const validacao = validarGeracaoConvocacaoV14_(c, dataInicio, dataFim);
      if (!validacao.ok) {
        resultados.push({ sucesso: false, ignorado: true, matricula: c.mat, colaborador: c.nome, situacao: c.situacao, dataAgendadaBR: c.dataAgendadaBR, motivo: validacao.motivo });
        return;
      }
      try {
        resultados.push(gerarConvocacaoNoModeloV14_(ss, temp, c, false));
      } catch (e) {
        resultados.push({ sucesso: false, ignorado: false, matricula: c.mat, colaborador: c.nome, erro: e.message || String(e) });
      }
    });
    return resultados;
  } finally {
    if (temp) {
      try { ss.deleteSheet(temp); } catch (e) {}
    }
    lock.releaseLock();
  }
}

function enviarConvocacoesSelecionadasGestorComCopiaV14(matriculas, emailsGestor, dataInicio, dataFim, opcoes) {
  opcoes = opcoes || {};
  const emails = validarEmailsGestor(emailsGestor);
  const selecionadas = [...new Set((matriculas || []).map(m => String(m || "").trim()).filter(Boolean))];
  if (!selecionadas.length) return [];
  if (selecionadas.length > LIMITE_ANEXOS_EMAIL_GESTOR) {
    throw new Error("Envie no máximo " + LIMITE_ANEXOS_EMAIL_GESTOR + " convocações por e-mail. O painel divide lotes maiores automaticamente.");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Existe outra geração/envio de convocação em andamento. Tente novamente após a conclusão.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let temp = null;
  const resultados = [];
  const enviados = [];
  const anexos = [];

  try {
    limparAbasTemporariasConvocacaoV14_();
    temp = criarModeloTemporarioConvocacaoV14_(ss);

    mapearColaboradoresSelecionadosV14_(selecionadas).forEach(item => {
      const c = item.colaborador;
      if (!c) {
        resultados.push({ sucesso: false, ignorado: false, matricula: item.solicitada, colaborador: "", erro: "Colaborador não encontrado" });
        return;
      }
      const validacao = validarGeracaoConvocacaoV14_(c, dataInicio, dataFim);
      if (!validacao.ok) {
        resultados.push({ sucesso: false, ignorado: true, matricula: c.mat, colaborador: c.nome, situacao: c.situacao, dataAgendadaBR: c.dataAgendadaBR, motivo: validacao.motivo });
        return;
      }
      try {
        const pdf = gerarConvocacaoNoModeloV14_(ss, temp, c, true);
        enviados.push(pdf);
        anexos.push(pdf.anexo);
        resultados.push(pdf);
      } catch (e) {
        resultados.push({ sucesso: false, ignorado: false, matricula: c.mat, colaborador: c.nome, erro: e.message || String(e) });
      }
    });

    if (anexos.length) {
      const assunto = montarAssuntoEmailGestor(dataInicio, dataFim);
      const contextoEmail = opcoes.reconvocacao
        ? {
            reconvocacao: true,
            dataAnteriorBR: opcoes.dataAnteriorBR || "",
            novaDataBR: obterNovaDataConvocacaoBR(enviados),
            colaborador: enviados.length === 1 ? (enviados[0].colaborador || enviados[0].nome || "") : ""
          }
        : {};
      const corpo = montarCorpoEmailGestor(enviados, dataInicio, dataFim, contextoEmail);
      const thread = opcoes.responderThreadId ? obterThreadGmailPorId(opcoes.responderThreadId) : null;
      const opcoesEmail = { htmlBody: corpo.html, attachments: anexos, cc: EMAIL_COPIA_CONVOCACOES };

      if (thread) thread.reply(corpo.texto, opcoesEmail);
      else GmailApp.sendEmail(emails.join(","), assunto, corpo.texto, opcoesEmail);

      const threadId = thread ? thread.getId() : localizarThreadEnviada(assunto);
      resultados.forEach(r => {
        if (!r.sucesso) return;
        r.emailEnviado = true;
        r.destinatarios = emails.join(", ");
        r.copia = EMAIL_COPIA_CONVOCACOES;
        registrarHistoricoEnvioConvocacao(r.matricula, {
          destinatarios: emails,
          assunto: assunto,
          threadId: threadId,
          arquivo: r.arquivo,
          url: r.url,
          reconvocacao: !!opcoes.reconvocacao
        });
      });
    }

    return resultados;
  } finally {
    if (temp) {
      try { ss.deleteSheet(temp); } catch (e) {}
    }
    lock.releaseLock();
  }
}

function enviarReconvocacaoPendenciaGestorComCopiaV14(mat, emailsGestor, dataInicio, dataFim, dataAnteriorBR) {
  const historico = obterHistoricoEnvioConvocacao(mat);
  const threadAnterior = historico.threadId || localizarThreadAnteriorConvocacao(mat);
  return enviarConvocacoesSelecionadasGestorComCopiaV14([mat], emailsGestor, dataInicio, dataFim, {
    reconvocacao: true,
    dataAnteriorBR: dataAnteriorBR || "",
    responderThreadId: threadAnterior
  });
}
