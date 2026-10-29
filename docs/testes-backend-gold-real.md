# Testes de insight e filtros com `GOLD_SOURCE=real`

## Issue e correção

Os testes envolvidos na issue são `backend/tests/test_insight.py` (insight da receita, B5) e `backend/tests/test_filtros.py` (montagem das listas de filtros pelo service).

Com `GOLD_SOURCE=real`, `metadados_gold` consulta `gold._carga_metadata` para obter a data da exportação. Os testes unitários de insight e filtros usam banco/repositories falsos; nesses cenários não há manifesto real disponível, e a consulta ao banco fazia os testes falharem antes de verificar o comportamento esperado.

A correção substitui `metadados_gold` somente nos testes que usam doubles, fornecendo metadados explícitos de seed. A implementação de produção e `gold_metadata.py` não mudam: com a Gold real, continuam lendo a data de exportação do PostgreSQL.

## Executar

Na pasta `backend`, inicie os serviços se ainda não estiverem ativos:

```bash
docker compose up -d --build
```

Execute os dois arquivos nos modos `seed` e `real`:

```bash
docker compose exec -e GOLD_SOURCE=seed api pytest tests/test_insight.py tests/test_filtros.py
docker compose exec -e GOLD_SOURCE=real api pytest tests/test_insight.py tests/test_filtros.py
```

Para ver os testes individualmente e o motivo de eventuais testes ignorados:

```bash
docker compose exec -e GOLD_SOURCE=real api pytest -v -rs tests/test_insight.py tests/test_filtros.py
```

Os testes devem terminar com código de saída `0`. Os testes de integração com PostgreSQL em `test_filtros.py` são ignorados quando `TEST_DATABASE_URL` não está definida; para executá-los, configure essa variável com uma conexão para um PostgreSQL descartável.
