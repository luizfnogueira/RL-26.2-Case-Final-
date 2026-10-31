"""V1c: fatos da UC para o resumo por IA da Visão 360. Só números e categorias, nunca dado pessoal.

Os números saem do mesmo diagnosticar_conta e dos mesmos dados do GET /unidades/{id}. O código decide
os motivos (o que explica a mudança do valor da conta contra o ano anterior, só quando a direção
combina) e os avisos (o que pede cautela e nunca é causa). A IA só redige a partir daqui.

O valor é consumo × preço médio por kWh: quando o valor muda e nenhum dos dois passa do limiar sozinho,
o motivo é a combinação dos dois. A bandeira não é motivo próprio, só detalhe do preço.
"""
from decimal import Decimal

from app.core.exceptions import GoldNaoCarregadaException, UCInexistenteException
from app.repositories.unidade_repository import (
    ContaMes, FaturaUC, GeracaoDistribuidaUC, MesConsumo, UnidadeRepositoryInterface,
)
from app.schemas.common import limites
from app.services.unidade_service import (
    LIMIAR_MEDIA_PCT, diagnosticar_conta, estados_consumo, janela_padrao, somar_meses,
)

DIRECAO = {'acima': 'subiu', 'abaixo': 'caiu', 'em linha': 'estável'}
SITUACAO_VALOR = {'subiu': 'alta', 'caiu': 'baixa', 'estável': 'normal'}
# Domínio da Gold, da mais barata para a mais cara. "P1/P2" aqui é patamar, não período.
ORDEM_BANDEIRA = ('VERDE', 'AMARELA', 'VERMELHA P1', 'VERMELHA P2')
# Variação do preço médio por kWh acima disto não é tarifa nem bandeira (nenhuma passa de ~26% na Gold):
# a decomposição não se aplica e vira aviso.
LIMITE_PRECO_PCT = 50
# Ordem fixa: a lista sai sempre na mesma ordem, com só os que se aplicam.
MOTIVOS = ('consumo_subiu', 'consumo_caiu', 'preco_kwh_subiu', 'preco_kwh_caiu', 'consumo_e_preco_kwh',
           'gd_conectada')
AVISOS = ('leitura_estimada', 'troca_medidor', 'faturas_em_aberto', 'preco_kwh_fora_do_padrao')
# Lista branca: a saída tem exatamente estes campos. Nada de nome, CPF, endereço ou identificadores.
CAMPOS = (
    'mes_analisado', 'mes_ano_anterior', 'periodo_media', 'veredito_titulo',
    'consumo_mes_kwh', 'consumo_ano_anterior_kwh', 'media_consumo_kwh', 'meses_na_media',
    'variacao_consumo_ano_anterior_pct', 'direcao_consumo_ano_anterior',
    'desvio_consumo_media_pct', 'direcao_consumo_media',
    'valor_conta_mes', 'valor_conta_ano_anterior', 'variacao_valor_conta_pct', 'direcao_valor_conta',
    'situacao_valor_conta',
    'preco_kwh_mes', 'preco_kwh_ano_anterior', 'variacao_preco_kwh_pct', 'direcao_preco_kwh',
    'decomposicao_aplicavel',
    'bandeira_mes', 'bandeira_ano_anterior', 'direcao_bandeira',
    'leitura_estimada_mes', 'leitura_estimada_ano_anterior', 'mes_troca_medidor',
    'tem_gd', 'mes_conexao_gd',
    'faturas_em_aberto_qtd', 'faturas_em_aberto_valor',
    'motivos', 'avisos',
)


def _positivo(valor: Decimal | float | None) -> float | None:
    """Consumo e valor só entram se > 0; nulo ou ≤ 0 não é base, e nada é inventado no lugar."""
    return None if valor is None or valor <= 0 else round(float(valor), 2)


def _direcao_pct(variacao: float) -> str:
    """Mesmo limiar de 20% do veredito, estrito nos dois sentidos."""
    return 'subiu' if variacao > LIMIAR_MEDIA_PCT else 'caiu' if variacao < -LIMIAR_MEDIA_PCT else 'estável'


def _direcao_bandeira(mes: str | None, anterior: str | None) -> str | None:
    if mes not in ORDEM_BANDEIRA or anterior not in ORDEM_BANDEIRA or mes == anterior:
        return None
    return 'mais_cara' if ORDEM_BANDEIRA.index(mes) > ORDEM_BANDEIRA.index(anterior) else 'mais_barata'


