"""GENAI-25: agente de insight da Tela 2. O modelo escreve com marcadores; os números vêm da Gold.

Sem gastar tokens: FunctionModel do PydanticAI no lugar do provedor.
"""
import json
from functools import partial

import pytest
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import FunctionModel

from app.ai.insights import escrever_insight
from app.services.insight_service import PREFIXO_TEXTO_ALTERNATIVO, GeradorIA
from tests.test_insight import NOMES, gold_falsa, pedir, usar  # noqa: F401  (gold_falsa é autouse)

BOM = {"titulo": "Preço sustentou a receita",
       "texto": "{recorte}, a receita de energia foi de {receita_energia_base} para {receita_energia_atual}. "
                "O reajuste de {reajuste} somou {efeito_preco}, e o volume ({variacao_volume}) tirou {efeito_volume}."}


def modelo(*saidas, vistas=None):
    """Devolve as saídas em ordem (a última se repete); guarda o prompt de cada chamada."""
    fila = list(saidas)

    def chamar(mensagens, info):
        if vistas is not None:
            vistas.append(mensagens[-1].parts[-1].content)
        saida = fila.pop(0) if len(fila) > 1 else fila[0]
        if isinstance(saida, Exception):
            raise saida
        return ModelResponse(parts=[TextPart(content=json.dumps(saida))])
    return FunctionModel(chamar)


def gerador(*saidas, vistas=None):
    return GeradorIA(escrever=partial(escrever_insight, modelo=modelo(*saidas, vistas=vistas)))


def alternativo(dados):
    return any(o.startswith(PREFIXO_TEXTO_ALTERNATIVO) for o in dados["metadados"]["observacoes"])

@pytest.fixture(autouse=True)
def metadados_do_seed(monkeypatch):
    # Os testes simulam o banco com db=None; com GOLD_SOURCE=real no .env, a leitura do _carga_metadata quebraria.
    monkeypatch.setattr('app.repositories.gold_metadata.GOLD_SOURCE', 'seed')

def test_texto_gerado_usa_os_numeros_da_gold_formatados():
    usar(gerador(BOM))
    dados = pedir().json()
    assert dados["titulo"] == "Preço sustentou a receita"
    assert dados["texto"] == ("No consolidado, a receita de energia foi de R$ 150,0 milhões para R$ 162,0 milhões. "
                              "O reajuste de 11,7% somou R$ 17,0 milhões, e o volume (−3,3%) tirou −R$ 5,0 milhões.")
    assert not alternativo(dados)
    assert [n["nome"] for n in dados["numeros_utilizados"]] == NOMES


@pytest.mark.parametrize("filtros, recorte", [
    ({}, "No consolidado"),
    ({"municipio": "RECIFE"}, "Em Recife"),
    ({"municipio": "RECIFE", "bairro": "BOA VISTA"}, "Em Recife / Boa Vista"),
    ({"classe": "RESIDENCIAL"}, "Em Residencial"),
])
def test_o_modelo_recebe_o_recorte_e_os_periodos(filtros, recorte):
    vistas = []
    usar(gerador(BOM, vistas=vistas))
    pedido = pedir(filtros={"periodo_atual": "2025-07/2026-06", "periodo_comparacao": "2022-07/2023-06", **filtros})
    assert pedido.json()["texto"].startswith(recorte)
    assert f"{{recorte}} = {recorte}" in vistas[0]
    assert "{periodo_atual} = jul/2025 a jun/2026" in vistas[0]
    assert "{periodo_base} = jul/2022 a jun/2023" in vistas[0]


def test_numero_fora_de_marcador_pede_nova_tentativa():
    inventado = {"titulo": "Receita subiu", "texto": "A receita subiu 9,4 milhões."}
    usar(gerador(inventado, BOM))
    dados = pedir().json()
    assert "R$ 17,0 milhões" in dados["texto"] and not alternativo(dados)


def test_marcador_inexistente_pede_nova_tentativa():
    usar(gerador({"titulo": "T", "texto": "Lucro de {lucro}."}, BOM))
    assert not alternativo(pedir().json())


def test_numero_inventado_duas_vezes_vira_texto_alternativo():
    usar(gerador({"titulo": "Alta de 8%", "texto": "Subiu 8%."}))
    response = pedir()
    assert response.status_code == 200
    assert alternativo(response.json()) and "No consolidado" in response.json()["texto"]


def test_falha_do_provedor_vira_texto_alternativo_e_nunca_503():
    usar(gerador(RuntimeError("provedor fora do ar")))
    response = pedir()
    assert response.status_code == 200 and alternativo(response.json())


def test_texto_longo_demais_vira_texto_alternativo():
    usar(gerador({"titulo": "T", "texto": "{efeito_preco} " * 400}))
    assert alternativo(pedir().json())


def test_escrever_insight_falha_quando_o_modelo_insiste_no_erro():
    with pytest.raises(UnexpectedModelBehavior):
        escrever_insight({"efeito_preco": "R$ 1,0 milhões"}, modelo=modelo({"titulo": "T", "texto": "1 2 3"}))



def test_receita_liquida_e_corrigida_para_receita_de_energia():
    com_liquida = {
        "titulo": "Receita líquida subiu",
        "texto": "{recorte}, a receita líquida foi de {receita_energia_base} para {receita_energia_atual}.",
    }
    usar(gerador(com_liquida))
    dados = pedir().json()
    assert not alternativo(dados)
    assert "líquida" not in dados["titulo"].lower()
    assert "líquida" not in dados["texto"].lower()
    assert "receita de energia" in dados["texto"].lower()


def test_sinal_duplo_e_marcador_sem_rotulo_sao_corrigidos():
    com_defeitos = {
        "titulo": "Preço sustentou a receita",
        "texto": "{recorte}, a alta foi impulsionada pelo {efeito_preco}, com retração de {efeito_volume}.",
    }
    usar(gerador(com_defeitos))
    dados = pedir().json()
    assert not alternativo(dados)
    assert "efeito-preço de R$ 17,0 milhões" in dados["texto"]
    assert "retração de R$ 5,0 milhões" in dados["texto"]
    assert "retração de −" not in dados["texto"]


def test_periodos_invertidos_sao_corrigidos():
    invertido = {
        "titulo": "Evolução da receita",
        "texto": "{recorte}, a receita de energia passou de {receita_energia_atual} para {receita_energia_base}.",
    }
    usar(gerador(invertido))
    dados = pedir().json()
    assert not alternativo(dados)
    assert "de R$ 150,0 milhões para R$ 162,0 milhões" in dados["texto"]


def test_escrever_insight_aceita_instrucoes_customizadas_para_v1c():
    saida_uc = {"titulo": "Resumo da UC", "texto": "Consumo médio de {consumo_medio}."}
    res = escrever_insight(
        {"consumo_medio": "250 kWh"},
        modelo=modelo(saida_uc),
        instrucoes="Escreva o resumo da unidade consumidora usando os marcadores.",
    )
    assert res == {"titulo": "Resumo da UC", "texto": "Consumo médio de 250 kWh."}
