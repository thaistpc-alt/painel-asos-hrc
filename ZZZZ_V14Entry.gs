/* =========================================================
   ENTRADA V14
   Mantém a casca V13 e redireciona os endpoints para o núcleo V14.
   Este arquivo deve permanecer por último na ordem do projeto.
========================================================= */

var V14_DOGET_BASE_ = doGet;

obterResumoPortalV13Leve = function(dataInicio, dataFim, forcarAtualizacao) {
  return obterResumoPortalV14Leve(dataInicio, dataFim, forcarAtualizacao);
};

obterModuloPortalV13 = function(modulo, dataInicio, dataFim, forcarAtualizacao) {
  return obterModuloPortalV14(modulo, dataInicio, dataFim, forcarAtualizacao);
};

obterGraficoPortalV13 = function(dataInicio, dataFim) {
  return obterGraficoPortalV14(dataInicio, dataFim);
};

doGet = function() {
  const saidaBase = V14_DOGET_BASE_();
  const htmlBase = saidaBase.getContent();
  const filaV14 = incluirArquivoHtml("ConvocacaoUIV14");
  const htmlFinal = htmlBase.includes("</body>")
    ? htmlBase.replace("</body>", filaV14 + "\n</body>")
    : htmlBase + filaV14;

  return HtmlService
    .createHtmlOutput(htmlFinal)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
};
