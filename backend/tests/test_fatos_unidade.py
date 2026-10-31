"""V1c: fatos da UC para o resumo por IA, sem banco (função pura e carregador com repository falso)."""
import json
from dataclasses import replace
from datetime import date
from decimal import Decimal

import pytest

from app.repositories.unidade_repository import ContaMes, FichaUC, GeracaoDistribuidaUC
from app.services.fatos_unidade import AVISOS, CAMPOS, MOTIVOS, carregar_fatos_unidade, montar_fatos_unidade
from app.services.unidade_service import diagnosticar_conta
from tests.test_diagnostico_conta import JANELA, PERIODO, _mes, historico
from tests.test_unidade_service import CADASTRO, MEDIDOR, RepositorioFalso, _fatura

MES, ANO_ANTERIOR = '2026-06', '2025-06'


def gd(conexao):
    return GeracaoDistribuidaUC(Decimal('4.50'), 'GERACAO NA PROPRIA UC', conexao, Decimal('180.00'))


def contas(valor=200, valor_anterior=200, bandeira='VERDE', bandeira_anterior='VERDE'):
    """Conta do mês analisado e do mesmo mês do ano anterior; None tira o mês da consulta."""
    linhas = [] if valor_anterior is None else [ContaMes(ANO_ANTERIOR, Decimal(valor_anterior), bandeira_anterior)]
    return linhas + ([] if valor is None else [ContaMes(MES, Decimal(valor), bandeira)])


def fatos(meses=None, conta=None, geracao=None, abertas=()):
    """Por padrão: consumo estável (305 × 298, média 300), conta estável, mesma bandeira, sem GD e sem abertas."""
    return montar_fatos_unidade(historico(ultimo=305, ano_anterior=298) if meses is None else meses, PERIODO,
                                contas() if conta is None else conta, geracao, list(abertas))


# ---------- lista vazia e lista branca ----------

def test_sem_nenhum_fator_motivos_e_avisos_ficam_vazios():
    f = fatos()
    assert (f['motivos'], f['avisos']) == ([], [])
    assert (f['direcao_consumo_ano_anterior'], f['direcao_consumo_media'], f['direcao_valor_conta']) == (
        'estável', 'estável', 'estável')
    assert f['situacao_valor_conta'] == 'normal'


def test_saida_tem_so_os_campos_da_lista_branca():
    assert tuple(fatos()) == CAMPOS


class RepositorioComContas(RepositorioFalso):
    def __init__(self, conta=None, **kwargs):
        super().__init__(**kwargs)
        self._contas, self.meses_pedidos = conta or contas(), None

    def contas(self, id_uc, meses):
        self.meses_pedidos = meses
        return [c for c in self._contas if c.mes in meses]


def test_nenhum_dado_pessoal_ou_identificador_sai_nos_fatos():
    repo = RepositorioComContas(ficha=FichaUC(CADASTRO, MEDIDOR, gd(date(2025, 2, 1))))
    texto = json.dumps(carregar_fatos_unidade(repo, 'UC-1'), ensure_ascii=False)
    proibidos = ['UC-1', CADASTRO.nome_titular, CADASTRO.cpf_cnpj, CADASTRO.logradouro, CADASTRO.bairro,
                 str(CADASTRO.latitude), str(CADASTRO.longitude), MEDIDOR.id_medidor, 'FT-2024-11',
                 'nome', 'cpf', 'telefone', 'logradouro', 'cep', 'latitude', 'longitude', 'bairro',
                 'protocolo', 'id_uc', 'id_medidor', 'id_fatura']
    assert [p for p in proibidos if p in texto] == []


def test_carregador_usa_a_janela_padrao_e_pede_so_os_dois_meses():
    repo = RepositorioComContas()
    f = carregar_fatos_unidade(repo, 'UC-1')
    assert repo.chamadas['consumo'] == ('2024-07', '2026-06')          # a mesma do GET /unidades/{id}
    assert repo.meses_pedidos == [ANO_ANTERIOR, MES]
    assert f['mes_analisado'] == MES
    assert f['faturas_em_aberto_qtd'] == 1                               # as mesmas abertas da tela


# ---------- coerência com o veredito da tela ----------

