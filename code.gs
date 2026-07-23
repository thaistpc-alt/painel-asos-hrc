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

function incluirArquivoHtml(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
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
    return (window.dadosPortal&&Array.isArray(dadosPortal.examesComplementares))
      ? dadosPortal.examesComplementares
      : [];
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
        aplicarComplementaresSeguro();
      };
      lista.appendChild(label);
    });

    const nomes=situacoes.filter(s=>selecionadasComplementaresSeguro.has(normalizarComplementarSeguro(s)));
    bloco.querySelector('.situacao-multipla-botao').textContent=nomes.length<=2?nomes.join(', '):nomes.slice(0,2).join(', ')+' +'+(nomes.length-2);
    return true;
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
