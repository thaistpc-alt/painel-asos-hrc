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

## Plano de correção

### Backend

- Criar uma leitura única e restrita das colunas necessárias da AGENDA.
- Detectar cabeçalhos apenas na faixa inicial e processar somente as colunas identificadas.
- Pré-calcular chaves, textos normalizados e flags uma única vez.
- Consolidar a construção das coleções do portal em uma passagem principal.
- Separar payload essencial do payload carregado sob demanda.
- Implementar versão de cache e invalidação efetiva por propriedade.
- Instrumentar duração das etapas críticas.

### Front-end

- Criar configuração única de filtros por página.
- Padronizar ordem: Pesquisar → Situação/Grupo/Setor/Função → ações.
- Padronizar rótulos, placeholder, limpeza e normalização.
- Aplicar debounce aos campos de pesquisa.
- Filtrar sempre sobre arrays, evitando varredura repetida do DOM.
- Renderizar somente a aba ativa e reutilizar resultados quando os filtros não mudarem.

## Validação obrigatória antes da publicação

- Comparar totais do dashboard antes/depois.
- Comparar listas de Convocar, Pendências, Prioridade, Vencidos e Complementares.
- Comparar indicador mensal e detalhes nominais.
- Testar matrículas curtas, completas e com zeros à esquerda.
- Testar status ASO REALIZADO, NÃO COMPARECEU, REAGENDOU e CANCELADO.
- Medir tempo total e tempo por etapa em carga sem cache e com cache.
- Validar geração individual, em lote e envio ao gestor.
- Confirmar ausência de erros no console e no log do Apps Script.

> Nenhuma alteração será integrada à `main` antes da conclusão desses testes.