@pytest.mark.parametrize('kwargs, direcoes', [
    ({}, ('subiu', 'subiu')),
    ({'ultimo': 400, 'ano_anterior': 280, 'base': 360}, ('subiu', 'estável')),
    ({'ultimo': 200, 'ano_anterior': 150}, ('subiu', 'caiu')),
    ({'ultimo': 420, 'ano_anterior': 400}, ('estável', 'subiu')),
    ({'ultimo': 305, 'ano_anterior': 298}, ('estável', 'estável')),
    ({'ultimo': 52, 'ano_anterior': 60, 'base': 83}, ('estável', 'caiu')),
    ({'ultimo': 200, 'ano_anterior': 300, 'base': 150}, ('caiu', 'subiu')),
    ({'ultimo': 200, 'ano_anterior': 300, 'base': 210}, ('caiu', 'estável')),
    ({'ultimo': 100, 'ano_anterior': 300, 'base': 300}, ('caiu', 'caiu')),
], ids=['acima-acima', 'acima-linha', 'acima-abaixo', 'linha-acima', 'linha-linha', 'linha-abaixo',
        'abaixo-acima', 'abaixo-linha', 'abaixo-abaixo'])
def test_direcoes_seguem_as_9_combinacoes_do_veredito(kwargs, direcoes):
    meses = historico(**kwargs)
    f = fatos(meses)
    d = diagnosticar_conta(meses, PERIODO)
    assert (f['direcao_consumo_ano_anterior'], f['direcao_consumo_media']) == direcoes
    assert f['veredito_titulo'] == d['veredito']['titulo']
    assert f['consumo_mes_kwh'] == d['ultimo_mes']['valor']
    assert f['media_consumo_kwh'] == d['media_12_meses']['valor']


def test_numeros_saem_sem_sinal_e_a_direcao_a_parte():
    f = fatos(historico(ultimo=100, ano_anterior=300, base=300), contas(valor=150, valor_anterior=300))
    assert (f['variacao_consumo_ano_anterior_pct'], f['direcao_consumo_ano_anterior']) == (66.67, 'caiu')
    assert (f['desvio_consumo_media_pct'], f['direcao_consumo_media']) == (66.67, 'caiu')
    assert (f['variacao_valor_conta_pct'], f['direcao_valor_conta']) == (50.0, 'caiu')
    assert f['situacao_valor_conta'] == 'baixa'


def test_valor_exatamente_20_por_cento_acima_ainda_e_estavel():
    assert fatos(conta=contas(valor=240, valor_anterior=200))['direcao_valor_conta'] == 'estável'
    assert fatos(conta=contas(valor=241, valor_anterior=200))['situacao_valor_conta'] == 'alta'


# ---------- motivos ----------

VALOR_SUBIU, VALOR_CAIU = contas(valor=300, valor_anterior=200), contas(valor=100, valor_anterior=200)
CAIU = {'ultimo': 100, 'ano_anterior': 300, 'base': 300}
ESTAVEL = {'ultimo': 305, 'ano_anterior': 298}


def test_consumo_e_valor_subindo_e_motivo():
    assert fatos(historico(), VALOR_SUBIU)['motivos'] == ['consumo_subiu']


def test_consumo_e_valor_caindo_e_motivo():
    assert fatos(historico(**CAIU), VALOR_CAIU)['motivos'] == ['consumo_caiu']


def test_consumo_subindo_com_valor_caindo_nao_e_motivo():
    f = fatos(historico(), VALOR_CAIU)
    assert (f['direcao_consumo_ano_anterior'], f['direcao_valor_conta']) == ('subiu', 'caiu')
    assert f['motivos'] == []


@pytest.mark.parametrize('conta', [contas(), VALOR_CAIU], ids=['valor-estavel', 'valor-caindo'])
def test_consumo_subindo_sem_o_valor_subir_nao_e_motivo(conta):
    assert fatos(historico(), conta)['motivos'] == []


def test_consumo_e_valor_estaveis_abaixo_da_media_nao_tem_motivo():
    # A média entra nos fatos como contexto, nunca como motivo
    f = fatos(historico(ultimo=52, ano_anterior=60, base=83), contas())
    assert (f['direcao_consumo_ano_anterior'], f['direcao_consumo_media']) == ('estável', 'caiu')
    assert f['desvio_consumo_media_pct'] is not None
    assert f['motivos'] == []


@pytest.mark.parametrize('kwargs', [{}, {'ultimo': 200, 'ano_anterior': 150}, CAIU,
                                    {'ultimo': 200, 'ano_anterior': 300, 'base': 150}])
