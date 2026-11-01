"""GENAI-10.2: a conferência de números não barra códigos, decimais nem unidades que vieram do banco.

Casos reais da Tela 7 ("5 alimentadores com maior DEC em P2" virava "não sei"). Valores inventados.
"""
import pytest

from app.ai.contratos import DepsAgente, PlanoConsulta, RespostaAgente, ResultadoConsulta
from app.ai.resposta import ViolacaoFidelidadeSaida, substituir_marcadores_pt_br, validar_fidelidade_saida

SQL = ("SELECT alimentador, SUM(dec) AS dec_horas_uc FROM agg_dec_fec_mensal WHERE periodo = 'P2' "
       "GROUP BY 1 ORDER BY 2 DESC LIMIT 5")
RESULTADO = ResultadoConsulta(colunas=["alimentador", "dec_horas_uc"],
                              linhas=[["ALM-ABR-007", 9.8765], ["ALM-REC-015", 8.5], ["ALM-OLI-004", 1234567.89]],
                              n_linhas=3, sql_executado=SQL, tabelas_usadas=["agg_dec_fec_mensal"])


def validar(texto, marcadores):
    deps = DepsAgente(pergunta_original="Quais os 5 alimentadores com maior DEC em P2?",
                      ultimo_sql=SQL, ultimo_resultado=RESULTADO)
    saida = RespostaAgente(
        status="ok", pergunta_interpretada="Alimentadores com maior DEC em P2", sql=SQL,
        plano=PlanoConsulta(tabelas=["agg_dec_fec_mensal"], colunas=["dec"], filtros=["periodo = 'P2'"],
                            agregacao="SUM", limite=5, periodo="P2"),
        marcadores=marcadores, texto=texto, justificativa="Somei o DEC dos meses.", confianca="alta")
    return validar_fidelidade_saida(deps, saida)


@pytest.mark.parametrize("texto, marcadores", [
    ("O alimentador ALM-ABR-007 lidera com {v1} horas.", {"v1": 9.8765}),
    ("Em seguida vem o alm-rec-015, com {v1} horas.", {"v1": 8.5}),
    ("O alimentador {a1} lidera com {v1} horas.", {"a1": "ALM-ABR-007", "v1": "9.88"}),
    ("O alimentador {a1} lidera com {v1}.", {"a1": "ALM-ABR-007", "v1": "9,88 horas"}),
    ("O maior valor foi {v1}.", {"v1": "1.234.567,89"}),
    ("O maior valor foi 1.234.567,89 horas.", {}),
])
def test_aceita_codigos_decimais_e_unidades_que_vieram_do_banco(texto, marcadores):
    validar(texto, marcadores)


@pytest.mark.parametrize("texto, marcadores", [
    ("O alimentador ALM-ABR-007 lidera com 42 horas.", {}),
    ("O alimentador {a1} lidera com {v1} horas.", {"a1": "ALM-ABR-007", "v1": "42.5"}),
    ("O alimentador {a1} lidera com {v1}.", {"a1": "ALM-ABR-007", "v1": "42,5 horas"}),
    ("O alimentador {a1} lidera.", {"a1": "ALM-XYZ-999"}),
])
def test_continua_barrando_numero_ou_texto_inventado(texto, marcadores):
    with pytest.raises(ViolacaoFidelidadeSaida):
        validar(texto, marcadores)


def test_marcador_no_formato_do_python_e_preenchido_em_pt_br():
    # Caso real: "totalizou R$ {v1:,.2f}" chegava assim na Tela 7
    saida = validar("O alimentador {a1} lidera com {v1:,.2f} horas.", {"a1": "ALM-ABR-007", "v1": 9.8765})
    assert substituir_marcadores_pt_br(saida.texto, saida.marcadores) == "O alimentador ALM-ABR-007 lidera com 9,88 horas."


def test_marcador_com_formato_sem_valor_continua_barrado():
    with pytest.raises(ViolacaoFidelidadeSaida, match="não foi preenchido"):
        validar("O alimentador lidera com {v2:,.2f} horas.", {"v1": 9.8765})


def test_decimal_em_texto_sai_formatado_em_pt_br():
    saida = validar("O alimentador {a1} lidera com {v1} horas.", {"a1": "ALM-ABR-007", "v1": "9.88"})
    assert saida.marcadores == {"a1": "ALM-ABR-007", "v1": 9.88}
    assert substituir_marcadores_pt_br(saida.texto, saida.marcadores) == "O alimentador ALM-ABR-007 lidera com 9,88 horas."
