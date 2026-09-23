/* =========================================================
   PDF DE CONVOCAÇÃO
========================================================= */

function lerAgendaDados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABA_AGENDA);

  if (!aba) return [];

  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 3) return [];

  // Para localizar turno são necessárias apenas as colunas D:I.
  // Evita ler toda a largura da AGENDA em cada lote de PDFs.
  return aba.getRange(3, 4, ultimaLinha - 2, 6).getValues();
}

function buscarUltimoTurnoAgenda(mat, dataAgendada, dadosAgenda) {
  const matricula = String(mat || "").trim();
  const dataAlvo = formatarDataISO(dataAgendada);

  if (dadosAgenda && typeof dadosAgenda.get === "function") {
    if (dataAlvo && dadosAgenda.has(matricula + "|" + dataAlvo)) {
      return dadosAgenda.get(matricula + "|" + dataAlvo) || "";
    }
    return dadosAgenda.get(matricula) || "";
  }

  const mapa = montarUltimosTurnosAgenda(dadosAgenda || lerAgendaDados());
  if (dataAlvo && mapa.has(matricula + "|" + dataAlvo)) {
    return mapa.get(matricula + "|" + dataAlvo) || "";
  }
  return mapa.get(matricula) || "";
}

function montarUltimosTurnosAgenda(dadosAgenda) {
  const dados = dadosAgenda || lerAgendaDados();
  const turnos = new Map();
  const ultimoPeriodico = new Map();

  // D:I => D data, G tipo, H matrícula, I turno.
  const IDX_DATA = 0;
  const IDX_TIPO = 3;
  const IDX_MAT = 4;
  const IDX_TURNO = 5;

  dados.forEach(l => {
    const mat = String(l[IDX_MAT] || "").trim();
    const dataISO = formatarDataISO(l[IDX_DATA]);
    const tipo = normalizarTexto(l[IDX_TIPO] || "");
    if (!mat || !dataISO || !tipo.includes("PERIODIC")) return;

    const turno = valorTexto(l[IDX_TURNO]);
    turnos.set(mat + "|" + dataISO, turno);

    const atual = ultimoPeriodico.get(mat);
    if (!atual || dataISO >= atual.dataISO) {
      ultimoPeriodico.set(mat, { dataISO: dataISO, turno: turno });
    }
  });

  ultimoPeriodico.forEach((item, mat) => {
    turnos.set(mat, item.turno || "");
  });

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

function registrarEmailsConvocacaoEnviados(matriculas) {
  const selecionadas = new Set((matriculas || []).map(m => String(m || "").trim()).filter(Boolean));
  if (selecionadas.size === 0) return 0;
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ABA_FONTE);
  if (!aba || aba.getLastRow() < 2) return 0;
  const totalLinhas = aba.getLastRow() - 1;
  const mats = aba.getRange(2, COL.MAT, totalLinhas, 1).getDisplayValues();
  const controle = aba.getRange(2, COL.CONVOCACAO_BAIXADA, totalLinhas, 1);
  const valores = controle.getDisplayValues();
  let marcadas = 0;
  mats.forEach((linha, indice) => {
    if (!selecionadas.has(String(linha[0] || "").trim())) return;
    valores[indice][0] = "✓";
    marcadas++;
  });
  if (marcadas > 0) controle.setValues(valores);
  return marcadas;
}


function marcarEmailsAgostoEnviados() {
  return reconstruirHistoricoEnviosAgosto2026();
}

function gerarConvocacaoIndividual(mat) {
  const lista = typeof obterListaOperacionalV15_ === "function"
    ? obterListaOperacionalV15_()
    : lerFontePainel();
  const matricula = String(mat).trim();

  const colaborador = lista.find(c =>
    String(c.mat).trim() === matricula ||
    String(c.matriculaCompleta).trim() === matricula
  );

  if (!colaborador) {
    throw new Error("Colaborador não encontrado: " + mat);
  }

  const motivo = motivoNaoBaixarConvocacao(colaborador, "", "");
  if (motivo) throw new Error(motivo);

  return gerarConvocacaoPorColaborador(colaborador, null);
}