@pytest.mark.parametrize('conta', [VALOR_SUBIU, VALOR_CAIU, contas()])
def test_consumo_subiu_e_consumo_caiu_nunca_saem_juntos(kwargs, conta):
    assert not {'consumo_subiu', 'consumo_caiu'} <= set(fatos(historico(**kwargs), conta)['motivos'])


# ---------- preço médio por kWh e decomposição ----------

def por_preco(ultimo, ano_anterior, preco, preco_anterior=0.8, **bandeiras):
    """Contas montadas como na Gold: valor = consumo × preço médio por kWh de cada mês."""
    return contas(valor=round(ultimo * preco, 2), valor_anterior=round(ano_anterior * preco_anterior, 2),
                  **bandeiras)


def test_preco_medio_por_kwh_sai_sem_sinal_e_com_a_direcao_a_parte():
    f = fatos(historico(**ESTAVEL), por_preco(305, 298, 0.6))
    assert (f['preco_kwh_mes'], f['preco_kwh_ano_anterior']) == (0.6, 0.8)
    assert (f['variacao_preco_kwh_pct'], f['direcao_preco_kwh']) == (25.0, 'caiu')
    assert f['decomposicao_aplicavel'] is True


def test_preco_subindo_com_o_valor_e_motivo():
    f = fatos(historico(**ESTAVEL), por_preco(305, 298, 1.0))
    assert (f['direcao_consumo_ano_anterior'], f['direcao_valor_conta']) == ('estável', 'subiu')
    assert f['motivos'] == ['preco_kwh_subiu']


def test_preco_caindo_com_o_valor_e_motivo():
    assert fatos(historico(**ESTAVEL), por_preco(305, 298, 0.6))['motivos'] == ['preco_kwh_caiu']


def test_consumo_e_preco_acima_do_limiar_sao_dois_motivos():
    assert fatos(historico(), por_preco(412, 298, 1.0))['motivos'] == ['consumo_subiu', 'preco_kwh_subiu']


def test_preco_contra_o_sentido_do_valor_nao_e_motivo():
    # Consumo +38% e preço −22%: o valor sobe 8% (estável); nenhum dos dois é motivo
    f = fatos(historico(), por_preco(412, 298, 0.62))
    assert (f['direcao_preco_kwh'], f['direcao_valor_conta']) == ('caiu', 'estável')
    assert f['motivos'] == []


@pytest.mark.parametrize('ultimo, preco, direcao', [
    (357, 0.82, 'subiu'),       # consumo +19,8% e preço +2,5%: o valor sobe 22,8%
    (245, 0.76, 'caiu'),        # consumo −17,8% e preço −5%: o valor cai 21,9%
])
def test_nenhum_componente_passa_do_limiar_e_o_motivo_e_a_combinacao(ultimo, preco, direcao):
    f = fatos(historico(ultimo=ultimo, ano_anterior=298), por_preco(ultimo, 298, preco))
    assert f['direcao_valor_conta'] == direcao
    assert (f['direcao_consumo_ano_anterior'], f['direcao_preco_kwh']) == ('estável', 'estável')
    assert f['motivos'] == ['consumo_e_preco_kwh']


@pytest.mark.parametrize('ultimo', range(240, 360, 7))
@pytest.mark.parametrize('preco', [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95])
def test_combinacao_nunca_tem_consumo_e_preco_em_sentidos_opostos(ultimo, preco):
    # Sentidos opostos e os dois abaixo de 20%: o valor muda menos que o maior deles e não passa de 20%
    f = fatos(historico(ultimo=ultimo, ano_anterior=298), por_preco(ultimo, 298, preco))
    if 'consumo_e_preco_kwh' in f['motivos']:
        assert (f['consumo_mes_kwh'] > f['consumo_ano_anterior_kwh']) == (f['preco_kwh_mes'] > f['preco_kwh_ano_anterior'])


def test_bandeira_nunca_e_motivo_proprio():
    assert not {m for m in MOTIVOS if 'bandeira' in m}
    f = fatos(historico(**ESTAVEL), por_preco(305, 298, 1.0, bandeira='VERMELHA P2', bandeira_anterior='VERDE'))
    assert (f['direcao_bandeira'], f['motivos']) == ('mais_cara', ['preco_kwh_subiu'])


