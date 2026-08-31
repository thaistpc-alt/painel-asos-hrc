/* =========================================================
   PAINEL DE ASOS - NÚCLEO V14
   Regra única de elegibilidade + fila persistente + cache por revisão.
========================================================= */

const V14_CACHE_PREFIXO = "ASOS_V14_";
const V14_CACHE_TTL = 1800;
const V14_CACHE_PARTE = 80000;
const V14_CACHE_MAX_PARTES = 50;
const V14_PROP_PARTE = 8000;
const V14_PROP_MAX_PARTES = 55;
const V14_REVISAO_CHAVE = "ASOS_V14_REVISAO_DADOS";
const V14_CONTEXTO_PROP_PREFIXO = "ASOS_V14_CTX_";
var V14_MEMORIA = {};

function validarPeriodoV14_(inicio, fim) {
  if (!inicio || !fim) throw new Error("Informe a data inicial e a data final.");
  if (String(inicio) > String(fim)) throw new Error("A data inicial não pode ser maior que a data final.");
}

function obterRevisaoDadosV14_() {
  const props = PropertiesService.getScriptProperties();
  const atual = Number(props.getProperty(V14_REVISAO_CHAVE));
  if (atual > 0) return atual;
  props.setProperty(V14_REVISAO_CHAVE, "1");
  return 1;
}

function avancarRevisaoDadosV14_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const atual = Number(props.getProperty(V14_REVISAO_CHAVE)) || 1;
    const nova = atual + 1;
    props.setProperty(V14_REVISAO_CHAVE, String(nova));
    V14_MEMORIA = {};
    return nova;
  } finally {
    lock.releaseLock();
  }
}

function chaveCacheV14_(sufixo, revisao) {
  const rev = revisao || obterRevisaoDadosV14_();
  return (V14_CACHE_PREFIXO + "R" + rev + "_" + String(sufixo || "").replace(/[^A-Za-z0-9_\-]/g, "_"))
    .substring(0, 220);
}

function serializarV14_(objeto) {
  const json = JSON.stringify(objeto);
  const gzip = Utilities.gzip(Utilities.newBlob(json, "application/json", "v14.json"));
  return Utilities.base64Encode(gzip.getBytes());
}

function desserializarV14_(base64) {
  const bytes = Utilities.base64Decode(base64);
  const gzip = Utilities.newBlob(bytes, "application/gzip", "v14.gz");
  return JSON.parse(Utilities.ungzip(gzip).getDataAsString("UTF-8"));
}

function salvarCacheV14_(sufixo, objeto, revisao) {
  const chave = chaveCacheV14_(sufixo, revisao);
  V14_MEMORIA[chave] = objeto;
  try {
    const base64 = serializarV14_(objeto);
    const qtd = Math.ceil(base64.length / V14_CACHE_PARTE);
    if (qtd < 1 || qtd > V14_CACHE_MAX_PARTES) return false;
    const cache = CacheService.getScriptCache();
    for (let i = 0; i < qtd; i++) {
      cache.put(chave + "_" + i, base64.substring(i * V14_CACHE_PARTE, (i + 1) * V14_CACHE_PARTE), V14_CACHE_TTL);
    }
    cache.put(chave + "_M", String(qtd), V14_CACHE_TTL);
    return true;
  } catch (e) {
    return false;
  }
}

function obterCacheV14_(sufixo, revisao) {
  const chave = chaveCacheV14_(sufixo, revisao);
  if (Object.prototype.hasOwnProperty.call(V14_MEMORIA, chave)) return V14_MEMORIA[chave];
  try {
    const cache = CacheService.getScriptCache();
    const qtd = Number(cache.get(chave + "_M"));
    if (!qtd || qtd > V14_CACHE_MAX_PARTES) return null;
    const chaves = [];
    for (let i = 0; i < qtd; i++) chaves.push(chave + "_" + i);
    const partes = cache.getAll(chaves);
    let base64 = "";
    for (let i = 0; i < qtd; i++) {
      if (!partes[chave + "_" + i]) return null;
      base64 += partes[chave + "_" + i];
    }
    const objeto = desserializarV14_(base64);
    V14_MEMORIA[chave] = objeto;
    return objeto;
  } catch (e) {
    return null;
  }
}

