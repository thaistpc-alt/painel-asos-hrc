/**
 * Auditoria operacional da sincronizacao materializada do Painel de ASOs.
 * Nao envia e-mails, nao altera agenda/fonte, nao cria PDFs.
 * Execute diagnosticarPainelAsosV15 no editor para conferir o estado.
 */
function diagnosticarPainelAsosV15() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = lerConfigBaseV15_();
  const trigger = "sincronizarBaseAutomaticamenteV15";
  const acionadores = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === trigger).length;
  const origemId = cfg.ORIGEM_AGENDA_ID || BASE_V15.ORIGEM_AGENDA_ID;
  const origemAba = cfg.ORIGEM_AGENDA_ABA || BASE_V15.ORIGEM_AGENDA_ABA;
  const fonteOrigem = SpreadsheetApp.openById(origemId).getSheetByName(origemAba);
  const espelho = ss.getSheetByName(CONFIG.ABA_AGENDA);
  const fontePainel = ss.getSheetByName(CONFIG.ABA_FONTE);
  if (!fonteOrigem || !espelho || !fontePainel) {
    throw new Error("Aba obrigatoria da origem, do espelho ou da fonte do painel nao encontrada.");
  }

  // Compara matrículas, datas e tipos de exame de uma amostra de agendamentos
  // sem depender apenas da contagem de linhas (que pode coincidir entre bases divergentes).
  const ultOrigem = fonteOrigem.getLastRow();
  const ultEspelho = espelho.getLastRow();
  const largura = 13; // A:M: matricula, data, tipo e nome
  const inicio = Math.max(1, ultOrigem - 49);
  const amostraOrigem = fonteOrigem.getRange(inicio, 1, ultOrigem - inicio + 1, largura).getDisplayValues();
  const amostraEspelho = ultEspelho >= inicio
    ? espelho.getRange(inicio, 1, Math.min(ultEspelho - inicio + 1, amostraOrigem.length), largura).getDisplayValues()
    : [];
  let divergentes = 0;
  const posicoes = [];
  for (let i = 0; i < amostraOrigem.length; i++) {
    const a = amostraOrigem[i] || [];
    const b = amostraEspelho[i] || [];
    // Compara apenas campos operacionais, evitando falsos positivos por formatacao.
    const cols = [0, 3, 5, 6, 7, 11];
    if (cols.some(j => String(a[j] || "").trim() !== String(b[j] || "").trim())) {
      divergentes++;
      if (posicoes.length < 10) posicoes.push(inicio + i);
    }
  }
  const resultado = {
    versao: cfg.VERSAO_BASE || "",
    ultimaSincronizacao: cfg.ULTIMA_SINCRONIZACAO || "",
    acionadoresCincoMinutos: acionadores,
    linhasAgendaOrigem: ultOrigem,
    linhasAgendaEspelho: ultEspelho,
    colaboradoresFonte: Math.max(0, fontePainel.getLastRow() - 1),
    divergenciasAmostraFinal: divergentes,
    linhasDivergentes: posicoes,
    precisaIntervencao: !acionadores || ultOrigem !== ultEspelho || divergentes > 0
  };
  console.log(JSON.stringify(resultado));
  return resultado;
}

/**
 * Recuperacao controlada: valida as fontes, atualiza a base e SOMENTE DEPOIS
 * instala o acionador. Nao executa envios de mensagens ou PDFs.
 * Requer execucao manual no editor autenticado da conta proprietaria.
 */
function recuperarAtualizacaoAutomaticaAsosV15() {
  const resultado = atualizarBaseCompletaV15();
  if (!resultado || !resultado.sucesso) {
    throw new Error("Nao foi possivel confirmar a sincronizacao. Acionador nao instalado.");
  }
  const instalado = instalarAtualizacaoAutomaticaV15();
  return { sincronizacao: resultado, acionador: instalado, diagnostico: diagnosticarPainelAsosV15() };
}
