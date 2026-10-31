"""V1c: resumo da UC por regra (plano B), montado só a partir dos fatos de fatos_unidade."""
import itertools
import re
from dataclasses import replace
from datetime import date, datetime, timezone

import pytest

from app.schemas.ia import RespostaInsight
from app.services.texto_unidade import MAXIMO_FRASES, kwh, reais, redigir, texto_por_regra_unidade
from tests.test_diagnostico_conta import JANELA, _mes, historico
from tests.test_fatos_unidade import CAIU, MES, VALOR_CAIU, VALOR_SUBIU, contas, fatos, gd
from tests.test_unidade_service import _fatura

METADADOS = {'dados_ficticios': False, 'gold_atualizada_em': '2026-10-25T01:03:01Z',
             'observacoes': ['Dados reais da Gold importada.']}
CAUSA = re.compile(r'\b(por isso|devido|porque|explica|causa|resultado de|por causa)\b', re.IGNORECASE)
ESTAVEL = {'ultimo': 305, 'ano_anterior': 298}
ABAIXO_DA_MEDIA = {'ultimo': 52, 'ano_anterior': 60, 'base': 83}       # estável no ano, 36% abaixo da média (81,08 kWh), como no veredito
UMA_ABERTA, DUAS_ABERTAS = [_fatura('2024-11', 'EM ABERTO')], [_fatura('2024-11', 'EM ABERTO')] * 2


def resumo(**kwargs) -> dict:
    return texto_por_regra_unidade(fatos(**kwargs), METADADOS, datetime(2026, 10, 31, 12, tzinfo=timezone.utc))


def frases(**kwargs) -> list[tuple[str, str]]:
    return redigir(fatos(**kwargs))[1]


def do_tipo(lista, tipo) -> list[str]:
    return [frase for t, frase in lista if t == tipo]


# ---------- formato ----------

def test_numeros_no_formato_da_tela():
    assert reais(2357.68) == 'R$ 2.357,68'
    assert reais(42.0) == 'R$ 42,00'
    assert kwh(3681.0) == '3.681 kWh'
    assert kwh(82.83) == '82,83 kWh'
    assert kwh(82.8) == '82,8 kWh'


def test_resposta_no_formato_do_ia_insight():
    r = resumo(meses=historico(**CAIU), conta=VALOR_CAIU, abertas=UMA_ABERTA)
    RespostaInsight.model_validate(r)
    assert r['metadados'] == METADADOS
    assert r['metadados'] is not METADADOS and r['metadados']['observacoes'] is not METADADOS['observacoes']


def test_numeros_utilizados_sao_os_do_texto_na_ordem_do_texto():
    r = resumo(meses=historico(**CAIU), conta=VALOR_CAIU, abertas=DUAS_ABERTAS)
    assert [n['nome'] for n in r['numeros_utilizados']] == [
        'valor_conta_mes', 'variacao_valor_conta', 'valor_conta_ano_anterior',
        'variacao_consumo_ano_anterior', 'consumo_ano_anterior', 'consumo_mes', 'faturas_em_aberto_valor']
    assert all(n['valor'] >= 0 for n in r['numeros_utilizados'])
    rotulos = {n['nome']: n['rotulo'] for n in r['numeros_utilizados']}
    assert (rotulos['variacao_valor_conta'], rotulos['variacao_consumo_ano_anterior']) == (
        'Queda do valor da conta', 'Queda do consumo')


# ---------- um teste por caso ----------

def test_consumo_subiu():
    r = resumo(meses=historico(), conta=VALOR_SUBIU)
    assert r['titulo'] == 'Valor da conta subiu'
    assert r['texto'] == ('O valor da conta de jun/2026 foi de R$ 300,00, 50% acima de jun/2025 (R$ 200,00). '
                          'O consumo subiu 38%, de 298 kWh para 412 kWh.')


def test_consumo_caiu():
    r = resumo(meses=historico(**CAIU), conta=VALOR_CAIU)
    assert r['titulo'] == 'Valor da conta caiu'
    assert r['texto'] == ('O valor da conta de jun/2026 foi de R$ 100,00, 50% abaixo de jun/2025 (R$ 200,00). '
                          'O consumo caiu 67%, de 300 kWh para 100 kWh.')