def montar_fatos_unidade(meses: list[MesConsumo], periodo: str, contas: list[ContaMes],
                         gd: GeracaoDistribuidaUC | None, faturas_abertas: list[FaturaUC]) -> dict:
    """Fatos do mês analisado pelo diagnóstico: números sem sinal, direções à parte, motivos e avisos.

    `meses` é o mesmo do GET /unidades/{id} (a janela e os 12 meses antes dela); `contas` traz o valor e a
    bandeira do mês analisado e do mesmo mês do ano anterior.
    """
    diagnostico = diagnosticar_conta(meses, periodo)
    analisado = diagnostico['periodo_referencia']
    ano_anterior = somar_meses(analisado, -12) if analisado else None
    por_mes = {m.mes: m for m in meses}
    ultimo, anterior = por_mes.get(analisado), por_mes.get(ano_anterior)

    consumo = _positivo(diagnostico['ultimo_mes']['valor'])
    media = diagnostico['media_12_meses']['valor']
    variacao_gold = diagnostico['variacao_percentual']['valor']
    estado_ano = estado_media = None
    if consumo is not None:
        estado_ano, estado_media = estados_consumo(Decimal(str(consumo)), diagnostico['conta_alta'],
                                                   variacao_gold, media)
    direcao_ano, direcao_media = DIRECAO.get(estado_ano), DIRECAO.get(estado_media)

    conta = {c.mes: c for c in contas}
    conta_mes, conta_anterior = conta.get(analisado), conta.get(ano_anterior)
    valor_mes = _positivo(conta_mes and conta_mes.valor_total)
    valor_anterior = _positivo(conta_anterior and conta_anterior.valor_total)
    variacao_valor = (round((valor_mes / valor_anterior - 1) * 100, 2)
                      if valor_mes is not None and valor_anterior is not None else None)
    direcao_valor = None if variacao_valor is None else _direcao_pct(variacao_valor)
    bandeira_mes = conta_mes.bandeira_tarifaria if conta_mes else None
    bandeira_anterior = conta_anterior.bandeira_tarifaria if conta_anterior else None
    direcao_bandeira = _direcao_bandeira(bandeira_mes, bandeira_anterior)

    mes_conexao_gd = gd.data_conexao.strftime('%Y-%m') if gd and gd.data_conexao else None
    gd_no_periodo = mes_conexao_gd is not None and ano_anterior is not None and (
        ano_anterior < mes_conexao_gd <= analisado)
    # Troca entre o mesmo mês do ano anterior (exclusive) e o mês analisado (inclusive): a última delas.
    trocas = [m.mes for m in meses if analisado and ano_anterior < m.mes <= analisado and m.troca_medidor]

    # Preço médio por kWh (valor ÷ consumo) dos dois meses. Só com consumo e valor > 0 nos dois lados.
    consumo_anterior = _positivo(diagnostico['mesmo_mes_ano_anterior']['valor'])
    preco_mes = preco_anterior = variacao_preco = None
    if None not in (consumo, consumo_anterior, valor_mes, valor_anterior, direcao_ano):
        preco_mes, preco_anterior = valor_mes / consumo, valor_anterior / consumo_anterior
        variacao_preco = round((preco_mes / preco_anterior - 1) * 100, 2)
    fora_do_padrao = variacao_preco is not None and abs(variacao_preco) > LIMITE_PRECO_PCT
    # GD conectada no período muda o que o kWh faturado significa; o motivo gd_conectada cobre esse caso.
    decompoe = variacao_preco is not None and not fora_do_padrao and not gd_no_periodo
    direcao_preco = _direcao_pct(variacao_preco) if decompoe else None

    # Motivos explicam o valor da conta, que é comparado com o ano anterior: consumo e preço só são motivo
    # quando andam junto com o valor. A comparação com a média fica nos fatos, como contexto.
    aplica = {
        'consumo_subiu': direcao_ano == 'subiu' and direcao_valor == 'subiu',
        'consumo_caiu': direcao_ano == 'caiu' and direcao_valor == 'caiu',
        'preco_kwh_subiu': direcao_preco == 'subiu' and direcao_valor == 'subiu',
        'preco_kwh_caiu': direcao_preco == 'caiu' and direcao_valor == 'caiu',
        'gd_conectada': gd_no_periodo and direcao_ano == 'caiu',
        'leitura_estimada': any(m is not None and m.tipo_leitura == 'ESTIMADA' for m in (ultimo, anterior)),
        'troca_medidor': bool(trocas),
        'faturas_em_aberto': bool(faturas_abertas),
        'preco_kwh_fora_do_padrao': fora_do_padrao,
    }
    # Valor mudando sem que consumo ou preço passe do limiar sozinho: o motivo é a combinação dos dois.
    aplica['consumo_e_preco_kwh'] = decompoe and direcao_valor in ('subiu', 'caiu') and not any(
        aplica[m] for m in ('consumo_subiu', 'consumo_caiu', 'preco_kwh_subiu', 'preco_kwh_caiu'))
    return {
        'mes_analisado': analisado,
        'mes_ano_anterior': ano_anterior,
        'periodo_media': diagnostico['media_12_meses']['periodo_referencia'] if analisado else None,
        'veredito_titulo': diagnostico['veredito']['titulo'] if diagnostico['veredito'] else None,
        'consumo_mes_kwh': consumo,
        'consumo_ano_anterior_kwh': consumo_anterior,
        'media_consumo_kwh': media,
        'meses_na_media': diagnostico['meses_media'],
        'variacao_consumo_ano_anterior_pct': (round(abs(variacao_gold), 2)
                                              if direcao_ano and variacao_gold is not None else None),
        'direcao_consumo_ano_anterior': direcao_ano,
        # Mesma conta do texto do veredito, sem o arredondamento para inteiro (fica para o texto)
        'desvio_consumo_media_pct': round(abs(consumo / media - 1) * 100, 2) if direcao_media else None,
        'direcao_consumo_media': direcao_media,
        'valor_conta_mes': valor_mes,
        'valor_conta_ano_anterior': valor_anterior,
        'variacao_valor_conta_pct': None if variacao_valor is None else abs(variacao_valor),
        'direcao_valor_conta': direcao_valor,
        'situacao_valor_conta': SITUACAO_VALOR.get(direcao_valor),
        'preco_kwh_mes': None if preco_mes is None else round(preco_mes, 4),
        'preco_kwh_ano_anterior': None if preco_anterior is None else round(preco_anterior, 4),
        'variacao_preco_kwh_pct': None if variacao_preco is None else abs(variacao_preco),
        'direcao_preco_kwh': direcao_preco,
        'decomposicao_aplicavel': decompoe,
        'bandeira_mes': bandeira_mes,
        'bandeira_ano_anterior': bandeira_anterior,
        'direcao_bandeira': direcao_bandeira,
        'leitura_estimada_mes': None if ultimo is None else ultimo.tipo_leitura == 'ESTIMADA',
        'leitura_estimada_ano_anterior': None if anterior is None else anterior.tipo_leitura == 'ESTIMADA',
        'mes_troca_medidor': max(trocas) if trocas else None,
        'tem_gd': gd is not None,
        'mes_conexao_gd': mes_conexao_gd,
        'faturas_em_aberto_qtd': len(faturas_abertas),
        'faturas_em_aberto_valor': round(float(sum(f.valor_total for f in faturas_abertas)), 2),
        'motivos': [m for m in MOTIVOS if aplica[m]],
        'avisos': [a for a in AVISOS if aplica[a]],
    }


def carregar_fatos_unidade(repository: UnidadeRepositoryInterface, id_uc: str,
                           periodo_atual: str | None = None) -> dict:
    """Mesmas leituras e mesma janela do GET /unidades/{id}, mais o valor da conta dos dois meses."""
    ultimo_mes = repository.ultimo_mes()
    if ultimo_mes is None:
        raise GoldNaoCarregadaException()
    ficha = repository.ficha(id_uc)
    if ficha is None:
        raise UCInexistenteException(f"Unidade Consumidora '{id_uc}' não encontrada no cadastro.")
    periodo = periodo_atual or janela_padrao(ultimo_mes)
    inicio, fim = limites(periodo)
    meses = repository.consumo(id_uc, somar_meses(inicio, -12), fim)
    analisado = diagnosticar_conta(meses, periodo)['periodo_referencia']
    contas = repository.contas(id_uc, [somar_meses(analisado, -12), analisado]) if analisado else []
    return montar_fatos_unidade(meses, periodo, contas, ficha.gd, repository.faturas_abertas(id_uc))
