const EMAIL_COPIA_FIXA_SESMT = "thais.tpc@isgh.org.br";

function enviarConvocacoesSelecionadasGestor(matriculas, emailsGestor, dataInicio, dataFim, opcoes) {
  opcoes = opcoes || {};
  const emails = validarEmailsGestor(emailsGestor);
  const selecionadas = (matriculas || []).map(m => String(m || "").trim()).filter(Boolean);
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

  const resultados = [], anexos = [], enviados = [];
  selecionadas.forEach(mat => {
    const colaborador = mapa.get(mat);
    if (!colaborador) {
      resultados.push({ sucesso:false, ignorado:false, matricula:mat, colaborador:"", erro:"Colaborador não encontrado" });
      return;
    }
    const motivo = motivoNaoBaixarConvocacao(colaborador, dataInicio, dataFim);
    if (motivo) {
      resultados.push({ sucesso:false, ignorado:true, colaborador:colaborador.nome, matricula:colaborador.mat, situacao:colaborador.situacao, dataAgendadaBR:colaborador.dataAgendadaBR, motivo:motivo });
      return;
    }
    try {
      const pdf = gerarConvocacaoPorColaborador(colaborador, dadosAgenda, { turnosAgenda:turnosAgenda, incluirAnexo:true });
      anexos.push(pdf.anexo);
      enviados.push(pdf);
      resultados.push({ sucesso:true, ignorado:false, colaborador:colaborador.nome, matricula:colaborador.mat, arquivo:pdf.arquivo, url:pdf.url });
    } catch (e) {
      resultados.push({ sucesso:false, ignorado:false, colaborador:colaborador.nome, matricula:colaborador.mat, erro:e.message });
    }
  });

  if (anexos.length > 0) {
    const assunto = montarAssuntoEmailGestor(dataInicio, dataFim);
    const contexto = opcoes.reconvocacao ? {
      reconvocacao:true,
      dataAnteriorBR:opcoes.dataAnteriorBR || "",
      novaDataBR:obterNovaDataConvocacaoBR(enviados),
      colaborador:enviados.length === 1 ? (enviados[0].colaborador || enviados[0].nome || "") : ""
    } : {};
    const corpo = montarCorpoEmailGestor(enviados, dataInicio, dataFim, contexto);
    const thread = opcoes.responderThreadId ? obterThreadGmailPorId(opcoes.responderThreadId) : null;

    if (thread) {
      thread.reply(corpo.texto, { htmlBody:corpo.html, attachments:anexos, cc:EMAIL_COPIA_FIXA_SESMT });
    } else {
      GmailApp.sendEmail(emails.join(","), assunto, corpo.texto, { htmlBody:corpo.html, attachments:anexos, cc:EMAIL_COPIA_FIXA_SESMT });
    }

    const threadId = thread ? thread.getId() : localizarThreadEnviada(assunto);
    resultados.forEach(r => {
      if (!r.sucesso) return;
      r.emailEnviado = true;
      r.destinatarios = emails.join(", ");
      registrarHistoricoEnvioConvocacao(r.matricula, {
        destinatarios:emails,
        copia:[EMAIL_COPIA_FIXA_SESMT],
        assunto:assunto,
        threadId:threadId,
        arquivo:r.arquivo,
        url:r.url,
        reconvocacao:!!opcoes.reconvocacao
      });
    });
  }
  return resultados;
}