function salvarContextoPropriedadesV14_(contexto, revisao) {
  try {
    const props = PropertiesService.getScriptProperties();
    const chave = V14_CONTEXTO_PROP_PREFIXO + "R" + revisao;
    const base64 = serializarV14_(contexto);
    const total = Math.ceil(base64.length / V14_PROP_PARTE);
    if (total < 1 || total > V14_PROP_MAX_PARTES) return false;

    const existentes = props.getProperties();
    Object.keys(existentes).forEach(k => {
      if (k.indexOf(V14_CONTEXTO_PROP_PREFIXO) === 0 && k.indexOf(chave) !== 0) props.deleteProperty(k);
    });

    const valores = {};
    valores[chave + "_M"] = JSON.stringify({ total: total, tamanho: base64.length, expiraEm: Date.now() + V14_CACHE_TTL * 1000 });
    for (let i = 0; i < total; i++) {
      valores[chave + "_" + i] = base64.substring(i * V14_PROP_PARTE, (i + 1) * V14_PROP_PARTE);
    }
    props.setProperties(valores, false);
    return true;
  } catch (e) {
    return false;
  }
}

function obterContextoPropriedadesV14_(revisao) {
  try {
    const props = PropertiesService.getScriptProperties();
    const chave = V14_CONTEXTO_PROP_PREFIXO + "R" + revisao;
    const manifestoTexto = props.getProperty(chave + "_M");
    if (!manifestoTexto) return null;
    const manifesto = JSON.parse(manifestoTexto);
    if (!manifesto.total || manifesto.total > V14_PROP_MAX_PARTES || Number(manifesto.expiraEm) <= Date.now()) return null;
    const todas = props.getProperties();
    let base64 = "";
    for (let i = 0; i < manifesto.total; i++) {
      const parte = todas[chave + "_" + i];
      if (!parte) return null;
      base64 += parte;
    }
    if (manifesto.tamanho && base64.length !== Number(manifesto.tamanho)) return null;
    return desserializarV14_(base64);
  } catch (e) {
    return null;
  }
}

function lerFontePainelV14_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_FONTE);
  if (!aba) throw new Error("Aba FONTEpainel não encontrada.");
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  // A:O contém os dados-base. P:R são derivados da AGENDA e não são lidos na V14.
  const dados = aba.getRange(2, 1, ultimaLinha - 1, COL.DIAS_PARA_VENCER).getValues();
  const hojeISO = obterHojeISO();

  return dados
    .filter(l => valorTexto(l[COL.MAT - 1]))
    .map((l, idx) => {
      const periodicidade = Number(l[COL.PERIODICIDADE - 1]) || 0;
      const dataPenultimoAso = formatarDataISO(l[COL.DATA_PENULTIMO_ASO - 1]);
      const dataUltimoAso = formatarDataISO(l[COL.DATA_ULTIMO_ASO - 1]);
      const proximoVencimento = formatarDataISO(l[COL.PROXIMO_VENCIMENTO - 1]);
      const dataConvocar = formatarDataISO(l[COL.DATA_CONVOCAR - 1]);
      const dataLimite = formatarDataISO(l[COL.DATA_LIMITE - 1]);
      const diasRaw = l[COL.DIAS_PARA_VENCER - 1];
      const diasParaVencer = diasRaw === "" || diasRaw === null
        ? calcularDiferencaDias(proximoVencimento, hojeISO)
        : Number(diasRaw) || 0;
      const situacao = valorTexto(l[COL.SITUACAO - 1]);
      const tipoExame = valorTexto(l[COL.TIPO_EXAME - 1]);

      const c = {
        linha: idx + 2,
        mat: valorTexto(l[COL.MAT - 1]),
        matricula: valorTexto(l[COL.MAT - 1]),
        matriculaCompleta: valorTexto(l[COL.MATRICULA_COMPLETA - 1]),
        nome: valorTexto(l[COL.NOME - 1]),
        funcao: valorTexto(l[COL.FUNCAO - 1]),
        setor: valorTexto(l[COL.SETOR - 1]),
        situacao: situacao,
        situacaoNorm: normalizarTexto(situacao),
        tipoExame: tipoExame,
        tipoExameNorm: normalizarTexto(tipoExame),
        periodicidade: periodicidade,
        dataPenultimoAso: dataPenultimoAso,
        dataPenultimoAsoBR: formatarDataBR(dataPenultimoAso),
        dataUltimoAso: dataUltimoAso,
        dataUltimoAsoBR: formatarDataBR(dataUltimoAso),
        dataPrevistaIndicador: adicionarMeses(dataPenultimoAso, periodicidade),
        dataPrevistaIndicadorBR: formatarDataBR(adicionarMeses(dataPenultimoAso, periodicidade)),
        proximoVencimento: proximoVencimento,
        proximoVencimentoBR: formatarDataBR(proximoVencimento),
        dataConvocar: dataConvocar,
        dataConvocarBR: formatarDataBR(dataConvocar),
        dataLimite: dataLimite,
        dataLimiteBR: formatarDataBR(dataLimite),
        diasParaVencer: diasParaVencer,
        prioridade: definirPrioridade(diasParaVencer),
        dataAgendada: "",
        dataAgendadaBR: "",
        statusAgenda: "",
        statusAgendaNorm: "",
        statusGeral: "",
        statusGeralNorm: "",
        convocacaoBaixada: ""
      };

      c.statusGeral = definirStatusGeralBaseV14_(c, hojeISO);
      c.statusGeralNorm = normalizarTexto(c.statusGeral);
      return c;
    });
}

