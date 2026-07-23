/**
 * Portal de ASOS - SESMT HRC - Versão 13.0
 * Arquivo: Code.gs
 */

const CONFIG = {
  ABA_FONTE: "FONTEpainel",
  ABA_MODELO: "CONVOCAÇÃO",
  ABA_AGENDA: "AGENDA",
  PASTA_PDFS_ID: "1nLiYb9RTPB_0mq9rNPC8it5kUxaCL6nV",
  TIMEZONE: Session.getScriptTimeZone(),
  CACHE_SEGUNDOS: 1800,
  CACHE_PREFIXO: "PAINEL_ASOS_HRC_V13_MODULAR"
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

const EMAIL_COPIA_CONVOCACOES = "thais.tpc@isgh.org.br";

function incluirArquivoHtml(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}

function enviarConvocacoesSelecionadasGestorComCopia(matriculas, emailsGestor, dataInicio, dataFim, opcoes) {
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
          colaborador: enviados.length === 1
            ? (enviados[0].colaborador || enviados[0].nome || "")
            : ""
        }
      : {};

    const corpo = montarCorpoEmailGestor(enviados, dataInicio, dataFim, contexto);
    const thread = opcoes.responderThreadId
      ? obterThreadGmailPorId(opcoes.responderThreadId)
      : null;

    const opcoesEmail = {
      htmlBody: corpo.html,
      attachments: anexos,
      cc: EMAIL_COPIA_CONVOCACOES
    };

    if (thread) {
      thread.reply(corpo.texto, opcoesEmail);
    } else {
      GmailApp.sendEmail(emails.join(","), assunto, corpo.texto, opcoesEmail);
    }

    const threadId = thread ? thread.getId() : localizarThreadEnviada(assunto);

    resultados.forEach(r => {
      if (!r.sucesso) return;

      r.emailEnviado = true;
      r.destinatarios = emails.join(", ");
      r.copia = EMAIL_COPIA_CONVOCACOES;

      registrarHistoricoEnvioConvocacao(r.matricula, {
        destinatarios: emails,
        assunto: assunto,
        threadId: threadId,
        arquivo: r.arquivo,
        url: r.url,
        reconvocacao: !!opcoes.reconvocacao
      });
    });
  }

  return resultados;
}

function enviarReconvocacaoPendenciaGestorComCopia(mat, emailsGestor, dataInicio, dataFim, dataAnteriorBR) {
  const historico = obterHistoricoEnvioConvocacao(mat);
  const threadAnterior = historico.threadId || localizarThreadAnteriorConvocacao(mat);

  return enviarConvocacoesSelecionadasGestorComCopia(
    [mat],
    emailsGestor,
    dataInicio,
    dataFim,
    {
      reconvocacao: true,
      dataAnteriorBR: dataAnteriorBR || "",
      responderThreadId: threadAnterior
    }
  );
}

