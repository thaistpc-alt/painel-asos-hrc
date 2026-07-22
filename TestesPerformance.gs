/* =========================================================
   TESTES DE REGRESSÃO E PERFORMANCE - V12
   Execute manualmente no editor do Apps Script.
========================================================= */

function executarTestesV12() {
  const inicio = Date.now();
  const resultados = [];

  function testar(nome, fn) {
    try {
      fn();
      resultados.push({ teste: nome, sucesso: true, erro: "" });
    } catch (e) {
      resultados.push({ teste: nome, sucesso: false, erro: e.message || String(e) });
    }
  }

  function afirmar(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
  }

  testar("normalização remove acentos", function () {
    afirmar(normalizarTexto("  Férias  ") === "FERIAS", "Normalização incorreta");
  });

  testar("normalização é estável", function () {
    const a = normalizarTexto("Não compareceu ASO");
    const b = normalizarTexto("Não compareceu ASO");
    afirmar(a === b && b === "NAO COMPARECEU ASO", "Memoização alterou o resultado");
  });

  testar("data BR para ISO", function () {
    afirmar(formatarDataISO("22/07/2026") === "2026-07-22", "Conversão BR/ISO incorreta");
  });

  testar("data ISO permanece ISO", function () {
    afirmar(formatarDataISO("2026-7-2") === "2026-07-02", "Normalização ISO incorreta");
  });

  testar("data ISO para BR", function () {
    afirmar(formatarDataBR("2026-07-22") === "22/07/2026", "Conversão ISO/BR incorreta");
  });

  testar("comparação de período inclusiva", function () {
    afirmar(noPeriodo("2026-07-01", "2026-07-01", "2026-07-31"), "Data inicial deveria ser incluída");
    afirmar(noPeriodo("2026-07-31", "2026-07-01", "2026-07-31"), "Data final deveria ser incluída");
  });

  testar("diferença de dias", function () {
    afirmar(calcularDiferencaDias("2026-07-31", "2026-07-01") === 30, "Diferença de dias incorreta");
  });

  testar("prioridades preservadas", function () {
    afirmar(definirPrioridade(-1) === "Vencido", "Prioridade vencida incorreta");
    afirmar(definirPrioridade(7) === "Alta", "Prioridade alta incorreta");
    afirmar(definirPrioridade(15) === "Média", "Prioridade média incorreta");
    afirmar(definirPrioridade(30) === "Baixa", "Prioridade baixa incorreta");
  });

  const falhas = resultados.filter(function (r) { return !r.sucesso; });
  const resumo = {
    sucesso: falhas.length === 0,
    total: resultados.length,
    aprovados: resultados.length - falhas.length,
    falhas: falhas.length,
    duracaoMs: Date.now() - inicio,
    resultados: resultados
  };

  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}

function medirCargaPortalV12(dataInicio, dataFim, repeticoes) {
  const total = Math.max(1, Math.min(Number(repeticoes) || 3, 10));
  const medicoes = [];

  for (let i = 0; i < total; i++) {
    const inicio = Date.now();
    const dados = obterDadosPortal(dataInicio, dataFim, i === 0);
    medicoes.push({
      execucao: i + 1,
      duracaoMs: Date.now() - inicio,
      cache: dados && dados.meta ? dados.meta.cache : "",
      colaboradores: dados && dados.dashboard ? dados.dashboard.totalColaboradores : 0,
      convocar: dados && dados.dashboard ? dados.dashboard.totalConvocar : 0,
      pendencias: dados && dados.dashboard ? dados.dashboard.totalFaltosos : 0,
      vencidos: dados && dados.dashboard ? dados.dashboard.totalVencidos : 0
    });
  }

  const duracoes = medicoes.map(function (m) { return m.duracaoMs; });
  const resumo = {
    periodo: dataInicio + " a " + dataFim,
    repeticoes: total,
    primeiraCargaMs: duracoes[0],
    menorMs: Math.min.apply(null, duracoes),
    maiorMs: Math.max.apply(null, duracoes),
    mediaMs: Math.round(duracoes.reduce(function (a, b) { return a + b; }, 0) / duracoes.length),
    medicoes: medicoes
  };

  console.log(JSON.stringify(resumo, null, 2));
  return resumo;
}
