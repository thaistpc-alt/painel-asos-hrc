/**
 * V15.0 - BASE MATERIALIZADA DO PAINEL DE ASOS
 *
 * Objetivo:
 * - eliminar IMPORTRANGE e ARRAYFORMULA do caminho operacional;
 * - sincronizar fontes externas em uma única rotina;
 * - materializar FONTEpainel e BASE_INDICADOR_ASO;
 * - preservar CONVOCAÇÃO ENVIADA por matrícula;
 * - permitir atualização manual e por gatilho.
 */

const BASE_V15 = {
  ORIGEM_AGENDA_ID: "1NJLlKL3foDBHHDPnWxz8Kypc0HU2izWoH6KvuZNy0lc",
  ORIGEM_AGENDA_ABA: "AGENDA",
  ORIGEM_FONTE_ABA: "FONTE",
  ORIGEM_GESTORES_ABA: "GESTORES",
  ORIGEM_ESCALA_ID: "1jWBi7VBF3KqcgJxxBjDEMD6y2WHfKpa2h6_7SZapHrM",
  ORIGEM_ESCALA_ABA: "Página1",
  ABA_CONFIG: "_CONFIG_ASOS",
  ABA_INDICADOR: "BASE_INDICADOR_ASO",
  COLUNAS_AGENDA: 20
};

function atualizarBaseCompletaV15() {
  return sincronizarBaseV15_(true);
}

