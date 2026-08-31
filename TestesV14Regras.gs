/* =========================================================
   TESTES V14 - regras críticas de convocação
========================================================= */

function validarCenariosCriticosV14() {
  const setembro = diagnosticarPainelV14("2026-09-01", "2026-09-30");
  const outubro = diagnosticarPainelV14("2026-10-01", "2026-10-31");
  const sinteticos = testarRegrasSinteticasV14();

  function item(resultado, mat) {
    return resultado && resultado.matriculasCriticas
      ? resultado.matriculasCriticas[String(mat)] || null
      : null;
  }

  const mat3738Set = item(setembro, "3738");
  const mat3738Out = item(outubro, "3738");
  const mat2644Set = item(setembro, "2644");

  const testes = [
    {
      teste: "3738 - demissional não encerra ciclo",
      sucesso: !!mat3738Set && mat3738Set.encerrouCiclo === false,
      detalhe: mat3738Set
    },
    {
      teste: "3738 - periódico agendado permanece elegível em setembro",
      sucesso: !!mat3738Set && !!mat3738Set.avaliacao && mat3738Set.avaliacao.elegivel === true,
      detalhe: mat3738Set
    },
    {
      teste: "3738 - não é encerrada silenciosamente em outubro",
      sucesso: !!mat3738Out && mat3738Out.encerrouCiclo === false,
      detalhe: mat3738Out
    },
    {
      teste: "2644 - retorno não encerra ciclo periódico",
      sucesso: !!mat2644Set && mat2644Set.encerrouCiclo === false,
      detalhe: mat2644Set
    },
    {
      teste: "Regras sintéticas setembro/outubro",
      sucesso: !!sinteticos && sinteticos.sucesso === true,
      detalhe: sinteticos
    }
  ];

  const resultado = {
    sucesso: testes.every(t => t.sucesso),
    total: testes.length,
    aprovados: testes.filter(t => t.sucesso).length,
    falhas: testes.filter(t => !t.sucesso).map(t => t.teste),
    testes: testes
  };
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
