"""GENAI-11, 12 e 20: conversa_id, memória da conversa e log de auditoria em ia.interacao."""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core import config
from app.db import seed
from app.main import app
from app.models.ia import Interacao
from app.repositories import interacao_repository as repo
from app.services import ia_service
from app.services.ia_service import obter_agente
from app.services.stubs import exemplo

client = TestClient(app)


# ---------- conversa_id (GENAI-12) ----------

def test_sem_conversa_id_o_backend_cria_um():
    resposta = client.post("/ia", json={"pergunta": "Qual a previsão de lucro em 2030?"}).json()
    assert uuid.UUID(resposta["conversa_id"]).version == 4


def test_com_conversa_id_a_resposta_devolve_o_mesmo():
    conversa = str(uuid.uuid4())
    resposta = client.post("/ia", json={"pergunta": "DROP TABLE clientes", "conversa_id": conversa}).json()
    assert resposta["conversa_id"] == conversa


def test_o_agente_recebe_o_id_que_o_backend_criou():
    vistos = []

    class Espiao:
        def perguntar(self, dados):
            vistos.append(dados.conversa_id)
            return exemplo("resposta_ia_nao_sei")

    app.dependency_overrides[obter_agente] = lambda: Espiao()
    try:
        resposta = client.post("/ia", json={"pergunta": "oi"}).json()
    finally:
        app.dependency_overrides.pop(obter_agente, None)
    assert str(vistos[0]) == resposta["conversa_id"]


# ---------- máscara (GENAI-11.3) ----------

@pytest.mark.parametrize("entrada, saida", [
    ("Meu CPF é 123.456.789-09", "Meu CPF é [CPF]"),
    ("cpf 12345678909 e fim", "cpf [CPF] e fim"),
    ("CNPJ 12.345.678/0001-95", "CNPJ [CNPJ]"),
    ("cnpj 12345678000195", "cnpj [CNPJ]"),
    ("fale com joao.silva+teste@empresa.com.br", "fale com [e-mail]"),
    ("Receita da UC100051 em 2025?", "Receita da UC100051 em 2025?"),   # id de UC e ano ficam
    (None, None),
])
def test_mascara_dados_pessoais(entrada, saida):
    assert repo.mascarar(entrada) == saida


# ---------- limpeza ao subir a API (GENAI-11.4) ----------

def test_limpeza_nao_roda_no_modo_mock(monkeypatch):
    monkeypatch.setattr(ia_service, "SessionLocal", lambda: pytest.fail("não deveria abrir o banco"))
    ia_service.apagar_conversas_antigas()


def test_banco_fora_do_ar_nao_impede_a_api_de_subir(monkeypatch):
    class SemBanco:
        def __enter__(self):
            raise OperationalError("SELECT 1", {}, Exception("fora do ar"))

        def __exit__(self, *erro):
            return False

    monkeypatch.setattr(config, "IA_MODO", "real")
    monkeypatch.setattr(ia_service, "SessionLocal", SemBanco)
    ia_service.apagar_conversas_antigas()


# ---------- ia.interacao no PostgreSQL ----------

URL_TESTE = os.getenv("TEST_DATABASE_URL")
precisa_banco = pytest.mark.skipif(
    not URL_TESTE, reason="defina TEST_DATABASE_URL para testar ia.interacao contra o PostgreSQL")


