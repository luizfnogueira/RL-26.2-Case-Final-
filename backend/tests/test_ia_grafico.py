"""Gráfico na conversa: o backend escolhe barras, pizza ou linhas pela forma dos dados (contrato, seção 9)."""
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.ia import RespostaIA
from app.services import grafico_ia, ia_service
from app.services.grafico_ia import (NOTA_LINHAS_SEM_TEMPO, NOTA_PIZZA_NAO_SOMA, NOTA_PIZZA_PARECIDAS,
                                     NOTA_UM_NUMERO, ler_pedido, montar_grafico)
from app.services.ia_service import AgenteReal, obter_agente
from app.services.stubs import exemplo

MUNICIPIOS = [["RECIFE", 182.4], ["OLINDA", 165.1], ["PAULISTA", 158.9], ["JABOATAO DOS GUARARAPES", 171.0]]


def resposta(colunas, linhas, interpretada="Pergunta interpretada"):
    r = exemplo("resposta_ia")
    r.pop("grafico", None)
    r.update(dados={"colunas": colunas, "linhas": linhas}, apresentacao="tabela")
    r["detalhes_tecnicos"]["estrutura_pensamento"]["pergunta_interpretada"] = interpretada
    return r


def grafico(pergunta, colunas, linhas):
    return montar_grafico(pergunta, resposta(colunas, linhas))


@pytest.mark.parametrize("pergunta, esperado", [
    ("Faça um gráfico de barras disso", (True, "barras")),
    ("mostre num grafico de pizza", (True, "pizza")),
    ("Gráfico de linhas da receita mês a mês", (True, "linhas")),
    ("Faz um gráfico?", (True, None)),
    ("Qual o DEC da linha de distribuição ALM-REC-001?", (False, None)),
    ("Qual a receita de P2?", (False, None)),
])
def test_le_o_pedido_de_grafico(pergunta, esperado):
    assert ler_pedido(pergunta) == esperado


# ---------- automático: comparação e série no tempo ----------

def test_p1_p2_numa_linha_vira_barras_verticais_na_ordem_dos_periodos():
    g, _ = grafico("Compare a receita de energia de P1 com P2",
                   ["receita_energia_p1_brl", "receita_energia_p2_brl"], [[2390029.77, 2692351.47]])
    assert (g["tipo"], g["orientacao"], g["eixo"], g["origem"]) == ("barras", "vertical", "periodo", "automatico")
    assert g["categorias"] == ["P1", "P2"] and g["series"][0]["valores"] == [2390029.77, 2692351.47]
    assert g["unidade"] == "brl"


def test_p1_p2_por_classe_vira_barras_agrupadas_ordenadas_pelo_p2():
    g, _ = grafico("Compare P1 e P2 por classe", ["classe", "kwh_p1", "kwh_p2"],
                   [["RURAL", 10.0, 12.0], ["RESIDENCIAL", 90.0, 95.0], ["COMERCIAL", 60.0, 55.0]])
    assert (g["tipo"], g["orientacao"]) == ("barras", "horizontal")
    assert [s["nome"] for s in g["series"]] == ["P1", "P2"]
    assert g["categorias"] == ["RESIDENCIAL", "COMERCIAL", "RURAL"]
    assert g["series"][1]["valores"] == [95.0, 55.0, 12.0] and g["unidade"] == "kwh"


def test_coluna_periodo_com_categoria_vira_p1_e_p2_lado_a_lado():
    g, _ = grafico("Receita por classe em P1 e P2", ["classe", "periodo", "receita_brl"],
                   [["COMERCIAL", "P1", 60.0], ["COMERCIAL", "P2", 55.0], ["RESIDENCIAL", "P1", 90.0],
                    ["RESIDENCIAL", "P2", 95.0]])
    assert g["categorias"] == ["RESIDENCIAL", "COMERCIAL"]
    assert [(s["nome"], s["valores"]) for s in g["series"]] == [("P1", [90.0, 60.0]), ("P2", [95.0, 55.0])]


