/**
 * V15 - Gestão da base derivada do Painel de ASOs
 *
 * Objetivos:
 * - manter FONTEpainel P:R como valores materializados, sem fórmulas pesadas;
 * - manter BASE_INDICADOR_ASO como tabela técnica materializada;
 * - usar as mesmas regras do painel para evitar divergência entre planilha e Web App;
 * - permitir atualização manual e automática sem recalcular a cada abertura.
 */

const BASE15_ABA_CONFIG = "_CONFIG_ASOS";
const BASE15_ABA_INDICADOR = "BASE_INDICADOR_ASO";
const BASE15_HANDLER_TRIGGER = "atualizarBasePainelCompletaV15";

function atualizarBasePainelCompletaV15() {
  const resultado = atualizarBaseDerivadaV15_({
    invalidarCache: true,
    retornarContexto: false
  });
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function atualizarBaseDerivadaV15_(opcoes) {
  opcoes = opcoes || {};
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error("Já existe uma atualização da base em andamento. Aguarde alguns segundos e tente novamente.");
  }

  const inicio = Date.now();

  try {
    const lista = lerFontePainel();
    const eventos = typeof montarEventosAgendaPorMatriculaV13_ === "function"
      ? montarEventosAgendaPorMatriculaV13_()
      : montarEventosAgendaPorMatricula();

    aplicarOcorrenciasAgenda(lista, eventos);
    aplicarAsoRealizadoAgenda(lista, eventos);
    prepararFlagsPortal(lista);

    const pendencias = gerarPendencias(lista, eventos);

    materializarFontePainelV15_(lista);
    const totalLinhasIndicador = materializarBaseIndicadorV15_(lista);

    SpreadsheetApp.flush();

    const duracaoMs = Date.now() - inicio;
    atualizarConfigBaseV15_({
      totalColaboradores: lista.length,
      totalPendencias: (pendencias.operacionais || []).length,
      totalLinhasIndicador: totalLinhasIndicador,
      duracaoMs: duracaoMs
    });

    if (opcoes.invalidarCache !== false && typeof avancarRevisaoCacheV133_ === "function") {
      avancarRevisaoCacheV133_();
    }

    const resultado = {
      sucesso: true,
      versaoBase: "15.0",
      colaboradores: lista.length,
      pendenciasOperacionais: (pendencias.operacionais || []).length,
      linhasIndicador: totalLinhasIndicador,
      duracaoMs: duracaoMs,
      atualizadoEm: formatarTimestampBaseV15_(new Date())
    };

    if (opcoes.retornarContexto) {
      resultado.contexto = {
        lista: lista,
        pendencias: pendencias,
        origemCache: "nova",
        processadoEm: resultado.atualizadoEm,
        duracaoProcessamentoMs: duracaoMs
      };
    }

    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function materializarFontePainelV15_(lista) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABA_FONTE);

  if (!aba) throw new Error("Aba FONTEpainel não encontrada.");

  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return;

  const totalLinhas = ultimaLinha - 1;
  const matriz = Array.from({ length: totalLinhas }, function() {
    return ["", "", ""];
  });

  (lista || []).forEach(function(c) {
    const indice = Number(c.linha) - 2;
    if (indice < 0 || indice >= matriz.length) return;

    matriz[indice] = [
      c.dataAgendada ? dataISOParaDate(c.dataAgendada) : "",
      c.informacoesAgenda || "",
      c.statusGeral || ""
    ];
  });

  const destino = aba.getRange(2, COL.DATA_AGENDADA, totalLinhas, 3);
  destino.setValues(matriz);

  // Preserva P como data, Q como texto multilinha e R como status textual.
  aba.getRange(2, COL.DATA_AGENDADA, totalLinhas, 1)
    .setNumberFormat("dd/MM/yyyy");
  aba.getRange(2, COL.STATUS_AGENDA, totalLinhas, 1)
    .setWrap(true);
}

