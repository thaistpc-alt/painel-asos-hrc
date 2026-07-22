/**
 * Portal de ASOS - SESMT HRC - Versão 11.4
 * Arquivo: Code.gs
 */

const CONFIG = {
  ABA_FONTE: "FONTEpainel",
  ABA_MODELO: "CONVOCAÇÃO",
  ABA_AGENDA: "AGENDA",
  PASTA_PDFS_ID: "1nLiYb9RTPB_0mq9rNPC8it5kUxaCL6nV",
  TIMEZONE: Session.getScriptTimeZone(),
  CACHE_SEGUNDOS: 1800,
  CACHE_PREFIXO: "PAINEL_ASOS_HRC_V11_4_COMPLEMENTARES_LAZY"
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

function doGet() {
  const index = HtmlService.createHtmlOutputFromFile("Index").getContent();
  const layout = HtmlService.createHtmlOutputFromFile("LayoutOverride").getContent();
  const performance = HtmlService.createHtmlOutputFromFile("PerformanceClient").getContent();
  const ajustes = HtmlService.createHtmlOutputFromFile("UIEnhancements").getContent();
  const correcoesFinais = HtmlService.createHtmlOutputFromFile("ZZ_UIRuntimeFix").getContent();
  const html = index.replace("</body>", layout + performance + ajustes + correcoesFinais + "</body>");

  return HtmlService
    .createHtmlOutput(html)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
