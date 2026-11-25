# Regras de negócio do Painel de ASOs

Este documento registra as regras que o código V15 aplica após a revisão. Datas de fórmula são calculadas a partir de `FONTEpainel` e os eventos operacionais vêm da aba `AGENDA`.

## Regras solicitadas

| Tema | Regra implementada |
|---|---|
| Periodicidade | Técnico(a) em Radiologia: 6 meses. Todas as demais funções: 12 meses. A identificação exige função de técnico e referência a Radiologia/Raios X; tecnólogos e outras profissões de Radiologia seguem 12 meses. |
| Vencimento | Último ASO + periodicidade aplicável, com ajuste de fim de mês equivalente a adicionar meses em calendário. |
| Convocação: técnico em Radiologia | 15 dias corridos antes do vencimento. |
| Convocação: demais funções | Último ASO + 10 meses. Para vencimentos em janeiro ou fevereiro, convocação no primeiro dia do próprio mês de vencimento, nunca no ano anterior. |
| Um periódico anual | A periodicidade anual e a regra de convocação acima definem um ciclo por ano para as demais funções. Radiologia técnica permanece semestral. |
| Filtro do período | A lista Agenda e convocação e Exames complementares usa exclusivamente a data de agendamento dentro do período selecionado. Data de convocação ou e-mail enviado não desloca o registro para outro mês. |
| Pendência | Ocorrências periódicas com `Não compareceu ASO`, `Reagendou` ou `Cancelado` podem abrir pendência. ASO demissional realizado encerra qualquer pendência. ASOs admissionais, periódicos, de retorno ao trabalho ou de mudança de risco realizados no ano calendário vigente encerram pendências; não há janela de 90 dias. Técnico(a) em Radiologia precisa completar dois ASOs qualificáveis no ano vigente para encerrar a pendência por essa regra. ASOs realizados em anos anteriores não encerram a pendência atual. |
| Prioridade | Vencimento de hoje até 30 dias, inclusive (0–30). |
| Atrasado | Vencimento anterior a hoje. Separado entre situação `Ativo` e demais situações. |
| E-mails | A convocação inicial envia o PDF ao gestor informado. A reconvocação exige uma nova data registrada na AGENDA e responde na conversa original via `replyAll`; se a conversa original não for localizada ou o destinatário informado não participar dela, o envio é bloqueado. A seleção múltipla processa cada pessoa na respectiva conversa original. A data/hora do envio mais recente é mostrada nas listas. |
| Consulta assistida | Pesquisa nome/matrícula/função/setor e apresenta explicação rastreável às linhas da FONTEpainel e AGENDA. Não envia dados de saúde a um modelo externo. |
| Matrículas duplicadas | A sincronização conserva todas as linhas, sem eleger situação. Registros ambíguos ficam fora das ações e pendências e são identificados na consulta assistida para correção da fonte. |

## Regras operacionais preexistentes que ainda influenciam ações

Estas condições não foram especificadas nas regras novas e ficam destacadas para validação do responsável pelo processo:

- A geração/envio de convocação aceita situação `Ativo` e `Férias`; outras situações são bloqueadas.
- O painel distingue apenas `Ativo` dos demais no agrupamento de atrasados.
- A regra de desempenho dos Indicadores continua classificando realização com pelo menos 30 dias de antecedência como “No prazo”; ela mede desempenho e não altera o vencimento nem a prioridade operacional.
- ASO concluído válido no ciclo atual não recebe uma nova convocação.

## Colunas legadas

`Data limite` permanece no espelho para compatibilidade e recebe a mesma data calculada de convocação. Não representa um prazo adicional. A coluna visível no painel foi renomeada para `Vencimento` e agora aponta para o vencimento calculado.
