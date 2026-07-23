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
  const ajustesFinais = `
<style>
.filtro-situacao-check{position:relative;width:190px;flex:0 0 190px}
.filtro-situacao-check>label{display:block;font-size:10px;font-weight:600;margin-bottom:4px;color:#334155}
.filtro-situacao-check-botao{width:100%;height:36px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:0 30px 0 10px;text-align:left;color:#0f172a;position:relative;cursor:pointer;font-size:10px}
.filtro-situacao-check-botao:after{content:'▾';position:absolute;right:10px;top:9px;color:#475569}
.filtro-situacao-check-lista{display:none;position:absolute;top:58px;left:0;z-index:9999;width:270px;max-height:300px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 25px rgba(15,23,42,.2);padding:8px}
.filtro-situacao-check.aberto .filtro-situacao-check-lista{display:block}
.filtro-situacao-check-opcao{display:flex!important;align-items:center;gap:8px;padding:6px 5px;margin:0!important;font-size:11px!important;color:#0f172a!important;cursor:pointer}
.filtro-situacao-check-opcao:hover{background:#f1f5f9;border-radius:6px}
.filtro-situacao-check-opcao input{display:inline-block!important;appearance:auto!important;width:14px!important;height:14px!important;min-width:14px!important;margin:0!important;opacity:1!important}
.filtro-situacao-check-opcao.fixa{font-weight:700}
.filtro-situacao-check-opcao.fixa span:after{content:' • fixa';font-size:9px;color:#64748b;font-weight:400}
#filtroSituacaoConvocar{display:none!important}
</style>
<script>
(function(){
  const FIXAS=['ATIVO','FERIAS'];
  const estado={convocar:new Set(FIXAS),complementares:new Set(FIXAS)};
  const norm=v=>String(v||'').trim().toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');

  function dadosConvocar(){return window.dadosPortal&&dadosPortal.convocar&&Array.isArray(dadosPortal.convocar.todos)?dadosPortal.convocar.todos:[];}
  function dadosComplementares(){return window.dadosPortal&&Array.isArray(dadosPortal.examesComplementares)?dadosPortal.examesComplementares:[];}
  function situacoes(lista){return [...new Set((lista||[]).map(i=>i.situacao).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}

  function fecharTodos(exceto){document.querySelectorAll('.filtro-situacao-check.aberto').forEach(el=>{if(el!==exceto)el.classList.remove('aberto');});}
  document.addEventListener('click',()=>fecharTodos(null));

  function resumo(tipo,lista){
    const nomes=situacoes(lista).filter(s=>estado[tipo].has(norm(s)));
    return nomes.length<=2?nomes.join(', '):nomes.slice(0,2).join(', ')+' +'+(nomes.length-2);
  }

  function filtrarConvocarSeguro(){
    if(!window.dadosPortal||!dadosPortal.convocar)return;
    const termo=typeof obterTermoPesquisa==='function'?obterTermoPesquisa('pesquisaConvocar'):'';
    const lista=dadosConvocar().filter(i=>estado.convocar.has(norm(i.situacao))&&(!termo||correspondePesquisa(i,termo)));
    if(typeof renderizarConvocar==='function')renderizarConvocar(lista);
  }

  function filtrarComplementaresSeguro(){
    if(!window.dadosPortal)return;
    const grupo=document.getElementById('filtroGrupoComplementar')?.value||'';
    const termo=typeof obterTermoPesquisa==='function'?obterTermoPesquisa('pesquisaComplementares'):'';
    const lista=dadosComplementares().filter(i=>estado.complementares.has(norm(i.situacao))&&(!grupo||i.grupoComplementar===grupo)&&(!termo||correspondePesquisaComplementar(i,termo)));
    if(typeof renderizarComplementares==='function')renderizarComplementares(lista);
  }

  function criarControle(tipo,lista,referencia,inserirAntes){
    const linha=referencia&&referencia.closest('.linha-filtros');
    if(!linha)return null;
    linha.querySelectorAll('.situacao-multipla,.filtro-situacao-check[data-tipo="'+tipo+'"]')
      .forEach(el=>el.remove());

    const bloco=document.createElement('div');
    bloco.className='filtro-situacao-check';
    bloco.dataset.tipo=tipo;
    bloco.innerHTML='<label>Situação</label><button type="button" class="filtro-situacao-check-botao"></button><div class="filtro-situacao-check-lista"></div>';
    const alvo=inserirAntes||referencia.closest('div');
    linha.insertBefore(bloco,alvo||linha.firstChild);

    const botao=bloco.querySelector('.filtro-situacao-check-botao');
    const caixa=bloco.querySelector('.filtro-situacao-check-lista');
    const opcoes=situacoes(lista);
    opcoes.forEach(s=>{
      const n=norm(s),fixa=FIXAS.includes(n);
      if(fixa)estado[tipo].add(n);
      const label=document.createElement('label');
      label.className='filtro-situacao-check-opcao'+(fixa?' fixa':'');
      const input=document.createElement('input');
      input.type='checkbox';
      input.checked=fixa||estado[tipo].has(n);
      input.disabled=fixa;
      const span=document.createElement('span');
      span.textContent=s;
      label.appendChild(input);label.appendChild(span);caixa.appendChild(label);
      input.addEventListener('change',()=>{
        input.checked?estado[tipo].add(n):estado[tipo].delete(n);
        botao.textContent=resumo(tipo,lista)||'Selecione';
        tipo==='convocar'?filtrarConvocarSeguro():filtrarComplementaresSeguro();
      });
    });
    botao.textContent=resumo(tipo,lista)||'Selecione';
    botao.addEventListener('click',e=>{e.stopPropagation();const abrir=!bloco.classList.contains('aberto');fecharTodos(bloco);bloco.classList.toggle('aberto',abrir);});
    caixa.addEventListener('click',e=>e.stopPropagation());
    return bloco;
  }

  function montarConvocar(){
    const select=document.getElementById('filtroSituacaoConvocar');
    if(!select||!dadosConvocar().length)return;
    criarControle('convocar',dadosConvocar(),select,select.closest('div'));
  }

  function montarComplementares(){
    const grupo=document.getElementById('filtroGrupoComplementar');
    if(!grupo||!dadosComplementares().length)return;
    criarControle('complementares',dadosComplementares(),grupo,grupo.closest('div'));
  }

  function removerPrioridadeComplementares(){
    const tabela=document.querySelector('#tabelaComplementares table');
    if(!tabela)return;
    const ths=[...tabela.querySelectorAll('thead th')];
    const indice=ths.findIndex(th=>norm(th.textContent)==='PRIORIDADE');
    if(indice<0)return;
    tabela.querySelectorAll('tr').forEach(tr=>{if(tr.children[indice])tr.children[indice].remove();});
  }

  function examesComplementaresSelecionados(matriculas){
    const chaves=new Set((matriculas||[]).map(v=>String(v||'').trim()));
    return dadosComplementares().filter(item=>chaves.has(String(item.mat||'').trim())||chaves.has(String(item.matricula||'').trim())||chaves.has(String(item.matriculaCompleta||'').trim()));
  }

  function confirmarExamesComplementares(matriculas){
    const itens=examesComplementaresSelecionados(matriculas);
    if(!itens.length)return true;
    const linhas=itens.map(item=>'• '+(item.nome||'Sem nome')+' — '+(item.grupoComplementar||'Exame complementar')).join('\\n');
    return window.confirm('ATENÇÃO: os colaboradores abaixo necessitam realizar exames complementares antes do ASO:\\n\\n'+linhas+'\\n\\nConfirme se os exames já foram realizados ou providenciados. Deseja continuar com o envio ao gestor?');
  }

  function enviarLoteGestorComCopia(matriculas,emailGestor){
    if(window.loteEmProcessamento){mostrarErro('Já existe uma geração/envio em lote em andamento. Aguarde finalizar.');return;}
    const lista=[...new Set((matriculas||[]).map(String).filter(Boolean))];
    if(!lista.length){mostrarErro('Nenhuma matrícula válida para enviar.');return;}
    if(!confirmarExamesComplementares(lista))return;
    const dataInicio=document.getElementById('dataInicio').value;
    const dataFim=document.getElementById('dataFim').value;
    if(!dataInicio||!dataFim){mostrarErro('Informe a data inicial e a data final.');return;}
    limparMensagens();limparStatusLote();
    const tamanhoLote=10;let indice=0,sucesso=0,ignorados=0,falhas=0;const motivos={};
    window.loteEmProcessamento=true;mostrarLoading(true);
    atualizarProgressoLote(0,lista.length,'Enviando convocações ao gestor');
    lista.forEach(mat=>definirStatusLote(mat,'aguardando-lote','...','Aguardando envio'));
    function proximo(){
      const lote=lista.slice(indice,indice+tamanhoLote);
      if(!lote.length){
        window.loteEmProcessamento=false;mostrarLoading(false);atualizarProgressoLote(lista.length,lista.length,'Envio concluído');
        const resumo=Object.keys(motivos).map(m=>m+': '+motivos[m]).join(' | ');
        let texto=sucesso+' convocação(ões) enviada(s) para '+emailGestor+', com cópia para ${EMAIL_COPIA_CONVOCACOES}. '+ignorados+' ignorado(s). '+falhas+' falha(s).';
        if(resumo)texto+=' Motivos: '+resumo+'.';mostrarOk(texto);return;
      }
      google.script.run.withSuccessHandler(resultados=>{
        (resultados||[]).forEach(r=>{const mat=String(r.matricula||'');if(r.sucesso){sucesso++;definirStatusLote(mat,'ok-lote','@',r.arquivo||'Convocação enviada');}else if(r.ignorado){ignorados++;const motivo=r.motivo||'Ignorado';motivos[motivo]=(motivos[motivo]||0)+1;definirStatusLote(mat,'erro-lote','!',motivo);}else{falhas++;definirStatusLote(mat,'erro-lote','X',r.erro||'Falha ao enviar');}});
        indice+=lote.length;atualizarProgressoLote(Math.min(indice,lista.length),lista.length,'Enviando convocações ao gestor');setTimeout(proximo,300);
      }).withFailureHandler(erro=>{lote.forEach(mat=>definirStatusLote(mat,'erro-lote','X',erro.message||erro));falhas+=lote.length;indice+=lote.length;setTimeout(proximo,600);}).enviarConvocacoesSelecionadasGestorComCopia(lote,emailGestor,dataInicio,dataFim);
    }
    proximo();
  }

  function enviarPendenciaGestorComCopia(mat,dataAnteriorBR){
    if(window.loteEmProcessamento){mostrarErro('Já existe uma geração/envio em lote em andamento. Aguarde finalizar.');return;}
    const emails=typeof obterEmailsGestor==='function'?obterEmailsGestor():[];
    if(!emails.length){mostrarErro('Informe o e-mail do gestor antes de enviar a pendência.');return;}
    if(!confirmarExamesComplementares([mat]))return;
    const dataInicio=document.getElementById('dataInicio').value,dataFim=document.getElementById('dataFim').value;
    limparMensagens();mostrarLoading(true);window.loteEmProcessamento=true;
    google.script.run.withSuccessHandler(resultados=>{window.loteEmProcessamento=false;mostrarLoading(false);const r=(resultados||[])[0]||{};if(r.sucesso){mostrarOk('Nova convocação enviada ao gestor, com cópia para ${EMAIL_COPIA_CONVOCACOES}.');carregarDados(true);}else if(r.ignorado)mostrarErro(r.motivo||'Convocação ignorada.');else mostrarErro(r.erro||'Falha ao enviar nova convocação.');}).withFailureHandler(erro=>{window.loteEmProcessamento=false;mostrarLoading(false);mostrarErro(erro.message||erro);}).enviarReconvocacaoPendenciaGestorComCopia(mat,emails.join('; '),dataInicio,dataFim,dataAnteriorBR);
  }

  const abrirOriginal=window.abrirAba;
  window.abrirAba=function(id,botao){abrirOriginal(id,botao);setTimeout(()=>{if(id==='convocar')montarConvocar();if(id==='complementares'){montarComplementares();removerPrioridadeComplementares();}},30);};
  const tudoOriginal=window.renderizarTudo;
  window.renderizarTudo=function(dados){tudoOriginal(dados);setTimeout(()=>{montarConvocar();montarComplementares();removerPrioridadeComplementares();},30);};
  const renderConvocarOriginal=window.renderizarConvocar;
  window.renderizarConvocar=function(lista){renderConvocarOriginal(lista);setTimeout(montarConvocar,0);};
  const renderComplementaresOriginal=window.renderizarComplementares;
  window.renderizarComplementares=function(lista){renderComplementaresOriginal(lista);setTimeout(()=>{montarComplementares();removerPrioridadeComplementares();},0);};

  window.filtrarConvocacaoPorSituacao=filtrarConvocarSeguro;
  window.filtrarComplementares=filtrarComplementaresSeguro;
  window.enviarLoteGestor=enviarLoteGestorComCopia;
  window.enviarPendenciaGestor=enviarPendenciaGestorComCopia;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{montarConvocar();montarComplementares();removerPrioridadeComplementares();},700));
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