function definirStatusGeralBaseV14_(c, hojeISO) {
  if (Number(c.diasParaVencer) < 0 || (c.proximoVencimento && c.proximoVencimento < hojeISO)) return "VENCIDO";
  if (c.dataLimite && c.dataLimite <= hojeISO) return "PRIORIDADE";
  if (c.dataConvocar && c.dataConvocar <= hojeISO) return "CONVOCAR";
  return "EM DIA";
}

function ehTipoPeriodicoV14_(tipo) {
  return normalizarTexto(tipo || "").includes("PERIODICO");
}

function classificarTipoEventoV14_(tipo) {
  const t = normalizarTexto(tipo || "");
  if (!t) return "INCOMPLETO";
  if (t.includes("PERIODICO")) return "PERIODICO";
  if (t.includes("DEMISSION")) return "DEMISSIONAL";
  if (t.includes("RETORNO")) return "RETORNO";
  if (t.includes("ADMISSION")) return "ADMISSIONAL";
  if (t.includes("MUDANCA") && t.includes("RISCO")) return "MUDANCA_RISCO";
  return "OUTRO";
}

function montarEventosAgendaV14_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_AGENDA);
  const mapa = new Map();
  const ocorrencias = new Map();
  mapa.__ocorrenciasPorMatricula = ocorrencias;
  if (!aba || aba.getLastRow() < 3) return mapa;

  const ultimaLinha = aba.getLastRow();
  const limiteColunas = Math.min(13, aba.getLastColumn());
  const amostra = aba.getRange(1, 1, Math.min(8, ultimaLinha), limiteColunas).getValues();
  const cfg = identificarColunasAgenda(amostra);
  if (!cfg) return mapa;

  const cab = amostra[Math.max(0, cfg.linhaDados - 1)] || [];
  let colTurno = procurarColuna(cab.map(normalizarTexto), ["TURNO"]);
  if (colTurno < 0) colTurno = 8; // coluna I na estrutura atual

  const colunas = [cfg.colData, cfg.colTipoExame, cfg.colMatricula, cfg.colStatus, colTurno].filter(i => i >= 0);
  const primeira = Math.min.apply(null, colunas);
  const ultima = Math.max.apply(null, colunas);
  const qtdLinhas = ultimaLinha - cfg.linhaDados;
  if (qtdLinhas <= 0) return mapa;

  const valores = aba.getRange(cfg.linhaDados + 1, primeira + 1, qtdLinhas, ultima - primeira + 1).getValues();
  const idxData = cfg.colData - primeira;
  const idxTipo = cfg.colTipoExame >= 0 ? cfg.colTipoExame - primeira : -1;
  const idxMat = cfg.colMatricula - primeira;
  const idxStatus = cfg.colStatus - primeira;
  const idxTurno = colTurno - primeira;

  valores.forEach((linha, indice) => {
    const mat = String(linha[idxMat] || "").trim();
    if (!mat) return;
    const data = formatarDataISO(linha[idxData]);
    const tipo = idxTipo >= 0 ? valorTexto(linha[idxTipo]) : "";
    const tipoNorm = normalizarTexto(tipo);
    const status = valorTexto(linha[idxStatus]);
    const statusNorm = normalizarTexto(status);
    const tipoClassificacao = classificarTipoEventoV14_(tipo);
    const ehPeriodico = tipoClassificacao === "PERIODICO";
    const ehAsoRealizadoQualquer = statusNorm.includes("ASO REALIZADO");
    const ehAsoRealizado = ehPeriodico && ehAsoRealizadoQualquer;
    const ehNaoCompareceu = statusNorm.includes("NAO COMPARECEU ASO");
    const ehReagendou = statusNorm.includes("REAGENDOU");
    const ehCancelado = statusNorm.includes("CANCELAD");
    const tipoIncompleto = !tipoNorm;

    // Na V14, consultas e retornos não entram no ciclo periódico apenas por terem data/status.
    const ehRegistroDoPainel = ehPeriodico || statusNorm.includes("ASO") || tipoIncompleto;
    if (!ehRegistroDoPainel || (!data && !statusNorm)) return;

    const evento = {
      mat: mat,
      data: data,
      dataBR: formatarDataBR(data),
      tipo: tipo,
      tipoNorm: tipoNorm,
      tipoClassificacao: tipoClassificacao,
      tipoIncompleto: tipoIncompleto,
      status: status,
      statusNorm: statusNorm,
      turno: idxTurno >= 0 ? valorTexto(linha[idxTurno]) : "",
      ehPeriodico: ehPeriodico,
      ehAsoRealizado: ehAsoRealizado,
      ehAsoRealizadoQualquer: ehAsoRealizadoQualquer,
      ehNaoCompareceu: ehNaoCompareceu,
      ehReagendou: ehReagendou,
      ehCancelado: ehCancelado,
      ordem: cfg.linhaDados + 1 + indice
    };

    obterChavesMatricula(mat, "").forEach(chave => {
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(evento);
      if (ehNaoCompareceu || ehReagendou) {
        ocorrencias.set(chave, (Number(ocorrencias.get(chave)) || 0) + 1);
      }
    });
  });

  mapa.forEach(lista => {
    if (!Array.isArray(lista)) return;
    lista.sort((a, b) => {
      const cmp = String(a.data || "").localeCompare(String(b.data || ""));
      return cmp !== 0 ? cmp : Number(a.ordem || 0) - Number(b.ordem || 0);
    });
  });
  return mapa;
}

