"""V1a: diagnóstico "a conta veio alta?" sem banco (função pura do unidade_service)."""
from decimal import Decimal

import pytest

from app.services.unidade_service import MesConsumo, diagnosticar_conta, media_12_meses

PERIODO = '2025-07/2026-06'
JANELA = [f'{2025 + (6 + i) // 12}-{(6 + i) % 12 + 1:02d}' for i in range(12)]      # 2025-07 … 2026-06
ANTERIORES = [f'{int(m[:4]) - 1}{m[4:]}' for m in JANELA]                         # 2024-07 … 2025-06


def _mes(mes, consumo, anterior=None, tipo='REAL', troca=False, flag=None):
    """Linha como a Gold grava: variação só com os dois consumos > 0; flag acima de +20%."""
    comparavel = consumo is not None and anterior is not None and consumo > 0 and anterior > 0
    variacao = round((Decimal(consumo) - anterior) / anterior * 100, 2) if comparavel else None
    if flag is None and variacao is not None:
        flag = variacao > 20
    return MesConsumo(mes, None if consumo is None else Decimal(consumo),
                      None if anterior is None else Decimal(anterior), variacao, flag, tipo, troca)


def historico(ultimo=412, ano_anterior=298, base=300, tipo='REAL', tipo_anterior='REAL',
              troca=False, troca_anterior=False, flag=None):
    """24 meses: consumo `base` em todos, exceto o último mês e o mesmo mês do ano anterior."""
    meses = [_mes(m, base) for m in ANTERIORES[:-1]]
    meses.append(_mes(ANTERIORES[-1], ano_anterior, tipo=tipo_anterior, troca=troca_anterior))
    meses += [_mes(m, base, base) for m in JANELA[:-1]]
    meses.append(_mes(JANELA[-1], ultimo, ano_anterior, tipo=tipo, troca=troca, flag=flag))
    return meses


def test_conta_alta_com_consumo_acima_da_media_explica_a_conta():
    d = diagnosticar_conta(historico(), PERIODO)

    assert d['conta_alta'] is True
    assert d['veredito'].startswith('Consumo subiu')
    assert d['ultimo_mes'] == {'valor': 412.0, 'unidade': 'kWh', 'periodo_referencia': '2026-06'}
    assert d['mesmo_mes_ano_anterior'] == {'valor': 298.0, 'unidade': 'kWh', 'periodo_referencia': '2025-06'}
    assert d['media_12_meses'] == {'valor': 309.33, 'unidade': 'kWh', 'periodo_referencia': PERIODO}
    assert d['variacao_percentual'] == {'valor': 38.26, 'unidade': '%', 'periodo_referencia': '2026-06'}
    assert d['leitura_estimada'] is False and d['alerta'] is None


def test_conta_alta_em_linha_com_a_media_indica_subida_ao_longo_do_ano():
    d = diagnosticar_conta(historico(ultimo=400, ano_anterior=280, base=360), PERIODO)
    assert d['conta_alta'] is True
    assert 'ao longo do ano' in d['veredito']


def test_acima_da_media_sem_conta_alta_e_efeito_sazonal():
    d = diagnosticar_conta(historico(ultimo=420, ano_anterior=400), PERIODO)
    assert d['conta_alta'] is False
    assert 'efeito sazonal' in d['veredito']


def test_consumo_estavel_aponta_tarifa_bandeira_ou_tributos():
    d = diagnosticar_conta(historico(ultimo=305, ano_anterior=298), PERIODO)
    assert d['conta_alta'] is False
    assert d['veredito'].startswith('Consumo estável')
    assert 'bandeira' in d['veredito']


def test_conta_alta_vem_da_gold_sem_recalcular():
    # Números indicariam +38%, mas a flag da Gold manda: a API não refaz a regra.
    d = diagnosticar_conta(historico(flag=False), PERIODO)
    assert d['conta_alta'] is False
    assert not d['veredito'].startswith('Consumo subiu')


def test_sem_ano_anterior_fica_nulo_e_usa_so_a_media():
    d = diagnosticar_conta(historico(ano_anterior=None), PERIODO)
    assert d['conta_alta'] is None
    assert d['mesmo_mes_ano_anterior']['valor'] is None
    assert d['variacao_percentual']['valor'] is None
    assert d['veredito'].startswith('Sem o mesmo mês do ano anterior')
    assert 'acima da média' in d['veredito']


def test_ultimo_mes_sem_consumo_valido_nao_avalia_a_conta():
    d = diagnosticar_conta(historico(ultimo=0), PERIODO)
    assert d['conta_alta'] is None and d['variacao_percentual']['valor'] is None
    assert d['veredito'].startswith('Sem consumo válido em 2026-06')
    assert d['media_12_meses']['valor'] == 300.0                  # o mês com 0 fica fora da média


def test_uc_sem_nenhum_mes_devolve_tudo_nulo():
    d = diagnosticar_conta([], PERIODO)
    assert d['conta_alta'] is None
    assert all(d[c]['valor'] is None for c in
               ('ultimo_mes', 'mesmo_mes_ano_anterior', 'media_12_meses', 'variacao_percentual'))
    assert d['leitura_estimada'] is False and d['alerta'] is None


@pytest.mark.parametrize('ruido', [None, 0, -5])
def test_media_ignora_meses_nulos_e_nao_positivos(ruido):
    meses = [_mes(m, 300) for m in JANELA[:-1]] + [_mes(JANELA[-1], ruido)]
    assert media_12_meses(meses, PERIODO) == 300.0


def test_media_considera_so_a_janela():
    assert media_12_meses(historico(base=300, ultimo=300) + [_mes('2023-01', 9000)], PERIODO) == 300.0


def test_leitura_estimada_no_ultimo_mes():
    d = diagnosticar_conta(historico(tipo='ESTIMADA'), PERIODO)
    assert d['leitura_estimada'] is True
    assert d['alerta'] == 'Leitura ESTIMADA em 2026-06: o consumo pode ser ajustado na próxima leitura real.'


def test_leitura_estimada_no_ano_anterior_enfraquece_a_comparacao():
    d = diagnosticar_conta(historico(tipo_anterior='ESTIMADA'), PERIODO)
    assert d['leitura_estimada'] is True
    assert d['alerta'] == 'Leitura ESTIMADA em 2025-06: a comparação com o ano anterior é fraca.'


@pytest.mark.parametrize('campo, mes', [('troca', '2026-06'), ('troca_anterior', '2025-06')])
def test_troca_de_medidor_gera_alerta_sem_marcar_estimada(campo, mes):
    d = diagnosticar_conta(historico(**{campo: True}), PERIODO)
    assert d['leitura_estimada'] is False
    assert d['alerta'].startswith(f'Troca de medidor em {mes}')


def test_alertas_se_somam_e_nao_mudam_o_veredito():
    sem_alerta = diagnosticar_conta(historico(), PERIODO)
    d = diagnosticar_conta(historico(tipo='ESTIMADA', tipo_anterior='ESTIMADA', troca=True), PERIODO)
    assert d['veredito'] == sem_alerta['veredito']
    assert [frase.split(':')[0] for frase in d['alerta'].split('. ') if frase] == [
        'Leitura ESTIMADA em 2026-06', 'Leitura ESTIMADA em 2025-06', 'Troca de medidor em 2026-06']
