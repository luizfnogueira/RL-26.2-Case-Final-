# AUTH-b — etapa inicial de Artur

27/10/2026. Escopo desta etapa: base de segurança isolada e testes unitários.

Em 28/10/2026, esta base foi isolada na branch `feat/auth-b`, criada de
`origin/main`, sem o protótipo do Painel Executivo nem as alterações de Operação.
Validação executada: 35 testes de segurança e 8 testes de regressão dos handlers
da API, todos passando.

A atribuição continua com Arthur no `Cronograma_Portal_VEnergy_Grid360-3.pdf`,
versão 5, página 9. As decisões de autenticação estão na página 3. A seção
`/auth` ainda não existe em `docs/api-contract.md`: os corpos HTTP e o formato
público do usuário precisam ser alinhados com Irvin no Par C antes da integração.

## Preparado

- `backend/app/core/security.py`: hash Argon2id com salt aleatório, verificação de
  senha sem remover espaços, emissão HS256 e validação de assinatura/expiração.
- `backend/app/schemas/auth.py`: claims internos `sub`, `perfil`, `iat` e `exp`.
  IDs são opacos, sem escolher antecipadamente a chave da tabela de usuários.
- JWT de 60 minutos; algoritmo aceito fixado em HS256; claims obrigatórios
  validados. Token inválido gera uma exceção interna genérica, sem expor o token.
- Segredo fornecido explicitamente pelo chamador, com mínimo de 32 bytes e sem
  fallback. Na integração, virá de `JWT_SECRET`, gerado aleatoriamente e mantido
  no ambiente privado. A verificação de tamanho não mede entropia.
- Dependências fixadas no `requirements.txt`; testes sem PostgreSQL ou servidor.

## Como validar esta etapa

Dentro de `backend`, usando o ambiente virtual do projeto:

```powershell
./.venv/Scripts/python -m pip install -r requirements.txt
./.venv/Scripts/python -m pytest tests/test_auth_security.py -q
```

## Próxima etapa, quando solicitada

1. Alinhar e registrar o contrato `/auth` com Irvin: entradas, usuário público,
   perfis e códigos de erro, preservando `{access_token, token_type, usuario}`
   previsto no cronograma.
2. Criar `portal.usuarios` e seed explícito de administrador; impedir que o
   cadastro escolha seu próprio perfil. Usuários ficam fora da Gold.
3. Implementar register com convite e e-mail único, login com erro genérico e
   `/auth/me`; adaptar `TokenInvalidoError` ao 401 `{codigo, mensagem}` existente.
4. Integrar `get_current_user`, `AUTH_ENABLED`, `JWT_SECRET` e `INVITE_CODE` no
   ponto central, com testes HTTP e PostgreSQL. A flag só será funcional nessa etapa.

AUTH-b permanece **parcial**. Esta etapa não registra rotas, cria usuários,
altera o banco, habilita proteção global ou implementa o login do frontend.

Referências das bibliotecas: [PyJWT](https://pyjwt.readthedocs.io/en/stable/api.html)
e [argon2-cffi](https://argon2-cffi.readthedocs.io/en/stable/api.html).