function eventoPosteriorAoUltimoAsoFonteV14_(evento, colaborador) {
  if (!evento || !evento.data) return false;
  if (!colaborador.dataUltimoAso) return true;
  return String(evento.data) > String(colaborador.dataUltimoAso);
}

function aplicarAgendaPeriodicaV14_(lista, eventosPorMatricula) {
  (lista || []).forEach(c => {
    const eventos = obterEventosPorColaborador(eventosPorMatricula, c);
    const atuais = eventos.filter(e => eventoPosteriorAoUltimoAsoFonteV14_(e, c));
    const periodicos = atuais.filter(e => e.ehPeriodico);
    const incompletos = atuais.filter(e => e.tipoIncompleto);
    const realizadosPeriodicos = periodicos.filter(e => e.ehAsoRealizado);
    const realizadosSemTipo = incompletos.filter(e => e.ehAsoRealizadoQualquer);

    const ultimoPeriodico = periodicos.length ? periodicos[periodicos.length - 1] : null;
    const ultimoIncompleto = incompletos.length ? incompletos[incompletos.length - 1] : null;
    const eventoAgendaAtual = ultimoPeriodico || ultimoIncompleto || null;
    const encerrador = realizadosPeriodicos.length ? realizadosPeriodicos[realizadosPeriodicos.length - 1] : null;

    c.eventoPeriodicoAtual = ultimoPeriodico;
    c.eventoAgendaAtual = eventoAgendaAtual;
    c.eventoQueEncerrouCiclo = encerrador;
    c.asoPeriodicoRealizadoValido = !!encerrador;
    c.asoRealizadoValido = !!encerrador; // compatibilidade com módulos antigos
    c.asoRealizadoAgendaAtual = !!encerrador;
    c.temAsoRealizadoAgenda = !!encerrador;
    c.dataAsoRealizadoAgenda = encerrador ? encerrador.data : "";
    c.dataAsoRealizadoAgendaBR = encerrador ? encerrador.dataBR : "";

    c.dataAgendada = eventoAgendaAtual ? eventoAgendaAtual.data : "";
    c.dataAgendadaBR = eventoAgendaAtual ? eventoAgendaAtual.dataBR : "";
    c.statusAgenda = eventoAgendaAtual ? eventoAgendaAtual.status : "";
    c.statusAgendaNorm = normalizarTexto(c.statusAgenda);
    c.tipoEventoAgenda = eventoAgendaAtual ? eventoAgendaAtual.tipo : "";
    c.tipoEventoAgendaNorm = normalizarTexto(c.tipoEventoAgenda);
    c.turnoAgenda = eventoAgendaAtual ? eventoAgendaAtual.turno : "";

    c.dadosIncompletosParaRevisao = [];
    if (!c.tipoExameNorm) c.dadosIncompletosParaRevisao.push("Tipo do exame na FONTEpainel está vazio.");
    if (realizadosSemTipo.length) {
      c.dadosIncompletosParaRevisao.push("Existe ASO realizado na AGENDA sem tipo de exame; o ciclo não foi encerrado automaticamente.");
    }
    if (ultimoIncompleto && !ultimoPeriodico) {
      c.dadosIncompletosParaRevisao.push("O evento mais recente da AGENDA não informa o tipo de exame.");
    }
  });
  return lista || [];
}

function prepararFlagsPortalV14_(lista) {
  const hoje = obterHojeISO();
  (lista || []).forEach(c => {
    c.ativoAtual = c.situacaoNorm === "ATIVO";
    c.vencidoAtual = Number(c.diasParaVencer) < 0 || (c.proximoVencimento && c.proximoVencimento < hoje);
    c.atrasadoAtivo = c.ativoAtual && c.vencidoAtual;

    if (c.asoPeriodicoRealizadoValido) c.statusGeral = "REALIZADO";
    else if (c.eventoPeriodicoAtual && c.dataAgendada && c.dataAgendada >= hoje && !c.eventoPeriodicoAtual.ehCancelado) c.statusGeral = "AGENDADO";
    else c.statusGeral = definirStatusGeralBaseV14_(c, hoje);
    c.statusGeralNorm = normalizarTexto(c.statusGeral);
  });
  return lista || [];
}

