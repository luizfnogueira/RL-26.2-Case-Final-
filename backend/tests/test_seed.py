"""B2: dados do seed e convenção de recarga (a Gold nunca toca no schema portal).

Os testes de banco só rodam com TEST_DATABASE_URL apontando para um PostgreSQL descartável,
porque recriam o schema gold. Ex.: TEST_DATABASE_URL=postgresql+psycopg://vgrid:vgrid@localhost:5432/vgrid360_teste
"""
import os
from collections import Counter
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text

from app.db import seed
from app.models import gold

DADOS = seed.gerar(n_ucs=60, semente=7)


def linhas(modelo) -> list[dict]:
    return DADOS[modelo]


def test_mesma_semente_gera_os_mesmos_dados():
    assert seed.gerar(n_ucs=20, semente=1) == seed.gerar(n_ucs=20, semente=1)


def test_historico_de_48_meses_por_uc():
    for modelo in (gold.Leitura, gold.Fatura):
        por_uc = Counter(linha["id_uc"] for linha in linhas(modelo))
        assert set(por_uc.values()) == {48}
    meses = sorted({linha["mes_referencia"] for linha in linhas(gold.Fatura)})
    assert meses[0] == "2022-07" and meses[-1] == "2026-06"


def test_formatos_e_dominios_das_silvers():
    for uc in linhas(gold.UnidadeConsumidora):
        assert uc["id_uc"].startswith("UC") and len(uc["id_uc"]) == 8
        assert len(uc["cpf_cnpj"]) == seed.CLASSES[uc["classe"]][2]
        assert uc["subgrupo_tarifario"] == seed.CLASSES[uc["classe"]][1]
        assert uc["alimentador"][4:7] == seed.REGIOES[uc["municipio"]][0]
    assert {f["bandeira_tarifaria"] for f in linhas(gold.Fatura)} <= set(seed.BANDEIRAS)
    assert {f["status"] for f in linhas(gold.Fatura)} <= {"PAGA", "EM ABERTO"}


def test_um_medidor_ativo_por_uc():
    ativos = Counter(m["id_uc"] for m in linhas(gold.Medidor) if m["status"] == "ATIVO")
    assert len(ativos) == 60 and set(ativos.values()) == {1}


def test_consistencias_das_flags():
    for f in linhas(gold.Fatura):
        assert f["valor_total"] == f["valor_energia"] + f["tributos"]
        assert (f["status"] == "PAGA") == (f["data_pagamento"] is not None)
    for leitura in linhas(gold.Leitura):
        anterior = leitura["leitura_anterior"] or Decimal(0)
        assert abs(leitura["consumo_kwh"] - (leitura["leitura_atual"] - anterior)) <= Decimal("0.05")
        assert leitura["flag_leitura_anterior_ausente"] == (leitura["leitura_anterior"] is None)
    for oc in linhas(gold.OcorrenciaRede):
        assert oc["data_encerramento"] > oc["data_abertura"]


def test_dec_fec_bate_com_as_ocorrencias():
    ocorrencias = Counter()
    minutos = Counter()
    for oc in linhas(gold.OcorrenciaRede):
        chave = (oc["alimentador"], oc["data_abertura"].strftime("%Y-%m"))
        ocorrencias[chave] += 1
        minutos[chave] += oc["duracao_min"]
    for linha in linhas(gold.DecFecAlimentadorMes):
        chave = (linha["alimentador"], linha["mes_referencia"])
        assert linha["interrupcoes"] == ocorrencias[chave]
        assert float(linha["dec"]) == pytest.approx(minutos[chave] / 60 / linha["ucs_total"], abs=1e-4)
        assert float(linha["fec"]) == pytest.approx(ocorrencias[chave] / linha["ucs_total"], abs=1e-4)


URL_TESTE = os.getenv("TEST_DATABASE_URL")


@pytest.mark.skipif(not URL_TESTE, reason="defina TEST_DATABASE_URL para testar contra o PostgreSQL")
def test_recarga_da_gold_preserva_o_portal():
    engine = create_engine(URL_TESTE)
    seed.preparar_schemas(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS portal.teste_preservacao"))
        conn.execute(text("CREATE TABLE portal.teste_preservacao (id int)"))
        conn.execute(text("INSERT INTO portal.teste_preservacao VALUES (1)"))
    try:
        for _ in range(2):
            contagem = seed.recarregar_gold(engine, seed.gerar(n_ucs=15, semente=3))
        with engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM portal.teste_preservacao")).scalar() == 1
            assert conn.execute(text("SELECT count(*) FROM gold.faturas")).scalar() == contagem["faturas"] == 15 * 48
    finally:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS portal.teste_preservacao"))
        engine.dispose()