function sincronizarBaseV15_(invalidarCache) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error("Já existe uma atualização da base em andamento. Aguarde alguns instantes.");
  }

  const inicioTotal = Date.now();
  const etapas = [];

  function medir(nome, fn) {
    const inicio = Date.now();
    const valor = fn();
    etapas.push({ etapa: nome, duracaoMs: Date.now() - inicio });
    return valor;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = lerConfigBaseV15_();

    const idAgenda = config.ORIGEM_AGENDA_ID || BASE_V15.ORIGEM_AGENDA_ID;
    const abaAgendaOrigem = config.ORIGEM_AGENDA_ABA || BASE_V15.ORIGEM_AGENDA_ABA;
    const idEscala = config.ORIGEM_ESCALA_ID || BASE_V15.ORIGEM_ESCALA_ID;
    const abaEscalaOrigem = config.ORIGEM_ESCALA_ABA || BASE_V15.ORIGEM_ESCALA_ABA;

    const origemAgenda = medir("Abrir fonte agenda", function() {
      return SpreadsheetApp.openById(idAgenda);
    });

    const dadosAgenda = medir("Ler AGENDA origem", function() {
      const aba = origemAgenda.getSheetByName(abaAgendaOrigem);
      if (!aba) throw new Error("Aba de origem da AGENDA não encontrada: " + abaAgendaOrigem);
      const ultimaLinha = aba.getLastRow();
      if (ultimaLinha < 1) return [];
      return aba.getRange(1, 1, ultimaLinha, BASE_V15.COLUNAS_AGENDA).getValues();
    });

    const dadosFonte = medir("Ler FONTE origem", function() {
      const aba = origemAgenda.getSheetByName(BASE_V15.ORIGEM_FONTE_ABA);
      if (!aba) throw new Error("Aba FONTE da origem não encontrada.");
      const ultimaLinha = aba.getLastRow();
      if (ultimaLinha < 2) return [];
      return aba.getRange(2, 2, ultimaLinha - 1, 8).getValues()
        .filter(linha => valorTexto(linha[0]));
    });

    const dadosGestores = medir("Ler GESTORES origem", function() {
      const aba = origemAgenda.getSheetByName(BASE_V15.ORIGEM_GESTORES_ABA);
      if (!aba) return [];
      const ultimaLinha = aba.getLastRow();
      if (ultimaLinha < 1) return [];
      return aba.getRange(1, 1, ultimaLinha, Math.min(6, aba.getLastColumn())).getValues();
    });

    const dadosEscala = medir("Ler escala médica origem", function() {
      const origem = SpreadsheetApp.openById(idEscala);
      const aba = origem.getSheetByName(abaEscalaOrigem);
      if (!aba) return [];
      const ultimaLinha = aba.getLastRow();
      if (ultimaLinha < 1) return [];
      return aba.getRange(1, 1, ultimaLinha, Math.min(5, aba.getLastColumn())).getValues();
    });

    const enviadosPorMatricula = medir("Preservar histórico de convocação", function() {
      return mapearConvocacaoEnviadaV15_(ss);
    });

    medir("Materializar AGENDA", function() {
      const destino = ss.getSheetByName(CONFIG.ABA_AGENDA);
      if (!destino) throw new Error("Aba AGENDA não encontrada na base.");
      escreverMatrizV15_(destino, dadosAgenda, BASE_V15.COLUNAS_AGENDA);
    });

    medir("Materializar GESTORES", function() {
      const destino = ss.getSheetByName("GESTORES");
      if (destino && dadosGestores.length) {
        escreverMatrizV15_(destino, dadosGestores, Math.max(1, dadosGestores[0].length));
      }
    });

    medir("Materializar escala médica", function() {
      const destino = ss.getSheetByName("Escala médica");
      if (destino && dadosEscala.length) {
        const linhasAntigas = Math.max(destino.getLastRow(), dadosEscala.length);
        destino.getRange(1, 1, linhasAntigas, 5).clearContent();
        destino.getRange(1, 1, dadosEscala.length, dadosEscala[0].length).setValues(dadosEscala);
      }
    });

    const eventos = medir("Indexar AGENDA em memória", function() {
      return montarEventosAgendaDeMatrizV15_(dadosAgenda);
    });

    const colaboradores = medir("Calcular FONTEpainel em memória", function() {
      return montarColaboradoresFonteV15_(dadosFonte, enviadosPorMatricula, eventos);
    });

    medir("Gravar FONTEpainel", function() {
      gravarFontePainelV15_(ss, colaboradores);
    });

    medir("Gravar BASE_INDICADOR_ASO", function() {
      gravarBaseIndicadorV15_(ss, colaboradores);
    });

    const agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
    definirConfigBaseV15_("VERSAO_BASE", "15.0", "Estrutura materializada da base do Painel de ASOs", "Apps Script");
    definirConfigBaseV15_("ULTIMA_SINCRONIZACAO", agora, "Última sincronização completa da base", "Apps Script");
    definirConfigBaseV15_("FONTE_DERIVADA", "GERENCIADO_POR_SCRIPT", "A, J:U são materializados pelo Apps Script", "Apps Script");
    definirConfigBaseV15_("AGENDA", "ESPELHO_POR_SCRIPT", "Sem IMPORTRANGE; origem AGENDA da planilha médica", "Apps Script");
    definirConfigBaseV15_("GESTORES", "ESPELHO_POR_SCRIPT", "Sincronizado da planilha médica", "Apps Script");
    definirConfigBaseV15_("ESCALA_MEDICA", "ESPELHO_POR_SCRIPT", "Sem IMPORTRANGE; sincronizada da planilha de escala", "Apps Script");
    definirConfigBaseV15_("ORIGEM_ESCALA_ID", idEscala, "Planilha ESCALA MÉDICA SESMT", "Google Sheets");
    definirConfigBaseV15_("ORIGEM_ESCALA_ABA", abaEscalaOrigem, "Aba usada no espelho da escala", "Google Sheets");
    definirConfigBaseV15_("LINHAS_AGENDA", String(dadosAgenda.length), "Quantidade de linhas materializadas", "Apps Script");
    definirConfigBaseV15_("COLABORADORES_ATIVOS_BASE", String(colaboradores.length), "Registros materializados na FONTEpainel", "Apps Script");

    if (invalidarCache !== false && typeof avancarRevisaoCacheV133_ === "function") {
      avancarRevisaoCacheV133_();
    }

    const resultado = {
      sucesso: true,
      versaoBase: "15.0",
      atualizadoEm: agora,
      colaboradores: colaboradores.length,
      linhasAgenda: dadosAgenda.length,
      linhasGestores: dadosGestores.length,
      linhasEscala: dadosEscala.length,
      duracaoTotalMs: Date.now() - inicioTotal,
      etapas: etapas
    };

    console.log(JSON.stringify(resultado, null, 2));
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function escreverMatrizV15_(aba, matriz, largura) {
  if (!aba) return;
  const linhasNovas = matriz.length;
  const linhasAntigas = Math.max(aba.getLastRow(), 1);
  const colunas = Math.max(1, Number(largura) || 1);

  garantirDimensoesV15_(aba, Math.max(linhasNovas, 1), colunas);

  const limparAte = Math.max(linhasAntigas, linhasNovas, 1);
  aba.getRange(1, 1, limparAte, colunas).clearContent();

  if (linhasNovas > 0) {
    aba.getRange(1, 1, linhasNovas, colunas).setValues(
      matriz.map(linha => {
        const copia = linha.slice(0, colunas);
        while (copia.length < colunas) copia.push("");
        return copia;
      })
    );
  }
}

function garantirDimensoesV15_(aba, linhas, colunas) {
  if (aba.getMaxRows() < linhas) {
    aba.insertRowsAfter(aba.getMaxRows(), linhas - aba.getMaxRows());
  }
  if (aba.getMaxColumns() < colunas) {
    aba.insertColumnsAfter(aba.getMaxColumns(), colunas - aba.getMaxColumns());
  }
}

function mapearConvocacaoEnviadaV15_(ss) {
  const aba = ss.getSheetByName(CONFIG.ABA_FONTE);
  const mapa = new Map();
  if (!aba || aba.getLastRow() < 2) return mapa;

  const linhas = aba.getLastRow() - 1;
  const dados = aba.getRange(2, 2, linhas, 18).getValues(); // B:S
  dados.forEach(linha => {
    const matriculaCompleta = valorTexto(linha[0]);
    const enviada = valorTexto(linha[17]);
    if (matriculaCompleta && enviada) mapa.set(matriculaCompleta, enviada);
  });
  return mapa;
}

function montarEventosAgendaDeMatrizV15_(valores) {
  const mapaEventos = new Map();
  const mapaOcorrencias = new Map();
  mapaEventos.__ocorrenciasPorMatricula = mapaOcorrencias;

  if (!valores || !valores.length) return mapaEventos;

  const cfg = identificarColunasAgenda(valores.slice(0, Math.min(8, valores.length)));
  if (!cfg) return mapaEventos;

  for (let i = cfg.linhaDados; i < valores.length; i++) {
    const linha = valores[i] || [];
    const mat = String(linha[cfg.colMatricula] || "").trim();
    if (!mat) continue;

    const data = formatarDataISO(linha[cfg.colData]);
    const status = valorTexto(linha[cfg.colStatus]);
    const statusNorm = normalizarTexto(status);
    const tipo = cfg.colTipoExame >= 0 ? valorTexto(linha[cfg.colTipoExame]) : "";
    const tipoNorm = normalizarTexto(tipo);
    if (!data && !statusNorm && !tipoNorm) continue;

    const evento = {
      mat: mat,
      data: data,
      dataBR: formatarDataBR(data),
      status: status,
      statusNorm: statusNorm,
      tipo: tipo,
      tipoNorm: tipoNorm,
      ehAsoRealizado: statusNorm.includes("ASO REALIZADO"),
      ehNaoCompareceu: statusNorm.includes("NAO COMPARECEU ASO"),
      ehReagendou: statusNorm.includes("REAGENDOU"),
      ehCancelado: statusNorm.includes("CANCELAD")
    };

    const tipoIndicaAso = tipoNorm.includes("PERIODICO") || tipoNorm.includes("ASO");
    const statusIndicaAso = statusNorm.includes("ASO") || evento.ehNaoCompareceu || evento.ehAsoRealizado;
    if (!(tipoIndicaAso || statusIndicaAso || !tipoNorm)) continue;

    obterChavesMatricula(mat, "").forEach(chave => {
      if (!mapaEventos.has(chave)) mapaEventos.set(chave, []);
      mapaEventos.get(chave).push(evento);
      if (evento.ehNaoCompareceu || evento.ehReagendou) {
        mapaOcorrencias.set(chave, (Number(mapaOcorrencias.get(chave)) || 0) + 1);
      }
    });
  }

  return mapaEventos;
}

function montarColaboradoresFonteV15_(dadosFonte, enviadosPorMatricula, eventos) {
  const hojeISO = obterHojeISO();
  const lista = [];

  (dadosFonte || []).forEach((linha, idx) => {
    const matriculaCompleta = valorTexto(linha[0]);
    if (!matriculaCompleta) return;

    const nome = valorTexto(linha[1]);
    const funcao = valorTexto(linha[2]);
    const setor = valorTexto(linha[3]);
    const situacao = valorTexto(linha[4]);
    const dataPenultimoAso = formatarDataISO(linha[5]);
    const dataUltimoAso = formatarDataISO(linha[6]);
    const tipoExame = valorTexto(linha[7]);

    const mat = reduzirMatriculaV15_(matriculaCompleta);
    const periodicidade = periodicidadeFonteV15_(funcao);
    const proximoVencimento = adicionarMeses(dataUltimoAso, periodicidade);
    const dataConvocar = calcularDataConvocarV15_(proximoVencimento, periodicidade);
    const dataLimite = calcularDataLimiteV15_(proximoVencimento, periodicidade);
    const diasParaVencer = calcularDiferencaDias(proximoVencimento, hojeISO);

    lista.push({
      linha: idx + 2,
      mat: mat,
      matricula: mat,
      matriculaCompleta: matriculaCompleta,
      nome: nome,
      funcao: funcao,
      setor: setor,
      situacao: situacao,
      situacaoNorm: normalizarTexto(situacao),
      dataPenultimoAso: dataPenultimoAso,
      dataPenultimoAsoBR: formatarDataBR(dataPenultimoAso),
      dataUltimoAso: dataUltimoAso,
      dataUltimoAsoBR: formatarDataBR(dataUltimoAso),
      tipoExame: tipoExame,
      periodicidade: periodicidade,
      dataBase: dataUltimoAso,
      proximoVencimento: proximoVencimento,
      proximoVencimentoBR: formatarDataBR(proximoVencimento),
      dataConvocar: dataConvocar,
      dataConvocarBR: formatarDataBR(dataConvocar),
      dataLimite: dataLimite,
      dataLimiteBR: formatarDataBR(dataLimite),
      diasParaVencer: diasParaVencer === null ? "" : diasParaVencer,
      prioridade: definirPrioridade(diasParaVencer),
      dataAgendada: "",
      dataAgendadaBR: "",
      statusAgenda: "",
      statusAgendaNorm: "",
      informacoesAgenda: "",
      statusGeral: "",
      statusGeralNorm: "",
      convocacaoBaixada: enviadosPorMatricula.get(matriculaCompleta) || ""
    });
  });

  aplicarOcorrenciasAgenda(lista, eventos);
  aplicarAsoRealizadoAgenda(lista, eventos);
  prepararFlagsPortal(lista);

  return lista;
}

function reduzirMatriculaV15_(matriculaCompleta) {
  const texto = valorTexto(matriculaCompleta);
  const numero = Number(texto);
  if (!isNaN(numero) && numero >= 2000000) return String(numero - 2000000);
  return texto;
}

function periodicidadeFonteV15_(funcao) {
  const f = normalizarTexto(funcao);
  const radiologia = f.includes("RADIOLOGIA") &&
    (f.includes("TECNICO") || f.includes("TECNOLOGO") || f.startsWith("TEC "));
  return radiologia ? 6 : 12;
}

function calcularDataConvocarV15_(vencimento, periodicidade) {
  if (!vencimento) return "";
  if (Number(periodicidade) === 6) return adicionarDiasV15_(vencimento, -15);

  const candidata = adicionarDiasV15_(vencimento, -60);
  if (!candidata) return "";
  if (candidata.substring(0, 4) < vencimento.substring(0, 4)) {
    return vencimento.substring(0, 4) + "-01-01";
  }
  return candidata;
}

function calcularDataLimiteV15_(vencimento, periodicidade) {
  if (!vencimento) return "";
  return adicionarDiasV15_(vencimento, Number(periodicidade) === 6 ? -15 : -30);
}

function adicionarDiasV15_(dataISO, dias) {
  const texto = formatarDataISO(dataISO);
  if (!texto) return "";

  const data = new Date(Date.UTC(
    Number(texto.substring(0, 4)),
    Number(texto.substring(5, 7)) - 1,
    Number(texto.substring(8, 10))
  ));
  data.setUTCDate(data.getUTCDate() + Number(dias || 0));

  return [
    data.getUTCFullYear(),
    String(data.getUTCMonth() + 1).padStart(2, "0"),
    String(data.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function gravarFontePainelV15_(ss, lista) {
  const aba = ss.getSheetByName(CONFIG.ABA_FONTE);
  if (!aba) throw new Error("Aba FONTEpainel não encontrada.");

  const cabecalho = [
    "MAT", "MATRICULA", "NOME", "FUNCAO", "NOME_DA_SECAO", "SITUACAO",
    "DATA_DO_PENULTIMO_ASO", "DATA_DO_ASO", "TIPO_DO_EXAME", "PERIODICIDADE ",
    "DATA BASE DO ASO", "PRÓXIMO VENCIMENTO", "DATA PARA CONVOCAR (60 dias)",
    "DATA LIMITE \n(30 dias)", "DIAS PARA VENCER", "DATA AGENDADA",
    "INFORMAÇÕES DA AGENDA", "STATUS GERAL", "CONVOCAÇÃO ENVIADA", "mês", "ano"
  ];

  const linhas = (lista || []).map(c => [
    numeroOuTextoV15_(c.mat),
    numeroOuTextoV15_(c.matriculaCompleta),
    c.nome || "",
    c.funcao || "",
    c.setor || "",
    c.situacao || "",
    dateOuVazioV15_(c.dataPenultimoAso),
    dateOuVazioV15_(c.dataUltimoAso),
    c.tipoExame || "",
    Number(c.periodicidade) || "",
    dateOuVazioV15_(c.dataBase),
    dateOuVazioV15_(c.proximoVencimento),
    dateOuVazioV15_(c.dataConvocar),
    dateOuVazioV15_(c.dataLimite),
    c.diasParaVencer === "" ? "" : Number(c.diasParaVencer),
    dateOuVazioV15_(c.dataAgendada),
    c.informacoesAgenda || "",
    c.statusGeral || "",
    c.convocacaoBaixada || "",
    c.dataConvocar ? Number(c.dataConvocar.substring(5, 7)) : "",
    c.dataUltimoAso ? Number(c.dataUltimoAso.substring(0, 4)) : ""
  ]);

  garantirDimensoesV15_(aba, linhas.length + 1, cabecalho.length);
  const limparLinhas = Math.max(aba.getLastRow(), linhas.length + 1);
  aba.getRange(1, 1, limparLinhas, cabecalho.length).clearContent();
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  if (linhas.length) aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);

  // Datas G:H, K:N e P.
  if (linhas.length) {
    ["G:H", "K:N", "P:P"].forEach(ref => {
      const partes = ref.split(":");
      const c1 = colunaNumeroV15_(partes[0]);
      const c2 = colunaNumeroV15_(partes[1]);
      aba.getRange(2, c1, linhas.length, c2 - c1 + 1).setNumberFormat("dd/MM/yyyy");
    });
    aba.getRange(2, 15, linhas.length, 1).setNumberFormat("0");
  }
}

function dateOuVazioV15_(iso) {
  const texto = formatarDataISO(iso);
  if (!texto) return "";
  return new Date(
    Number(texto.substring(0, 4)),
    Number(texto.substring(5, 7)) - 1,
    Number(texto.substring(8, 10))
  );
}

function numeroOuTextoV15_(valor) {
  const texto = valorTexto(valor);
  if (!texto) return "";
  const numero = Number(texto);
  return isNaN(numero) ? texto : numero;
}

function colunaNumeroV15_(letra) {
  let n = 0;
  String(letra || "").toUpperCase().split("").forEach(c => {
    n = n * 26 + c.charCodeAt(0) - 64;
  });
  return n;
}

function gravarBaseIndicadorV15_(ss, lista) {
  let aba = ss.getSheetByName(BASE_V15.ABA_INDICADOR);
  if (!aba) aba = ss.insertSheet(BASE_V15.ABA_INDICADOR);

  const cabecalho = [
    "MAT", "NOME", "FUNCAO", "SITUACAO", "TIPO_DO_EXAME", "CICLO",
    "VENCIMENTO_ANALISADO", "DATA_REALIZACAO", "STATUS_AGENDA",
    "DIAS_ANTECEDENCIA", "CLASSIFICACAO"
  ];

  const linhas = [];
  (lista || []).forEach(c => {
    if (!ehAtivoIndicadorASO(c) || !ehTipoPeriodicoIndicadorASO(c) || !c.periodicidade) return;

    obterEventosIndicadorASO(c).forEach(evento => {
      const classificacao = classificarEventoIndicadorASO(evento);
      linhas.push([
        numeroOuTextoV15_(c.mat),
        c.nome || "",
        c.funcao || "",
        c.situacao || "",
        c.tipoExame || "",
        evento.origem || "",
        dateOuVazioV15_(evento.dataPrevista),
        dateOuVazioV15_(evento.dataRealizada),
        c.informacoesAgenda || c.statusAgenda || "",
        evento.antecedencia === null ? "" : Number(evento.antecedencia),
        classificacao
      ]);
    });
  });

  garantirDimensoesV15_(aba, linhas.length + 1, cabecalho.length);
  const limparLinhas = Math.max(aba.getLastRow(), linhas.length + 1);
  aba.getRange(1, 1, limparLinhas, cabecalho.length).clearContent();
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  if (linhas.length) {
    aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
    aba.getRange(2, 7, linhas.length, 2).setNumberFormat("dd/MM/yyyy");
    aba.getRange(2, 10, linhas.length, 1).setNumberFormat("0");
  }

  if (!aba.isSheetHidden()) aba.hideSheet();
}

function lerConfigBaseV15_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(BASE_V15.ABA_CONFIG);
  const obj = {};
  if (!aba || aba.getLastRow() < 2) return obj;

  aba.getRange(2, 1, aba.getLastRow() - 1, 2).getDisplayValues().forEach(linha => {
    const chave = String(linha[0] || "").trim();
    if (chave) obj[chave] = String(linha[1] || "").trim();
  });
  return obj;
}

function definirConfigBaseV15_(chave, valor, descricao, responsavel) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(BASE_V15.ABA_CONFIG);

  if (!aba) {
    aba = ss.insertSheet(BASE_V15.ABA_CONFIG);
    aba.getRange(1, 1, 1, 4).setValues([["CHAVE", "VALOR", "DESCRIÇÃO", "RESPONSÁVEL"]]);
    aba.hideSheet();
  }

  const ultimaLinha = aba.getLastRow();
  const chaves = ultimaLinha >= 2
    ? aba.getRange(2, 1, ultimaLinha - 1, 1).getDisplayValues().flat()
    : [];
  const indice = chaves.findIndex(item => String(item || "").trim() === String(chave));
  const linha = indice >= 0 ? indice + 2 : ultimaLinha + 1;

  aba.getRange(linha, 1, 1, 4).setValues([[
    String(chave || ""),
    valor === null || valor === undefined ? "" : String(valor),
    String(descricao || ""),
    String(responsavel || "")
  ]]);

  if (!aba.isSheetHidden()) aba.hideSheet();
}

function obterUltimaSincronizacaoBaseV15_() {
  const cfg = lerConfigBaseV15_();
  return cfg.ULTIMA_SINCRONIZACAO || "";
}

function instalarAtualizacaoAutomaticaV15() {
  const nome = "atualizarBaseCompletaV15";
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === nome)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(nome)
    .timeBased()
    .everyMinutes(5)
    .create();

  return {
    sucesso: true,
    mensagem: "Atualização automática configurada para cada 5 minutos."
  };
}

function removerAtualizacaoAutomaticaV15() {
  const nome = "atualizarBaseCompletaV15";
  let removidos = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === nome)
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      removidos++;
    });

  return { sucesso: true, removidos: removidos };
}