@pytest.mark.parametrize('preco, aplica', [(1.2, True), (1.21, False), (0.39, False)])
def test_preco_variando_mais_de_50_por_cento_nao_decompoe_e_vira_aviso(preco, aplica):
    f = fatos(historico(**ESTAVEL), por_preco(305, 298, preco))
    assert f['decomposicao_aplicavel'] is aplica
    assert ('preco_kwh_fora_do_padrao' in f['avisos']) is not aplica
    if not aplica:
        assert f['direcao_preco_kwh'] is None
        assert not {'preco_kwh_subiu', 'preco_kwh_caiu', 'consumo_e_preco_kwh'} & set(f['motivos'])


def test_gd_conectada_no_periodo_nao_decompoe():
    f = fatos(historico(ultimo=357, ano_anterior=298), por_preco(357, 298, 0.82), geracao=gd(date(2025, 11, 20)))
    assert (f['decomposicao_aplicavel'], f['direcao_preco_kwh']) == (False, None)
    assert f['motivos'] == []                                            # consumo não caiu: GD não é motivo


def test_gd_anterior_ao_periodo_decompoe_normalmente():
    f = fatos(historico(ultimo=357, ano_anterior=298), por_preco(357, 298, 0.82), geracao=gd(date(2025, 2, 1)))
    assert f['motivos'] == ['consumo_e_preco_kwh']


@pytest.mark.parametrize('conta', [contas(valor_anterior=None), []])
def test_sem_valor_ou_sem_ano_anterior_nao_tem_preco(conta):
    f = fatos(historico(), conta)
    assert (f['preco_kwh_mes'], f['preco_kwh_ano_anterior'], f['variacao_preco_kwh_pct']) == (None, None, None)
    assert (f['direcao_preco_kwh'], f['decomposicao_aplicavel']) == (None, False)


def test_gd_conectada_no_periodo_com_consumo_caindo_e_motivo():
    f = fatos(historico(**CAIU), VALOR_CAIU, geracao=gd(date(2025, 11, 20)))
    assert (f['tem_gd'], f['mes_conexao_gd']) == (True, '2025-11')
    assert f['motivos'] == ['consumo_caiu', 'gd_conectada']


def test_gd_conectada_no_periodo_com_consumo_subindo_nao_e_motivo():
    f = fatos(historico(), VALOR_SUBIU, geracao=gd(date(2025, 11, 20)))
    assert f['motivos'] == ['consumo_subiu']


@pytest.mark.parametrize('conexao', [date(2025, 6, 30), date(2024, 3, 1)])
def test_gd_conectada_no_mes_do_ano_anterior_ou_antes_nao_e_motivo(conexao):
    f = fatos(historico(**CAIU), VALOR_CAIU, geracao=gd(conexao))
    assert f['motivos'] == ['consumo_caiu']


def test_gd_conectada_no_proprio_mes_analisado_conta():
    f = fatos(historico(**CAIU), geracao=gd(date(2026, 6, 1)))
    assert 'gd_conectada' in f['motivos']


# ---------- avisos (nunca motivo) ----------

@pytest.mark.parametrize('kwargs, mes, anterior', [
    ({'tipo': 'ESTIMADA'}, True, False),
    ({'tipo_anterior': 'ESTIMADA'}, False, True),
])
def test_leitura_estimada_no_mes_ou_no_ano_anterior_e_aviso(kwargs, mes, anterior):
    f = fatos(historico(ultimo=305, ano_anterior=298, **kwargs))
    assert (f['leitura_estimada_mes'], f['leitura_estimada_ano_anterior']) == (mes, anterior)
    assert (f['motivos'], f['avisos']) == ([], ['leitura_estimada'])


def test_troca_de_medidor_no_meio_da_janela_e_aviso():
    meses = [replace(m, troca_medidor=True) if m.mes == '2025-11' else m
             for m in historico(ultimo=305, ano_anterior=298)]
    f = fatos(meses)
    assert f['mes_troca_medidor'] == '2025-11'
    assert (f['motivos'], f['avisos']) == ([], ['troca_medidor'])


def test_troca_no_mes_analisado_conta_e_a_ultima_vale():
    meses = [replace(m, troca_medidor=True) if m.mes in ('2025-09', MES) else m
             for m in historico(ultimo=305, ano_anterior=298)]
    assert fatos(meses)['mes_troca_medidor'] == MES


def test_troca_no_mes_do_ano_anterior_fica_de_fora():
    f = fatos(historico(ultimo=305, ano_anterior=298, troca_anterior=True))
    assert (f['mes_troca_medidor'], f['avisos']) == (None, [])


