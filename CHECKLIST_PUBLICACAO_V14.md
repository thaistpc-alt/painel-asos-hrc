# V14 - Checklist de publicação

1. Sincronizar a branch `continuacao-codex-elegibilidade-convocacao` com o projeto Apps Script de teste.
2. Confirmar que `ZZZZ_V14Entry.gs` é carregado após os arquivos V13 existentes.
3. Executar `testarRegrasSinteticasV14()` e exigir `sucesso: true`.
4. Executar `validarCenariosCriticosV14()` e revisar 3738/2644.
5. Executar `medirPerformanceV14()` para setembro e outubro.
6. Abrir a implantação de teste e conferir:
   - Convocações do período;
   - Agendados no período;
   - Pendências anteriores;
   - Revisão / exclusões justificadas;
   - PDF individual;
   - lote de PDFs;
   - envio ao gestor;
   - reconvocação.
7. Conferir que Ativo/Férias são a fila automática e outras situações aparecem justificadas na revisão.
8. Confirmar que demissional/retorno/admissional/mudança de risco não encerram periódico.
9. Confirmar que tipo vazio aparece em revisão e não é excluído silenciosamente.
10. Somente após todos os itens, criar nova versão/implantação. Manter a versão publicada anterior como rollback.
