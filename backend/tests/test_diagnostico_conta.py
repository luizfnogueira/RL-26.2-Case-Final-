"""V1a: diagnóstico "a conta veio alta?" sem banco (função pura do unidade_service)."""
from decimal import Decimal

import pytest

from app.services.stubs import exemplo
from app.services.unidade_service import (
    MesConsumo, diagnosticar_conta, media_12_meses, mes_texto, somar_meses,
)

PERIODO = '2025-07/2026-06'
JANELA = [somar_meses('2025-07', i) for i in range(12)]          # 2025-07 … 2026-06
ANTERIORES = [somar_meses(m, -12) for m in JANELA]               # 2024-07 … 2025-06
BASE_MEDIA = '2025-06/2026-05'                                   # 12 meses antes de 2026-06, sem ele


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


@pytest.mark.parametrize('nome', ['unidade', 'unidade_recente'])
def test_exemplo_do_contrato_segue_a_regra(nome):
    """O diagnóstico de cada exemplo é o que a função calcula sobre o consumo do próprio exemplo."""
    unidade = exemplo(nome)
    meses = []
    for c in unidade['consumo']:
        atual, anterior = c['atual']['valor'], c['ano_anterior']['valor']
        if atual is not None:                                    # mês sem dado da UC não tem linha
            meses.append(_mes(c['mes'], atual, None if anterior is None else Decimal(str(anterior)),
                              tipo=c['tipo_leitura']))
        if anterior is not None:
            meses.append(_mes(c['ano_anterior']['periodo_referencia'], anterior))
    assert diagnosticar_conta(meses, unidade['periodo_referencia']) == unidade['diagnostico_conta']


def test_somar_meses_atravessa_o_ano():
    assert somar_meses('2026-06', -12) == '2025-06'
    assert somar_meses('2026-01', -1) == '2025-12'
    assert somar_meses('2025-12', 1) == '2026-01'


@pytest.mark.parametrize('mes, texto', [('2026-06', 'jun/2026'), ('2025-01', 'jan/2025'), ('2024-12', 'dez/2024')])
def test_mes_no_texto_e_por_extenso(mes, texto):
    assert mes_texto(mes) == texto


def test_conta_alta_com_consumo_acima_da_media_explica_a_conta():
    d = diagnosticar_conta(historico(), PERIODO)

    assert d['periodo_referencia'] == '2026-06'
    assert d['conta_alta'] is True
    assert d['veredito'].startswith('Consumo subiu')
    assert 'média dos meses anteriores (12 meses)' in d['veredito']
    assert d['ultimo_mes'] == {'valor': 412.0, 'unidade': 'kWh', 'periodo_referencia': '2026-06'}
    assert d['mesmo_mes_ano_anterior'] == {'valor': 298.0, 'unidade': 'kWh', 'periodo_referencia': '2025-06'}
    # (298 + 11 × 300) / 12: jun/2025 a mai/2026, sem o próprio jun/2026
    assert d['media_12_meses'] == {'valor': 299.83, 'unidade': 'kWh', 'periodo_referencia': BASE_MEDIA}
    assert d['meses_media'] == 12
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
    assert d['veredito'] == ('Consumo estável: se o valor da conta subiu, a causa não é o consumo, '
                             'e sim tarifa, bandeira tarifária ou tributos.')


def test_consumo_muito_abaixo_da_media_e_consumo_caiu_nao_estavel():
    # Caso real da UC100015: 52 kWh contra média ~83 (−37%), sem alta sobre o ano anterior.
    d = diagnosticar_conta(historico(ultimo=52, ano_anterior=60, base=83), PERIODO)
    assert d['conta_alta'] is False
    assert d['veredito'] == ('Consumo caiu: jun/2026 ficou mais de 20% abaixo da média dos meses anteriores '
                             '(12 meses). Se o valor da conta subiu, a causa não é o consumo, '
                             'e sim tarifa, bandeira tarifária ou tributos.')


def test_exatamente_20_por_cento_abaixo_da_media_ainda_e_estavel():
    # Média (240 + 11 × 300) / 12 = 295; 240 não é menor que 80% de 295 (236).
    d = diagnosticar_conta(historico(ultimo=240, ano_anterior=240), PERIODO)
    assert d['veredito'].startswith('Consumo estável')


