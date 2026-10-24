import os
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.exceptions import CenarioStubIndisponivelException
from app.db import seed
from app.db.session import get_db
from app.main import app
from app.models import gold
from app.repositories.candidato_repository import CandidatoFila, ResumoFila
from app.schemas.inspecoes import FiltrosCandidatos
from app.services.candidato_service import CandidatoService
from app.services.stubs import PERIODO_ATUAL as PA

DADOS = seed.gerar(n_ucs=60, semente=21)


class RepositorioFalso:
    def __init__(self) -> None:
        self.chamada: dict = {}

    def consultar(self, **filtros):
        self.chamada = filtros
        return (
            [
                CandidatoFila(
                    id_uc="UC100001",
                    municipio="RECIFE",
                    bairro="BOA VISTA",
                    classe="RESIDENCIAL",
                    alimentador="ALM-REC-001",
                    posicao=1,
                    motivos=["Consumo abaixo da média da classe"],
                    kwh_estimado=Decimal("520.00"),
                    score=Decimal("87.20"),
                    confianca_evidencia="MEDIA",
                    id_ordem_ativa=7,
                )
            ],
            1,
            ResumoFila(
                ucs_analisadas=10,
                ucs_priorizadas=1,
                potencial_recuperacao=Decimal("520.00"),
                ordens_ativas=1,
            ),
        )


class TestServico:
    def test_repassa_filtros_e_monta_contrato(self):
        repo = RepositorioFalso()
        filtros = FiltrosCandidatos(
            periodo_atual=PA,
            municipio="Recife",
            bairro="Boa Vista",
            classe="Residencial",
            page=2,
            page_size=5,
        )

        dados = CandidatoService(repo).listar(filtros)

        assert repo.chamada == {
            "municipio": "Recife",
            "bairro": "Boa Vista",
            "classe": "Residencial",
            "alimentador": None,
            "page": 2,
            "page_size": 5,
        }
        assert dados["page"] == 2
        assert dados["total"] == 1
        assert dados["periodo_referencia"] == PA
        item = dados["items"][0]
        assert item["posicao"] == 1
        assert item["energia_estimada"] == {
            "valor": 520.0, "unidade": "kWh", "periodo_referencia": PA,
        }
        assert item["score"] == 87.2
        assert item["ordem_ativa"] is True and item["id_ordem_ativa"] == 7
        assert dados["resumo"]["potencial_recuperacao"]["valor"] == 520.0
        assert dados["resumo"]["ordens_ativas"]["valor"] == 1
        assert dados["metadados"]["dados_ficticios"] is True

    def test_periodo_fora_do_seed_retorna_422_de_cenario(self):
        filtros = FiltrosCandidatos(periodo_atual="2024-07/2025-06")
        with pytest.raises(CenarioStubIndisponivelException):
            CandidatoService(RepositorioFalso()).listar(filtros)


URL_TESTE = os.getenv("TEST_DATABASE_URL")


