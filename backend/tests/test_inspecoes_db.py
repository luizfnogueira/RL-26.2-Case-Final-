import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.core.exceptions import OrdemAtivaExistenteException
from app.db import seed
from app.db.session import get_db
from app.main import app
from app.models.gold import FilaPerdas, UnidadeConsumidora
from app.models.portal import OrdemHistorico, OrdemInspecao
from app.repositories.inspecao_repository import SqlAlchemyOrdemInspecaoRepository
from app.schemas.inspecao import HistoricoOrdem, OrdemInspecaoResponse, StatusOrdem

URL_TESTE = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not URL_TESTE,
    reason="defina TEST_DATABASE_URL para testar a persistência contra o PostgreSQL",
)


@pytest.fixture(scope="module")
def engine():
    engine = create_engine(URL_TESTE, pool_pre_ping=True)
    seed.recarregar_gold(engine, seed.gerar(n_ucs=30, semente=21))
    yield engine
    engine.dispose()


@pytest.fixture
def limpar_ordens(engine):
    with engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE portal.ordens_historico, portal.ordens_inspecao RESTART IDENTITY CASCADE"
        ))


@pytest.fixture
def client(engine, limpar_ordens):
    def override_get_db():
        db = Session(bind=engine, autoflush=False, expire_on_commit=False)
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def corpo(id_uc: str = "UC100001", equipe: str = "Equipe Norte 02") -> dict:
    return {
        "id_uc": id_uc,
        "equipe_responsavel": equipe,
        "data_prevista": "2026-10-22",
        "motivo": "Verificar variação de consumo.",
        "kwh_estimado": 120.0,
        "observacoes": "Suspeita de desvio no ramal.",
    }


def resultado() -> dict:
    return {
        "irregularidade_detectada": True,
        "tipo_irregularidade": "BY-PASS",
        "kwh_recuperado": 120.0,
        "observacoes": "Ligação direta regularizada em campo.",
        "inspetor": "Inspetor de teste",
    }


def test_post_grava_ordem_e_historico_na_mesma_transacao(client, engine):
    response = client.post("/inspecoes", json=corpo())
    assert response.status_code == 201, response.text
    ordem = response.json()

    assert ordem["id_ordem"] >= 1
    assert ordem["status"] == "ABERTA"
    assert ordem["historico"][0]["status_novo"] == "ABERTA"
    assert ordem["historico"][0]["id_historico"] >= 1

    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(OrdemInspecao)) == 1
        assert db.scalar(select(func.count()).select_from(OrdemHistorico)) == 1
        assert db.scalar(select(OrdemInspecao.status)) == "ABERTA"
        assert db.scalar(select(OrdemHistorico.id_ordem)) == ordem["id_ordem"]


def test_get_expoe_ordem_persistida_e_filtros(client, engine):
    primeira = client.post("/inspecoes", json=corpo("UC100001", "Equipe Norte")).json()
    segunda = client.post("/inspecoes", json=corpo("UC100002", "Equipe Sul")).json()
    assert client.patch(f"/inspecoes/{primeira['id_ordem']}", json={"status": "EM_CAMPO"}).status_code == 200

    todas = client.get("/inspecoes")
    assert todas.status_code == 200
    assert todas.json()["total"] == 2
    assert todas.json()["metadados"]["dados_ficticios"] is True

    abertas = client.get("/inspecoes", params={"status": "ABERTA"}).json()
    assert [ordem["id_ordem"] for ordem in abertas["items"]] == [segunda["id_ordem"]]
    assert abertas["contagem_status"] == {"ABERTA": 1, "EM_CAMPO": 1, "CONCLUIDA": 0, "CANCELADA": 0}

    por_uc = client.get("/inspecoes", params={"id_uc": "UC100001"}).json()
    assert [ordem["id_ordem"] for ordem in por_uc["items"]] == [primeira["id_ordem"]]

    mes_atual = datetime.now(timezone.utc).strftime("%Y-%m")
    assert client.get("/inspecoes", params={"periodo_atual": mes_atual}).json()["total"] == 2
    assert client.get("/inspecoes", params={"periodo_atual": "2020-01"}).json()["total"] == 0

    with Session(engine) as db:
        uc = db.get(UnidadeConsumidora, "UC100001")
        assert uc is not None
        por_regiao = client.get(
            "/inspecoes", params={"municipio": uc.municipio, "bairro": uc.bairro}
        ).json()
    assert primeira["id_ordem"] in [ordem["id_ordem"] for ordem in por_regiao["items"]]


