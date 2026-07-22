/* =========================================================
   PDF DE CONVOCAÇÃO
========================================================= */

function lerAgendaDados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABA_AGENDA);

  if (!aba) return [];

  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 3) return [];

  const ultimaColuna = aba.getLastColumn();
  return aba.getRange(3, 1, ultimaLinha - 2, ultimaColuna).getValues();
}

function buscarUltimoTurnoAgenda(mat, dadosAgenda) {
  if (dadosAgenda && typeof dadosAgenda.get === "function") {
    return dadosAgenda.get(String(mat).trim()) || "";
  }

  const dados = dadosAgenda || lerAgendaDados();

  if (!dados || dados.length === 0) return "";

  const COL_DATA_AGENDA = 4;
  const COL_MAT_AGENDA = 8;
  const COL_TURNO_AGENDA = 9;

  const matricula = String(mat).trim();

  const registros = dados
    .filter(l => String(l[COL_MAT_AGENDA - 1]).trim() === matricula)
    .filter(l => l[COL_DATA_AGENDA - 1])
    .sort((a, b) => {
      const dataB = new Date(limparDataParaOrdenacao(b[COL_DATA_AGENDA - 1]));
      const dataA = new Date(limparDataParaOrdenacao(a[COL_DATA_AGENDA - 1]));
      return dataB - dataA;
    });

  if (registros.length === 0) return "";

  return registros[0][COL_TURNO_AGENDA - 1] || "";
}

function montarUltimosTurnosAgenda(dadosAgenda) {
  const dados = dadosAgenda || lerAgendaDados();
  const mapa = new Map();

  const COL_DATA_AGENDA = 4;
  const COL_MAT_AGENDA = 8;
  const COL_TURNO_AGENDA = 9;

  dados.forEach(l => {
    const mat = String(l[COL_MAT_AGENDA - 1] || "").trim();
    if (!mat) return;

    const data = limparDataParaOrdenacao(l[COL_DATA_AGENDA - 1]);
    const atual = mapa.get(mat);

    if (!atual || data >= atual.data) {
      mapa.set(mat, {
        data: data,
        turno: valorTexto(l[COL_TURNO_AGENDA - 1])
      });
    }
  });

  const turnos = new Map();
  mapa.forEach((item, mat) => turnos.set(mat, item.turno || ""));
  return turnos;
}

function limparDataParaOrdenacao(valor) {
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    return valor;
  }

  const iso = formatarDataISO(valor);
  if (!iso) return new Date(0);

  return dataISOParaDate(iso);
}

/**
 * Controle desativado.
 * A coluna "Convocação" fica sempre em branco no portal.
 */
function registrarConvocacaoBaixada(mat) {
  return true;
}

function gerarConvocacaoIndividual(mat) {
  const lista = lerFontePainel();
  const matricula = String(mat).trim();

  const colaborador = lista.find(c =>
    String(c.mat).trim() === matricula ||
    String(c.matriculaCompleta).trim() === matricula
  );

  if (!colaborador) {
    throw new Error("Colaborador não encontrado: " + mat);
  }

  return gerarConvocacaoPorColaborador(colaborador, null);
}

function gerarConvocacaoPorColaborador(colaborador, dadosAgenda, opcoes) {
  opcoes = opcoes || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const modeloOriginal = ss.getSheetByName(CONFIG.ABA_MODELO);

  if (!modeloOriginal) {
    throw new Error("Aba CONVOCAÇÃO não encontrada.");
  }

  const turno = colaborador.dataAgendada
    ? buscarUltimoTurnoAgenda(colaborador.mat, opcoes.turnosAgenda || dadosAgenda)
    : "";

  const nomeTemp = "TEMP_CONVOCACAO_" + colaborador.mat + "_" + new Date().getTime();
  const modeloTemp = modeloOriginal.copyTo(ss).setName(nomeTemp);

  try {
    modeloTemp.getRange("C10:C13").setValues([
      [colaborador.nome],
      [colaborador.mat],
      [colaborador.funcao],
      [colaborador.setor]
    ]);

    if (colaborador.dataAgendadaBR) {
      modeloTemp.getRange("C18").setValue(colaborador.dataAgendadaBR);
    } else {
      modeloTemp.getRange("C18").setValue(
        colaborador.dataConvocarBR ||
        colaborador.dataLimiteBR ||
        colaborador.proximoVencimentoBR ||
        ""
      );
    }

    modeloTemp.getRange("E18").setValue(turno);

    SpreadsheetApp.flush();

    const nomeArquivo = limparNomeArquivo(
      `${colaborador.setor} - ${colaborador.funcao} - ${colaborador.nome}`
    );

    const pdf = exportarAbaComoPDF(ss.getId(), modeloTemp.getSheetId(), nomeArquivo);

    const pasta = DriveApp.getFolderById(CONFIG.PASTA_PDFS_ID);
    const arquivo = pasta.createFile(pdf).setName(nomeArquivo + ".pdf");

    registrarConvocacaoBaixada(colaborador.mat);

    const resultado = {
      sucesso: true,
      nome: colaborador.nome,
      colaborador: colaborador.nome,
      matricula: colaborador.mat,
      dataAgendadaBR: colaborador.dataAgendadaBR || "",
      dataConvocarBR: colaborador.dataConvocarBR || "",
      dataLimiteBR: colaborador.dataLimiteBR || "",
      arquivo: arquivo.getName(),
      url: arquivo.getUrl()
    };

    if (opcoes.incluirAnexo) {
      resultado.anexo = arquivo.getBlob().setName(arquivo.getName());
    }

    return resultado;

  } finally {
    ss.deleteSheet(modeloTemp);
  }
}

