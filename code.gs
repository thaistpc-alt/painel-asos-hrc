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
      resultados.push({ sucesso: false, ignorado: false, matricula: mat, colaborador: "", erro: "Colaborador não encontrado" });
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
  return enviarConvocacoesSelecionadasGestorComCopia([mat], emailsGestor, dataInicio, dataFim, {
    reconvocacao: true,
    dataAnteriorBR: dataAnteriorBR || "",
    responderThreadId: threadAnterior
  });
}

function doGet() {
  const htmlBase = HtmlService.createHtmlOutputFromFile("Index").getContent();
  const patch = incluirArquivoHtml("PatchPerformance");
  const visual = incluirArquivoHtml("VisualAdjustmentsV13");
  const hotfixComplementares = `
<script>
(function(){
  const FIXAS_COMPLEMENTARES=['ATIVO','FERIAS'];
  let selecionadasComplementaresSeguro=new Set(FIXAS_COMPLEMENTARES);
  const normalizarComplementarSeguro=v=>String(v||'').trim().toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');

  function obterDadosComplementaresSeguro(){
    return (window.dadosPortal&&Array.isArray(dadosPortal.examesComplementares)) ? dadosPortal.examesComplementares : [];
  }

  function aplicarComplementaresSeguro(){
    const dados=obterDadosComplementaresSeguro();
    const grupo=document.getElementById('filtroGrupoComplementar');
    const grupoValor=grupo?grupo.value||'':'';
    const termo=typeof obterTermoPesquisa==='function'?obterTermoPesquisa('pesquisaComplementares'):'';
    const filtrados=dados.filter(i=>
      selecionadasComplementaresSeguro.has(normalizarComplementarSeguro(i.situacao))&&
      (!grupoValor||i.grupoComplementar===grupoValor)&&
      (!termo||correspondePesquisaComplementar(i,termo))
    );
    if(typeof renderizarComplementares==='function')renderizarComplementares(filtrados);
  }

  function montarFiltroSituacaoComplementaresSeguro(){
    const grupo=document.getElementById('filtroGrupoComplementar');
    if(!grupo)return false;
    const linha=grupo.closest('.linha-filtros');
    if(!linha)return false;
    const dados=obterDadosComplementaresSeguro();
    const situacoes=[...new Set(dados.map(i=>i.situacao).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    let bloco=linha.querySelector('.situacao-complementares');

    if(!bloco){
      bloco=document.createElement('div');
      bloco.className='situacao-multipla situacao-complementares';
      bloco.innerHTML='<label>Situação</label><button type="button" class="situacao-multipla-botao">Ativo, Férias</button><div class="situacao-multipla-lista"></div>';
      linha.insertBefore(bloco,grupo.closest('div'));
      bloco.querySelector('.situacao-multipla-botao').onclick=()=>bloco.classList.toggle('aberta');
    }

    const lista=bloco.querySelector('.situacao-multipla-lista');
    const assinatura=situacoes.map(normalizarComplementarSeguro).join('|');
    if(lista.dataset.assinatura===assinatura)return true;
    lista.dataset.assinatura=assinatura;
    lista.innerHTML='';

    situacoes.forEach(s=>{
      const n=normalizarComplementarSeguro(s);
      const fixa=FIXAS_COMPLEMENTARES.includes(n);
      if(fixa)selecionadasComplementaresSeguro.add(n);
      const label=document.createElement('label');
      label.className='situacao-opcao'+(fixa?' fixa':'');
      label.innerHTML='<input type="checkbox" data-normalizada="'+n.replace(/"/g,'&quot;')+'" '+((fixa||selecionadasComplementaresSeguro.has(n))?'checked ':'')+(fixa?'disabled':'')+'><span></span>';
      label.querySelector('span').textContent=s;
      const cb=label.querySelector('input');
      cb.onchange=()=>{
        cb.checked?selecionadasComplementaresSeguro.add(n):selecionadasComplementaresSeguro.delete(n);
        const nomes=situacoes.filter(x=>selecionadasComplementaresSeguro.has(normalizarComplementarSeguro(x)));
        bloco.querySelector('.situacao-multipla-botao').textContent=nomes.length<=2?nomes.join(', '):nomes.slice(0,2).join(', ')+' +'+(nomes.length-2);
        aplicarComplementaresSeguro();
      };
      lista.appendChild(label);
    });

    const nomes=situacoes.filter(s=>selecionadasComplementaresSeguro.has(normalizarComplementarSeguro(s)));
    bloco.querySelector('.situacao-multipla-botao').textContent=nomes.length<=2?nomes.join(', '):nomes.slice(0,2).join(', ')+' +'+(nomes.length-2);
    return true;
  }

  function examesComplementaresSelecionados(matriculas){
    const chaves=new Set((matriculas||[]).map(v=>String(v||'').trim()));
    return obterDadosComplementaresSeguro().filter(item=>
      chaves.has(String(item.mat||'').trim())||
      chaves.has(String(item.matricula||'').trim())||
      chaves.has(String(item.matriculaCompleta||'').trim())
    );
  }

  function confirmarExamesComplementares(matriculas){
    const itens=examesComplementaresSelecionados(matriculas);
    if(!itens.length)return true;
    const linhas=itens.map(item=>'• '+(item.nome||'Sem nome')+' — '+(item.grupoComplementar||'Exame complementar')).join('\\n');
    return window.confirm(
      'ATENÇÃO: os colaboradores abaixo necessitam realizar exames complementares antes do ASO:\\n\\n'+
      linhas+
      '\\n\\nConfirme se os exames já foram realizados ou providenciados. Deseja continuar com o envio ao gestor?'
    );
  }

  function enviarLoteGestorComCopia(matriculas,emailGestor){
    if(window.loteEmProcessamento){mostrarErro('Já existe uma geração/envio em lote em andamento. Aguarde finalizar.');return;}
    const lista=[...new Set((matriculas||[]).map(String).filter(Boolean))];
    if(!lista.length){mostrarErro('Nenhuma matrícula válida para enviar.');return;}
    if(!confirmarExamesComplementares(lista))return;

    const dataInicio=document.getElementById('dataInicio').value;
    const dataFim=document.getElementById('dataFim').value;
    if(!dataInicio||!dataFim){mostrarErro('Informe a data inicial e a data final.');return;}

    limparMensagens();
    limparStatusLote();
    const tamanhoLote=10;
    let indice=0,sucesso=0,ignorados=0,falhas=0;
    const motivos={};
    window.loteEmProcessamento=true;
    mostrarLoading(true);
    atualizarProgressoLote(0,lista.length,'Enviando convocações ao gestor');
    lista.forEach(mat=>definirStatusLote(mat,'aguardando-lote','...','Aguardando envio'));

    function proximo(){
      const lote=lista.slice(indice,indice+tamanhoLote);
      if(!lote.length){
        window.loteEmProcessamento=false;
        mostrarLoading(false);
        atualizarProgressoLote(lista.length,lista.length,'Envio concluído');
        const resumo=Object.keys(motivos).map(m=>m+': '+motivos[m]).join(' | ');
        let texto=sucesso+' convocação(ões) enviada(s) para '+emailGestor+', com cópia para ${EMAIL_COPIA_CONVOCACOES}. '+ignorados+' ignorado(s). '+falhas+' falha(s).';
        if(resumo)texto+=' Motivos: '+resumo+'.';
        mostrarOk(texto);
        return;
      }
      google.script.run
        .withSuccessHandler(resultados=>{
          (resultados||[]).forEach(r=>{
            const mat=String(r.matricula||'');
            if(r.sucesso){sucesso++;definirStatusLote(mat,'ok-lote','@',r.arquivo||'Convocação enviada');}
            else if(r.ignorado){ignorados++;const motivo=r.motivo||'Ignorado';motivos[motivo]=(motivos[motivo]||0)+1;definirStatusLote(mat,'erro-lote','!',motivo);}
            else{falhas++;definirStatusLote(mat,'erro-lote','X',r.erro||'Falha ao enviar');}
          });
          indice+=lote.length;
          atualizarProgressoLote(Math.min(indice,lista.length),lista.length,'Enviando convocações ao gestor');
          setTimeout(proximo,300);
        })
        .withFailureHandler(erro=>{
          lote.forEach(mat=>definirStatusLote(mat,'erro-lote','X',erro.message||erro));
          falhas+=lote.length;indice+=lote.length;
          atualizarProgressoLote(Math.min(indice,lista.length),lista.length,'Continuando após falha do lote');
          setTimeout(proximo,600);
        })
        .enviarConvocacoesSelecionadasGestorComCopia(lote,emailGestor,dataInicio,dataFim);
    }
    proximo();
  }

  function enviarPendenciaGestorComCopia(mat,dataAnteriorBR){
    if(window.loteEmProcessamento){mostrarErro('Já existe uma geração/envio em lote em andamento. Aguarde finalizar.');return;}
    const emails=typeof obterEmailsGestor==='function'?obterEmailsGestor():[];
    if(!emails.length){mostrarErro('Informe o e-mail do gestor antes de enviar a pendência.');return;}
    const invalidos=emails.filter(email=>!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email));
    if(invalidos.length){mostrarErro('E-mail(s) inválido(s): '+invalidos.join(', '));return;}
    if(!confirmarExamesComplementares([mat]))return;
    const dataInicio=document.getElementById('dataInicio').value;
    const dataFim=document.getElementById('dataFim').value;
    if(!dataInicio||!dataFim){mostrarErro('Informe a data inicial e a data final.');return;}

    limparMensagens();mostrarLoading(true);window.loteEmProcessamento=true;
    google.script.run
      .withSuccessHandler(resultados=>{
        window.loteEmProcessamento=false;mostrarLoading(false);
        const r=(resultados||[])[0]||{};
        if(r.sucesso){mostrarOk('Nova convocação enviada ao gestor, com cópia para ${EMAIL_COPIA_CONVOCACOES}.');carregarDados(true);}
        else if(r.ignorado)mostrarErro(r.motivo||'Convocação ignorada.');
        else mostrarErro(r.erro||'Falha ao enviar nova convocação.');
      })
      .withFailureHandler(erro=>{window.loteEmProcessamento=false;mostrarLoading(false);mostrarErro(erro.message||erro);})
      .enviarReconvocacaoPendenciaGestorComCopia(mat,emails.join('; '),dataInicio,dataFim,dataAnteriorBR);
  }

  const abrirAnterior=window.abrirAba;
  window.abrirAba=function(id,botao){
    abrirAnterior(id,botao);
    if(id==='complementares'){
      setTimeout(montarFiltroSituacaoComplementaresSeguro,50);
      setTimeout(montarFiltroSituacaoComplementaresSeguro,500);
    }
  };

  const renderAnterior=window.renderizarComplementares;
  window.renderizarComplementares=function(lista){
    if(typeof renderAnterior==='function')renderAnterior(lista);
    setTimeout(montarFiltroSituacaoComplementaresSeguro,0);
  };

  window.enviarLoteGestor=enviarLoteGestorComCopia;
  window.enviarPendenciaGestor=enviarPendenciaGestorComCopia;

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(montarFiltroSituacaoComplementaresSeguro,500);
    setTimeout(montarFiltroSituacaoComplementaresSeguro,1500);
  });
})();
</script>`;
  const complementos = patch + "\n" + visual + "\n" + hotfixComplementares;
  const htmlFinal = htmlBase.includes("</body>")
    ? htmlBase.replace("</body>", complementos + "\n</body>")
    : htmlBase + complementos;

  return HtmlService
    .createHtmlOutput(htmlFinal)
    .setTitle("PAINEL DE ASOS - SESMT HRC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
