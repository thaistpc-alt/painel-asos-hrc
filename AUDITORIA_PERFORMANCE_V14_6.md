# Auditoria de Performance — Painel de ASOs V14.6

## Base auditada

- Repositório: `thaistpc-alt/painel-asos-hrc`
- Base funcional: `correcao-v14-4-falta-aso-posterior`
- Snapshot preservado da produção V14.4 / implantação 101: `snapshot-producao-v14-4-2026-09-22`
- Branch de otimização: `performance-v14-6`

A auditoria considera o fluxo completo do Web App: abertura, Dashboard, módulos sob demanda, leitura da FONTEpainel, leitura/indexação da AGENDA, cache, indicadores, PDF e envio por e-mail.

## Principais gargalos encontrados

### 1. Contexto frio ainda precisa ler Fonte + Agenda

O primeiro acesso sem cache executa:
1. leitura da FONTEpainel;
2. leitura/indexação da AGENDA;
3. consolidação de ocorrências;
4. identificação de ASOs realizados;
5. regras e flags;
6. cálculo de pendências;
7. serialização/compressão do contexto.

Esse é o principal caminho a ser medido no Apps Script. Foi adicionada a função `diagnosticarPerformanceDetalhadaV14_6()` para medir cada etapa separadamente.

### 2. Reprocessamento e ordenações repetidas

A mesma lista de eventos por matrícula era consolidada e ordenada em mais de uma rotina. Pendências ainda repetiam ordenações para localizar último evento e próximo agendamento.

V14.6:
- memoriza a consolidação dos eventos durante a execução;
- ordena somente uma vez por colaborador;
- usa o último item ou `find` em listas já ordenadas;
- evita mapa intermediário duplicado de colaboradores em pendências.

### 3. Cache fragmentado com muitas chamadas

O cache compactado era gravado com um `CacheService.put` por fragmento.

V14.6 usa `putAll` para os fragmentos e grava apenas o manifesto ao final. O prefixo principal e o fallback persistente foram versionados para V14.6, evitando recuperação de contexto antigo.

Módulos que não dependem do período agora possuem cache global:
- Pendências/Faltosos
- Prioridade
- Vencidos
- Geral/Colaboradores
- Indicadores

Convocar e Exames Complementares continuam dependentes do período.

### 4. Indicadores e gráfico eram recalculados em caminhos diferentes

O gráfico do Dashboard e a aba Indicadores podiam recalcular a mesma estrutura anual.

V14.6 cria um resultado compartilhado de indicadores por ano/revisão e o gráfico reutiliza esse resultado.

O Dashboard também já calcula Exames Complementares para exibir a quantidade. Esse resultado agora é guardado no cache do módulo para evitar novo cálculo ao abrir a aba.

### 5. Chamadas concorrentes no navegador

Ao abrir Geral, duas rotinas diferentes podiam solicitar o mesmo módulo `COLABORADORES`.

V14.6 remove a segunda chamada.

O gráfico do Dashboard também iniciava logo após o resumo e podia competir com uma navegação imediata do usuário. Agora ele é carregado de forma secundária, com pequeno atraso, apenas se o usuário ainda estiver no Dashboard.

### 6. PDFs e e-mails

A AGENDA era lida em toda a sua largura para obter apenas data, matrícula e turno.

V14.6 lê apenas D:I.

Em alguns fluxos, uma cópia da aba-modelo de convocação era criada para cada colaborador. V14.6 reutiliza uma única aba temporária por lote e a remove no final.

## Pontos estruturais ainda existentes

### Front-end em camadas

O painel hoje é composto por:
- `Index.html`;
- `PatchPerformance.html`;
- `VisualAdjustmentsV13.html`;
- ajustes adicionais injetados por `code.gs`.

Essa arquitetura funciona, mas acumula wrappers, consultas ao DOM e sobrescritas de funções. Não é recomendável desmontá-la junto com a otimização de backend, porque aumentaria muito o risco de regressão visual.

Recomendação futura: após estabilizar V14.6, consolidar a interface em uma versão V15 com HTML, estilos e JavaScript organizados por responsabilidade, retirando patches legados.

### Fórmulas pesadas na FONTEpainel

As colunas de agenda/status da FONTEpainel ainda executam fórmulas com combinações de `ARRAYFORMULA`, `FILTER`, `SORT` e `VLOOKUP` sobre milhares de linhas da AGENDA.

O painel já lê e interpreta a AGENDA diretamente. A próxima otimização de maior impacto potencial é retirar do caminho crítico do Web App a dependência dessas colunas calculadas e montar `dataAgendada`, informações da agenda e status necessário diretamente em memória.

Essa mudança deve ser realizada somente após a medição da V14.6, porque altera a fonte de verdade desses campos.

### Fallback em ScriptProperties

Existe fallback persistente do contexto em ScriptProperties. Ele é útil quando o CacheService não comporta ou expulsa o contexto, porém trabalha com um objeto grande e pode ficar caro se for acionado com frequência.

A função de diagnóstico permitirá verificar se o contexto normalmente cabe no CacheService. Se couber com folga e o fallback quase nunca for necessário, é possível simplificá-lo numa etapa posterior.

## Validação antes de publicação

Executar no Apps Script:

`validarAntesPublicarV14_6()`

Essa função executa:
- regressão das regras de convocação;
- regressão do caso 1883 (falta seguida de periódico realizado);
- diagnóstico detalhado das etapas de performance.

Somente após resultado funcional `sucesso: true` a branch deve seguir para implantação de teste.

## Critério para a próxima etapa

Usar os tempos de `diagnosticarPerformanceDetalhadaV14_6()`:

- se **Ler FONTEpainel** dominar: atacar fórmulas/colunas P:R e criar leitura-base enxuta;
- se **Ler/indexar AGENDA** dominar: criar índice materializado/atualizado por revisão;
- se **Aplicar ASOs realizados / Gerar pendências** dominar: reduzir ainda mais chaves alternativas e pré-indexar estado por matrícula;
- se **Serializar contexto** dominar: reduzir o objeto armazenado no cache;
- se **Calcular indicadores** dominar: materializar/resumir o indicador por revisão, já parcialmente implementado;
- se o backend estiver rápido mas a interface continuar lenta: consolidar patches do front-end e reduzir renderização de tabelas grandes.