function situacaoPermiteBaixarConvocacao(c) {
  const situacao = normalizarTexto(c.situacao || c.situacaoNorm || "");
  return situacao === "ATIVO" || situacao === "FERIAS" || situacao.includes("FERIAS");
}

function motivoNaoBaixarConvocacao(c, dataInicio, dataFim) {
  if (!c.dataAgendada) {
    return "Sem data agendada";
  }

  if (!noPeriodo(c.dataAgendada, dataInicio, dataFim)) {
    return "Data agendada fora do período selecionado";
  }

  if (!situacaoPermiteBaixarConvocacao(c)) {
    return "Situação diferente de Ativo/Férias";
  }

  return "";
}

function gerarConvocacoesPeriodo(dataInicio, dataFim) {
  const lista = lerFontePainel()
    .sort((a, b) => {
      const dataA = a.dataAgendada || "";
      const dataB = b.dataAgendada || "";

      if (dataA !== dataB) return dataA.localeCompare(dataB);

      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });

  const resultados = [];
  const dadosAgenda = lerAgendaDados();
  const turnosAgenda = montarUltimosTurnosAgenda(dadosAgenda);

  lista.forEach(colaborador => {
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
      const pdf = gerarConvocacaoPorColaborador(colaborador, dadosAgenda, { turnosAgenda: turnosAgenda });

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

  return resultados;
}


function gerarConvocacoesSelecionadasLote(matriculas, dataInicio, dataFim) {
  const selecionadas = (matriculas || [])
    .map(m => String(m || "").trim())
    .filter(Boolean);

  if (selecionadas.length === 0) return [];

  const lista = lerFontePainel();
  const dadosAgenda = lerAgendaDados();
  const turnosAgenda = montarUltimosTurnosAgenda(dadosAgenda);
  const mapa = new Map();

  lista.forEach(c => {
    mapa.set(String(c.mat || "").trim(), c);
    if (c.matriculaCompleta) mapa.set(String(c.matriculaCompleta || "").trim(), c);
  });

  const resultados = [];

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
      const pdf = gerarConvocacaoPorColaborador(colaborador, dadosAgenda, { turnosAgenda: turnosAgenda });
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

  return resultados;
}

const LIMITE_ANEXOS_EMAIL_GESTOR = 10;
const PREFIXO_HISTORICO_CONVOCACAO = "HIST_ENVIO_CONVOCACAO_";

function validarEmailsGestor(emailsGestor) {
  const emails = String(emailsGestor || "")
    .split(/[;,]/)
    .map(email => email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error("Informe pelo menos um e-mail do gestor.");
  }

  const invalidos = emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalidos.length > 0) {
    throw new Error("E-mail(s) inválido(s): " + invalidos.join(", "));
  }

  return Array.from(new Set(emails));
}

function enviarConvocacoesSelecionadasGestor(matriculas, emailsGestor, dataInicio, dataFim, opcoes) {
  opcoes = opcoes || {};
  const emails = validarEmailsGestor(emailsGestor);
  const selecionadas = (matriculas || [])
    .map(m => String(m || "").trim())
    .filter(Boolean);

  if (selecionadas.length === 0) return [];

  if (selecionadas.length > LIMITE_ANEXOS_EMAIL_GESTOR) {
    throw new Error("Envie no máximo " + LIMITE_ANEXOS_EMAIL_GESTOR + " convocações por e-mail. O painel divide lotes maiores automaticamente.");
  }

  const lista = lerFontePainel();
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
      const pdf = gerarConvocacaoPorColaborador(colaborador, dadosAgenda, {
        turnosAgenda: turnosAgenda,
        incluirAnexo: true
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

  if (anexos.length > 0) {
    const assunto = montarAssuntoEmailGestor(dataInicio, dataFim);
    const contexto = opcoes.reconvocacao
      ? {
          reconvocacao: true,
          dataAnteriorBR: opcoes.dataAnteriorBR || "",
          novaDataBR: obterNovaDataConvocacaoBR(enviados),
          colaborador: enviados.length === 1 ? (enviados[0].colaborador || enviados[0].nome || "") : ""
        }
      : {};
    const corpo = montarCorpoEmailGestor(enviados, dataInicio, dataFim, contexto);
    const thread = opcoes.responderThreadId ? obterThreadGmailPorId(opcoes.responderThreadId) : null;

    if (thread) {
      thread.reply(corpo.texto, {
        htmlBody: corpo.html,
        attachments: anexos
      });
    } else {
      GmailApp.sendEmail(emails.join(","), assunto, corpo.texto, {
        htmlBody: corpo.html,
        attachments: anexos
      });
    }

    const threadId = thread ? thread.getId() : localizarThreadEnviada(assunto);

    resultados.forEach(r => {
      if (r.sucesso) {
        r.emailEnviado = true;
        r.destinatarios = emails.join(", ");
        registrarHistoricoEnvioConvocacao(r.matricula, {
          destinatarios: emails,
          assunto: assunto,
          threadId: threadId,
          arquivo: r.arquivo,
          url: r.url,
          reconvocacao: !!opcoes.reconvocacao
        });
      }
    });
  }

  return resultados;
}

function montarAssuntoEmailGestor(dataInicio, dataFim) {
  const referencia = obterReferenciaMesConvocacoes(dataInicio, dataFim);
  return "Convocações de ASO - SESMT HRC" + (referencia ? " - " + referencia : "");
}

function obterReferenciaMesConvocacoes(dataInicio, dataFim) {
  const inicio = dataISOParaDate(dataInicio);
  const fim = dataISOParaDate(dataFim || dataInicio);

  if (!inicio && !fim) return "";

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const dataBase = inicio || fim;
  if (inicio && fim && inicio.getFullYear() === fim.getFullYear() && inicio.getMonth() === fim.getMonth()) {
    return meses[inicio.getMonth()] + "/" + inicio.getFullYear();
  }

  if (inicio && fim) {
    return formatarDataBR(dataInicio) + " a " + formatarDataBR(dataFim);
  }

  return meses[dataBase.getMonth()] + "/" + dataBase.getFullYear();
}

function obterNovaDataConvocacaoBR(convocacoes) {
  const primeira = (convocacoes || [])[0] || {};
  return primeira.dataAgendadaBR || primeira.dataConvocarBR || primeira.dataLimiteBR || "";
}

function montarCorpoEmailGestor(convocacoes, dataInicio, dataFim, contexto) {
  contexto = contexto || {};
  const periodo = [
    dataInicio ? formatarDataBR(dataInicio) : "",
    dataFim ? formatarDataBR(dataFim) : ""
  ].filter(Boolean).join(" a ");

  const linhasHtml = (convocacoes || []).map(c =>
    "<li>" + escaparHtmlEmail(c.colaborador || c.nome || "") +
    " - Matrícula " + escaparHtmlEmail(c.matricula || "") + "</li>"
  ).join("");

  const linhasTexto = (convocacoes || []).map(c =>
    "- " + (c.colaborador || c.nome || "") + " - Matrícula " + (c.matricula || "")
  ).join("\n");

  const avisoReconvocacaoHtml = contexto.reconvocacao
    ? "<p>Informamos que " + (contexto.colaborador ? "<strong>" + escaparHtmlEmail(contexto.colaborador) + "</strong> " : "o colaborador ") +
      "faltou à data anterior" + (contexto.dataAnteriorBR ? " (" + escaparHtmlEmail(contexto.dataAnteriorBR) + ")" : "") +
      ". Segue nova convocação" + (contexto.novaDataBR ? " com a nova data " + escaparHtmlEmail(contexto.novaDataBR) : "") + ".</p>"
    : "";

  const avisoReconvocacaoTexto = contexto.reconvocacao
    ? "Informamos que " + (contexto.colaborador || "o colaborador") +
      " faltou à data anterior" + (contexto.dataAnteriorBR ? " (" + contexto.dataAnteriorBR + ")" : "") +
      ". Segue nova convocação" + (contexto.novaDataBR ? " com a nova data " + contexto.novaDataBR : "") + ".\n\n"
    : "";

  const html =
    "<p>Prezada(o),</p>" +
    avisoReconvocacaoHtml +
    "<p>Segue(m) em anexo a(s) convocação(ões) de ASO selecionada(s)" +
    (periodo ? " para o período de <strong>" + escaparHtmlEmail(periodo) + "</strong>" : "") +
    ".</p>" +
    "<ul>" + linhasHtml + "</ul>" +
    "<p>Atenciosamente,<br>SESMT HRC</p>";

  const texto =
    "Prezada(o),\n\n" +
    avisoReconvocacaoTexto +
    "Segue(m) em anexo a(s) convocação(ões) de ASO selecionada(s)" +
    (periodo ? " para o período de " + periodo : "") +
    ".\n\n" +
    linhasTexto +
    "\n\nAtenciosamente,\nSESMT HRC";

  return { html: html, texto: texto };
}

function escaparHtmlEmail(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function obterThreadGmailPorId(threadId) {
  if (!threadId) return null;
  try {
    return GmailApp.getThreadById(threadId);
  } catch (e) {
    return null;
  }
}

function localizarThreadEnviada(assunto) {
  try {
    const seguro = String(assunto || "").replace(/"/g, "");
    const threads = GmailApp.search('in:sent subject:"' + seguro + '" newer_than:2d', 0, 1);
    return threads.length ? threads[0].getId() : "";
  } catch (e) {
    return "";
  }
}

function chaveHistoricoConvocacao(mat) {
  return PREFIXO_HISTORICO_CONVOCACAO + String(mat || "").trim();
}

function obterHistoricoEnvioConvocacao(mat) {
  if (!mat) return {};
  const props = PropertiesService.getScriptProperties();
  const bruto = props.getProperty(chaveHistoricoConvocacao(mat));
  if (!bruto) return {};

  try {
    return JSON.parse(bruto) || {};
  } catch (e) {
    return {};
  }
}

function registrarHistoricoEnvioConvocacao(mat, dados) {
  const props = PropertiesService.getScriptProperties();
  const atual = obterHistoricoEnvioConvocacao(mat);
  const total = Number(atual.totalEnvios) || 0;
  const agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  props.setProperty(chaveHistoricoConvocacao(mat), JSON.stringify({
    totalEnvios: total + 1,
    ultimoEnvioEm: agora,
    destinatarios: dados.destinatarios || atual.destinatarios || [],
    assunto: dados.assunto || atual.assunto || "",
    threadId: dados.threadId || atual.threadId || "",
    ultimoArquivo: dados.arquivo || "",
    ultimaUrl: dados.url || "",
    teveReconvocacao: !!dados.reconvocacao || !!atual.teveReconvocacao
  }));
}

function obterResumoHistoricoEnviosConvocacao(matriculas) {
  const props = PropertiesService.getScriptProperties();
  const propriedades = props.getProperties();
  const resumo = {};

  (matriculas || []).forEach(mat => {
    const bruto = propriedades[chaveHistoricoConvocacao(mat)];
    if (!bruto) {
      resumo[mat] = { totalEnvios: 0 };
      return;
    }

    try {
      const item = JSON.parse(bruto) || {};
      resumo[mat] = {
        totalEnvios: Number(item.totalEnvios) || 0,
        ultimoEnvioEm: item.ultimoEnvioEm || "",
        destinatarios: item.destinatarios || [],
        threadId: item.threadId || ""
      };
    } catch (e) {
      resumo[mat] = { totalEnvios: 0 };
    }
  });

  return resumo;
}

function enviarReconvocacaoPendenciaGestor(mat, emailsGestor, dataInicio, dataFim, dataAnteriorBR) {
  const historico = obterHistoricoEnvioConvocacao(mat);
  const threadAnterior = historico.threadId || localizarThreadAnteriorConvocacao(mat);
  return enviarConvocacoesSelecionadasGestor([mat], emailsGestor, dataInicio, dataFim, {
    reconvocacao: true,
    dataAnteriorBR: dataAnteriorBR || "",
    responderThreadId: threadAnterior
  });
}

function localizarThreadAnteriorConvocacao(mat) {
  try {
    const matricula = String(mat || "").replace(/"/g, "").trim();
    if (!matricula) return "";

    const threads = GmailApp.search('in:sent ("' + matricula + '" "Convocações de ASO") newer_than:365d', 0, 1);
    return threads.length ? threads[0].getId() : "";
  } catch (e) {
    return "";
  }
}

function exportarAbaComoPDF(spreadsheetId, sheetId, nomeArquivo) {
  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
    `format=pdf` +
    `&gid=${sheetId}` +
    `&size=A4` +
    `&portrait=true` +
    `&fitw=true` +
    `&sheetnames=false` +
    `&printtitle=false` +
    `&pagenumbers=false` +
    `&gridlines=false` +
    `&fzr=false`;

  const token = ScriptApp.getOAuthToken();

  const resposta = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  const codigo = resposta.getResponseCode();

  if (codigo < 200 || codigo >= 300) {
    throw new Error("Erro ao exportar PDF. Código HTTP: " + codigo);
  }

  return resposta.getBlob().setName(nomeArquivo + ".pdf");
}