function criarContextoGeracaoConvocacoes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const modeloOriginal = ss.getSheetByName(CONFIG.ABA_MODELO);

  if (!modeloOriginal) {
    throw new Error("Aba CONVOCAÇÃO não encontrada.");
  }

  limparTemporariosConvocacaoV15_(ss);
  const nomeTemp = "TEMP_CONVOCACOES_" + new Date().getTime();
  return {
    ss: ss,
    modeloTemp: modeloOriginal.copyTo(ss).setName(nomeTemp),
    pasta: DriveApp.getFolderById(CONFIG.PASTA_PDFS_ID)
  };
}

function limparTemporariosConvocacaoV15_(ss) {
  const agora = Date.now();
  const limiteMs = 6 * 60 * 60 * 1000;

  (ss.getSheets() || []).forEach(function(aba) {
    const nome = String(aba.getName() || "");
    if (!nome.startsWith("TEMP_CONVOCACOES_")) return;

    const timestamp = Number(nome.substring("TEMP_CONVOCACOES_".length));
    if (!timestamp || agora - timestamp < limiteMs) return;

    try {
      ss.deleteSheet(aba);
    } catch (e) {
      console.warn("Não foi possível remover temporário antigo " + nome + ": " + e.message);
    }
  });
}

function encerrarContextoGeracaoConvocacoes(contexto) {
  if (!contexto || !contexto.ss || !contexto.modeloTemp) return;
  try {
    contexto.ss.deleteSheet(contexto.modeloTemp);
  } catch (e) {
    console.warn("Não foi possível excluir a aba temporária: " + e.message);
  }
}

function gerarConvocacaoPorColaborador(colaborador, dadosAgenda, opcoes) {
  opcoes = opcoes || {};
  const contextoProprio = !opcoes.contextoGeracao;
  const contexto = opcoes.contextoGeracao || criarContextoGeracaoConvocacoes();
  const ss = contexto.ss;
  const modeloTemp = contexto.modeloTemp;

  const turno = colaborador.dataAgendada
    ? buscarUltimoTurnoAgenda(
        colaborador.mat,
        colaborador.dataAgendada,
        opcoes.turnosAgenda || dadosAgenda
      )
    : "";

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
    modeloTemp.getRange("G27").setValue(new Date()).setNumberFormat("dd/MM/yyyy");

    SpreadsheetApp.flush();

    const nomeArquivo = limparNomeArquivo(
      `${colaborador.setor} - ${colaborador.funcao} - ${colaborador.nome}`
    );

    const pdf = exportarAbaComoPDF(ss.getId(), modeloTemp.getSheetId(), nomeArquivo);

    const arquivo = contexto.pasta.createFile(pdf).setName(nomeArquivo + ".pdf");

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
      resultado.anexo = pdf.copyBlob().setName(arquivo.getName());
    }

    return resultado;

  } finally {
    if (contextoProprio) encerrarContextoGeracaoConvocacoes(contexto);
  }
}

function situacaoPermiteBaixarConvocacao(c) {
  const situacao = normalizarTexto(c.situacao || c.situacaoNorm || "");
  return situacao === "ATIVO" || situacao === "FERIAS" || situacao.includes("FERIAS");
}

function motivoNaoBaixarConvocacao(c, dataInicio, dataFim) {
  if (!c) return "Colaborador não encontrado";

  if (c.asoRealizadoValido) {
    return "ASO periódico do ciclo já realizado";
  }

  if (!c.dataAgendada) {
    return "Sem data agendada";
  }

  if (!situacaoPermiteBaixarConvocacao(c)) {
    return "Situação diferente de Ativo/Férias";
  }

  /* O período selecionado define a fila exibida, não a validade do PDF.
     Assim, uma convocação originada em setembro e agendada em outubro
     pode ser emitida em setembro já com a data futura correta. */
  return "";
}