def test_bandeira_mais_cara():
    conta = contas(valor=300, valor_anterior=200, bandeira='VERMELHA P2', bandeira_anterior='VERDE')
    assert do_tipo(frases(conta=conta), 'motivo') == [
        'A bandeira tarifária passou de verde para vermelha patamar 2, que é mais cara.']


def test_bandeira_mais_barata():
    conta = contas(valor=100, valor_anterior=200, bandeira='AMARELA', bandeira_anterior='VERMELHA P1')
    assert do_tipo(frases(conta=conta), 'motivo') == [
        'A bandeira tarifária passou de vermelha patamar 1 para amarela, que é mais barata.']


def test_gd_conectada():
    # Consumo caindo e valor estável: a GD é o único motivo
    lista = frases(meses=historico(**CAIU), geracao=gd(date(2025, 11, 20)))
    assert do_tipo(lista, 'motivo') == ['A unidade passou a gerar a própria energia em nov/2025.']


def test_sem_motivo_com_valor_estavel():
    r = resumo(conta=contas(valor=180, valor_anterior=200))
    assert r['titulo'] == 'Valor da conta estável'
    # "Dentro do normal" já diz que não há mudança a explicar: nenhuma frase de motivo
    assert r['texto'] == ('O valor da conta de jun/2026 foi de R$ 180,00, 10% abaixo de jun/2025 (R$ 200,00), '
                          'uma variação dentro do normal.')
    assert do_tipo(redigir(fatos(conta=contas(valor=180, valor_anterior=200)))[1], 'motivo') == []


def test_valor_igual_ao_ano_anterior_sem_motivo_tambem_nao_tem_frase_de_motivo():
    assert do_tipo(frases(), 'motivo') == []


@pytest.mark.parametrize('valor, comparacao, rotulo', [
    (180, '10% abaixo de jun/2025 (R$ 200,00), uma variação dentro do normal', 'Queda do valor da conta'),
    (230, '15% acima de jun/2025 (R$ 200,00), uma variação dentro do normal', 'Aumento do valor da conta'),
])
def test_valor_estavel_diz_o_percentual_e_o_sentido_em_palavras(valor, comparacao, rotulo):
    r = resumo(conta=contas(valor=valor, valor_anterior=200))
    assert do_tipo(redigir(fatos(conta=contas(valor=valor, valor_anterior=200)))[1], 'situacao') == [
        f'O valor da conta de jun/2026 foi de R$ {valor},00, {comparacao}.']
    assert {n['nome']: n['rotulo'] for n in r['numeros_utilizados']}['variacao_valor_conta'] == rotulo


@pytest.mark.parametrize('valor', [200, 200.8])                         # 0% e 0,4% arredondam para 0%
def test_valor_estavel_com_0_por_cento_e_igual_ao_ano_anterior(valor):
    r = resumo(conta=contas(valor=valor, valor_anterior=200))
    assert r['texto'] == f'O valor da conta de jun/2026 foi de {reais(valor)}, igual a jun/2025 (R$ 200,00).'
    assert 'dentro do normal' not in r['texto']
    assert 'variacao_valor_conta' not in {n['nome'] for n in r['numeros_utilizados']}


def test_valor_mudando_nao_diz_dentro_do_normal():
    assert 'dentro do normal' not in resumo(conta=VALOR_SUBIU)['texto']
    assert 'dentro do normal' not in resumo(conta=VALOR_CAIU)['texto']


def test_sem_motivo_com_valor_mudando():
    r = resumo(conta=VALOR_SUBIU)
    assert do_tipo(redigir(fatos(conta=VALOR_SUBIU))[1], 'motivo') == [
        'Nenhum fator identificado nos dados explica essa mudança.']
    assert r['titulo'] == 'Valor da conta subiu'


def test_sem_ano_anterior_nao_compara_e_mostra_a_media_como_contexto():
    meses = [_mes(m, 200) for m in JANELA[6:-1]] + [_mes(MES, 300)]
    r = resumo(meses=meses, conta=contas(valor_anterior=None))
    assert r['titulo'] == 'Sem base de comparação'
    assert r['texto'] == ('O valor da conta de jun/2026 foi de R$ 200,00. '
                          'Não há o mesmo mês do ano anterior para comparar. '
                          'O consumo de jun/2026 (300 kWh) ficou 50% acima da média dos 5 meses anteriores '
                          'com consumo (200 kWh).')
    assert 'jun/2025' not in r['texto']


