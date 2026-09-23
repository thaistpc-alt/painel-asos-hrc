# Painel de ASOs — SESMT HRC

Versão em desenvolvimento: **V15**

## Estrutura

- `Portal.gs` — regras de negócio e filas operacionais.
- `PerformanceV13.gs` / `ZZ_PerformanceV13_3.gs` — carregamento modular, cache e contexto compartilhado.
- `BaseDadosV15.gs` — materialização da base e atualização automática.
- `Convocacao.gs` — PDFs, turnos, lotes e envio.
- `Indicadores.gs` — indicador anual.
- `PatchPerformance.html` — carregamento sob demanda.
- `UXV15.html` — interface e produtividade.
- `TestesV13.gs` — regressões históricas e validação V15.
- `ARQUITETURA_V15.md` — documentação completa.

## Regra central

Somente **ASO PERIÓDICO realizado pertencente ao ciclo atual** encerra o ciclo periódico.

A fila Convocar é persistente e separa:
- Pendências anteriores;
- Convocações do período;
- Agendados no período;
- Revisão / exceções.

## Antes de publicar

No Apps Script, executar:

```
validarAntesPublicarV15()
```

Publicar somente com `sucesso: true`.

Depois da validação, instalar uma única vez o atualizador automático:

```
instalarAtualizacaoAutomaticaBaseV15()
```

A base derivada será verificada a cada 15 minutos e só será regravada quando houver alteração real.

## Rollback

- Planilha: `BASE PAINEL ASO SESMT - HRC - BACKUP 2026-09-23`
- Código: branch `snapshot-producao-v14-4-2026-09-22`