function construirContextoPortalV14_(forcarAtualizacao) {
  const revisao = obterRevisaoDadosV14_();
  const chave = "CONTEXTO_GLOBAL";

  if (!forcarAtualizacao) {
    const cacheado = obterCacheV14_(chave, revisao);
    if (cacheado && Array.isArray(cacheado.lista) && cacheado.pendencias) {
      cacheado.origemCache = "cache";
      return cacheado;
    }
    const persistente = obterContextoPropriedadesV14_(revisao);
    if (persistente && Array.isArray(persistente.lista) && persistente.pendencias) {
      persistente.origemCache = "propriedades";
      salvarCacheV14_(chave, persistente, revisao);
      return persistente;
    }
  }

  const inicio = Date.now();
  const lista = lerFontePainelV14_();
  const eventos = montarEventosAgendaV14_();
  aplicarOcorrenciasAgenda(lista, eventos);
  aplicarAgendaPeriodicaV14_(lista, eventos);
  prepararFlagsPortalV14_(lista);
  const pendencias = gerarPendencias(lista, eventos);

  const contexto = {
    lista: lista,
    pendencias: pendencias,
    revisaoDados: revisao,
    origemCache: "nova",
    processadoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
    duracaoProcessamentoMs: Date.now() - inicio
  };

  const salvo = salvarCacheV14_(chave, contexto, revisao);
  if (!salvo) salvarContextoPropriedadesV14_(contexto, revisao);
  return contexto;
}

function situacaoPermiteFilaV14_(c) {
  const s = normalizarTexto(c && (c.situacaoNorm || c.situacao) || "");
  return s === "ATIVO" || s === "FERIAS" || s.includes("FERIAS");
}

function definirStatusOperacionalV14_(c) {
  if (c.asoPeriodicoRealizadoValido) return "Realizado";
  const status = normalizarTexto(c.statusAgenda || "");
  const hoje = obterHojeISO();

  if (status.includes("NAO COMPARECEU ASO")) return "Não compareceu — reconvocar";
  if (status.includes("REAGENDOU")) return "Reagendou — conferir nova data";
  if (status.includes("CANCELAD")) return "Cancelado — reagendar";

  if (normalizarTexto(c.situacao || "").includes("FERIAS")) {
    return c.dataAgendada ? "Adiado por férias — agendado" : "Adiado por férias";
  }

  if (c.dataAgendada) {
    if (c.dataAgendada < hoje) return "Agendamento passado — revisar";
    return "Agendado";
  }
  return "A convocar";
}

function avaliarElegibilidadeConvocacaoV14_(c, dataInicio, dataFim) {
  validarPeriodoV14_(dataInicio, dataFim);
  const motivos = [];
  const avisos = (c.dadosIncompletosParaRevisao || []).slice();
  const agendadoNoPeriodo = noPeriodo(c.dataAgendada, dataInicio, dataFim);
  const entrouNaFila = !!(c.dataConvocar && c.dataConvocar <= dataFim && !c.asoPeriodicoRealizadoValido);
  const candidato = agendadoNoPeriodo || entrouNaFila;

  if (!candidato) {
    return {
      candidato: false,
      elegivel: false,
      motivos: ["Fora da fila do período selecionado."],
      avisos: avisos,
      eventoQueEncerrouCiclo: c.eventoQueEncerrouCiclo || null
    };
  }

  if (c.asoPeriodicoRealizadoValido) {
    motivos.push("Ciclo encerrado por ASO periódico realizado em " + (c.dataAsoRealizadoAgendaBR || c.dataAsoRealizadoAgenda || "data não informada") + ".");
  }

  if (!situacaoPermiteFilaV14_(c)) {
    motivos.push("Situação funcional fora da fila automática: " + (c.situacao || "não informada") + ".");
  }

  let grupo = "PENDENCIAS_ANTERIORES";
  if (agendadoNoPeriodo) grupo = "AGENDADOS_PERIODO";
  else if (noPeriodo(c.dataConvocar, dataInicio, dataFim)) grupo = "CONVOCACOES_PERIODO";

  const statusOperacional = definirStatusOperacionalV14_(c);
  const observacoes = [];
  if (grupo === "AGENDADOS_PERIODO" && c.dataConvocar && c.dataConvocar < dataInicio) {
    observacoes.push("Convocação originada em " + (c.dataConvocarBR || c.dataConvocar) + ".");
  }
  if (normalizarTexto(c.situacao || "").includes("FERIAS") && c.dataAgendada && c.dataAgendada > dataFim) {
    observacoes.push("Adiado por férias; agendado para " + (c.dataAgendadaBR || c.dataAgendada) + ".");
  }
  avisos.forEach(a => observacoes.push(a));

  const hoje = obterHojeISO();
  const statusAgendaNorm = normalizarTexto(c.statusAgenda || "");
  const motivosGeracao = [];
  if (!c.dataAgendada) motivosGeracao.push("Sem data agendada.");
  else if (c.dataAgendada < hoje) motivosGeracao.push("A data agendada já passou; revisar status ou reagendamento.");
  if (statusAgendaNorm.includes("NAO COMPARECEU ASO") || statusAgendaNorm.includes("CANCELAD") || statusAgendaNorm.includes("REAGENDOU")) {
    motivosGeracao.push("O status atual exige revisão/reagendamento antes de gerar a convocação.");
  }

  return {
    candidato: true,
    elegivel: motivos.length === 0,
    motivos: motivos,
    avisos: avisos,
    eventoQueEncerrouCiclo: c.eventoQueEncerrouCiclo || null,
    grupoConvocacao: grupo,
    statusOperacional: statusOperacional,
    observacaoConvocacao: observacoes.join(" "),
    podeGerarConvocacao: motivos.length === 0 && motivosGeracao.length === 0,
    motivosGeracao: motivosGeracao
  };
}

