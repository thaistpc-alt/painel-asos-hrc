/**
 * Portal de ASOS - SESMT HRC - Versão 13.0
 * Arquivo: Code.gs
 */

const CONFIG = {
  ABA_FONTE: "FONTEpainel",
  ABA_MODELO: "CONVOCAÇÃO",
  ABA_AGENDA: "AGENDA",
  PASTA_PDFS_ID: "1nLiYb9RTPB_0mq9rNPC8it5kUxaCL6nV",
  TIMEZONE: Session.getScriptTimeZone(),
  CACHE_SEGUNDOS: 1800,
  CACHE_PREFIXO: "PAINEL_ASOS_HRC_V13_MODULAR"
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
  // Usa o fluxo único para convocação e reconvocação: ele valida participantes,
  // exige nova data na AGENDA e responde na conversa original com replyAll.
  return enviarConvocacoesSelecionadasGestor(
    matriculas,
    emailsGestor,
    dataInicio,
    dataFim,
    opcoes || {}
  );
}

function enviarReconvocacaoPendenciaGestorComCopia(mat, emailsGestor, dataInicio, dataFim, dataAnteriorBR) {
  return enviarReconvocacaoPendenciaGestor(
    mat,
    emailsGestor,
    dataInicio,
    dataFim,
    dataAnteriorBR || ""
  );
}

function doGet() {
  const htmlBase = HtmlService.createHtmlOutputFromFile("Index").getContent();
  const complementos = incluirArquivoHtml("PainelInterfaceV15");
  const htmlFinal = htmlBase.includes("</body>")
    ? htmlBase.replace("</body>", complementos + "\n</body>")
    : htmlBase + complementos;

  return HtmlService
    .createHtmlOutput(htmlFinal)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
