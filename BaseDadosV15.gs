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
    const contextoOperacional = construirContextoOperacionalV15_();
    const lista = contextoOperacional.lista;
    const pendencias = contextoOperacional.pendencias;

    const assinatura = calcularAssinaturaBaseV15_(contextoOperacional);
    const propriedades = PropertiesService.getScriptProperties();
    const assinaturaAnterior = propriedades.getProperty("ASOS_V15_ASSINATURA_BASE") || "";
    const dadosAlterados = assinatura !== assinaturaAnterior;

    let totalLinhasIndicador = obterTotalLinhasIndicadorV15_();

    if (dadosAlterados) {
      materializarFontePainelV15_(lista);
      totalLinhasIndicador = materializarBaseIndicadorV15_(lista);
      SpreadsheetApp.flush();
      propriedades.setProperty("ASOS_V15_ASSINATURA_BASE", assinatura);

      if (opcoes.invalidarCache !== false && typeof avancarRevisaoCacheV133_ === "function") {
        avancarRevisaoCacheV133_();
      }
    }

    const duracaoMs = Date.now() - inicio;
    atualizarConfigBaseV15_({
      totalColaboradores: lista.length,
      totalPendencias: (pendencias.operacionais || []).length,
      totalLinhasIndicador: totalLinhasIndicador,
      duracaoMs: duracaoMs,
      dadosAlterados: dadosAlterados
    });

    const resultado = {
      sucesso: true,
      versaoBase: "15.0",
      dadosAlterados: dadosAlterados,
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

function construirContextoOperacionalV15_() {
  const inicio = Date.now();
  const lista = lerFontePainel();
  const eventos = typeof montarEventosAgendaPorMatriculaV13_ === "function"
    ? montarEventosAgendaPorMatriculaV13_()
    : montarEventosAgendaPorMatricula();

  aplicarOcorrenciasAgenda(lista, eventos);
  aplicarAsoRealizadoAgenda(lista, eventos);
  prepararFlagsPortal(lista);
  const pendencias = gerarPendencias(lista, eventos);

  return {
    lista: lista,
    pendencias: pendencias,
    eventos: eventos,
    origemCache: "nova",
    processadoEm: formatarTimestampBaseV15_(new Date()),
    duracaoProcessamentoMs: Date.now() - inicio
  };
}

function obterListaOperacionalV15_() {
  const hoje = obterHojeISO();
  if (typeof construirContextoV13_ === "function") {
    const contexto = construirContextoV13_(hoje, hoje, false);
    if (contexto && Array.isArray(contexto.lista)) return contexto.lista;
  }
  return construirContextoOperacionalV15_().lista;
}

function materializarContextoBaseV15_(contexto) {
  if (!contexto || !Array.isArray(contexto.lista)) return null;

  const inicio = Date.now();
  const assinatura = calcularAssinaturaBaseV15_(contexto);
  const propriedades = PropertiesService.getScriptProperties();
  const assinaturaAnterior = propriedades.getProperty("ASOS_V15_ASSINATURA_BASE") || "";
  const dadosAlterados = assinatura !== assinaturaAnterior;
  let totalLinhasIndicador = obterTotalLinhasIndicadorV15_();

  if (dadosAlterados) {
    materializarFontePainelV15_(contexto.lista);
    totalLinhasIndicador = materializarBaseIndicadorV15_(contexto.lista);
    SpreadsheetApp.flush();
    propriedades.setProperty("ASOS_V15_ASSINATURA_BASE", assinatura);
  }

  atualizarConfigBaseV15_({
    totalColaboradores: contexto.lista.length,
    totalPendencias: contexto.pendencias && contexto.pendencias.operacionais
      ? contexto.pendencias.operacionais.length
      : 0,
    totalLinhasIndicador: totalLinhasIndicador,
    duracaoMs: Date.now() - inicio,
    dadosAlterados: dadosAlterados
  });

  return {
    dadosAlterados: dadosAlterados,
    linhasIndicador: totalLinhasIndicador
  };
}

function calcularAssinaturaBaseV15_(contexto) {
  const lista = contexto && Array.isArray(contexto.lista) ? contexto.lista : [];
  const partes = lista.map(function(c) {
    return [
      c.mat || "",
      c.situacao || "",
      c.tipoExame || "",
      c.periodicidade || "",
      c.dataUltimoAso || "",
      c.proximoVencimento || "",
      c.dataConvocar || "",
      c.dataLimite || "",
      c.dataAgendada || "",
      c.statusAgenda || "",
      c.dataAsoRealizadoAgenda || "",
      c.informacoesAgenda || "",
      c.statusGeral || ""
    ].join("|");
  });

  const pendencias = contexto && contexto.pendencias && contexto.pendencias.operacionais
    ? contexto.pendencias.operacionais.map(function(p) {
        return [p.mat || "", p.dataUltimaPendencia || "", p.novaDataAgendada || ""].join("|");
      })
    : [];

  const texto = partes.join("\n") + "\n#PENDENCIAS\n" + pendencias.join("\n");
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    const valor = byte < 0 ? byte + 256 : byte;
    return valor.toString(16).padStart(2, "0");
  }).join("");
}

function obterTotalLinhasIndicadorV15_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BASE15_ABA_INDICADOR);
  return aba ? Math.max(0, aba.getLastRow() - 1) : 0;
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
  const linhasAtuais = Math.max(0, aba.getLastRow() - 1);
  const linhasLimpar = Math.max(linhasAtuais, linhas.length);

  if (linhasLimpar > 0) {
    aba.getRange(2, 1, linhasLimpar, 11).clearContent();
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
    ["DURACAO_ATUALIZACAO_MS", String(Number(dados.duracaoMs) || 0), "Duração da última atualização da base", "Apps Script"],
    ["DADOS_ALTERADOS", dados.dadosAlterados ? "SIM" : "NÃO", "Indica se a última checagem precisou regravar a base", "Apps Script"]
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


function obterGestoresV15() {
  const cache = CacheService.getScriptCache();
  const chave = "ASOS_V15_GESTORES";
  const cacheado = cache.get(chave);
  if (cacheado) {
    try {
      return JSON.parse(cacheado);
    } catch (e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("GESTORES");
  if (!aba || aba.getLastRow() < 2) return [];

  const valores = aba
    .getRange(2, 1, aba.getLastRow() - 1, Math.min(5, aba.getLastColumn()))
    .getDisplayValues();

  const gestores = valores
    .map(function(linha) {
      return {
        nome: String(linha[0] || "").trim(),
        setor: String(linha[1] || "").trim(),
        email: String(linha[2] || "").trim().toLowerCase(),
        telefone: String(linha[3] || "").trim(),
        observacao: String(linha[4] || "").trim()
      };
    })
    .filter(function(item) {
      return item.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email);
    })
    .sort(function(a, b) {
      return a.nome.localeCompare(b.nome);
    });

  try {
    cache.put(chave, JSON.stringify(gestores), 21600);
  } catch (e) {}

  return gestores;
}