def test_post_duplicada_na_mesma_uc_retorna_409(client):
    assert client.post("/inspecoes", json=corpo()).status_code == 201
    response = client.post("/inspecoes", json=corpo("UC100001", "Equipe Sul"))
    assert response.status_code == 409, response.text
    assert response.json()["codigo"] == "ORDEM_ATIVA_EXISTENTE"


def test_post_uc_inexistente_retorna_404(client):
    response = client.post("/inspecoes", json=corpo("UC999999"))
    assert response.status_code == 404, response.text
    assert response.json()["codigo"] == "UC_INEXISTENTE"


def test_patch_conclui_e_persiste_resultado_e_tres_eventos(client, engine):
    criada = client.post("/inspecoes", json=corpo()).json()
    id_ordem = criada["id_ordem"]

    assert client.patch(f"/inspecoes/{id_ordem}", json={"status": "EM_CAMPO"}).status_code == 200
    response = client.patch(
        f"/inspecoes/{id_ordem}",
        json={"status": "CONCLUIDA", "resultado": resultado()},
    )
    assert response.status_code == 200, response.text
    concluida = response.json()
    assert concluida["status"] == "CONCLUIDA"
    assert concluida["resultado"]["irregularidade_detectada"] is True
    assert concluida["resultado"]["tipo_irregularidade"] == "BY-PASS"
    assert [evento["status_novo"] for evento in concluida["historico"]] == [
        "ABERTA", "EM_CAMPO", "CONCLUIDA",
    ]

    recarregada = client.get("/inspecoes", params={"id_uc": "UC100001"}).json()["items"][0]
    assert recarregada["status"] == "CONCLUIDA"
    assert recarregada["resultado"]["kwh_recuperado"] == 120.0
    assert len(recarregada["historico"]) == 3

    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(OrdemHistorico)) == 3
        ultimo = db.scalars(
            select(OrdemHistorico).order_by(OrdemHistorico.id_historico.desc())
        ).first()
        assert ultimo.status_anterior == "EM_CAMPO"
        assert ultimo.status_novo == "CONCLUIDA"


def test_nova_ordem_apos_cancelamento_e_ordenacao_por_criacao(client):
    primeira = client.post("/inspecoes", json=corpo()).json()
    assert client.patch(
        f"/inspecoes/{primeira['id_ordem']}",
        json={"status": "CANCELADA", "justificativa": "Ordem criada em duplicidade."},
    ).status_code == 200

    segunda = client.post("/inspecoes", json=corpo("UC100001", "Equipe Sul"))
    assert segunda.status_code == 201, segunda.text
    assert segunda.json()["id_ordem"] != primeira["id_ordem"]

    ordens = client.get("/inspecoes", params={"id_uc": "UC100001"}).json()["items"]
    assert [ordem["id_ordem"] for ordem in ordens] == [
        segunda.json()["id_ordem"], primeira["id_ordem"],
    ]


def _ordem_em_memoria(id_uc: str = "UC100001") -> tuple[OrdemInspecaoResponse, HistoricoOrdem]:
    agora = datetime.now(timezone.utc)
    ordem = OrdemInspecaoResponse(
        id_ordem=0,
        id_uc=id_uc,
        status=StatusOrdem.ABERTA,
        equipe_responsavel="Equipe Concorrente",
        data_criacao=agora,
    )
    evento = HistoricoOrdem(
        id_ordem=0,
        status_anterior=None,
        status_novo=StatusOrdem.ABERTA,
        data_mudanca=agora,
        justificativa_ou_motivo="Criação concorrente",
    )
    return ordem, evento


def test_indice_unico_parcial_impede_duas_ordens_ativas_no_banco(engine, limpar_ordens):
    barreira = Barrier(2)

    def tentar_salvar() -> str:
        ordem, evento = _ordem_em_memoria()
        with Session(bind=engine, expire_on_commit=False) as db:
            repo = SqlAlchemyOrdemInspecaoRepository(db)
            barreira.wait(timeout=10)
            try:
                repo.salvar(ordem, evento_historico=evento)
                return "gravou"
            except OrdemAtivaExistenteException:
                return "conflito"

    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = [futuro.result() for futuro in [pool.submit(tentar_salvar), pool.submit(tentar_salvar)]]

    assert sorted(resultados) == ["conflito", "gravou"]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(OrdemInspecao)) == 1
        assert db.scalar(select(func.count()).select_from(OrdemHistorico)) == 1