function gerarConvocacoesPeriodo(dataInicio, dataFim) {
  const base = typeof obterListaOperacionalV15_ === "function"
    ? obterListaOperacionalV15_()
    : lerFontePainel();

  const lista = gerarListaConvocar(base, dataInicio, dataFim)
    .filter(c => !c.asoRealizadoValido)
    .sort((a, b) => {
      const dataA = a.dataAgendada || "";
      const dataB = b.dataAgendada || "";
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });

  const resultados = [];
  const dadosAgenda = lerAgendaDados();
  const turnosAgenda = montarUltimosTurnosAgenda(dadosAgenda);
  let contextoGeracao = null;

  try {
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
        if (!contextoGeracao) contextoGeracao = criarContextoGeracaoConvocacoes();
        const pdf = gerarConvocacaoPorColaborador(colaborador, dadosAgenda, {
          turnosAgenda: turnosAgenda,
          contextoGeracao: contextoGeracao
        });

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

  return resultados;
}


function gerarConvocacoesSelecionadasLote(matriculas, dataInicio, dataFim) {
  const selecionadas = (matriculas || [])
    .map(m => String(m || "").trim())
    .filter(Boolean);

  if (selecionadas.length === 0) return [];

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
          contextoGeracao: contextoGeracao
        });
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

  return resultados;
}

const LIMITE_ANEXOS_EMAIL_GESTOR = 30;
const PREFIXO_HISTORICO_CONVOCACAO = "HIST_ENVIO_CONVOCACAO_";
const EMAIL_COPIA_CONVOCACOES_GESTOR = "thais.tpc@isgh.org.br";

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
    encerrarContextoGeracaoConvocacoes(contextoGeracao);
  }

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
      const destinatariosOriginais = obterDestinatariosOriginaisThread(thread);
      const destinatariosEnvio = Array.from(new Set(
        emails.concat(destinatariosOriginais)
          .map(email => String(email || "").trim().toLowerCase())
          .filter(email => email && email !== EMAIL_COPIA_CONVOCACOES_GESTOR.toLowerCase())
      ));

      if (destinatariosEnvio.length === 0) {
        throw new Error("Não foi possível identificar os e-mails dos coordenadores.");
      }

      GmailApp.sendEmail(destinatariosEnvio.join(","), assunto, corpo.texto, {
        htmlBody: corpo.html,
        attachments: anexos,
        cc: EMAIL_COPIA_CONVOCACOES_GESTOR
      });

      emails.splice(0, emails.length, ...destinatariosEnvio);
    } else {
      GmailApp.sendEmail(emails.join(","), assunto, corpo.texto, {
        htmlBody: corpo.html,
        attachments: anexos,
        cc: EMAIL_COPIA_CONVOCACOES_GESTOR
      });
    }

    // A pesquisa no Gmail é adiada para uma eventual reconvocação. Fazer a
    // busca logo após o envio adicionava vários segundos ao caminho crítico.
    const threadId = thread ? thread.getId() : "";

    resultados.forEach(r => {
      if (r.sucesso) {
        r.emailEnviado = true;
        r.destinatarios = emails.join(", ");
      }
    });

    registrarHistoricoEnviosConvocacaoEmLote(resultados, {
      destinatarios: emails,
      assunto: assunto,
      threadId: threadId,
      reconvocacao: !!opcoes.reconvocacao
    });
    registrarEmailsConvocacaoEnviados(
      resultados.filter(r => r && r.sucesso).map(r => r.matricula)
    );
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

function extrairEmailsCabecalhoGmail(valor) {
  const encontrados = String(valor || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(encontrados.map(email => email.toLowerCase())));
}