def test_serie_no_tempo_vira_linhas_em_ordem_e_mes_sem_dado_fica_vazio():
    g, _ = grafico("Receita mês a mês", ["mes_referencia", "receita_energia_brl"],
                   [["2025-09", 3.0], ["2025-07", 1.0], ["2025-08", None], ["2025-10", 4.0]])
    assert (g["tipo"], g["eixo"]) == ("linhas", "tempo")
    assert g["categorias"] == ["2025-07", "2025-08", "2025-09", "2025-10"]
    assert g["series"][0]["valores"] == [1.0, None, 3.0, 4.0]


def test_mes_numerico_ordena_por_numero_e_nao_por_texto():
    g, _ = grafico("DEC por mês em 2025", ["ano", "mes", "dec_horas_uc"],
                   [[2025, m, float(m)] for m in (10, 2, 1, 11, 3)])
    assert g["categorias"] == ["2025/1", "2025/2", "2025/3", "2025/10", "2025/11"]
    assert len(g["series"]) == 1 and g["unidade"] == "h"


def test_varias_cidades_no_tempo_viram_uma_linha_por_cidade_ate_4():
    linhas = [[c, m, v] for c, v in [("A", 5), ("B", 4), ("C", 3), ("D", 2), ("E", 1)] for m in ("2025-07", "2025-08", "2025-09")]
    g, _ = grafico("Receita por município mês a mês", ["municipio", "mes_referencia", "receita_brl"], linhas)
    assert g["tipo"] == "linhas" and [s["nome"] for s in g["series"]] == ["A", "B", "C", "D"]
    assert g["omitidos"] == 1


def test_ranking_sem_pedido_continua_tabela():
    assert grafico("Quais municípios têm maior consumo médio?", ["municipio", "consumo_medio_kwh"], MUNICIPIOS) == (None, None)


# ---------- com pedido ----------

def test_exemplo_das_duas_perguntas_vira_barras_horizontais_do_maior_para_o_menor():
    g, _ = grafico("Agora faça um gráfico de barras mostrando essa diferença",
                   ["municipio", "consumo_medio_kwh"], MUNICIPIOS)
    assert (g["tipo"], g["orientacao"], g["origem"], g["unidade"]) == ("barras", "horizontal", "pedido", "kwh")
    assert g["categorias"] == ["RECIFE", "JABOATAO DOS GUARARAPES", "OLINDA", "PAULISTA"]


def test_ordem_do_sql_e_respeitada_quando_ja_vem_ordenada():
    g, _ = grafico("Gráfico dos municípios com menor consumo", ["municipio", "consumo_kwh"],
                   [["A", 1.0], ["B", 2.0], ["C", 3.0]])
    assert g["categorias"] == ["A", "B", "C"]


def test_barras_param_em_20_e_contam_as_omitidas():
    # Fora de ordem: o gráfico ordena do maior para o menor e corta nas 20 maiores
    g, _ = grafico("gráfico de barras por bairro", ["bairro", "receita_brl"],
                   [[f"B{i}", float(i * 7 % 25)] for i in range(25)])
    assert len(g["categorias"]) == 20 and g["omitidos"] == 5
    assert g["series"][0]["valores"][0] == 24.0 and g["series"][0]["valores"][-1] == 5.0


def test_pizza_de_totais_tem_ate_5_fatias_com_outros_no_fim():
    linhas = [["RESIDENCIAL", 104.1], ["COMERCIAL", 58.9], ["INDUSTRIAL", 31.8], ["RURAL", 10.4],
              ["PODER PUBLICO", 7.6], ["SERVICO PUBLICO", 4.2]]
    g, _ = grafico("gráfico de pizza da receita por classe", ["classe", "receita_energia_brl"], linhas)
    assert g["tipo"] == "pizza" and g["categorias"][-1] == "Outros" and len(g["categorias"]) == 5
    assert g["series"][0]["valores"][-1] == pytest.approx(11.8)