function doGet() {
  const htmlBase = HtmlService.createHtmlOutputFromFile("Index").getContent();
  const patch = incluirArquivoHtml("PatchPerformance");
  const visual = incluirArquivoHtml("VisualAdjustmentsV13");

  const ajustesFinais = `
<style>
.filtro-situacao-check {
  position: relative;
  width: 190px;
  flex: 0 0 190px;
}
.filtro-situacao-check > label {
  display: block;
  margin-bottom: 4px;
  color: #334155;
  font-size: 10px;
  font-weight: 600;
}
.filtro-situacao-check-botao {
  position: relative;
  width: 100%;
  height: 36px;
  padding: 0 30px 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  text-align: left;
  font-size: 11px;
  cursor: pointer;
}
.filtro-situacao-check-botao::after {
  content: '▾';
  position: absolute;
  top: 9px;
  right: 10px;
  color: #475569;
}
.filtro-situacao-check-lista {
  display: none;
  position: absolute;
  top: 58px;
  left: 0;
  z-index: 10050;
  width: 280px;
  max-height: 300px;
  padding: 8px;
  overflow: auto;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 25px rgba(15, 23, 42, .2);
}
.filtro-situacao-check.aberto .filtro-situacao-check-lista {
  display: block;
}
.filtro-situacao-check-opcao {
  display: flex !important;
  align-items: center;
  gap: 8px;
  margin: 0 !important;
  padding: 7px 5px;
  color: #0f172a !important;
  font-size: 11px !important;
  cursor: pointer;
}
.filtro-situacao-check-opcao:hover {
  border-radius: 6px;
  background: #f1f5f9;
}
.filtro-situacao-check-opcao input {
  display: inline-block !important;
  width: 14px !important;
  min-width: 14px !important;
  height: 14px !important;
  margin: 0 !important;
  opacity: 1 !important;
  appearance: auto !important;
}
.filtro-situacao-check-opcao.fixa {
  font-weight: 700;
}
.filtro-situacao-check-opcao.fixa span::after {
  content: ' • fixa';
  color: #64748b;
  font-size: 9px;
  font-weight: 400;
}
#filtroSituacaoConvocar {
  display: none !important;
}
</style>
<script>
(function () {
  'use strict';

  const FIXAS = ['ATIVO', 'FERIAS'];
  const estado = {
    convocar: new Set(FIXAS),
    complementares: new Set(FIXAS)
  };

  function portalAtual() {
    return typeof dadosPortal !== 'undefined' && dadosPortal ? dadosPortal : null;
  }

  function processamentoAtivo() {
    return typeof loteEmProcessamento !== 'undefined' && loteEmProcessamento === true;
  }

  function definirProcessamento(valor) {
    if (typeof loteEmProcessamento !== 'undefined') loteEmProcessamento = valor;
  }

  function normalizar(valor) {
    return String(valor || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '');
  }

  function listaConvocar() {
    const portal = portalAtual();
    return portal && portal.convocar && Array.isArray(portal.convocar.todos)
      ? portal.convocar.todos
      : [];
  }

  function listaComplementares() {
    const portal = portalAtual();
    return portal && Array.isArray(portal.examesComplementares)
      ? portal.examesComplementares
      : [];
  }

  function obterSituacoes(lista) {
    return [...new Set((lista || []).map(item => item.situacao).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function assinaturaSituacoes(lista) {
    return obterSituacoes(lista).map(normalizar).join('|');
  }

  function textoResumo(tipo, lista) {
    const selecionadas = obterSituacoes(lista)
      .filter(situacao => estado[tipo].has(normalizar(situacao)));

    if (selecionadas.length === 0) return 'Selecione';
    if (selecionadas.length <= 2) return selecionadas.join(', ');
    return selecionadas.slice(0, 2).join(', ') + ' +' + (selecionadas.length - 2);
  }

  function fecharFiltros(exceto) {
    document.querySelectorAll('.filtro-situacao-check.aberto').forEach(elemento => {
      if (elemento !== exceto) elemento.classList.remove('aberto');
    });
  }

  document.addEventListener('click', function () {
    fecharFiltros(null);
  });

  function renderizarFiltro(tipo, lista, referencia) {
    if (!referencia || !lista.length) return null;

    const linha = referencia.closest('.linha-filtros');
    if (!linha) return null;

    linha.querySelectorAll('.situacao-multipla').forEach(elemento => elemento.remove());

    const assinatura = assinaturaSituacoes(lista);
    let bloco = linha.querySelector('.filtro-situacao-check[data-tipo="' + tipo + '"]');

    if (bloco && bloco.dataset.assinatura === assinatura) {
      const botaoExistente = bloco.querySelector('.filtro-situacao-check-botao');
      if (botaoExistente) botaoExistente.textContent = textoResumo(tipo, lista);
      return bloco;
    }

    if (bloco) bloco.remove();

    bloco = document.createElement('div');
    bloco.className = 'filtro-situacao-check';
    bloco.dataset.tipo = tipo;
    bloco.dataset.assinatura = assinatura;
    bloco.innerHTML =
      '<label>Situação</label>' +
      '<button type="button" class="filtro-situacao-check-botao"></button>' +
      '<div class="filtro-situacao-check-lista"></div>';

    const alvo = referencia.closest('div');
    linha.insertBefore(bloco, alvo || linha.firstChild);

    const botao = bloco.querySelector('.filtro-situacao-check-botao');
    const caixa = bloco.querySelector('.filtro-situacao-check-lista');

    obterSituacoes(lista).forEach(situacao => {
      const chave = normalizar(situacao);
      const fixa = FIXAS.includes(chave);
      if (fixa) estado[tipo].add(chave);

      const label = document.createElement('label');
      label.className = 'filtro-situacao-check-opcao' + (fixa ? ' fixa' : '');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = fixa || estado[tipo].has(chave);
      input.disabled = fixa;

      const texto = document.createElement('span');
      texto.textContent = situacao;

      label.appendChild(input);
      label.appendChild(texto);
      caixa.appendChild(label);

      input.addEventListener('change', function () {
        if (input.checked) estado[tipo].add(chave);
        else estado[tipo].delete(chave);

        botao.textContent = textoResumo(tipo, lista);
        if (tipo === 'convocar') filtrarConvocarEstavel();
        else filtrarComplementaresEstavel();
      });
    });

    botao.textContent = textoResumo(tipo, lista);
    botao.addEventListener('click', function (evento) {
      evento.stopPropagation();
      const abrir = !bloco.classList.contains('aberto');
      fecharFiltros(bloco);
      bloco.classList.toggle('aberto', abrir);
    });

    caixa.addEventListener('click', function (evento) {
      evento.stopPropagation();
    });

    return bloco;
  }

  function montarFiltroConvocar() {
    const select = document.getElementById('filtroSituacaoConvocar');
    const lista = listaConvocar();
    if (!select || !lista.length) return;
    renderizarFiltro('convocar', lista, select);
  }

  function montarFiltroComplementares() {
    const grupo = document.getElementById('filtroGrupoComplementar');
    const lista = listaComplementares();
    if (!grupo || !lista.length) return;
    renderizarFiltro('complementares', lista, grupo);
  }

  function filtrarConvocarEstavel() {
    const portal = portalAtual();
    if (!portal || !portal.convocar) return;

    const termo = typeof obterTermoPesquisa === 'function'
      ? obterTermoPesquisa('pesquisaConvocar')
      : '';

    const filtrados = listaConvocar().filter(item =>
      estado.convocar.has(normalizar(item.situacao)) &&
      (!termo || correspondePesquisa(item, termo))
    );

    if (typeof renderizarConvocar === 'function') renderizarConvocar(filtrados);
  }

  function filtrarComplementaresEstavel() {
    const portal = portalAtual();
    if (!portal) return;

    const grupo = document.getElementById('filtroGrupoComplementar');
    const grupoSelecionado = grupo ? grupo.value || '' : '';
    const termo = typeof obterTermoPesquisa === 'function'
      ? obterTermoPesquisa('pesquisaComplementares')
      : '';

    const filtrados = listaComplementares().filter(item =>
      estado.complementares.has(normalizar(item.situacao)) &&
      (!grupoSelecionado || item.grupoComplementar === grupoSelecionado) &&
      (!termo || correspondePesquisaComplementar(item, termo))
    );

    if (typeof renderizarComplementares === 'function') {
      renderizarComplementares(filtrados);
    }
  }

  function removerColunaPrioridadeComplementares() {
    const tabela = document.querySelector('#tabelaComplementares table');
    if (!tabela) return;

    const cabecalhos = Array.from(tabela.querySelectorAll('thead th'));
    const indice = cabecalhos.findIndex(th => normalizar(th.textContent) === 'PRIORIDADE');
    if (indice < 0) return;

    tabela.querySelectorAll('tr').forEach(linha => {
      if (linha.children[indice]) linha.children[indice].remove();
    });
  }

  function examesComplementaresSelecionados(matriculas) {
    const chaves = new Set((matriculas || []).map(valor => String(valor || '').trim()));

    return listaComplementares().filter(item =>
      chaves.has(String(item.mat || '').trim()) ||
      chaves.has(String(item.matricula || '').trim()) ||
      chaves.has(String(item.matriculaCompleta || '').trim())
    );
  }

  function confirmarExamesComplementares(matriculas) {
    const itens = examesComplementaresSelecionados(matriculas);
    if (!itens.length) return true;

    const linhas = itens.map(item =>
      '• ' + (item.nome || 'Sem nome') + ' — ' +
      (item.grupoComplementar || 'Exame complementar')
    ).join('\\n');

    return window.confirm(
      'ATENÇÃO: os colaboradores abaixo necessitam realizar exames complementares antes do ASO:\\n\\n' +
      linhas +
      '\\n\\nConfirme se os exames já foram realizados ou providenciados. Deseja continuar com o envio ao gestor?'
    );
  }

  function enviarLoteGestorComCopia(matriculas, emailGestor) {
    if (processamentoAtivo()) {
      mostrarErro('Já existe uma geração/envio em lote em andamento. Aguarde finalizar.');
      return;
    }

    const lista = [...new Set((matriculas || []).map(String).filter(Boolean))];
    if (!lista.length) {
      mostrarErro('Nenhuma matrícula válida para enviar.');
      return;
    }

    if (!confirmarExamesComplementares(lista)) return;

    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;

    if (!dataInicio || !dataFim) {
      mostrarErro('Informe a data inicial e a data final.');
      return;
    }

    limparMensagens();
    limparStatusLote();

    const tamanhoLote = 10;
    let indice = 0;
    let sucesso = 0;
    let ignorados = 0;
    let falhas = 0;
    const motivos = {};

    definirProcessamento(true);
    mostrarLoading(true);
    atualizarProgressoLote(0, lista.length, 'Enviando convocações ao gestor');
    lista.forEach(mat => definirStatusLote(mat, 'aguardando-lote', '...', 'Aguardando envio'));

    function processarProximo() {
      const lote = lista.slice(indice, indice + tamanhoLote);

      if (!lote.length) {
        definirProcessamento(false);
        mostrarLoading(false);
        atualizarProgressoLote(lista.length, lista.length, 'Envio concluído');

        const resumo = Object.keys(motivos)
          .map(motivo => motivo + ': ' + motivos[motivo])
          .join(' | ');

        let texto = sucesso + ' convocação(ões) enviada(s) para ' + emailGestor +
          ', com cópia para thais.tpc@isgh.org.br. ' +
          ignorados + ' ignorado(s). ' + falhas + ' falha(s).';

        if (resumo) texto += ' Motivos: ' + resumo + '.';
        mostrarOk(texto);
        return;
      }

      google.script.run
        .withSuccessHandler(function (resultados) {
          (resultados || []).forEach(resultado => {
            const mat = String(resultado.matricula || '');

            if (resultado.sucesso) {
              sucesso++;
              definirStatusLote(mat, 'ok-lote', '@', resultado.arquivo || 'Convocação enviada');
            } else if (resultado.ignorado) {
              ignorados++;
              const motivo = resultado.motivo || 'Ignorado';
              motivos[motivo] = (motivos[motivo] || 0) + 1;
              definirStatusLote(mat, 'erro-lote', '!', motivo);
            } else {
              falhas++;
              definirStatusLote(mat, 'erro-lote', 'X', resultado.erro || 'Falha ao enviar');
            }
          });

          indice += lote.length;
          atualizarProgressoLote(
            Math.min(indice, lista.length),
            lista.length,
            'Enviando convocações ao gestor'
          );
          setTimeout(processarProximo, 300);
        })
        .withFailureHandler(function (erro) {
          lote.forEach(mat => definirStatusLote(mat, 'erro-lote', 'X', erro.message || erro));
          falhas += lote.length;
          indice += lote.length;
          atualizarProgressoLote(
            Math.min(indice, lista.length),
            lista.length,
            'Continuando após falha do lote'
          );
          setTimeout(processarProximo, 600);
        })
        .enviarConvocacoesSelecionadasGestorComCopia(
          lote,
          emailGestor,
          dataInicio,
          dataFim
        );
    }

    processarProximo();
  }

  function enviarPendenciaGestorComCopia(mat, dataAnteriorBR) {
    if (processamentoAtivo()) {
      mostrarErro('Já existe uma geração/envio em lote em andamento. Aguarde finalizar.');
      return;
    }

    const emails = typeof obterEmailsGestor === 'function' ? obterEmailsGestor() : [];
    if (!emails.length) {
      mostrarErro('Informe o e-mail do gestor antes de enviar a pendência.');
      return;
    }

    const invalidos = emails.filter(email => !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email));
    if (invalidos.length) {
      mostrarErro('E-mail(s) inválido(s): ' + invalidos.join(', '));
      return;
    }

    if (!confirmarExamesComplementares([mat])) return;

    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;

    if (!dataInicio || !dataFim) {
      mostrarErro('Informe a data inicial e a data final.');
      return;
    }

    limparMensagens();
    mostrarLoading(true);
    definirProcessamento(true);

    google.script.run
      .withSuccessHandler(function (resultados) {
        definirProcessamento(false);
        mostrarLoading(false);

        const resultado = (resultados || [])[0] || {};
        if (resultado.sucesso) {
          mostrarOk('Nova convocação enviada ao gestor, com cópia para thais.tpc@isgh.org.br.');
          carregarDados(true);
        } else if (resultado.ignorado) {
          mostrarErro(resultado.motivo || 'Convocação ignorada.');
        } else {
          mostrarErro(resultado.erro || 'Falha ao enviar nova convocação.');
        }
      })
      .withFailureHandler(function (erro) {
        definirProcessamento(false);
        mostrarLoading(false);
        mostrarErro(erro.message || erro);
      })
      .enviarReconvocacaoPendenciaGestorComCopia(
        mat,
        emails.join('; '),
        dataInicio,
        dataFim,
        dataAnteriorBR
      );
  }

  const abrirAbaOriginal = window.abrirAba;
  window.abrirAba = function (id, botao) {
    abrirAbaOriginal(id, botao);
    setTimeout(function () {
      if (id === 'convocar') montarFiltroConvocar();
      if (id === 'complementares') {
        montarFiltroComplementares();
        removerColunaPrioridadeComplementares();
      }
    }, 0);
  };

  const renderizarConvocarOriginal = window.renderizarConvocar;
  window.renderizarConvocar = function (lista) {
    renderizarConvocarOriginal(lista);
    montarFiltroConvocar();
  };

  const renderizarComplementaresOriginal = window.renderizarComplementares;
  window.renderizarComplementares = function (lista) {
    renderizarComplementaresOriginal(lista);
    montarFiltroComplementares();
    removerColunaPrioridadeComplementares();
  };

  const limparFiltrosOriginal = window.limparFiltrosLocais;
  window.limparFiltrosLocais = function () {
    estado.convocar = new Set(FIXAS);
    estado.complementares = new Set(FIXAS);
    if (typeof limparFiltrosOriginal === 'function') limparFiltrosOriginal();
    montarFiltroConvocar();
    montarFiltroComplementares();
  };

  window.filtrarConvocacaoPorSituacao = filtrarConvocarEstavel;
  window.filtrarComplementares = filtrarComplementaresEstavel;
  window.enviarLoteGestor = enviarLoteGestorComCopia;
  window.enviarPendenciaGestor = enviarPendenciaGestorComCopia;
})();
</script>`;

  const complementos = patch + "\n" + visual + "\n" + ajustesFinais;
  const htmlFinal = htmlBase.includes("</body>")
    ? htmlBase.replace("</body>", complementos + "\n</body>")
    : htmlBase + complementos;

  return HtmlService
    .createHtmlOutput(htmlFinal)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
