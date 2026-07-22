# Auditoria de desempenho — Painel de ASOs v12

## Escopo

- Eliminar funções, cálculos e estruturas redundantes.
- Reduzir leituras e processamento das abas `FONTEpainel` e `AGENDA`.
- Padronizar filtros, rótulos, ordem e comportamento entre páginas.
- Reduzir o volume do payload enviado ao navegador.
- Evitar renderizações e filtragens repetidas no DOM.
- Preservar integralmente as regras operacionais do painel.

## Diagnóstico inicial

1. `montarEventosAgendaPorMatricula()` lê todas as linhas e todas as colunas da AGENDA e normaliza cada célula da linha para formar `linhaNorm`. Esse processamento cresce com `linhas × colunas` e é executado durante a carga principal.
2. A mesma carga monta diversas listas por sucessivas chamadas a `filter`, `map` e `sort`, gerando múltiplas passagens sobre a base.
3. `gerarColaboradoresPortal()` duplica todos os objetos de colaboradores no payload, embora boa parte dos campos já esteja presente em outras listas.
4. Os filtros do front-end não seguem uma única estratégia: algumas páginas filtram arrays e renderizam novamente; Prioridade e Vencidos filtram linhas já renderizadas diretamente no DOM.
5. Os campos de pesquisa são semelhantes, mas filtros adicionais e ordem dos controles variam entre páginas.
6. Há cálculos de datas e normalizações repetidos por colaborador e por evento.
7. A invalidação de cache depende apenas da alteração manual de `CACHE_PREFIXO`; `limparCachePortal()` não limpa as chaves vigentes.
8. A interface chama `carregarDados()` automaticamente ao alterar cada data e também pelo botão Filtrar, podendo gerar requisições intermediárias desnecessárias.

## Alterações aplicadas nesta rodada

### Backend

- Memoização das normalizações de texto.
- Memoização das conversões de datas para ISO e formato brasileiro.
- Reaproveitamento da data atual durante a leitura da fonte.
- Novo prefixo de cache da versão 12, impedindo reaproveitamento de objetos da versão anterior.
- Inclusão de funções internas para regressão e medição de carga, disponíveis para uso posterior.

### Front-end

- Inclusão de debounce nos campos de pesquisa para impedir renderizações a cada tecla.
- Padronização inicial de rótulos e placeholders dos filtros.
- Carregamento da camada de desempenho sem reescrever integralmente o arquivo `Index.html`.

## Pontos que permanecem para uma rodada posterior

- Restringir a leitura da AGENDA somente às colunas utilizadas.
- Consolidar a construção das coleções do portal em uma única passagem.
- Reduzir o payload duplicado da aba Colaboradores.
- Migrar Prioridade e Vencidos da filtragem no DOM para filtragem sobre arrays.

## Validação pós-implantação

Por decisão da responsável pelo painel, os testes serão executados após a implantação. Recomenda-se validar:

- Totais do dashboard antes/depois.
- Listas de Convocar, Pendências, Prioridade, Vencidos e Complementares.
- Indicador mensal e detalhes nominais.
- Matrículas curtas, completas e com zeros à esquerda.
- Status ASO REALIZADO, NÃO COMPARECEU, REAGENDOU e CANCELADO.
- Tempo total em carga sem cache e com cache.
- Geração individual, em lote e envio ao gestor.
- Console do navegador e registros de execução do Apps Script.

> Esta versão será implantada sem execução prévia da suíte de regressão, conforme orientação da responsável pelo painel.