def test_pizza_de_media_vira_barras_com_nota():
    g, _ = grafico("gráfico de pizza do consumo médio", ["municipio", "consumo_medio_kwh"], MUNICIPIOS)
    assert g["tipo"] == "barras" and g["nota"] == NOTA_PIZZA_NAO_SOMA


def test_pizza_com_fatias_parecidas_vira_barras_com_nota():
    g, _ = grafico("pizza da receita por classe", ["classe", "receita_brl"], [["A", 33.0], ["B", 34.0], ["C", 33.5]])
    assert g["tipo"] == "barras" and g["nota"] == NOTA_PIZZA_PARECIDAS


def test_linhas_pedidas_sem_tempo_viram_barras_com_nota():
    g, _ = grafico("gráfico de linhas do consumo por município", ["municipio", "consumo_kwh"], MUNICIPIOS)
    assert g["tipo"] == "barras" and g["nota"] == NOTA_LINHAS_SEM_TEMPO


def test_varios_indicadores_da_mesma_unidade_numa_linha_viram_barras():
    g, _ = grafico("gráfico da receita total e de energia", ["receita_total_brl", "receita_energia_brl"],
                   [[169683458.59, 127262595.65]])
    assert g["categorias"] == ["Receita total", "Receita energia"]


def test_um_numero_so_fica_em_texto_com_nota():
    assert grafico("faça um gráfico do DEC de P2", ["dec_horas_uc"], [[3.2992]]) == (None, NOTA_UM_NUMERO)


def test_resposta_sem_status_ok_nao_tem_grafico():
    r = exemplo("resposta_ia_nao_sei")
    assert montar_grafico("gráfico de barras", r) == (None, None)


# ---------- contrato e ponte ----------

def test_contrato_exige_grafico_junto_com_apresentacao_grafico():
    r = exemplo("resposta_ia_grafico_barras")
    RespostaIA.model_validate(r)
    with pytest.raises(ValidationError):
        RespostaIA.model_validate({**r, "grafico": None})
    with pytest.raises(ValidationError):
        RespostaIA.model_validate({**r, "grafico": {**r["grafico"], "categorias": ["P1"]}})


def test_ponte_acrescenta_o_grafico_na_resposta_do_agente(monkeypatch):
    monkeypatch.setattr(ia_service.interacao_repository, "carregar_historico", lambda db, c: [])
    monkeypatch.setattr(ia_service.interacao_repository, "registrar", lambda *a: None)
    monkeypatch.setattr("app.repositories.gold_metadata.GOLD_SOURCE", "seed")
    agente = AgenteReal(responder=lambda *a, **k: resposta(["municipio", "consumo_medio_kwh"], MUNICIPIOS),
                        executar_sql=lambda sql: None, sessao=nullcontext)
    corpo = agente.perguntar(ia_service.PerguntaIA(pergunta="Faça um gráfico de barras disso"))
    assert corpo["apresentacao"] == "grafico" and corpo["grafico"]["tipo"] == "barras"
    RespostaIA.model_validate(corpo)


def test_erro_ao_montar_o_grafico_so_tira_o_grafico(monkeypatch):
    monkeypatch.setattr(grafico_ia, "montar_grafico", lambda p, r: ({"tipo": "radar"}, None))
    r = resposta(["municipio", "consumo_kwh"], MUNICIPIOS)
    ia_service.acrescentar_grafico("gráfico", r)
    assert "grafico" not in r and r["apresentacao"] == "tabela"


@pytest.mark.parametrize("pergunta, tipo", [("Faça um gráfico de pizza da receita", "pizza"),
                                            ("gráfico de linhas da receita", "linhas"),
                                            ("Me mostra um gráfico de barras", "barras")])
def test_modo_mock_responde_com_um_exemplo_de_cada_tipo(pergunta, tipo):
    app.dependency_overrides[obter_agente] = lambda: ia_service.AgenteMock()
    try:
        corpo = TestClient(app).post("/ia", json={"pergunta": pergunta}).json()
    finally:
        app.dependency_overrides.pop(obter_agente, None)
    assert corpo["apresentacao"] == "grafico" and corpo["grafico"]["tipo"] == tipo
