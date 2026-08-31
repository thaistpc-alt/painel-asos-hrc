# Revisão estrutural V14 — Painel de ASOs

## Problema identificado

A lógica anterior misturava critérios diferentes em pontos distintos do fluxo:

- a lista **Convocar** era montada pela `DATA PARA CONVOCAR`;
- a geração da convocação exigia `DATA AGENDADA` dentro do mesmo período;
- qualquer registro com status `ASO Realizado` podia encerrar o ciclo, sem exigir que o tipo fosse `PERIÓDICO`;
- `DATA AGENDADA` e `STATUS DA AGENDA` vinham do último registro geral da AGENDA, inclusive consulta, retorno ou demissional;
- filtros de situação existiam no navegador e no backend com significados diferentes;
- caches por período podiam preservar módulos gerados a partir de revisões de dados diferentes.

Isso permitia que uma pessoa aparecesse em um mês, fosse recusada ao gerar a convocação e depois desaparecesse do mês em que efetivamente estava agendada.

## Regra V14

A V14 separa status funcional de status operacional e usa uma única avaliação de elegibilidade.

Somente **ASO PERIÓDICO + ASO Realizado** encerra o ciclo periódico. Demissional, retorno, admissional e mudança de risco não encerram o ciclo automaticamente.

A fila do período considera:

1. **Convocações do período** — `DATA PARA CONVOCAR` dentro do intervalo.
2. **Agendados no período** — agendamento periódico dentro do intervalo, mesmo que a convocação tenha origem anterior.
3. **Pendências anteriores** — `DATA PARA CONVOCAR` anterior ao período e ciclo ainda não encerrado.
4. **Revisão / exclusões justificadas** — situações fora da fila automática ou registros com dados incompletos, sempre com motivo visível.

Enquanto não houver periódico realizado válido, a pessoa permanece na fila quando `dataConvocar <= fim` ou quando existir agendamento periódico dentro do período.

## Situação funcional

A fila automática considera no servidor:

- Ativo
- Férias

Férias não encerram o ciclo. O status operacional pode ser `Adiado por férias` ou `Adiado por férias — agendado`.

Outras situações ficam na área de revisão com o motivo da exclusão automática.

## Dados incompletos

Tipo de exame vazio não encerra ciclo. O registro recebe aviso de **dados incompletos para revisão**.

## Desempenho

- leitura da FONTEpainel limitada às colunas-base A:O;
- leitura da AGENDA limitada às colunas realmente necessárias;
- contexto global Fonte + Agenda processado uma vez e compartilhado entre módulos;
- cache com revisão global de dados: ao clicar em Atualizar, a revisão muda e todos os módulos passam a usar a mesma base;
- fallback comprimido em PropertiesService;
- geração em lote reutiliza uma única cópia temporária do modelo de convocação;
- limpeza automática de abas `TEMP_CONVOCACAO_*` antigas.

## Casos críticos

### Matrícula 3738

Há `DEMISSIONAL / ASO Realizado` em 07/08/2026 e um `PERIÓDICO` agendado em 01/09/2026. O demissional não encerra o ciclo periódico. A colaboradora deve continuar na fila do periódico.

### Matrícula 2644

Há `RETORNO / ASO Realizado` em 31/07/2026 e posteriormente uma `CONSULTA`. Nenhum desses registros encerra o ciclo periódico.

## Antes de publicar

Executar no Apps Script:

- `testarRegrasSinteticasV14()`
- `diagnosticarPainelV14("2026-09-01", "2026-09-30")`
- `diagnosticarPainelV14("2026-10-01", "2026-10-31")`

Validar visualmente as três seções da aba Convocar e a área de revisão. Só depois criar uma nova implantação/publicação.