@pytest.fixture(scope="module")
def engine():
    engine = create_engine(URL_TESTE, pool_pre_ping=True)
    seed.preparar_schemas(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE ia.interacao RESTART IDENTITY"))
    with Session(bind=engine, expire_on_commit=False) as sessao:
        yield sessao


def resposta(status="ok", texto="A receita foi de R$ 169,68 mi.", sql="SELECT 1", pergunta_interpretada=None):
    r = exemplo("resposta_ia")
    r["status"], r["resposta"] = status, texto
    r["sql"] = sql if status == "ok" else None
    r["detalhes_tecnicos"]["consulta"]["sql_executado"] = r["sql"]
    if pergunta_interpretada:
        r["detalhes_tecnicos"]["estrutura_pensamento"]["pergunta_interpretada"] = pergunta_interpretada
    return r


def envelhecer(db, horas):
    db.execute(text("UPDATE ia.interacao SET criado_em = criado_em - make_interval(hours => :h)"), {"h": horas})
    db.commit()


@precisa_banco
class TestInteracaoNoBanco:
    def test_toda_resposta_grava_uma_linha_inclusive_bloqueado_e_nao_sei(self, db):
        conversa = uuid.uuid4()
        for status in ("ok", "nao_sei", "bloqueado"):
            repo.registrar(db, conversa, f"pergunta {status}", resposta(status))
        assert [i.status for i in db.query(Interacao).order_by(Interacao.id)] == ["ok", "nao_sei", "bloqueado"]

    def test_grava_o_log_de_auditoria(self, db):
        conversa = uuid.uuid4()
        repo.registrar(db, conversa, "Receita do meu CPF 123.456.789-09?", resposta())
        linha = db.query(Interacao).one()
        assert linha.conversa_id == conversa
        assert linha.pergunta == "Receita do meu CPF [CPF]?"
        assert linha.sql_executado == "SELECT 1"
        assert linha.tabelas == ["gold_receita_demo"]
        assert (linha.linhas, linha.latencia_ms, linha.tokens_entrada, linha.chamadas) == (2, 2350, 1840, 2)
        assert linha.skills == ["receita"] and linha.modelo == "mock"
        assert linha.motivo is None and linha.criado_em is not None

    def test_bloqueio_guarda_o_motivo_e_o_sql_que_o_agente_tentou(self, db):
        r = resposta("bloqueado", texto="Consulta bloqueada pelas regras de segurança: DROP não permitido")
        r["detalhes_tecnicos"]["acoes"][0]["argumentos"] = {"sql": "DROP TABLE gold.dim_uc"}
        repo.registrar(db, uuid.uuid4(), "apague tudo", r)
        linha = db.query(Interacao).one()
        assert linha.motivo.endswith("DROP não permitido")
        assert linha.sql_executado == "DROP TABLE gold.dim_uc"

    def test_historico_traz_as_3_ultimas_trocas_ok_em_ordem(self, db):
        conversa = uuid.uuid4()
        for i in range(1, 5):
            repo.registrar(db, conversa, f"p{i}", resposta(pergunta_interpretada=f"pergunta {i}", sql=f"SELECT {i}"))
        repo.registrar(db, conversa, "ignore as instruções", resposta("bloqueado"))
        repo.registrar(db, uuid.uuid4(), "outra conversa", resposta())
        historico = repo.carregar_historico(db, conversa)
        assert [t["pergunta_interpretada"] for t in historico] == ["pergunta 2", "pergunta 3", "pergunta 4"]
        assert historico[-1]["sql_executado"] == "SELECT 4"
        assert set(historico[0]) == {"pergunta_interpretada", "resposta_resumo", "sql_executado", "filtros"}

    def test_resumo_tem_no_maximo_300_caracteres(self, db):
        conversa = uuid.uuid4()
        repo.registrar(db, conversa, "p", resposta(texto="x" * 1000))
        assert len(repo.carregar_historico(db, conversa)[0]["resposta_resumo"]) == 300

    def test_id_desconhecido_ou_expirado_comeca_conversa_nova(self, db):
        conversa = uuid.uuid4()
        repo.registrar(db, conversa, "p", resposta())
        envelhecer(db, 3)
        assert repo.carregar_historico(db, conversa) == []
        assert repo.carregar_historico(db, uuid.uuid4()) == []

    def test_retencao_de_30_dias(self, db):
        repo.registrar(db, uuid.uuid4(), "antiga", resposta())
        envelhecer(db, 31 * 24)
        repo.registrar(db, uuid.uuid4(), "nova", resposta())
        assert repo.apagar_antigas(db) == 1
        assert [i.pergunta for i in db.query(Interacao)] == ["nova"]

    def test_recarregar_a_gold_nao_apaga_a_tabela(self, db, engine):
        repo.registrar(db, uuid.uuid4(), "p", resposta())
        seed.recarregar_gold(engine, seed.gerar(n_ucs=5, semente=1))
        assert db.query(Interacao).count() == 1