def test_acima_do_ano_anterior_mas_muito_abaixo_da_media_indica_queda_recente():
    d = diagnosticar_conta(historico(ultimo=200, ano_anterior=150), PERIODO)
    assert d['conta_alta'] is True
    assert 'abaixo da média dos meses anteriores (12 meses): o consumo vem caindo' in d['veredito']


def test_queda_forte_no_ano_e_media_em_linha_e_queda_contra_o_ano_anterior():
    # −33% contra o ano anterior; média (300 + 11 × 210) / 12 = 217,5, então 200 está em linha.
    d = diagnosticar_conta(historico(ultimo=200, ano_anterior=300, base=210), PERIODO)
    assert d['conta_alta'] is False and d['variacao_percentual']['valor'] == -33.33
    assert d['veredito'] == ('Consumo caiu em relação ao mesmo mês do ano anterior: jun/2026 ficou mais de 20% '
                             'abaixo dele e em linha com a média dos meses anteriores (12 meses). Se o valor da '
                             'conta subiu, a causa não é o consumo, e sim tarifa, bandeira tarifária ou tributos.')


def test_queda_forte_no_ano_e_na_media():
    d = diagnosticar_conta(historico(ultimo=100, ano_anterior=300, base=300), PERIODO)
    assert d['veredito'] == ('Consumo caiu: jun/2026 ficou mais de 20% abaixo do mesmo mês do ano anterior e da '
                             'média dos meses anteriores (12 meses). Se o valor da conta subiu, a causa não é o '
                             'consumo, e sim tarifa, bandeira tarifária ou tributos.')


def test_queda_forte_no_ano_mas_acima_da_media_e_retomada():
    # −33% contra o ano anterior; média (300 + 11 × 150) / 12 = 162,5, então 200 está acima.
    d = diagnosticar_conta(historico(ultimo=200, ano_anterior=300, base=150), PERIODO)
    assert 'abaixo do mesmo mês do ano anterior, mas mais de 20% acima da média' in d['veredito']
    assert d['veredito'].endswith('o consumo voltou a subir nos últimos meses.')


def test_exatamente_20_por_cento_abaixo_do_ano_anterior_ainda_e_em_linha():
    # −20,00% contra o ano anterior: o limiar é estrito, então não é "caiu".
    d = diagnosticar_conta(historico(ultimo=240, ano_anterior=300, base=240), PERIODO)
    assert d['variacao_percentual']['valor'] == -20.0
    assert d['veredito'].startswith('Consumo estável')


def test_sem_ano_anterior_e_muito_abaixo_da_media():
    d = diagnosticar_conta(historico(ultimo=200, ano_anterior=None), PERIODO)
    assert d['conta_alta'] is None
    assert d['veredito'] == ('Sem o mesmo mês do ano anterior para comparar; o consumo de jun/2026 '
                             'ficou mais de 20% abaixo da média dos meses anteriores (11 meses).')


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
    assert d['meses_media'] == 11                                # jun/2025 sem consumo fica fora
    assert d['veredito'].startswith('Sem o mesmo mês do ano anterior')
    assert 'acima da média dos meses anteriores (11 meses)' in d['veredito']


def test_ultimo_mes_sem_consumo_valido_nao_avalia_a_conta():
    d = diagnosticar_conta(historico(ultimo=0), PERIODO)
    assert d['conta_alta'] is None and d['variacao_percentual']['valor'] is None
    assert d['veredito'].startswith('Sem consumo válido em jun/2026')
    assert d['media_12_meses']['valor'] == 299.83


def test_ultimo_mes_com_dado_e_o_mes_analisado_quando_a_janela_passa_do_fim_da_base():
    d = diagnosticar_conta(historico(), '2026-01/2026-12')
    assert d['periodo_referencia'] == '2026-06'
    assert d['ultimo_mes'] == {'valor': 412.0, 'unidade': 'kWh', 'periodo_referencia': '2026-06'}
    assert d['mesmo_mes_ano_anterior']['periodo_referencia'] == '2025-06'
    # A média não segue a janela: são os mesmos 12 meses anteriores a jun/2026.
    assert d['media_12_meses'] == {'valor': 299.83, 'unidade': 'kWh', 'periodo_referencia': BASE_MEDIA}
    assert d['veredito'].startswith('Consumo subiu: jun/2026')


