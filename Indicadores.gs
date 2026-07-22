/**
 * Regra do indicador:
 * - Considera colaboradores ativos, em férias ou aviso prévio.
 * - Técnicos/tecnólogos de Radiologia não entram na meta de 30 dias.
 *   Eles entram somente nas contagens/listas de ASOs atrasados.
 * - O mês analisado olha os ASOs periódicos que vencem no mês seguinte.
 * - No prazo: ASO realizado com 30 dias ou mais antes do vencimento.
 * - Menos de 30 dias e atrasados ficam detalhados para análise nominal.
 */
function gerarIndicadores(lista) {
  const anoVigente = obterAnoVigente();
  const hojeISO = obterHojeISO();
  const meses = {};
  const analisePorMes = {};
  const atrasadosAtuais = [];

  for (let mes = 1; mes <= 12; mes++) {
    const chave = `${anoVigente}-${String(mes).padStart(2, "0")}`;
    const vencimentoAvaliado = adicionarMeses(`${chave}-01`, 1).substring(0, 7);

    meses[chave] = {
      mesAnalise: chave,
      mes: chave,
      vencimentoAvaliado: vencimentoAvaliado,
      totalFazer: 0,
      feitos30DiasOuMais: 0,
      feitosMenos30Dias: 0,
      atrasados: 0,
      pendenteRealizacao: 0
    };

    analisePorMes[chave] = {
      mesAnalise: chave,
      vencimentoAvaliado: vencimentoAvaliado,
      menos30: [],
      atrasadosRealizadosMes: []
    };
  }

  lista.forEach(c => {
    if (!ehAtivoIndicadorASO(c)) return;
    if (!ehTipoPeriodicoIndicadorASO(c)) return;
    if (!c.periodicidade) return;

    const eventos = obterEventosIndicadorASO(c);
    const radiologia = ehRadiologiaIndicadorASO(c);

    eventos.forEach(evento => {
      const mesVencimento = evento.dataPrevista.substring(0, 7);
      const mesAnalise = adicionarMeses(evento.dataPrevista.substring(0, 7) + "-01", -1).substring(0, 7);
      const classificacao = classificarEventoIndicadorASO(evento);
      const itemAnalise = montarItemAnaliseIndicador(c, evento, mesAnalise, mesVencimento, classificacao);

      if (meses[mesAnalise] && meses[mesAnalise].vencimentoAvaliado === mesVencimento) {
        if (classificacao === "ATRASADO") {
          meses[mesAnalise].atrasados++;
        } else if (!radiologia && classificacao === "NO PRAZO (>=30d)") {
          meses[mesAnalise].totalFazer++;
          meses[mesAnalise].feitos30DiasOuMais++;
        } else if (!radiologia && classificacao === "MENOS DE 30 DIAS") {
          meses[mesAnalise].totalFazer++;
          meses[mesAnalise].feitosMenos30Dias++;
          analisePorMes[mesAnalise].menos30.push(itemAnalise);
        } else if (!radiologia) {
          meses[mesAnalise].pendenteRealizacao++;
        }
      }

      if (classificacao === "ATRASADO" && evento.dataRealizada) {
        const mesRealizacao = evento.dataRealizada.substring(0, 7);
        if (analisePorMes[mesRealizacao]) {
          analisePorMes[mesRealizacao].atrasadosRealizadosMes.push(Object.assign({}, itemAnalise, {
            mesAnalise: mesRealizacao,
            mes: mesRealizacao
          }));
        }
      }

      if (classificacao === "PENDENTE" && evento.dataPrevista < hojeISO) {
        atrasadosAtuais.push(itemAnalise);
      }
    });
  });

  Object.keys(meses).forEach(mes => {
    const i = meses[mes];
    i.totalFazer = Number(i.totalFazer) || 0;
    i.feitos30DiasOuMais = Number(i.feitos30DiasOuMais) || 0;
    i.feitosMenos30Dias = Number(i.feitosMenos30Dias) || 0;
    i.atrasados = Number(i.atrasados) || 0;
    i.pendenteRealizacao = Number(i.pendenteRealizacao) || 0;
    i.percentual = i.totalFazer > 0 ? i.feitos30DiasOuMais / i.totalFazer : 0;
  });

  return {
    ano: anoVigente,
    resumoMensal: Object.values(meses),
    analisePorMes: ordenarAnalisesPorMesIndicador(analisePorMes),
    atrasadosAtuais: ordenarItensAnaliseIndicador(atrasadosAtuais)
  };
}