@pytest.fixture(scope="module")
def engine():
    engine = create_engine(URL_TESTE, pool_pre_ping=True)
    seed.recarregar_gold(engine, DADOS)
    yield engine
    engine.dispose()


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")
class TestCandidatosNoBanco:
    @pytest.fixture
    def client(self, engine):
        with engine.begin() as conn:
            conn.execute(text(
                "TRUNCATE portal.ordens_historico, portal.ordens_inspecao RESTART IDENTITY CASCADE"
            ))

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

    def get(self, client, **params) -> dict:
        response = client.get(
            "/inspecoes/candidatos", params={"periodo_atual": PA, **params}
        )
        assert response.status_code == 200, response.text
        return response.json()

    @staticmethod
    def _ucs() -> dict[str, dict]:
        return {uc["id_uc"]: uc for uc in DADOS[gold.UnidadeConsumidora]}

    def _esperados(
        self,
        municipio: str | None = None,
        bairro: str | None = None,
        classe: str | None = None,
        alimentador: str | None = None,
    ) -> list[dict]:
        ucs = self._ucs()
        filtros = {
            "municipio": municipio.lower() if municipio else None,
            "bairro": bairro.lower() if bairro else None,
            "classe": classe.lower() if classe else None,
            "alimentador": alimentador.lower() if alimentador else None,
        }
        linhas = []
        for linha in DADOS[gold.FilaPerdas]:
            if linha["status_triagem"] != "ELEGIVEL":
                continue
            uc = ucs[linha["id_uc"]]
            if any(valor is not None and uc[campo].lower() != valor
                   for campo, valor in filtros.items()):
                continue
            linhas.append(linha)
        return sorted(linhas, key=lambda c: (-c["score"], -c["kwh_estimado"], c["id_uc"]))

    def test_ordem_posicao_e_campos_do_contrato(self, client):
        dados = self.get(client)
        esperados = self._esperados()

        assert dados["total"] == len(esperados)
        assert dados["page"] == 1 and dados["page_size"] == 20
        assert dados["periodo_referencia"] == PA
        assert len(dados["items"]) == min(20, len(esperados))
        assert [item["id_uc"] for item in dados["items"]] == [
            linha["id_uc"] for linha in esperados[:20]
        ]
        assert [item["posicao"] for item in dados["items"]] == list(
            range(1, len(dados["items"]) + 1)
        )
        for item in dados["items"]:
            assert item["motivos"]
            assert item["energia_estimada"]["unidade"] == "kWh"
            assert item["energia_estimada"]["periodo_referencia"] == PA
            assert 0 <= item["score"] <= 100
            assert item["confianca_evidencia"] in {"ALTA", "MEDIA", "BAIXA", "INDETERMINADA"}
            assert item["ordem_ativa"] is False
            assert item["id_ordem_ativa"] is None

    def test_so_elegiveis_entram_na_fila(self, client):
        dados = self.get(client, page_size=100)
        inelegiveis = {
            linha["id_uc"] for linha in DADOS[gold.FilaPerdas]
            if linha["status_triagem"] != "ELEGIVEL"
        }
        assert inelegiveis
        assert inelegiveis.isdisjoint(item["id_uc"] for item in dados["items"])

    def test_paginacao_e_posicao_global_apos_filtros(self, client):
        por_municipio: dict[str, list[dict]] = {}
        for linha in self._esperados():
            municipio = self._ucs()[linha["id_uc"]]["municipio"]
            por_municipio.setdefault(municipio, []).append(linha)
        municipio = next(
            nome for nome, linhas in por_municipio.items() if len(linhas) >= 4
        )

        dados = self.get(client, municipio=municipio, page=2, page_size=2)
        esperados = self._esperados(municipio=municipio)

        assert dados["total"] == len(esperados)
        assert [item["id_uc"] for item in dados["items"]] == [
            linha["id_uc"] for linha in esperados[2:4]
        ]
        assert [item["posicao"] for item in dados["items"]] == [3, 4]

        alem_do_fim = self.get(client, municipio=municipio, page=999)
        assert alem_do_fim["items"] == [] and alem_do_fim["total"] == len(esperados)

    def test_filtros_combinam_por_and_e_ignoram_caixa(self, client):
        primeiro = self._esperados()[0]
        uc = self._ucs()[primeiro["id_uc"]]

        dados = self.get(
            client,
            municipio=uc["municipio"].title(),
            bairro=uc["bairro"].title(),
            classe=uc["classe"].title(),
            page_size=100,
        )
        esperados = self._esperados(
            municipio=uc["municipio"], bairro=uc["bairro"], classe=uc["classe"]
        )

        assert dados["total"] == len(esperados) >= 1
        assert all(item["municipio"].lower() == uc["municipio"].lower()
                   and item["bairro"].lower() == uc["bairro"].lower()
                   and item["classe"].lower() == uc["classe"].lower()
                   for item in dados["items"])

    def test_bairro_sem_municipio_retorna_422(self, client):
        response = client.get(
            "/inspecoes/candidatos",
            params={"periodo_atual": PA, "bairro": "BOA VISTA"},
        )
        assert response.status_code == 422
        assert response.json()["codigo"] == "DADOS_INVALIDOS"

    def test_resumo_antes_da_paginacao_e_com_filtros(self, client):
        primeiro = self._esperados()[0]
        uc = self._ucs()[primeiro["id_uc"]]
        esperados = self._esperados(municipio=uc["municipio"])
        ucs_do_municipio = [
            unidade for unidade in DADOS[gold.UnidadeConsumidora]
            if unidade["municipio"].lower() == uc["municipio"].lower()
        ]

        pagina_1 = self.get(client, municipio=uc["municipio"], page=1, page_size=1)
        pagina_2 = self.get(client, municipio=uc["municipio"], page=2, page_size=1)

        assert pagina_1["resumo"] == pagina_2["resumo"]
        assert pagina_1["resumo"]["ucs_analisadas"]["valor"] == len(ucs_do_municipio)
        assert pagina_1["resumo"]["ucs_priorizadas"]["valor"] == len(esperados)
        assert pagina_1["resumo"]["potencial_recuperacao"]["valor"] == pytest.approx(
            float(sum(linha["kwh_estimado"] for linha in esperados))
        )
        assert pagina_1["resumo"]["ordens_ativas"]["valor"] == 0

    def test_indicador_de_ordem_ativa_vem_do_portal(self, client):
        primeiro = self.get(client, page_size=1)["items"][0]

        criada = client.post(
            "/inspecoes",
            json={
                "id_uc": primeiro["id_uc"],
                "equipe_responsavel": "Equipe A1",
                "motivo": "Conferir fila priorizada.",
            },
        )
        assert criada.status_code == 201, criada.text
        id_ordem = criada.json()["id_ordem"]

        ativa = self.get(client, page_size=100)
        item = next(i for i in ativa["items"] if i["id_uc"] == primeiro["id_uc"])
        assert item["ordem_ativa"] is True
        assert item["id_ordem_ativa"] == id_ordem
        assert ativa["resumo"]["ordens_ativas"]["valor"] == 1

        cancelada = client.patch(
            f"/inspecoes/{id_ordem}",
            json={"status": "CANCELADA", "justificativa": "Teste da fila."},
        )
        assert cancelada.status_code == 200, cancelada.text

        sem_ordem = self.get(client, page_size=100)
        item = next(i for i in sem_ordem["items"] if i["id_uc"] == primeiro["id_uc"])
        assert item["ordem_ativa"] is False and item["id_ordem_ativa"] is None
        assert sem_ordem["resumo"]["ordens_ativas"]["valor"] == 0