@pytest.mark.parametrize('meses', [[], historico()], ids=['uc_sem_meses', 'janela_sem_dados'])
def test_janela_sem_dado_da_uc_devolve_veredito_e_mes_nulos(meses):
    d = diagnosticar_conta(meses, '2030-01/2030-12')
    assert d['periodo_referencia'] is None and d['veredito'] is None and d['conta_alta'] is None
    assert all(d[c]['valor'] is None for c in
               ('ultimo_mes', 'mesmo_mes_ano_anterior', 'media_12_meses', 'variacao_percentual'))
    assert d['ultimo_mes']['periodo_referencia'] == '2030-12'
    assert d['meses_media'] == 0
    assert d['leitura_estimada'] is False and d['alerta'] is None


@pytest.mark.parametrize('ruido', [None, 0, -5])
def test_media_ignora_meses_nulos_e_nao_positivos(ruido):
    anteriores = [somar_meses('2026-06', -i) for i in range(1, 13)]
    meses = [_mes(m, 300) for m in anteriores[1:]] + [_mes(anteriores[0], ruido)]
    assert media_12_meses(meses, '2026-06') == (300.0, 11)


def test_media_usa_so_os_12_meses_anteriores_sem_o_mes_analisado():
    anteriores = [_mes(somar_meses('2026-06', -i), 300) for i in range(1, 13)]
    fora = [_mes('2025-05', 9000), _mes('2026-06', 9000)]       # 13 meses antes e o próprio mês
    assert media_12_meses(anteriores + fora, '2026-06') == (300.0, 12)


def test_uc_recente_usa_os_meses_que_existem():
    meses = [_mes(m, 300) for m in JANELA[6:-1]] + [_mes('2026-06', 500)]   # ligada em jan/2026
    d = diagnosticar_conta(meses, PERIODO)
    assert d['media_12_meses'] == {'valor': 300.0, 'unidade': 'kWh', 'periodo_referencia': BASE_MEDIA}
    assert d['meses_media'] == 5
    assert d['conta_alta'] is None
    assert 'acima da média dos meses anteriores (5 meses)' in d['veredito']


def test_leitura_estimada_no_ultimo_mes():
    d = diagnosticar_conta(historico(tipo='ESTIMADA'), PERIODO)
    assert d['leitura_estimada'] is True
    assert d['alerta'] == 'Leitura estimada em jun/2026: o consumo pode ser ajustado na próxima leitura real.'


def test_leitura_estimada_no_ano_anterior_enfraquece_a_comparacao():
    d = diagnosticar_conta(historico(tipo_anterior='ESTIMADA'), PERIODO)
    assert d['leitura_estimada'] is True
    assert d['alerta'] == 'Leitura estimada em jun/2025: a comparação com o ano anterior é fraca.'


@pytest.mark.parametrize('campo, mes', [('troca', 'jun/2026'), ('troca_anterior', 'jun/2025')])
def test_troca_de_medidor_gera_alerta_sem_marcar_estimada(campo, mes):
    d = diagnosticar_conta(historico(**{campo: True}), PERIODO)
    assert d['leitura_estimada'] is False
    assert d['alerta'].startswith(f'Troca de medidor em {mes}')


def test_alertas_se_somam_e_nao_mudam_o_veredito():
    sem_alerta = diagnosticar_conta(historico(), PERIODO)
    d = diagnosticar_conta(historico(tipo='ESTIMADA', tipo_anterior='ESTIMADA', troca=True), PERIODO)
    assert d['veredito'] == sem_alerta['veredito']
    assert [frase.split(':')[0] for frase in d['alerta'].split('. ') if frase] == [
        'Leitura estimada em jun/2026', 'Leitura estimada em jun/2025', 'Troca de medidor em jun/2026']
