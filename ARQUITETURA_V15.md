# Arquitetura V15 — Painel de ASOs SESMT HRC

## 1. Objetivo

A V15 reorganiza o Painel de ASOs para que planilha, painel, PDFs e indicadores compartilhem a mesma regra operacional.

Princípios:

1. dado-fonte fica na planilha;
2. cruzamentos pesados e regras operacionais ficam no Apps Script;
3. resultados derivados usados por outras rotinas são materializados em lote;
4. nenhum colaborador deve desaparecer da fila sem um motivo verificável;
5. somente ASO PERIÓDICO realizado e pertencente ao ciclo atual encerra o ciclo periódico;
6. cache é otimização, nunca fonte de verdade;
7. a interface carrega módulos sob demanda.

---

## 2. Abas da planilha

### FONTEpainel

Fonte cadastral e de acompanhamento.

Campos A:O:
- cadastro e situação funcional;
- histórico básico de ASO;
- periodicidade;
- datas de vencimento/convocação;
- dias para vencer.

Campos P:R são **materializados pelo Apps Script**:
- P — DATA AGENDADA;
- Q — INFORMAÇÕES DA AGENDA;
- R — STATUS GERAL.

Essas colunas não devem voltar a receber `SORT/FILTER/VLOOKUP/IMPORTRANGE` de grande porte.

Campo S:
- CONVOCAÇÃO ENVIADA — marcação resumida de envio pelo painel.

T:U são auxiliares e ficam ocultas.
V:Y são vazias e ficam ocultas.

As fórmulas leves mantidas na FONTEpainel são somente os anchors ARRAYFORMULA de:
- MAT;
- PERIODICIDADE;
- DATA BASE;
- PRÓXIMO VENCIMENTO;
- DATA PARA CONVOCAR;
- DATA LIMITE;
- DIAS PARA VENCER;
- mês;
- ano.

### AGENDA

Espelho da agenda médica. Continua alimentada a partir da fonte institucional.

O painel lê somente as colunas necessárias ao processamento de ASO:
- data;
- tipo de exame;
- matrícula;
- status;
- turno quando necessário ao PDF.

### CONVOCAÇÃO

Modelo estático de PDF.

Não contém IMPORTRANGE/VLOOKUP/XLOOKUP.
O Apps Script preenche:
- nome;
- matrícula;
- função;
- setor;
- data agendada;
- turno do PERIÓDICO na data exata;
- data de emissão.

O local do documento é Juazeiro do Norte.

### GESTORES

Cadastro de gestores usado como lista de sugestões no painel.

Não há roteamento automático setor → gestor porque os nomes dos setores não constituem uma chave normalizada segura. O usuário escolhe/confirma o destinatário.

### BASE_INDICADOR_ASO

Aba técnica oculta e materializada pelo Apps Script.

Não usa fórmula gigante. É reconstruída em lote com as mesmas regras do módulo Indicadores.

### _CONFIG_ASOS

Aba técnica oculta com:
- versão da base;
- origem da AGENDA;
- definição dos campos gerenciados por script;
- data/hora da última atualização;
- quantidade de colaboradores;
- quantidade de pendências;
- linhas do indicador;
- duração da atualização;
- indicação se houve alteração real de dados.

---

## 3. Atualização da base

Arquivo: `BaseDadosV15.gs`

Funções principais:

- `atualizarBasePainelCompletaV15()`
- `instalarAtualizacaoAutomaticaBaseV15()`
- `removerAtualizacaoAutomaticaBaseV15()`

Fluxo:

1. lê FONTEpainel;
2. lê/indexa AGENDA;
3. aplica ocorrências;
4. identifica periódicos realizados;
5. prepara flags;
6. calcula pendências;
7. cria assinatura SHA-256 do estado operacional;
8. compara com a assinatura anterior;
9. se nada mudou, não regrava milhares de células e não invalida cache;
10. se mudou, materializa P:R e BASE_INDICADOR_ASO em lote;
11. atualiza revisão global do cache.

A atualização automática prevista é a cada 15 minutos.

O botão **Atualizar dados** do painel também força reconstrução do contexto e materialização quando necessário.

---

## 4. Regra do ciclo periódico

Funções centrais em `Portal.gs`:

- `dataPertenceAoCicloPeriodicoAtual()`
- `temAsoRealizadoValido()`
- `avaliarElegibilidadeConvocacao()`
- `gerarListaConvocar()`
- `gerarListaRevisaoConvocar()`

### Fecha o ciclo

Somente:
- tipo PERIÓDICO;
- status ASO Realizado;
- evento pertencente ao ciclo periódico atual.

Não fecham automaticamente:
- demissional;
- retorno;
- admissional;
- consulta;
- mudança de risco;
- ASO realizado sem tipo informado.

ASO realizado sem tipo gera **Revisar dados**.

---

## 5. Fila Convocar

A fila é persistente.

Prioridade de classificação no período:

1. **Agendado no período**
   - DATA AGENDADA dentro do filtro.

2. **Convocação do período**
   - DATA PARA CONVOCAR dentro do filtro.

3. **Pendência anterior**
   - DATA PARA CONVOCAR anterior ao início do filtro;
   - ciclo ainda aberto;
   - continua aparecendo mesmo se o agendamento estiver em mês futuro.

Exemplo:
- origem setembro;
- férias em setembro;
- agendado novembro.

Em setembro: Convocação do período.
Em outubro: Pendência anterior.
Em novembro: Agendado no período.
Após periódico válido realizado: sai da fila.

---

## 6. Situação funcional x situação operacional

Situação funcional vem da fonte:
- Ativo;
- Férias;
- afastamentos etc.

Situação operacional é calculada:
- A convocar;
- Agendado;
- Adiado por férias;
- Pendente;
- Revisar dados;
- Realizado.

A lista automática de convocação permanece restrita às situações permitidas pela regra institucional.
Casos não incluídos automaticamente aparecem em **Revisão / exceções**, com motivo.

---

## 7. Pendências

Pendência operacional nasce de:
- Não compareceu ASO;
- Reagendou.

A pendência só é encerrada por **ASO periódico realizado posteriormente**.

Retorno, demissional ou consulta não resolvem uma falta de periódico.

Caso de regressão obrigatório:
- matrícula 1883:
  - falta em 24/07/2026;
  - periódico realizado em 28/07/2026;
  - não deve permanecer em Pendências;
  - Geral deve usar 28/07/2026 como último ASO efetivo.

---

## 8. PDFs

Todos os fluxos usam a mesma lista operacional do painel.

O PDF:
- exige data agendada;
- exige situação permitida;
- não pode ser gerado se o periódico do ciclo já foi realizado;
- NÃO exige que a data agendada esteja no mesmo mês do filtro.

Assim, uma convocação originada em setembro e agendada em outubro pode ser emitida em setembro com a data correta.

Turno:
- é buscado no registro PERIÓDICO;
- tenta primeiro matrícula + data agendada exata;
- não usa consulta/retorno posterior.

Lotes:
- reutilizam uma única aba temporária;
- temporários abandonados com mais de 6 horas são removidos.

---

## 9. Performance

Baseline V14.6:
- carga fria: 19.965 ms.

V14.7:
- carga fria: 2.942 ms.

Melhorias incorporadas à V15:
- FONTE lê A:O + S, sem P:R;
- datas convertidas em JavaScript sem milhares de Utilities.formatDate;
- AGENDA lê somente colunas necessárias;
- eventos por matrícula são consolidados uma vez;
- cache fragmentado usa putAll;
- módulos globais reutilizam cache;
- indicadores são compartilhados entre Dashboard e módulo;
- Geral envia payload projetado, não objetos completos;
- gráfico do Dashboard é secundário/lazy;
- respostas de período antigo são descartadas no navegador;
- atualização automática não regrava a base quando a assinatura não mudou.

---

## 10. Interface V15

Arquivos principais:
- `Index.html` — estrutura funcional histórica;
- `PatchPerformance.html` — loader modular/lazy;
- `UXV15.html` — camada visual e operacional consolidada.

`VisualAdjustmentsV13.html` foi removido.

Melhorias:
- status visível de atualização;
- botão Atualizar bloqueado durante execução;
- Dashboard com cards clicáveis;
- Convocar dividido por grupo operacional;
- seção Revisão / exceções;
- status operacional em chip;
- Geral paginado em 100 registros;
- pesquisa com debounce;
- lista de gestores como sugestão;
- e-mail escolhido é lembrado entre módulos;
- tabelas com fonte mais legível;
- prevenção contra resposta assíncrona de período antigo.

---

## 11. Cache

Cache ativo:
- memória por execução;
- CacheService;
- fallback persistente em ScriptProperties;
- revisão global.

A antiga aba `_CACHE_ASOS_V13` e seu código de fallback foram removidos.

---

## 12. Teste obrigatório antes de publicação

Executar no Apps Script:

`validarAntesPublicarV15()`

Valida:
- atualização/materialização da base;
- estrutura sem fórmulas pesadas;
- modelo de convocação estático;
- fila persistente;
- férias;
- demissional não fechando periódico;
- tipo de exame incompleto;
- matrícula 1883;
- PDF com agendamento em mês futuro;
- consistência P:R;
- performance.

Publicar somente se:
- `sucesso: true`;
- nenhuma regressão de regra;
- carga fria dentro do limite esperado.

---

## 13. Rollback

Antes da reestruturação foi criada a cópia:

`BASE PAINEL ASO SESMT - HRC - BACKUP 2026-09-23`

O snapshot de código de produção V14.4 permanece preservado no GitHub na branch:

`snapshot-producao-v14-4-2026-09-22`

A V15 deve ser validada em implantação de teste antes de substituir a implantação vigente.