function obterEventosIndicadorASO(c) {
  const periodicidade = Number(c.periodicidade) || 0;
  if (!periodicidade) return [];

  const dataPenultimo = c.dataPenultimoAso || "";
  const dataUltimo = c.dataUltimoAso || "";
  const eventos = [];

  if (dataPenultimo) {
    const vencimentoPenultimo = adicionarMeses(dataPenultimo, periodicidade);
    if (vencimentoPenultimo) {
      eventos.push({
        origem: "Ciclo anterior",
        dataPrevista: vencimentoPenultimo,
        dataRealizada: dataUltimo || "",
        antecedencia: calcularDiferencaDias(vencimentoPenultimo, dataUltimo)
      });
    }
  }

  if (dataUltimo) {
    const vencimentoUltimo = adicionarMeses(dataUltimo, periodicidade);
    if (vencimentoUltimo) {
      const dataRealizadaCicloAtual = obterDataRealizacaoPosteriorAoUltimoASO(c, dataUltimo);
      eventos.push({
        origem: "Ciclo atual/proximo",
        dataPrevista: vencimentoUltimo,
        dataRealizada: dataRealizadaCicloAtual,
        antecedencia: calcularDiferencaDias(vencimentoUltimo, dataRealizadaCicloAtual)
      });
    }
  }

  return eventos;
}

function obterDataRealizacaoPosteriorAoUltimoASO(c, dataUltimo) {
  const candidatas = [
    c && c.dataAsoRealizadoAgenda ? c.dataAsoRealizadoAgenda : "",
    c && ehAsoRealizado(c) ? c.dataAgendada : ""
  ].filter(Boolean);

  const posteriores = candidatas
    .map(formatarDataISO)
    .filter(data => data && data > dataUltimo)
    .sort();

  return posteriores[0] || "";
}

function classificarEventoIndicadorASO(evento) {
  if (!evento || !evento.dataRealizada) return "PENDENTE";

  if (evento.dataRealizada > evento.dataPrevista) return "ATRASADO";

  const antecedencia = calcularDiferencaDias(evento.dataPrevista, evento.dataRealizada);
  if (antecedencia === null) return "PENDENTE";
  if (antecedencia >= 30) return "NO PRAZO (>=30d)";
  return "MENOS DE 30 DIAS";
}

function anoDaDataISO(dataISO) {
  if (!dataISO) return null;
  return Number(String(dataISO).substring(0, 4));
}

function ehTipoPeriodicoIndicadorASO(c) {
  return normalizarTexto(c && c.tipoExame ? c.tipoExame : "") === "PERIODICO";
}

function ehAtivoIndicadorASO(c) {
  const situacao = normalizarTexto(c && (c.situacaoNorm || c.situacao) ? (c.situacaoNorm || c.situacao) : "");
  return situacao === "ATIVO" || situacao === "FERIAS" || situacao.includes("AVISO");
}

function ehRadiologiaIndicadorASO(c) {
  const funcao = normalizarTexto(c && c.funcao ? c.funcao : "");
  return funcao.includes("RADIOLOGIA") || funcao.includes("RAIOS X");
}

function montarItemAnaliseIndicador(c, evento, mesAnalise, mesVencimento, classificacao) {
  return {
    mes: mesAnalise,
    mesAnalise: mesAnalise,
    vencimentoAvaliado: mesVencimento,
    mat: c.mat,
    nome: c.nome,
    funcao: c.funcao,
    setor: c.setor,
    situacao: c.situacao,
    ciclo: evento.origem,
    dataVencimento: evento.dataPrevista,
    dataVencimentoBR: formatarDataBR(evento.dataPrevista),
    dataLimiteIndicador: adicionarDiasIndicadorASO(evento.dataPrevista, -30),
    dataLimiteIndicadorBR: formatarDataBR(adicionarDiasIndicadorASO(evento.dataPrevista, -30)),
    dataRealizada: evento.dataRealizada || "",
    dataRealizadaBR: formatarDataBR(evento.dataRealizada),
    antecedencia: evento.antecedencia,
    classificacao: classificacao,
    statusAgenda: c.statusAgenda || (evento.dataRealizada ? "ASO Realizado" : "Pendente")
  };
}

function adicionarDiasIndicadorASO(dataISO, dias) {
  const data = dataISOParaDate(dataISO);
  if (!data) return "";
  data.setDate(data.getDate() + Number(dias || 0));
  return Utilities.formatDate(data, CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function ordenarAnalisesPorMesIndicador(analisePorMes) {
  Object.keys(analisePorMes).forEach(mes => {
    analisePorMes[mes].menos30 = ordenarItensAnaliseIndicador(analisePorMes[mes].menos30);
    analisePorMes[mes].atrasadosRealizadosMes = ordenarItensAnaliseIndicador(analisePorMes[mes].atrasadosRealizadosMes);
  });
  return analisePorMes;
}

function ordenarItensAnaliseIndicador(lista) {
  return (lista || []).sort((a, b) => {
    if ((a.dataVencimento || "") !== (b.dataVencimento || "")) return String(a.dataVencimento || "").localeCompare(String(b.dataVencimento || ""));
    return String(a.nome || "").localeCompare(String(b.nome || ""));
  });
}