function gerarFilaConvocacaoV14_(lista, dataInicio, dataFim) {
  const todos = [];
  const revisao = [];
  const grupos = {
    CONVOCACOES_PERIODO: [],
    AGENDADOS_PERIODO: [],
    PENDENCIAS_ANTERIORES: []
  };

  (lista || []).forEach(c => {
    const avaliacao = avaliarElegibilidadeConvocacaoV14_(c, dataInicio, dataFim);
    if (!avaliacao.candidato) return;

    const item = Object.assign({}, c, {
      grupoConvocacao: avaliacao.grupoConvocacao || "REVISAO",
      statusOperacional: avaliacao.statusOperacional || "Revisar",
      observacaoConvocacao: avaliacao.observacaoConvocacao || "",
      podeGerarConvocacao: !!avaliacao.podeGerarConvocacao,
      motivosGeracao: avaliacao.motivosGeracao || [],
      motivosElegibilidade: avaliacao.motivos || [],
      avisosElegibilidade: avaliacao.avisos || []
    });

    if (avaliacao.elegivel) {
      todos.push(item);
      if (grupos[item.grupoConvocacao]) grupos[item.grupoConvocacao].push(item);
      if ((avaliacao.avisos || []).length) {
        revisao.push(Object.assign({}, item, { motivoRevisao: (avaliacao.avisos || []).join(" "), apenasAviso: true }));
      }
    } else {
      revisao.push(Object.assign({}, item, { motivoRevisao: (avaliacao.motivos || []).join(" "), apenasAviso: false }));
    }
  });

  const ordenar = (a, b) => {
    const da = a.dataAgendada || a.dataConvocar || "";
    const db = b.dataAgendada || b.dataConvocar || "";
    if (da !== db) return da.localeCompare(db);
    return String(a.nome || "").localeCompare(String(b.nome || ""));
  };
  todos.sort(ordenar);
  Object.keys(grupos).forEach(k => grupos[k].sort(ordenar));
  revisao.sort(ordenar);

  return {
    todos: todos,
    pendentes: todos,
    realizados: [],
    revisao: revisao,
    grupos: grupos
  };
}

function gerarExamesComplementaresFilaV14_(fila) {
  return (fila && fila.todos || [])
    .filter(c => colaboradorExigeExameComplementar(c))
    .map(c => Object.assign({}, c, {
      grupoComplementar: obterGrupoExameComplementar(c),
      prioridadeComplementar: definirPrioridadeComplementar(c)
    }));
}