def test_so_avisos():
    meses = [replace(m, troca_medidor=True) if m.mes == '2025-10' else m
             for m in historico(**ESTAVEL, tipo='ESTIMADA', tipo_anterior='ESTIMADA')]
    r = resumo(meses=meses, abertas=DUAS_ABERTAS)
    assert r['texto'].endswith('Pontos a verificar: as leituras de jun/2026 e jun/2025 foram estimadas, houve '
                               'troca de medidor em out/2025 e há 2 faturas em aberto, somando R$ 972,00.')
    assert r['texto'].startswith('O valor da conta de jun/2026 foi de R$ 200,00, igual a jun/2025 (R$ 200,00). '
                                 'Pontos a verificar:')


def test_uma_fatura_em_aberto_no_singular():
    assert do_tipo(frases(abertas=UMA_ABERTA), 'aviso') == [
        'Pontos a verificar: há 1 fatura em aberto, de R$ 486,00.']


def test_varios_motivos_cada_um_na_sua_frase():
    conta = contas(valor=100, valor_anterior=200, bandeira='AMARELA', bandeira_anterior='VERMELHA P1')
    lista = frases(meses=historico(**CAIU), conta=conta, geracao=gd(date(2025, 11, 20)))
    assert do_tipo(lista, 'motivo') == [
        'O consumo caiu 67%, de 300 kWh para 100 kWh.',
        'A bandeira tarifária passou de vermelha patamar 1 para amarela, que é mais barata.',
        'A unidade passou a gerar a própria energia em nov/2025.']


def test_tres_motivos_e_avisos_juntam_a_gd_ao_consumo_para_caber_em_4_frases():
    conta = contas(valor=100, valor_anterior=200, bandeira='AMARELA', bandeira_anterior='VERMELHA P1')
    lista = frases(meses=historico(**CAIU), conta=conta, geracao=gd(date(2025, 11, 20)), abertas=UMA_ABERTA)
    assert len(lista) == MAXIMO_FRASES
    assert do_tipo(lista, 'motivo')[0] == ('O consumo caiu 67%, de 300 kWh para 100 kWh, e a unidade passou a '
                                           'gerar a própria energia em nov/2025.')


def test_janela_sem_dado_da_uc():
    r = resumo(meses=[], conta=[], abertas=UMA_ABERTA)
    assert (r['titulo'], r['texto'], r['numeros_utilizados']) == (
        'Sem dados no período', 'Não há dados desta unidade no período analisado.', [])


# ---------- ajuste 1: média só sem motivo de consumo ----------

def test_sem_motivo_de_consumo_a_media_entra_como_contexto():
    assert do_tipo(frases(meses=historico(**ABAIXO_DA_MEDIA)), 'contexto') == [
        'O consumo de jun/2026 (52 kWh) ficou 36% abaixo da média dos 12 meses anteriores (81,08 kWh).']


@pytest.mark.parametrize('kwargs, conta', [
    ({'ultimo': 200, 'ano_anterior': 150}, VALOR_SUBIU),                 # subiu no ano, abaixo da média
    ({'ultimo': 200, 'ano_anterior': 300, 'base': 150}, VALOR_CAIU),     # caiu no ano, acima da média
    ({}, VALOR_SUBIU), (CAIU, VALOR_CAIU),
])
def test_com_motivo_de_consumo_a_frase_da_media_sai(kwargs, conta):
    r = resumo(meses=historico(**kwargs), conta=conta)
    assert 'média' not in r['texto']
    assert 'media_consumo' not in {n['nome'] for n in r['numeros_utilizados']}


# ---------- ajuste 2: GD de contexto em frase própria ----------

def test_gd_anterior_ao_ano_anterior_e_contexto_em_frase_propria():
    lista = frases(meses=historico(**ABAIXO_DA_MEDIA), geracao=gd(date(2025, 2, 1)))
    assert do_tipo(lista, 'contexto') == [
        'O consumo de jun/2026 (52 kWh) ficou 36% abaixo da média dos 12 meses anteriores (81,08 kWh).',
        'A unidade tem geração própria desde fev/2025, já presente no mesmo mês do ano anterior.']