def test_duas_criacoes_simultaneas_pela_api_para_a_mesma_uc(client, engine):
    barreira = Barrier(2)

    def criar(equipe: str) -> tuple[int, str | None]:
        with TestClient(app) as test_client:
            barreira.wait(timeout=10)
            response = test_client.post("/inspecoes", json=corpo("UC100001", equipe))
            codigo = response.json().get("codigo")
            return response.status_code, codigo

    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = [futuro.result() for futuro in [
            pool.submit(criar, "Equipe Norte"), pool.submit(criar, "Equipe Sul"),
        ]]

    assert sorted(status for status, _ in resultados) == [201, 409]
    assert next(codigo for status, codigo in resultados if status == 409) == "ORDEM_ATIVA_EXISTENTE"

    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(OrdemInspecao)) == 1
        assert db.scalar(select(func.count()).select_from(OrdemHistorico)) == 1


def ucs_sem_restricao(engine, quantidade: int) -> list[str]:
    """UCs do seed que aceitam ordem de campo (fora da VALIDACAO_DOCUMENTAL)."""
    documentais = select(FilaPerdas.id_uc).where(FilaPerdas.acao_recomendada == "VALIDACAO_DOCUMENTAL")
    with engine.connect() as conn:
        return list(conn.execute(
            select(UnidadeConsumidora.id_uc)
            .where(UnidadeConsumidora.id_uc.not_in(documentais))
            .order_by(UnidadeConsumidora.id_uc)
            .limit(quantidade)
        ).scalars())


def contar_ordens(engine) -> int:
    with engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM portal.ordens_inspecao")).scalar_one()


def test_lote_cria_todas_as_ordens_com_historico(client, engine):
    ucs = ucs_sem_restricao(engine, 3)
    response = client.post("/inspecoes/lote", json={"ordens": [corpo(uc) for uc in ucs]})
    assert response.status_code == 201, response.text
    dados = response.json()
    assert dados["total"] == 3
    assert [ordem["id_uc"] for ordem in dados["items"]] == ucs
    assert all(ordem["status"] == "ABERTA" and len(ordem["historico"]) == 1 for ordem in dados["items"])
    assert contar_ordens(engine) == 3


@pytest.mark.parametrize("problema, codigo", [
    ("inexistente", "UC_INEXISTENTE"),
    ("ativa", "ORDEM_ATIVA_EXISTENTE"),
    ("repetida", "ORDEM_ATIVA_EXISTENTE"),
])
def test_lote_com_uma_uc_invalida_nao_cria_nenhuma(client, engine, problema, codigo):
    ucs = ucs_sem_restricao(engine, 3)
    if problema == "ativa":
        assert client.post("/inspecoes", json=corpo(ucs[2])).status_code == 201
    ruim = {"inexistente": "UC999999", "ativa": ucs[2], "repetida": ucs[0]}[problema]
    antes = contar_ordens(engine)

    response = client.post("/inspecoes/lote", json={"ordens": [corpo(ucs[0]), corpo(ucs[1]), corpo(ruim)]})

    assert response.status_code == 422, response.text
    erro = response.json()
    assert erro["codigo"] == "LOTE_REJEITADO"
    assert [(f["id_uc"], f["codigo"]) for f in erro["detalhes"]["falhas"]] == [(ruim, codigo)]
    assert contar_ordens(engine) == antes


def test_lote_lista_todas_as_falhas_de_uma_vez(client):
    response = client.post(
        "/inspecoes/lote", json={"ordens": [corpo("UC999998"), corpo("UC999999")]}
    )
    assert response.status_code == 422
    assert [f["id_uc"] for f in response.json()["detalhes"]["falhas"]] == ["UC999998", "UC999999"]


@pytest.mark.parametrize("quantidade", [0, 201])
def test_lote_aceita_de_1_a_200_ordens(client, quantidade):
    response = client.post("/inspecoes/lote", json={"ordens": [corpo()] * quantidade})
    assert response.status_code == 422
    assert response.json()["codigo"] == "DADOS_INVALIDOS"


def test_salvar_varias_desfaz_o_lote_se_o_indice_barrar_uma_ordem(client, engine):
    # Ordem ativa criada entre a validação e a gravação: o índice único barra e nada do lote fica
    livre, ocupada = ucs_sem_restricao(engine, 2)
    assert client.post("/inspecoes", json=corpo(ocupada)).status_code == 201

    with Session(bind=engine, expire_on_commit=False) as db:
        repositorio = SqlAlchemyOrdemInspecaoRepository(db)
        with pytest.raises(OrdemAtivaExistenteException, match=ocupada):
            repositorio.salvar_varias([_ordem_em_memoria(livre), _ordem_em_memoria(ocupada)])

    with engine.connect() as conn:
        assert conn.execute(
            select(func.count()).select_from(OrdemInspecao).where(OrdemInspecao.id_uc == livre)
        ).scalar_one() == 0
