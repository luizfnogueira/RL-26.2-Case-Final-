"""Contrato da resposta do guia da plataforma: metadados.fonte "guia", seções citadas e nada do banco."""
import pytest
from pydantic import ValidationError

from app.schemas.ia import RespostaIA
from app.services.stubs import exemplo


def guia(**mudancas) -> dict:
    resposta = exemplo('resposta_ia_guia')
    for chave, valor in mudancas.items():
        if chave in ('fonte', 'secoes_guia'):
            resposta['metadados'][chave] = valor
        else:
            resposta[chave] = valor
    return resposta


def test_fixture_do_guia_e_valido():
    resposta = RespostaIA.model_validate(guia())
    assert resposta.metadados.fonte == 'guia'
    assert resposta.metadados.secoes_guia[0].titulo == 'Assistente V-Energy'


def test_resposta_antiga_sem_fonte_vale_como_dados():
    resposta = exemplo('resposta_ia')
    del resposta['metadados']['fonte'], resposta['metadados']['secoes_guia']
    validada = RespostaIA.model_validate(resposta)
    assert validada.metadados.fonte == 'dados' and validada.metadados.secoes_guia == []


def test_nao_sei_do_guia_pode_vir_sem_secoes():
    RespostaIA.model_validate(guia(status='nao_sei', secoes_guia=[]))


@pytest.mark.parametrize('mudancas, erro', [
    ({'sql': 'SELECT 1'}, 'não traz sql'),
    ({'tabelas': ['dim_uc']}, 'não traz sql'),
    ({'dados': {'colunas': ['x'], 'linhas': [[1]]}}, 'não traz sql'),
    ({'status': 'bloqueado'}, 'status "ok" ou "nao_sei"'),
    ({'secoes_guia': []}, 'cita as seções'),
    ({'fonte': 'dados'}, 'secoes_guia só vem'),
])
def test_resposta_do_guia_fora_do_contrato_e_recusada(mudancas, erro):
    with pytest.raises(ValidationError, match=erro):
        RespostaIA.model_validate(guia(**mudancas))