def test_gd_conectada_no_periodo_sem_ser_motivo_nao_diz_que_ja_existia():
    lista = frases(meses=historico(), conta=VALOR_SUBIU, geracao=gd(date(2025, 11, 20)))
    assert do_tipo(lista, 'contexto') == ['A unidade passou a ter geração própria em nov/2025.']


def test_gd_conectada_depois_do_mes_analisado_nao_aparece():
    f = fatos(geracao=gd(date(2025, 2, 1)))
    f = {**f, 'mes_analisado': '2024-10', 'mes_ano_anterior': '2023-10'}
    assert do_tipo(redigir(f)[1], 'contexto') == []


def test_valor_estavel_com_media_gd_e_avisos_cabe_nas_4_frases():
    # Como a UC100015: sem a frase de motivo, a GD de contexto volta a caber
    lista = frases(meses=historico(**ABAIXO_DA_MEDIA), conta=contas(valor=180, valor_anterior=200),
                   geracao=gd(date(2025, 2, 1)), abertas=UMA_ABERTA)
    assert [t for t, _ in lista] == ['situacao', 'contexto', 'contexto', 'aviso']
    assert 'geração própria' in do_tipo(lista, 'contexto')[1]


def test_gd_de_contexto_sai_quando_nao_cabe_nas_4_frases():
    # Valor mudando sem motivo: a frase "nenhum fator" ocupa o lugar e a GD sai
    f = fatos(meses=historico(**ABAIXO_DA_MEDIA), conta=VALOR_SUBIU, geracao=gd(date(2025, 2, 1)),
              abertas=UMA_ABERTA)
    lista = redigir(f)[1]
    texto = texto_por_regra_unidade(f, METADADOS)['texto']
    assert len(lista) == MAXIMO_FRASES
    assert 'geração própria' not in texto
    assert 'média' in texto                                              # a média tem prioridade


# ---------- garantias sobre todos os casos ----------

CONTAS = [contas(), VALOR_SUBIU, VALOR_CAIU,
          contas(valor=300, valor_anterior=200, bandeira='VERMELHA P2', bandeira_anterior='VERDE'),
          contas(valor=100, valor_anterior=200, bandeira='AMARELA', bandeira_anterior='VERMELHA P1'),
          contas(valor_anterior=None), []]
CONSUMOS = [{}, CAIU, ESTAVEL, ABAIXO_DA_MEDIA, {'ultimo': 200, 'ano_anterior': 150},
            {'ultimo': 200, 'ano_anterior': 300, 'base': 150}, {**ESTAVEL, 'tipo': 'ESTIMADA'}]
GDS = [None, gd(date(2025, 2, 1)), gd(date(2025, 11, 20))]
TODOS = list(itertools.product(CONSUMOS, CONTAS, GDS, [[], UMA_ABERTA]))


@pytest.mark.parametrize('consumo, conta, geracao, abertas', TODOS)
def test_garantias_do_texto_em_todas_as_combinacoes(consumo, conta, geracao, abertas):
    f = fatos(meses=historico(**consumo), conta=conta, geracao=geracao, abertas=abertas)
    titulo, lista, numeros = redigir(f)
    texto = ' '.join(frase for _, frase in lista)
    assert len(lista) <= MAXIMO_FRASES
    assert '-' not in texto + titulo and '−' not in texto + titulo           # direção só em palavras
    assert not re.search(r'(?<!\w)a conta\b', texto, re.IGNORECASE)          # sempre "o valor da conta"
    assert lista[0][0] == 'situacao' and lista[0][1].startswith(('O valor da conta', 'Não há valor da conta'))
    tipos = [t for t, _ in lista]
    assert tipos == sorted(tipos, key=['situacao', 'motivo', 'contexto', 'aviso'].index)
    for frase in do_tipo(lista, 'contexto') + do_tipo(lista, 'aviso'):
        assert not CAUSA.search(frase), frase
    # GD de contexto nunca unida à média, e a média nunca junto de motivo de consumo
    for frase in do_tipo(lista, 'contexto'):
        assert not ('média' in frase and 'geração' in frase), frase
    if {'consumo_subiu', 'consumo_caiu'} & set(f['motivos']):
        assert not any('média' in frase for frase in do_tipo(lista, 'contexto'))
    assert all(n['valor'] is not None and n['valor'] >= 0 for n in numeros)
    assert len({n['nome'] for n in numeros}) == len(numeros)
