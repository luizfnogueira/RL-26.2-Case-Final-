# RL-26.2-Case-Final-

## Backend

Banco de dados: **PostgreSQL 16+**. A Gold fica no schema `gold` e as ordens do portal no schema `portal`; a recarga da Gold nunca toca no `portal`.

### Pré-requisitos

- Python 3.12+
- PostgreSQL 16+
  - Fedora: `sudo dnf install postgresql-server postgresql && sudo postgresql-setup --initdb && sudo systemctl enable --now postgresql`
  - Ubuntu/Debian: `sudo apt install postgresql`
  - Windows: instalador em postgresql.org
  - macOS: `brew install postgresql@16 && brew services start postgresql@16`

### Instalação

1. Crie o usuário e o banco (Linux: `sudo -u postgres psql`; Windows/macOS: `psql` ou pgAdmin):

   ```sql
   CREATE ROLE vgrid LOGIN PASSWORD 'vgrid';
   CREATE DATABASE vgrid360 OWNER vgrid;
   ```

   No Fedora, libere o login por senha (senão o seed falha com `autenticação do tipo Ident falhou`):

   ```bash
   sudo sed -i -E 's/^(host\s+all\s+all\s+(127\.0\.0\.1\/32|::1\/128)\s+)ident/\1scram-sha-256/' /var/lib/pgsql/data/pg_hba.conf
   sudo systemctl restart postgresql
   ```

2. Instale o backend:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate        # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env             # ajuste DATABASE_URL se mudar usuário, senha ou porta
   ```

3. Carregue os dados fictícios da Gold:

   ```bash
   python -m app.db.seed
   ```

### Rodar

```bash
uvicorn app.main:app --reload
```

Documentação da API em http://localhost:8000/docs.

### Testes

```bash
pytest
```

Para incluir o teste de recarga no banco, defina `TEST_DATABASE_URL` com um banco descartável (ex.: `postgresql+psycopg://vgrid:vgrid@localhost:5432/vgrid360_teste`).