function obterDestinatariosOriginaisThread(thread) {
  if (!thread) return [];

  try {
    const mensagens = thread.getMessages();
    if (!mensagens || mensagens.length === 0) return [];

    const original = mensagens[0];
    return extrairEmailsCabecalhoGmail(
      [original.getTo(), original.getCc()].filter(Boolean).join(",")
    );
  } catch (e) {
    console.warn("Não foi possível recuperar os destinatários originais: " + e.message);
    return [];
  }
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

function registrarHistoricoEnviosConvocacaoEmLote(resultados, dados) {
  const enviados = (resultados || []).filter(r => r && r.sucesso && r.matricula);
  if (enviados.length === 0) return;

  const props = PropertiesService.getScriptProperties();
  const existentes = props.getProperties();
  const atualizacoes = {};
  const agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  enviados.forEach(r => {
    const chave = chaveHistoricoConvocacao(r.matricula);
    let atual = {};
    try {
      atual = JSON.parse(existentes[chave] || "{}") || {};
    } catch (e) {
      atual = {};
    }

    atualizacoes[chave] = JSON.stringify({
      totalEnvios: (Number(atual.totalEnvios) || 0) + 1,
      ultimoEnvioEm: agora,
      destinatarios: dados.destinatarios || atual.destinatarios || [],
      assunto: dados.assunto || atual.assunto || "",
      threadId: dados.threadId || atual.threadId || "",
      ultimoArquivo: r.arquivo || "",
      ultimaUrl: r.url || "",
      teveReconvocacao: !!dados.reconvocacao || !!atual.teveReconvocacao
    });
  });

  props.setProperties(atualizacoes, false);
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

/** Reconstrói, sem reenviar mensagens, o histórico de e-mails de agosto/2026. */
function reconstruirHistoricoEnviosAgosto2026() {
  const inicio = "2026-08-01";
  const fim = "2026-08-31";
  const elegiveis = new Set(
    lerFontePainel()
      .filter(c => noPeriodo(c.dataConvocar, inicio, fim))
      .map(c => String(c.mat || "").trim())
      .filter(Boolean)
  );
  const encontrados = {};
  const threads = GmailApp.search('in:sent subject:"Convocações de ASO - SESMT HRC"', 0, 500);

  threads.forEach(thread => {
    thread.getMessages().forEach(mensagem => {
      const assunto = String(mensagem.getSubject() || "");
      if (!assunto.includes("Convocações de ASO - SESMT HRC")) return;

      const corpo = String(mensagem.getPlainBody() || "");
      const matriculasMensagem = new Set();
      const regex = /Matr[ií]cula\s+(\d+)/gi;
      let match;
      while ((match = regex.exec(corpo)) !== null) {
        const mat = String(match[1] || "").trim();
        if (elegiveis.has(mat)) matriculasMensagem.add(mat);
      }

      matriculasMensagem.forEach(mat => {
        const data = mensagem.getDate();
        const atual = encontrados[mat];
        if (!atual || data.getTime() > atual.data.getTime()) {
          encontrados[mat] = {
            data: data,
            destinatarios: String(mensagem.getTo() || "")
              .split(",")
              .map(email => email.trim())
              .filter(Boolean),
            assunto: assunto,
            threadId: thread.getId()
          };
        }
      });
    });
  });

  const props = PropertiesService.getScriptProperties();
  const existentes = props.getProperties();
  const atualizacoes = {};
  const marcadas = [];
  const preservadas = [];

  Object.keys(encontrados).forEach(mat => {
    const chave = chaveHistoricoConvocacao(mat);
    if (existentes[chave]) {
      preservadas.push(mat);
      return;
    }

    const envio = encontrados[mat];
    atualizacoes[chave] = JSON.stringify({
      totalEnvios: 1,
      ultimoEnvioEm: Utilities.formatDate(envio.data, CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
      destinatarios: envio.destinatarios,
      assunto: envio.assunto,
      threadId: envio.threadId,
      ultimoArquivo: "",
      ultimaUrl: "",
      teveReconvocacao: false
    });
    marcadas.push(mat);
  });

  if (Object.keys(atualizacoes).length > 0) {
    props.setProperties(atualizacoes, false);
  }
  registrarEmailsConvocacaoEnviados(Object.keys(encontrados));

  const resultado = {
    totalElegiveisAgosto: elegiveis.size,
    localizadasNosEmails: Object.keys(encontrados).length,
    marcadas: marcadas.sort(),
    preservadas: preservadas.sort()
  };
  console.log(JSON.stringify(resultado));
  return resultado;
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

