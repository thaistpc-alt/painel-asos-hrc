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
  function montarFiltroSituacaoComplementaresSeguro(){
    const grupo=document.getElementById('filtroGrupoComplementar');
    if(!grupo)return;
    const linha=grupo.closest('.linha-filtros');
    if(!linha||linha.querySelector('.situacao-complementares'))return;
    const dados=(window.dadosPortal&&dadosPortal.examesComplementares)||[];
    const normalizar=v=>String(v||'').trim().toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
    const fixas=['ATIVO','FERIAS'];
    const selecionadas=new Set(fixas);
    const situacoes=[...new Set(dados.map(i=>i.situacao).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const bloco=document.createElement('div');
    bloco.className='situacao-multipla situacao-complementares';
    bloco.innerHTML='<label>Situação</label><button type="button" class="situacao-multipla-botao">Ativo, Férias</button><div class="situacao-multipla-lista"></div>';
    linha.insertBefore(bloco,grupo.closest('div'));
    const lista=bloco.querySelector('.situacao-multipla-lista');
    function aplicar(){
      const grupoValor=grupo.value||'';
      const termo=typeof obterTermoPesquisa==='function'?obterTermoPesquisa('pesquisaComplementares'):'';
      const filtrados=dados.filter(i=>selecionadas.has(normalizar(i.situacao))&&(!grupoValor||i.grupoComplementar===grupoValor)&&(!termo||correspondePesquisaComplementar(i,termo)));
      if(typeof renderizarComplementares==='function')renderizarComplementares(filtrados);
    }
    situacoes.forEach(s=>{
      const n=normalizar(s),fixa=fixas.includes(n),label=document.createElement('label');
      label.className='situacao-opcao'+(fixa?' fixa':'');
      label.innerHTML='<input type="checkbox" '+(fixa?'checked disabled':'')+'><span></span>';
      label.querySelector('span').textContent=s;
      const cb=label.querySelector('input');
      cb.onchange=()=>{cb.checked?selecionadas.add(n):selecionadas.delete(n);aplicar();};
      lista.appendChild(label);
    });
    bloco.querySelector('.situacao-multipla-botao').onclick=()=>bloco.classList.toggle('aberta');
  }
  const abrirAnterior=window.abrirAba;
  window.abrirAba=function(id,botao){
    abrirAnterior(id,botao);
    if(id==='complementares')setTimeout(montarFiltroSituacaoComplementaresSeguro,50);
  };
  document.addEventListener('DOMContentLoaded',()=>setTimeout(montarFiltroSituacaoComplementaresSeguro,500));
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