function materializarBaseIndicadorV15_(lista) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(BASE15_ABA_INDICADOR);
  if (!aba) return 0;

  const linhas = construirBaseIndicadorV15_(lista);
  const maxLinhas = aba.getMaxRows();

  if (maxLinhas > 1) {
    aba.getRange(2, 1, maxLinhas - 1, 11).clearContent();
  }

  if (linhas.length) {
    aba.getRange(2, 1, linhas.length, 11).setValues(linhas);
    aba.getRange(2, 7, linhas.length, 2).setNumberFormat("dd/MM/yyyy");
    aba.getRange(2, 10, linhas.length, 1).setNumberFormat("0");
  }

  return linhas.length;
}

function construirBaseIndicadorV15_(lista) {
  const linhas = [];

  (lista || []).forEach(function(c) {
    if (!ehAtivoIndicadorASO(c)) return;
    if (!ehTipoPeriodicoIndicadorASO(c)) return;
    if (!Number(c.periodicidade)) return;

    const eventos = obterEventosIndicadorASO(c);

    eventos.forEach(function(evento) {
      const classificacao = classificarEventoIndicadorASO(evento);
      const dataRealizada = evento.dataRealizada || "";

      linhas.push([
        c.mat || "",
        c.nome || "",
        c.funcao || "",
        c.situacao || "",
        c.tipoExame || "",
        evento.origem || "",
        evento.dataPrevista ? dataISOParaDate(evento.dataPrevista) : "",
        dataRealizada ? dataISOParaDate(dataRealizada) : "",
        dataRealizada ? "ASO Realizado" : (c.statusAgenda || "Pendente"),
        evento.antecedencia === null || evento.antecedencia === undefined
          ? ""
          : Number(evento.antecedencia),
        classificacao
      ]);
    });
  });

  linhas.sort(function(a, b) {
    const dataA = a[6] instanceof Date ? a[6].getTime() : 0;
    const dataB = b[6] instanceof Date ? b[6].getTime() : 0;
    if (dataA !== dataB) return dataA - dataB;
    return String(a[1] || "").localeCompare(String(b[1] || ""));
  });

  return linhas;
}

function atualizarConfigBaseV15_(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(BASE15_ABA_CONFIG);
  if (!aba) return;

  const linhas = [
    ["ULTIMA_ATUALIZACAO_DADOS", formatarTimestampBaseV15_(new Date()), "Última materialização de P:R e BASE_INDICADOR_ASO", "Apps Script"],
    ["TOTAL_COLABORADORES", String(Number(dados.totalColaboradores) || 0), "Colaboradores processados na última atualização", "Apps Script"],
    ["TOTAL_PENDENCIAS", String(Number(dados.totalPendencias) || 0), "Pendências operacionais na última atualização", "Apps Script"],
    ["TOTAL_LINHAS_INDICADOR", String(Number(dados.totalLinhasIndicador) || 0), "Linhas materializadas em BASE_INDICADOR_ASO", "Apps Script"],
    ["DURACAO_ATUALIZACAO_MS", String(Number(dados.duracaoMs) || 0), "Duração da última atualização da base", "Apps Script"]
  ];

  aba.getRange(10, 1, linhas.length, 4).setValues(linhas);
}

function formatarTimestampBaseV15_(data) {
  return Utilities.formatDate(data, CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
}

function instalarAtualizacaoAutomaticaBaseV15() {
  removerAtualizacaoAutomaticaBaseV15();

  ScriptApp.newTrigger(BASE15_HANDLER_TRIGGER)
    .timeBased()
    .everyMinutes(15)
    .create();

  return {
    sucesso: true,
    intervaloMinutos: 15,
    handler: BASE15_HANDLER_TRIGGER
  };
}

function removerAtualizacaoAutomaticaBaseV15() {
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === BASE15_HANDLER_TRIGGER;
    })
    .forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  return true;
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Painel ASOs")
      .addItem("Atualizar base derivada", "atualizarBasePainelCompletaV15")
      .addSeparator()
      .addItem("Instalar atualização automática (15 min)", "instalarAtualizacaoAutomaticaBaseV15")
      .addItem("Remover atualização automática", "removerAtualizacaoAutomaticaBaseV15")
      .addToUi();
  } catch (e) {
    console.warn("Não foi possível criar o menu Painel ASOs: " + e.message);
  }
}