function obterResumoPortalV14Leve(dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV14_(dataInicio, dataFim);
  if (forcarAtualizacao) avancarRevisaoDadosV14_();
  const revisao = obterRevisaoDadosV14_();
  const chave = "RESUMO_" + dataInicio + "_" + dataFim;
  if (!forcarAtualizacao) {
    const cacheado = obterCacheV14_(chave, revisao);
    if (cacheado) return cacheado;
  }

  const contexto = construirContextoPortalV14_(false);
  const lista = contexto.lista || [];
  const fila = gerarFilaConvocacaoV14_(lista, dataInicio, dataFim);
  const complementares = gerarExamesComplementaresFilaV14_(fila);
  const pendencias = contexto.pendencias || { operacionais: [] };

  let totalPrioridade = 0;
  let totalVencidos = 0;
  let totalVencidosAtivos = 0;
  let totalAtrasadosAtivos = 0;
  let totalCompareceram = 0;

  lista.forEach(c => {
    if (c.eventoQueEncerrouCiclo && noPeriodo(c.eventoQueEncerrouCiclo.data, dataInicio, dataFim) && situacaoPermiteFilaV14_(c)) totalCompareceram++;
    if (!c.asoPeriodicoRealizadoValido) {
      const dias = Number(c.diasParaVencer);
      if (dias >= 0 && dias <= 30) totalPrioridade++;
      if (c.vencidoAtual) {
        totalVencidos++;
        if (c.ativoAtual) totalVencidosAtivos++;
      }
      if (c.atrasadoAtivo) totalAtrasadosAtivos++;
    }
  });

  const resumo = {
    meta: {
      versao: "14.0",
      revisaoDados: revisao,
      cache: contexto.origemCache === "nova" ? "não" : "sim",
      origemCache: contexto.origemCache || "nova",
      duracaoProcessamentoMs: contexto.duracaoProcessamentoMs || 0,
      geradoEm: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss"),
      dataInicio: dataInicio,
      dataFim: dataFim
    },
    dashboard: {
      totalColaboradores: lista.length,
      totalConvocar: fila.todos.length,
      totalConvocarPendentes: fila.todos.length,
      totalConvocarRealizados: 0,
      totalAgendados: fila.grupos.AGENDADOS_PERIODO.length,
      totalCompareceram: totalCompareceram,
      totalFaltosos: (pendencias.operacionais || []).length,
      totalPrioridade: totalPrioridade,
      totalVencidos: totalVencidos,
      totalVencidosAtivos: totalVencidosAtivos,
      totalAtrasadosAtivos: totalAtrasadosAtivos,
      totalExamesComplementares: complementares.length,
      totalRevisaoConvocacao: fila.revisao.length
    }
  };

  salvarCacheV14_("MOD_CONVOCAR_" + dataInicio + "_" + dataFim, { convocar: fila }, revisao);
  salvarCacheV14_(chave, resumo, revisao);
  return resumo;
}

function obterModuloPortalV14(modulo, dataInicio, dataFim, forcarAtualizacao) {
  validarPeriodoV14_(dataInicio, dataFim);
  const revisao = obterRevisaoDadosV14_();
  const nome = normalizarTexto(modulo || "");
  const chave = "MOD_" + nome + "_" + dataInicio + "_" + dataFim;
  if (!forcarAtualizacao) {
    const cacheado = obterCacheV14_(chave, revisao);
    if (cacheado) return cacheado;
  }

  const contexto = construirContextoPortalV14_(false);
  const lista = contexto.lista || [];
  let resultado;

  switch (nome) {
    case "CONVOCAR":
      resultado = { convocar: gerarFilaConvocacaoV14_(lista, dataInicio, dataFim) };
      break;
    case "FALTOSOS":
    case "PENDENCIAS": {
      const pendencias = contexto.pendencias || { operacionais: [] };
      resultado = { pendencias: pendencias, faltosos: pendencias.operacionais || [] };
      aplicarHistoricoEnviosPendencias(resultado);
      break;
    }
    case "PRIORIDADE": {
      const itens = lista
        .filter(c => !c.asoPeriodicoRealizadoValido)
        .filter(c => Number(c.diasParaVencer) >= 0 && Number(c.diasParaVencer) <= 30)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      resultado = { prioridadeAtivos: itens.filter(ehAtivo), prioridadeOutros: itens.filter(c => !ehAtivo(c)) };
      break;
    }
    case "VENCIDOS": {
      const itens = lista
        .filter(c => !c.asoPeriodicoRealizadoValido)
        .filter(c => c.vencidoAtual)
        .sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer));
      resultado = { vencidosAtivos: itens.filter(ehAtivo), vencidosOutros: itens.filter(c => !ehAtivo(c)) };
      break;
    }
    case "COMPLEMENTARES": {
      const fila = gerarFilaConvocacaoV14_(lista, dataInicio, dataFim);
      resultado = { examesComplementares: gerarExamesComplementaresFilaV14_(fila) };
      break;
    }
    case "COLABORADORES":
      resultado = { colaboradores: gerarColaboradoresPortal(lista).sort((a, b) => Number(a.diasParaVencer) - Number(b.diasParaVencer)) };
      break;
    case "INDICADORES":
      resultado = { indicadores: gerarIndicadores(lista) };
      break;
    default:
      throw new Error("Módulo inválido: " + modulo);
  }

  salvarCacheV14_(chave, resultado, revisao);
  return resultado;
}