def test_faturas_em_aberto_e_aviso_com_quantidade_e_valor_somado():
    f = fatos(abertas=[_fatura('2024-11', 'EM ABERTO'), _fatura('2026-06', 'EM ABERTO')])
    assert (f['faturas_em_aberto_qtd'], f['faturas_em_aberto_valor']) == (2, 972.0)
    assert (f['motivos'], f['avisos']) == ([], ['faturas_em_aberto'])


def test_todos_os_avisos_juntos_saem_na_ordem_fixa():
    meses = [replace(m, troca_medidor=True) if m.mes == '2026-01' else m
             for m in historico(ultimo=305, ano_anterior=298, tipo='ESTIMADA')]
    f = fatos(meses, por_preco(305, 298, 1.3), abertas=[_fatura('2026-06', 'EM ABERTO')])
    assert f['avisos'] == list(AVISOS)


def test_identificadores_de_motivos_e_avisos_nao_se_misturam():
    assert not set(MOTIVOS) & set(AVISOS)


# ---------- casos de borda ----------

def test_uc_sem_ano_anterior_tem_a_media_como_contexto_e_nenhum_motivo():
    # UC ligada em jan/2026: 6 meses, o último bem acima dos anteriores
    meses = [_mes(m, 200) for m in JANELA[6:-1]] + [_mes(MES, 300)]
    f = fatos(meses, contas(valor_anterior=None))
    assert f['mes_ano_anterior'] == ANO_ANTERIOR
    assert (f['consumo_ano_anterior_kwh'], f['variacao_consumo_ano_anterior_pct']) == (None, None)
    assert (f['direcao_consumo_ano_anterior'], f['direcao_consumo_media']) == (None, 'subiu')
    assert (f['valor_conta_ano_anterior'], f['direcao_valor_conta'], f['situacao_valor_conta']) == (None, None, None)
    assert (f['bandeira_ano_anterior'], f['direcao_bandeira']) == (None, None)
    assert f['leitura_estimada_ano_anterior'] is None
    assert f['motivos'] == []


@pytest.mark.parametrize('consumo', [0, None])
def test_consumo_zero_ou_nulo_nao_tem_direcao_nem_motivo_de_consumo(consumo):
    meses = historico(ultimo=305, ano_anterior=298)
    meses[-1] = _mes(MES, consumo, 298)
    f = fatos(meses)
    assert f['veredito_titulo'] == 'Sem consumo válido'
    assert (f['consumo_mes_kwh'], f['direcao_consumo_ano_anterior'], f['direcao_consumo_media']) == (None, None, None)
    assert (f['variacao_consumo_ano_anterior_pct'], f['desvio_consumo_media_pct']) == (None, None)
    assert f['motivos'] == []


def test_uc_com_gd_e_consumo_zero_nao_vira_gd_conectada():
    meses = historico(ultimo=305, ano_anterior=298)
    meses[-1] = _mes(MES, 0, 298)
    f = fatos(meses, geracao=gd(date(2025, 11, 20)))
    assert f['tem_gd'] is True
    assert f['motivos'] == []


def test_sem_conta_nos_meses_valor_e_bandeira_ficam_nulos_e_consumo_nao_vira_motivo():
    f = fatos(historico(), conta=[])
    assert (f['valor_conta_mes'], f['valor_conta_ano_anterior'], f['variacao_valor_conta_pct']) == (None, None, None)
    assert (f['bandeira_mes'], f['bandeira_ano_anterior'], f['direcao_bandeira']) == (None, None, None)
    assert f['direcao_consumo_ano_anterior'] == 'subiu'
    assert f['motivos'] == []


def test_bandeira_fora_do_dominio_nao_tem_direcao():
    f = fatos(conta=contas(bandeira='ROXA', bandeira_anterior='VERDE'))
    assert f['direcao_bandeira'] is None


def test_janela_sem_dado_da_uc_nao_tem_mes_nem_motivo():
    f = fatos(meses=[], conta=[], abertas=[_fatura('2024-11', 'EM ABERTO')])
    assert (f['mes_analisado'], f['mes_ano_anterior'], f['veredito_titulo']) == (None, None, None)
    assert (f['leitura_estimada_mes'], f['mes_troca_medidor']) == (None, None)
    assert (f['motivos'], f['avisos']) == ([], ['faturas_em_aberto'])
