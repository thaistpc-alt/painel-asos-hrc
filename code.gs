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
  // Usa o fluxo único para convocação e reconvocação: ele valida participantes,
  // exige nova data na AGENDA e responde na conversa original com replyAll.
  return enviarConvocacoesSelecionadasGestor(
    matriculas,
    emailsGestor,
    dataInicio,
    dataFim,
    opcoes || {}
  );
}

function enviarReconvocacaoPendenciaGestorComCopia(mat, emailsGestor, dataInicio, dataFim, dataAnteriorBR) {
  return enviarReconvocacaoPendenciaGestor(
    mat,
    emailsGestor,
    dataInicio,
    dataFim,
    dataAnteriorBR || ""
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

  function montarFiltroGrupoConvocacaoV15() {
    const referencia = document.getElementById('filtroSituacaoConvocar');
    const linha = referencia && referencia.closest('.linha-filtros');
    if (!linha) return;

    let select = document.getElementById('filtroGrupoConvocacaoV15');
    if (!select) {
      const bloco = document.createElement('div');
      bloco.className = 'filtro-grupo-convocacao-v15';
      const label = document.createElement('label');
      label.textContent = 'Origem da convocação';
      select = document.createElement('select');
      select.id = 'filtroGrupoConvocacaoV15';
      bloco.append(label, select);
      const alvo = linha.querySelector('.email-gestor') || linha.querySelector('.acoes-lote');
      linha.insertBefore(bloco, alvo || null);
      select.addEventListener('change', filtrarConvocarEstavel);
    }

    const selecionada = select.value;
    const origens = [...new Set(listaConvocar()
      .map(item => String(item.grupoConvocacao || '').trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.replaceChildren();
    const todas = document.createElement('option');
    todas.value = '';
    todas.textContent = 'Todas';
    select.appendChild(todas);
    origens.forEach(origem => {
      const opcao = document.createElement('option');
      opcao.value = origem;
      opcao.textContent = origem;
      select.appendChild(opcao);
    });
    select.value = origens.includes(selecionada) ? selecionada : '';
  }

  function montarFiltroConvocar() {
    const select = document.getElementById('filtroSituacaoConvocar');
    const lista = listaConvocar();
    if (!select || !lista.length) return;
    renderizarFiltro('convocar', lista, select);
    montarFiltroGrupoConvocacaoV15();
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
    const grupoEl = document.getElementById('filtroGrupoConvocacaoV15');
    const grupo = grupoEl ? grupoEl.value || '' : '';

    const filtrados = listaConvocar().filter(item =>
      estado.convocar.has(normalizar(item.situacao)) &&
      (!grupo || item.grupoConvocacao === grupo) &&
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

    const tamanhoLote = 30;
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
        atualizarProgressoLote(lista.length, lista.length, sucesso ? 'Envio finalizado: ' + sucesso + ' enviada(s)' : 'Nenhum e-mail enviado');

        const resumo = Object.keys(motivos)
          .map(motivo => motivo + ': ' + motivos[motivo])
          .join(' | ');

        let texto = sucesso + ' convocação(ões) enviada(s) para ' + emailGestor +
          ', com cópia para thais.tpc@isgh.org.br. ' +
          ignorados + ' ignorado(s). ' + falhas + ' falha(s).';

        if (resumo) texto += ' Motivos: ' + resumo + '.';
        if (sucesso === 0) mostrarErro(texto);
        else mostrarOk(texto);
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


  const ajustesLayout = `
<style>
/* Camada única e final do layout: uma grade estável para os filtros. */
:root{--menu:#0f172a;--menu2:#1e293b;--app:#f3f6fa;--borda:#dce4ee;--azul:#1d4ed8}
body{overflow-x:hidden!important}
.painel-sidebar,.painel-sidebar .abas{border:0!important;outline:0!important;box-shadow:none!important;border-radius:0!important}
.painel-sidebar .abas:focus,.painel-sidebar .abas:focus-within{outline:0!important;box-shadow:none!important}
.painel-topbar{display:grid!important;grid-template-columns:minmax(250px,1fr) auto!important;gap:20px!important;align-items:center!important}
.painel-topbar-status{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important}
.painel-topbar-status .painel-busca-global{display:block!important;flex:1 1 280px!important;width:280px!important;max-width:360px!important;min-width:220px!important;margin:0!important}
.painel-topbar-status .painel-busca-global label{display:block!important;font-size:11px!important;line-height:1.2!important;margin:0 0 4px!important}
.painel-topbar-status .painel-busca-global input{width:100%!important;min-width:0!important;height:40px!important;font-size:13px!important;padding:8px 10px!important}
.painel-topbar-status .painel-sync{font-size:11px!important;line-height:1.25!important;white-space:normal!important;max-width:230px!important}
.painel-topbar-status #loading{font-size:11px!important;white-space:nowrap!important}
.painel-atualizar{height:40px!important;white-space:nowrap!important}

.filtros{position:sticky!important;top:94px!important;z-index:50!important;display:grid!important;
 grid-template-columns:minmax(94px,1.05fr) minmax(64px,.78fr) minmax(74px,.9fr) minmax(60px,.7fr)
 minmax(92px,1.1fr) minmax(115px,1.25fr) minmax(145px,1.65fr) minmax(115px,1.25fr) minmax(132px,1.5fr)!important;
 align-items:end!important;gap:6px!important;width:auto!important;min-width:0!important;margin:16px 20px 0!important;
 padding:12px!important;overflow:visible!important;background:#fff!important;border:1px solid var(--borda)!important;border-radius:12px!important}
.filtros>.painel-topbar-periodo,.painel-topbar-periodo{display:contents!important}
.painel-periodo-atalhos{display:contents!important}
.painel-topbar-periodo .filtro-data-wrap{display:block!important;position:relative!important;width:100%!important;min-width:0!important;flex:none!important;margin:0!important}
.painel-topbar-periodo .filtro-data-wrap>label,#toolbarModulo .linha-filtros label{display:block!important;white-space:normal!important;overflow-wrap:anywhere!important;font-size:11px!important;line-height:1.2!important;margin:0 0 5px!important}
.painel-topbar-periodo .filtro-data-trigger{width:100%!important;min-width:0!important;height:44px!important;min-height:44px!important;padding:8px 9px!important;font-size:12px!important;line-height:1.2!important;white-space:normal!important}
.painel-periodo-atalhos>button{width:100%!important;min-width:0!important;max-width:none!important;min-height:44px!important;height:44px!important;padding:5px 6px!important;font-size:11.5px!important;line-height:1.15!important;white-space:normal!important;overflow-wrap:anywhere!important}
#toolbarModulo,#toolbarModulo .linha-filtros,#toolbarModulo .acoes-lote{display:contents!important}
#toolbarModulo .linha-filtros>div{width:100%!important;min-width:0!important;max-width:none!important;flex:none!important;margin:0!important}
#toolbarModulo .linha-filtros>div:has(#filtroSituacaoConvocar){display:none!important}
#toolbarModulo #filtroSituacaoConvocar{display:none!important}
#toolbarModulo .filtro-situacao-check,#toolbarModulo .situacao-multipla{width:100%!important;min-width:0!important;max-width:none!important;flex:none!important}
#toolbarModulo .filtro-grupo-convocacao-v15{width:100%!important;min-width:0!important;max-width:none!important;flex:none!important}
#toolbarModulo .linha-filtros select,#toolbarModulo .situacao-multipla-botao,#toolbarModulo .filtro-situacao-check-botao,
#toolbarModulo .linha-filtros input{width:100%!important;min-width:0!important;height:44px!important;padding:8px 9px!important;font-size:12px!important;line-height:1.2!important}
#toolbarModulo .acoes-lote button{width:100%!important;min-width:0!important;max-width:none!important;min-height:44px!important;height:44px!important;padding:5px 6px!important;font-size:11.5px!important;line-height:1.15!important;white-space:normal!important;overflow-wrap:anywhere!important}
#toolbarModulo .email-gestor{width:100%!important;min-width:0!important;max-width:none!important}
#toolbarModulo .email-gestor input{width:100%!important}
#toolbarModulo .situacao-multipla:not(.situacao-complementares){display:none!important}
.filtros>.azul,.filtros>.cinza{display:none!important}
#popoverPeriodo{z-index:30000!important}
#popoverPeriodo .periodo-campos{grid-template-columns:repeat(2,minmax(0,1fr))!important}
#popoverPeriodo input{width:100%!important;min-width:0!important}

/* Cabeçalhos preservam os controles de ordenação e mantêm a legenda legível. */
.conteudo .tabela-container{width:100%!important;max-width:100%!important;max-height:none!important;overflow-x:hidden!important;overflow-y:visible!important}
.conteudo table{width:100%!important;min-width:0!important;table-layout:fixed!important}
.conteudo th,.conteudo td{min-width:0!important;max-width:none!important;overflow-wrap:anywhere!important;word-break:normal!important}
.conteudo th.ordenavel{position:relative!important;padding-right:13px!important;white-space:normal!important;line-height:1.2!important;vertical-align:middle!important}
.conteudo th.ordenavel::after{position:absolute!important;right:3px!important;top:50%!important;transform:translateY(-50%)!important;display:inline-block!important;white-space:nowrap!important;margin:0!important;font-size:9px!important}
#tabelaConvocar .tabela-container{max-height:none!important;overflow-x:hidden!important;overflow-y:visible!important}
#tabelaConvocar table{width:100%!important;min-width:0!important;table-layout:fixed!important}
#tabelaConvocar th,#tabelaConvocar td{padding:7px 5px!important;font-size:10.5px!important;line-height:1.28!important}
#tabelaConvocar th{font-size:9.5px!important}
#tabelaConvocar td:nth-child(3){font-size:12px!important;font-weight:600!important;line-height:1.25!important}
#tabelaConvocar td.info-agenda{white-space:normal!important;overflow-wrap:anywhere!important;line-height:1.24!important}
#tabelaConvocar th:nth-child(1),#tabelaConvocar td:nth-child(1){width:2%!important}
#tabelaConvocar th:nth-child(2),#tabelaConvocar td:nth-child(2){width:4%!important}
#tabelaConvocar th:nth-child(3),#tabelaConvocar td:nth-child(3){width:16%!important}
#tabelaConvocar th:nth-child(4),#tabelaConvocar td:nth-child(4){width:9%!important}
#tabelaConvocar th:nth-child(5),#tabelaConvocar td:nth-child(5){width:10%!important}
#tabelaConvocar th:nth-child(6),#tabelaConvocar td:nth-child(6){width:6%!important}
#tabelaConvocar th:nth-child(7),#tabelaConvocar td:nth-child(7){width:7%!important}
#tabelaConvocar th:nth-child(8),#tabelaConvocar td:nth-child(8){width:6%!important}
#tabelaConvocar th:nth-child(9),#tabelaConvocar td:nth-child(9){width:6%!important}
#tabelaConvocar th:nth-child(10),#tabelaConvocar td:nth-child(10){width:7%!important}
#tabelaConvocar th:nth-child(11),#tabelaConvocar td:nth-child(11){width:8%!important}
#tabelaConvocar th:nth-child(12),#tabelaConvocar td:nth-child(12){width:8%!important}
#tabelaConvocar th:nth-child(13),#tabelaConvocar td:nth-child(13){width:3%!important;text-align:center!important}
#tabelaConvocar th:nth-child(14),#tabelaConvocar td:nth-child(14){width:3%!important;text-align:center!important}
#tabelaConvocar th:nth-child(15),#tabelaConvocar td:nth-child(15){width:5%!important;text-align:center!important}
#tabelaFaltosos .tabela-reconvocacao{width:100%!important;min-width:0!important;table-layout:fixed!important}
#tabelaFaltosos .tabela-reconvocacao th,#tabelaFaltosos .tabela-reconvocacao td{padding:7px 5px!important;font-size:10px!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(1),#tabelaFaltosos .tabela-reconvocacao td:nth-child(1){width:3%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(2),#tabelaFaltosos .tabela-reconvocacao td:nth-child(2){width:7%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(3),#tabelaFaltosos .tabela-reconvocacao td:nth-child(3){width:13%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(4),#tabelaFaltosos .tabela-reconvocacao td:nth-child(4){width:10%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(5),#tabelaFaltosos .tabela-reconvocacao td:nth-child(5){width:10%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(6),#tabelaFaltosos .tabela-reconvocacao td:nth-child(6){width:7%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(7),#tabelaFaltosos .tabela-reconvocacao td:nth-child(7){width:10%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(8),#tabelaFaltosos .tabela-reconvocacao td:nth-child(8){width:11%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(9),#tabelaFaltosos .tabela-reconvocacao td:nth-child(9){width:8%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(10),#tabelaFaltosos .tabela-reconvocacao td:nth-child(10){width:5%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(11),#tabelaFaltosos .tabela-reconvocacao td:nth-child(11){width:5%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(12),#tabelaFaltosos .tabela-reconvocacao td:nth-child(12){width:7%!important}
#tabelaFaltosos .tabela-reconvocacao th:nth-child(13),#tabelaFaltosos .tabela-reconvocacao td:nth-child(13){width:4%!important}
@media(max-width:1280px){
 .painel-topbar{grid-template-columns:minmax(220px,1fr) auto!important}
 .painel-topbar-status{flex-wrap:wrap!important}
 .painel-topbar-status .painel-busca-global{width:240px!important;min-width:190px!important}
}
@media(max-width:1100px){
 .filtros{grid-template-columns:repeat(5,minmax(0,1fr))!important}
}
@media(max-width:900px){
 .painel-topbar{position:relative!important;left:auto!important;right:auto!important;height:auto!important;grid-template-columns:1fr!important}
 .painel-topbar-status{flex-wrap:wrap!important}
 .filtros{position:relative!important;top:auto!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;margin:12px!important}
 .conteudo{margin:12px!important}
}
@media(max-width:600px){
 .painel-topbar-status{align-items:stretch!important}
 .painel-topbar-status .painel-busca-global{flex:1 1 100%!important;width:100%!important;max-width:none!important}
 .painel-topbar-status .painel-sync{max-width:none!important}
 .filtros{grid-template-columns:1fr!important}
}
</style>`;

  const complementos = patch + "\n" + visual + "\n" + ajustesFinais + "\n" + ajustesLayout;
  const htmlFinal = htmlBase.includes("</body>")
    ? htmlBase.replace("</body>", complementos + "\n</body>")
    : htmlBase + complementos;

  return HtmlService
    .createHtmlOutput(htmlFinal)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