function obterGraficoPortalV14(dataInicio, dataFim) {
  validarPeriodoV14_(dataInicio, dataFim);
  const revisao = obterRevisaoDadosV14_();
  const chave = "GRAFICO_" + dataInicio + "_" + dataFim;
  const cacheado = obterCacheV14_(chave, revisao);
  if (cacheado) return cacheado;

  const contexto = construirContextoPortalV14_(false);
  const indicadores = gerarIndicadores(contexto.lista || []);
  const mesAtual = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM");
  const resultado = {
    ano: indicadores.ano,
    resumoMensal: (indicadores.resumoMensal || []).filter(i => String(i.mesAnalise || i.mes || "") <= mesAtual),
    revisaoDados: revisao
  };
  salvarCacheV14_(chave, resultado, revisao);
  return resultado;
}

function diagnosticarPainelV14(dataInicio, dataFim) {
  validarPeriodoV14_(dataInicio, dataFim);
  const inicio = Date.now();
  const contexto = construirContextoPortalV14_(false);
  const fila = gerarFilaConvocacaoV14_(contexto.lista || [], dataInicio, dataFim);
  const porMatricula = {};
  ["3738", "2644"].forEach(mat => {
    const c = (contexto.lista || []).find(i => obterChavesMatricula(i.mat, i.matriculaCompleta).includes(mat));
    if (!c) return;
    const av = avaliarElegibilidadeConvocacaoV14_(c, dataInicio, dataFim);
    porMatricula[mat] = {
      nome: c.nome,
      situacao: c.situacao,
      dataConvocar: c.dataConvocar,
      dataAgendada: c.dataAgendada,
      tipoEventoAgenda: c.tipoEventoAgenda,
      statusAgenda: c.statusAgenda,
      encerrouCiclo: c.asoPeriodicoRealizadoValido,
      eventoQueEncerrouCiclo: c.eventoQueEncerrouCiclo,
      avaliacao: av
    };
  });

  const resultado = {
    versao: "14.0",
    revisaoDados: obterRevisaoDadosV14_(),
    periodo: dataInicio + " a " + dataFim,
    duracaoMs: Date.now() - inicio,
    colaboradores: (contexto.lista || []).length,
    fila: {
      total: fila.todos.length,
      convocacoesPeriodo: fila.grupos.CONVOCACOES_PERIODO.length,
      agendadosPeriodo: fila.grupos.AGENDADOS_PERIODO.length,
      pendenciasAnteriores: fila.grupos.PENDENCIAS_ANTERIORES.length,
      revisao: fila.revisao.length
    },
    matriculasCriticas: porMatricula
  };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function testarRegrasSinteticasV14() {
  const base = {
    mat: "TESTE",
    matriculaCompleta: "2000000",
    nome: "TESTE",
    situacao: "Ativo",
    situacaoNorm: "ATIVO",
    tipoExame: "Periódico",
    tipoExameNorm: "PERIODICO",
    dataUltimoAso: "2025-11-01",
    dataConvocar: "2026-09-01",
    dataConvocarBR: "01/09/2026",
    dataLimite: "2026-10-01",
    proximoVencimento: "2026-11-01",
    diasParaVencer: 62,
    dadosIncompletosParaRevisao: []
  };

  const cenarios = [
    {
      nome: "férias setembro / agendamento outubro",
      c: Object.assign({}, base, { situacao: "Férias", situacaoNorm: "FERIAS", dataAgendada: "2026-10-10", dataAgendadaBR: "10/10/2026", statusAgenda: "", statusAgendaNorm: "", asoPeriodicoRealizadoValido: false }),
      setembro: true,
      outubro: true
    },
    {
      nome: "demissional realizado não encerra periódico",
      c: Object.assign({}, base, { dataAgendada: "2026-09-10", statusAgenda: "", statusAgendaNorm: "", asoPeriodicoRealizadoValido: false, eventoQueEncerrouCiclo: null }),
      setembro: true,
      outubro: false
    },
    {
      nome: "periódico realizado encerra ciclo",
      c: Object.assign({}, base, { dataAgendada: "2026-09-10", statusAgenda: "ASO Realizado", statusAgendaNorm: "ASO REALIZADO", asoPeriodicoRealizadoValido: true, eventoQueEncerrouCiclo: { data: "2026-09-10", tipo: "PERIÓDICO", status: "ASO Realizado" } }),
      setembro: false,
      outubro: false
    }
  ];

  const resultados = cenarios.map(item => {
    const set = avaliarElegibilidadeConvocacaoV14_(item.c, "2026-09-01", "2026-09-30");
    const out = avaliarElegibilidadeConvocacaoV14_(item.c, "2026-10-01", "2026-10-31");
    return {
      cenario: item.nome,
      setembro: set.elegivel,
      esperadoSetembro: item.setembro,
      outubro: out.elegivel,
      esperadoOutubro: item.outubro,
      sucesso: set.elegivel === item.setembro && out.elegivel === item.outubro
    };
  });
  return { sucesso: resultados.every(r => r.sucesso), resultados: resultados };
}
