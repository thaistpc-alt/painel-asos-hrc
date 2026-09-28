/* =========================================================
   TESTES V14 - regras críticas de convocação
========================================================= */

function testarPersistenciaFilaV14_() {
  const base = {
    mat: "TESTE",
    matriculaCompleta: "2000000",
    nome: "TESTE",
    situacao: "Ativo",
    situacaoNorm: "ATIVO",
    tipoExame: "Periódico",
    tipoExameNorm: "PERIODICO",
    dataUltimoAso: "2025-11-01",
    dataConvocar: "2026-09-01",
    dataConvocarBR: "01/09/2026",
    dataLimite: "2026-10-01",
    proximoVencimento: "2026-11-01",
    diasParaVencer: 62,
    dadosIncompletosParaRevisao: []
  };

  const cenarios = [
    {
      nome: "férias em setembro / agendamento em outubro",
      c: Object.assign({}, base, {
        situacao: "Férias",
        situacaoNorm: "FERIAS",
        dataAgendada: "2026-10-10",
        dataAgendadaBR: "10/10/2026",
        statusAgenda: "",
        statusAgendaNorm: "",
        asoPeriodicoRealizadoValido: false
      }),
      setembro: true,
      outubro: true,
      grupoSetembro: "CONVOCACOES_PERIODO",
      grupoOutubro: "AGENDADOS_PERIODO"
    },
    {
      nome: "demissional realizado não encerra o ciclo periódico",
      c: Object.assign({}, base, {
        dataAgendada: "2026-09-10",
        dataAgendadaBR: "10/09/2026",
        statusAgenda: "",
        statusAgendaNorm: "",
        asoPeriodicoRealizadoValido: false,
        eventoQueEncerrouCiclo: null
      }),
      setembro: true,
      outubro: true,
      grupoSetembro: "AGENDADOS_PERIODO",
      grupoOutubro: "PENDENCIAS_ANTERIORES"
    },
    {
      nome: "periódico realizado encerra definitivamente o ciclo",
      c: Object.assign({}, base, {
        dataAgendada: "2026-09-10",
        dataAgendadaBR: "10/09/2026",
        statusAgenda: "ASO Realizado",
        statusAgendaNorm: "ASO REALIZADO",
        asoPeriodicoRealizadoValido: true,
        dataAsoRealizadoAgenda: "2026-09-10",
        dataAsoRealizadoAgendaBR: "10/09/2026",
        eventoQueEncerrouCiclo: {
          data: "2026-09-10",
          dataBR: "10/09/2026",
          tipo: "PERIÓDICO",
          status: "ASO Realizado"
        }
      }),
      setembro: false,
      outubro: false,
      grupoSetembro: null,
      grupoOutubro: null
    }
  ];

  const resultados = cenarios.map(item => {
    const setembro = avaliarElegibilidadeConvocacaoV14_(item.c, "2026-09-01", "2026-09-30");
    const outubro = avaliarElegibilidadeConvocacaoV14_(item.c, "2026-10-01", "2026-10-31");
    const grupoSetembroOk = item.grupoSetembro === null || setembro.grupoConvocacao === item.grupoSetembro;
    const grupoOutubroOk = item.grupoOutubro === null || outubro.grupoConvocacao === item.grupoOutubro;

    return {
      cenario: item.nome,
      setembro: setembro.elegivel,
      esperadoSetembro: item.setembro,
      grupoSetembro: setembro.grupoConvocacao || null,
      esperadoGrupoSetembro: item.grupoSetembro,
      outubro: outubro.elegivel,
      esperadoOutubro: item.outubro,
      grupoOutubro: outubro.grupoConvocacao || null,
      esperadoGrupoOutubro: item.grupoOutubro,
      sucesso:
        setembro.elegivel === item.setembro &&
        outubro.elegivel === item.outubro &&
        grupoSetembroOk &&
        grupoOutubroOk
    };
  });

  return {
    sucesso: resultados.every(r => r.sucesso),
    resultados: resultados
  };
}

function testarFaltaResolvidaPorAsoPosteriorV14_() {
  const contexto = construirContextoPortalV14_(true);
  const colaborador = (contexto.lista || []).find(c =>
    obterChavesMatricula(c.mat, c.matriculaCompleta).includes("1883")
  ) || null;

  const geral = colaborador ? gerarColaboradoresPortal([colaborador])[0] : null;
  const pendenteOperacional = !!((contexto.pendencias && contexto.pendencias.operacionais) || [])
    .find(item => obterChavesMatricula(item.mat, item.matriculaCompleta).includes("1883"));

  const sucesso =
    !!colaborador &&
    !!colaborador.eventoQueEncerrouCiclo &&
    colaborador.eventoQueEncerrouCiclo.data === "2026-07-28" &&
    pendenteOperacional === false &&
    !!geral &&
    geral.dataUltimoAsoBR === "28/07/2026" &&
    geral.proximoVencimentoBR === "28/07/2027" &&
    normalizarTexto(geral.statusAso) !== "EM ATRASO";

  return {
    sucesso: sucesso,
    matricula: "1883",
    eventoQueEncerrouCiclo: colaborador ? colaborador.eventoQueEncerrouCiclo : null,
    apareceComoPendencia: pendenteOperacional,
    exibicaoGeral: geral ? {
      ultimoAso: geral.dataUltimoAsoBR,
      proximoVencimento: geral.proximoVencimentoBR,
      dias: geral.diasStatusAso,
      status: geral.statusAso,
      origemUltimoAso: geral.origemUltimoAso
    } : null
  };
}

function validarCenariosCriticosV14() {
  const setembro = diagnosticarPainelV14("2026-09-01", "2026-09-30");
  const outubro = diagnosticarPainelV14("2026-10-01", "2026-10-31");
  const sinteticos = testarPersistenciaFilaV14_();
  const faltaResolvida = testarFaltaResolvidaPorAsoPosteriorV14_();

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
      teste: "3738 - pendência não desaparece em outubro enquanto o periódico não for realizado",
      sucesso:
        !!mat3738Out &&
        mat3738Out.encerrouCiclo === false &&
        !!mat3738Out.avaliacao &&
        mat3738Out.avaliacao.elegivel === true,
      detalhe: mat3738Out
    },
    {
      teste: "2644 - retorno não encerra ciclo periódico",
      sucesso: !!mat2644Set && mat2644Set.encerrouCiclo === false,
      detalhe: mat2644Set
    },
    {
      teste: "Fila persistente setembro/outubro",
      sucesso: !!sinteticos && sinteticos.sucesso === true,
      detalhe: sinteticos
    },
    {
      teste: "1883 - falta seguida de ASO periódico realizado atualiza a aba Geral",
      sucesso: !!faltaResolvida && faltaResolvida.sucesso === true,
      detalhe: faltaResolvida
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
