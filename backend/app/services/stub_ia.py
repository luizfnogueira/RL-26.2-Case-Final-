"""Respostas pré-definidas do assistente e do insight; não há agente, SQL executado nem parser de segurança."""
from app.core.exceptions import AppException, UCInexistenteException
from app.schemas.dashboard import FiltrosDashboard
from app.schemas.ia import PedidoInsight, PerguntaIA
from app.services.stub_dashboard import montar_dashboard
from app.services.stubs import CAMPOS_REGIAO, exemplo, verificar_cenario

PERGUNTA_OK = 'qual foi a receita no período?'
PERGUNTA_BLOQUEADA = 'drop table clientes'
UC_INSIGHT = 'UC-DEMO-001'
NUMEROS_UNIDADE = (
    ('ultimo_mes', 'Último mês'),
    ('mesmo_mes_ano_anterior', 'Mesmo mês do ano anterior'),
    ('media_12_meses', 'Média de 12 meses'),
    ('variacao_percentual', 'Variação sobre o ano anterior'),
)


def responder(dados: PerguntaIA) -> dict:
    pergunta = dados.pergunta.casefold()
    if pergunta == PERGUNTA_BLOQUEADA:
        return exemplo('resposta_ia_bloqueado')
    contexto = dados.contexto.model_dump() if dados.contexto else None
    if pergunta == PERGUNTA_OK and contexto == exemplo('pergunta_ia')['contexto']:
        return exemplo('resposta_ia')
    return exemplo('resposta_ia_nao_sei')


def _brl(valor: float) -> str:
    sinal = '−' if valor < 0 else ''
    valor = abs(valor)
    if valor >= 1_000_000:
        texto = f'{valor / 1_000_000:.1f} milhões'
    elif valor >= 1_000:
        texto = f'{valor / 1_000:.1f} mil'
    else:
        texto = f'{valor:.2f}'
    return f'{sinal}R$ {texto.replace(".", ",")}'


def _pct(valor: float, sinal: bool = True) -> str:
    return (f'{valor:+.1f}%' if sinal else f'{valor:.1f}%').replace('.', ',').replace('-', '−')


def _numero(nome: str, rotulo: str, ind: dict) -> dict:
    return {'nome': nome, 'rotulo': rotulo, **ind}


def _conferir(enviados: list, esperados: list[dict]) -> None:
    """Indicadores enviados pelo front são opcionais, mas se vierem precisam bater com o cenário."""
    if not enviados:
        return
    recebidos = {i.nome: i for i in enviados}
    if recebidos.keys() != {n['nome'] for n in esperados} or any(
        abs((recebidos[n['nome']].valor or 0) - n['valor']) > 0.01
        or recebidos[n['nome']].unidade != n['unidade']
        or recebidos[n['nome']].periodo_referencia != n['periodo_referencia']
        for n in esperados
    ):
        raise AppException('Os indicadores enviados não correspondem ao cenário consultado.',
                           codigo='DADOS_INVALIDOS', status_code=422)


def _insight_receita(dados: PedidoInsight) -> dict:
    filtros = dados.filtros
    dashboard = montar_dashboard(FiltrosDashboard(**filtros.model_dump()))
    ponte = dashboard['ponte_receita']
    numeros = [
        _numero('receita_energia_atual', 'Receita de energia atual', ponte['receita_energia_atual']),
        _numero('receita_energia_comparacao', 'Receita de energia base', ponte['receita_energia_comparacao']),
        _numero('variacao_volume', 'Volume', dashboard['indicadores']['energia_faturada']['variacao_percentual']),
        _numero('reajuste', 'Reajuste', ponte['reajuste_percentual']),
        _numero('efeito_preco', 'Efeito-preço', ponte['efeito_preco']),
        _numero('efeito_volume', 'Efeito-volume', ponte['efeito_volume']),
    ]
    _conferir(dados.indicadores, numeros)
    v = {n['nome']: n['valor'] for n in numeros}
    regiao = ' / '.join(getattr(filtros, c) for c in CAMPOS_REGIAO if getattr(filtros, c))
    recorte = f'Em {regiao}' if regiao else 'No consolidado'
    texto = (
        f'{recorte}, a receita de energia passou de {_brl(v["receita_energia_comparacao"])} '
        f'para {_brl(v["receita_energia_atual"])}. '
        f'O reajuste de {_pct(v["reajuste"], sinal=False)} gerou um efeito-preço de {_brl(v["efeito_preco"])}, '
        f'enquanto o volume faturado variou {_pct(v["variacao_volume"])} e respondeu por um efeito-volume '
        f'de {_brl(v["efeito_volume"])}.'
    )
    if v['efeito_preco'] > 0 > v['efeito_volume']:
        texto += ' O crescimento da receita veio do preço, não de mais consumo.'
    base = exemplo('resposta_insight')
    return {**base, 'texto': texto, 'numeros_utilizados': numeros, 'metadados': dashboard['metadados']}


def _insight_unidade(dados: PedidoInsight) -> dict:
    if dados.id_uc != UC_INSIGHT:
        raise UCInexistenteException(f"Unidade Consumidora '{dados.id_uc}' não disponível no cenário.")
    diagnostico = exemplo('unidade')['diagnostico_conta']
    numeros = [_numero(nome, rotulo, diagnostico[nome]) for nome, rotulo in NUMEROS_UNIDADE]
    _conferir(dados.indicadores, numeros)
    return {**exemplo('resposta_insight_unidade'), 'numeros_utilizados': numeros}


def gerar_insight(dados: PedidoInsight) -> dict:
    verificar_cenario(dados.filtros.periodo_atual, dados.filtros.periodo_comparacao)
    if dados.contexto == 'receita':
        return _insight_receita(dados)
    return _insight_unidade(dados)
