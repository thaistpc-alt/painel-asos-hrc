/**
 * Portal de ASOS - SESMT HRC - Versão 15.0
 * Arquivo: Code.gs
 */

const CONFIG = {
  ABA_FONTE: "FONTEpainel",
  ABA_MODELO: "CONVOCAÇÃO",
  ABA_AGENDA: "AGENDA",
  PASTA_PDFS_ID: "1nLiYb9RTPB_0mq9rNPC8it5kUxaCL6nV",
  TIMEZONE: Session.getScriptTimeZone(),
  CACHE_SEGUNDOS: 1800,
  CACHE_PREFIXO: "PAINEL_ASOS_HRC_V15"
};

const COL = {
  MAT: 1,
  MATRICULA_COMPLETA: 2,
  NOME: 3,
  FUNCAO: 4,
  SETOR: 5,
  SITUACAO: 6,
  DATA_PENULTIMO_ASO: 7,
  DATA_ULTIMO_ASO: 8,
  TIPO_EXAME: 9,
  PERIODICIDADE: 10,
  DATA_BASE: 11,
  PROXIMO_VENCIMENTO: 12,
  DATA_CONVOCAR: 13,
  DATA_LIMITE: 14,
  DIAS_PARA_VENCER: 15,
  DATA_AGENDADA: 16,
  STATUS_AGENDA: 17,
  STATUS_GERAL: 18,
  CONVOCACAO_BAIXADA: 19
};

const EMAIL_COPIA_CONVOCACOES = "thais.tpc@isgh.org.br";

function incluirArquivoHtml(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}

function enviarConvocacoesSelecionadasGestorComCopia(matriculas, emailsGestor, dataInicio, dataFim, opcoes) {
  opcoes = opcoes || {};
  const emails = validarEmailsGestor(emailsGestor);
  const selecionadas = (matriculas || []).map(m => String(m || "").trim()).filter(Boolean);

  if (selecionadas.length === 0) return [];
  if (selecionadas.length > LIMITE_ANEXOS_EMAIL_GESTOR) {
    throw new Error("Envie no máximo " + LIMITE_ANEXOS_EMAIL_GESTOR + " convocações por e-mail. O painel divide lotes maiores automaticamente.");
  }

  const lista = typeof obterListaOperacionalV15_ === "function"
    ? obterListaOperacionalV15_()
    : lerFontePainel();
  const dadosAgenda = lerAgendaDados();
  const turnosAgenda = montarUltimosTurnosAgenda(dadosAgenda);
  const mapa = new Map();

  lista.forEach(c => {
    mapa.set(String(c.mat || "").trim(), c);
    if (c.matriculaCompleta) mapa.set(String(c.matriculaCompleta || "").trim(), c);
  });

  const resultados = [];
  const anexos = [];
  const enviados = [];
  let contextoGeracao = null;

  try {
    selecionadas.forEach(mat => {
    const colaborador = mapa.get(mat);

    if (!colaborador) {
      resultados.push({
        sucesso: false,
        ignorado: false,
        matricula: mat,
        colaborador: "",
        erro: "Colaborador não encontrado"
      });
      return;
    }

    const motivo = motivoNaoBaixarConvocacao(colaborador, dataInicio, dataFim);
    if (motivo) {
      resultados.push({
        sucesso: false,
        ignorado: true,
        colaborador: colaborador.nome,
        matricula: colaborador.mat,
        situacao: colaborador.situacao,
        dataAgendadaBR: colaborador.dataAgendadaBR,
        motivo: motivo
      });
      return;
    }

    try {
      if (!contextoGeracao) contextoGeracao = criarContextoGeracaoConvocacoes();
      const pdf = gerarConvocacaoPorColaborador(colaborador, dadosAgenda, {
        turnosAgenda: turnosAgenda,
        incluirAnexo: true,
        contextoGeracao: contextoGeracao
      });

      anexos.push(pdf.anexo);
      enviados.push(pdf);
      resultados.push({
        sucesso: true,
        ignorado: false,
        colaborador: colaborador.nome,
        matricula: colaborador.mat,
        arquivo: pdf.arquivo,
        url: pdf.url
      });
    } catch (e) {
      resultados.push({
        sucesso: false,
        ignorado: false,
        colaborador: colaborador.nome,
        matricula: colaborador.mat,
        erro: e.message
      });
    }
    });
  } finally {
    if (contextoGeracao) encerrarContextoGeracaoConvocacoes(contextoGeracao);
  }

  if (anexos.length > 0) {
    const assunto = montarAssuntoEmailGestor(dataInicio, dataFim);
    const contexto = opcoes.reconvocacao
      ? {
          reconvocacao: true,
          dataAnteriorBR: opcoes.dataAnteriorBR || "",
          novaDataBR: obterNovaDataConvocacaoBR(enviados),
          colaborador: enviados.length === 1
            ? (enviados[0].colaborador || enviados[0].nome || "")
            : ""
        }
      : {};

    const corpo = montarCorpoEmailGestor(enviados, dataInicio, dataFim, contexto);
    const thread = opcoes.responderThreadId
      ? obterThreadGmailPorId(opcoes.responderThreadId)
      : null;

    const destinatariosOriginais = thread
      ? obterDestinatariosOriginaisThread(thread)
      : [];
    const destinatariosEnvio = Array.from(new Set(
      emails.concat(destinatariosOriginais)
        .map(email => String(email || "").trim().toLowerCase())
        .filter(email => email && email !== EMAIL_COPIA_CONVOCACOES.toLowerCase())
    ));

    if (destinatariosEnvio.length === 0) {
      throw new Error("Não foi possível identificar os e-mails dos coordenadores.");
    }

    GmailApp.sendEmail(destinatariosEnvio.join(","), assunto, corpo.texto, {
      htmlBody: corpo.html,
      attachments: anexos,
      cc: EMAIL_COPIA_CONVOCACOES
    });

    emails.splice(0, emails.length, ...destinatariosEnvio);

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
}

function enviarReconvocacaoPendenciaGestorComCopia(mat, emailsGestor, dataInicio, dataFim, dataAnteriorBR) {
  const historico = obterHistoricoEnvioConvocacao(mat);
  const threadAnterior = historico.threadId || localizarThreadAnteriorConvocacao(mat);

  return enviarConvocacoesSelecionadasGestorComCopia(
    [mat],
    emailsGestor,
    dataInicio,
    dataFim,
    {
      reconvocacao: true,
      dataAnteriorBR: dataAnteriorBR || "",
      responderThreadId: threadAnterior
    }
  );
}

function doGet() {
  const htmlBase = HtmlService.createHtmlOutputFromFile("Index").getContent();
  const performance = incluirArquivoHtml("PatchPerformance");
  const ux = incluirArquivoHtml("UXV15");

  const complementos = performance + "\n" + ux;
  const htmlFinal = htmlBase.includes("</body>")
    ? htmlBase.replace("</body>", complementos + "\n</body>")
    : htmlBase + complementos;

  return HtmlService
    .createHtmlOutput(htmlFinal)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
