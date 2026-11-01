"""V1c (4b): resumo da UC redigido pela IA, com modelo falso (FunctionModel), conferência e plano B."""
import json
import re
import time
from dataclasses import replace
from datetime import date
from functools import partial

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import FunctionModel

from app.ai.insights import escrever_insight
from app.core import config
from app.main import app
from app.repositories.unidade_repository import FichaUC
from app.services import insight_unidade
from app.services.fatos_unidade import AVISOS, MOTIVOS, carregar_fatos_unidade
from app.services.insight_service import PREFIXO_TEXTO_ALTERNATIVO, GeradorIA
from app.services.insight_unidade import (
    OBSERVACAO_CONFERENCIA, OBSERVACAO_FALHA, OBSERVACAO_SEM_IA, OBSERVACAO_SEM_SITUACAO,
)
from app.services.redacao_ia_unidade import (
    INSTRUCOES_UNIDADE, NUMERO_POR_EXTENSO, UNIDADE_REPETIDA, Caso, aparece, frases,
)
from app.services.texto_unidade import texto_por_regra_unidade
from tests.test_diagnostico_conta import JANELA, _mes, historico
from tests.test_fatos_unidade import ESTAVEL, MES, RepositorioComContas, contas, gd, por_preco
from tests.test_insight import gold_falsa  # noqa: F401  (autouse: get_db sem banco)
from tests.test_unidade_service import CADASTRO, MEDIDOR, METADADOS, _fatura

client = TestClient(app)
PEDIDO = {'contexto': 'unidade', 'id_uc': 'UC-1', 'filtros': {'periodo_atual': '2025-07/2026-06'}}
SEM_GD = FichaUC(CADASTRO, MEDIDOR, None)

# Caso base: valor +47% (R$ 350,20 × R$ 238,40), consumo +38% (motivo), preço +6% (estável), 1 fatura em
# aberto (aviso) e GD desde fev/2025 (contexto)
TITULO_IA = 'Consumo maior elevou o valor'
TEXTO_IA = ('Em {mes_analisado}, o valor da conta foi de {valor_conta_mes}, {variacao_valor_conta} acima de '
            '{mes_ano_anterior} ({valor_conta_ano_anterior}). O consumo subiu {variacao_consumo_ano_anterior}, '
            'de {consumo_ano_anterior} para {consumo_mes}. Vale verificar a fatura em aberto de '
            '{faturas_em_aberto_valor}.')
PREENCHIDO = ('Em jun/2026, o valor da conta foi de R$ 350,20, 47% acima de jun/2025 (R$ 238,40). O consumo subiu '
              '38%, de 298 kWh para 412 kWh. Vale verificar a fatura em aberto de R$ 486,00.')


def repo_base(**kwargs):
    return RepositorioComContas(conta=por_preco(412, 298, 0.85), meses=historico(), **kwargs)


def fatos_base(**kwargs):
    return carregar_fatos_unidade(repo_base(**kwargs), 'UC-1')


def modelo(*saidas, instrucoes=None):
    """Devolve as saídas em ordem (a última se repete); exceção é levantada; guarda as instruções recebidas."""
    fila = list(saidas)

    def chamar(mensagens, info):
        if instrucoes is not None:
            instrucoes.append(mensagens[-1].instructions)
        saida = fila.pop(0) if len(fila) > 1 else fila[0]
        if isinstance(saida, Exception):
            raise saida
        return ModelResponse(parts=[TextPart(content=json.dumps(saida))])
    return FunctionModel(chamar)


@pytest.fixture
def ia(monkeypatch):
    """GOLD_SOURCE=real, IA_MODO=real e o modelo trocado por um falso; devolve quem configura cada teste."""
    monkeypatch.setattr(config, 'GOLD_SOURCE', 'real')
    monkeypatch.setattr(config, 'IA_MODO', 'real')

    def configurar(*saidas, repo=None, instrucoes=None, escrever=None):
        monkeypatch.setattr(insight_unidade, 'repositorio', lambda db: repo or repo_base())
        escrever = escrever or partial(escrever_insight, modelo=modelo(*saidas, instrucoes=instrucoes))
        monkeypatch.setattr(insight_unidade, 'escritor', lambda: escrever)
    return configurar


def pedir() -> dict:
    resposta = client.post('/ia/insight', json=PEDIDO)
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def alternativo(corpo: dict) -> list[str]:
    return [o for o in corpo['metadados']['observacoes'] if o.startswith(PREFIXO_TEXTO_ALTERNATIVO)]


def regra(repo=None) -> dict:
    repo = repo or repo_base()
    return texto_por_regra_unidade(carregar_fatos_unidade(repo, 'UC-1'), repo.metadados())


def ok(texto=TEXTO_IA, titulo=TITULO_IA) -> dict:
    return {'titulo': titulo, 'texto': texto}


# ---------- resposta válida ----------

def test_resposta_valida_usa_o_texto_da_ia_e_o_titulo_do_codigo(ia):
    ia(ok())
    corpo = pedir()
    assert corpo['texto'] == PREENCHIDO
    assert corpo['titulo'] == regra()['titulo'] == 'Valor da conta subiu'      # a situação é do código
    assert alternativo(corpo) == []                                            # selo "Gerado por IA"
    assert corpo['metadados']['observacoes'] == METADADOS['observacoes']
    assert [n['nome'] for n in corpo['numeros_utilizados']] == [
        'valor_conta_mes', 'variacao_valor_conta', 'valor_conta_ano_anterior', 'variacao_consumo_ano_anterior',
        'consumo_ano_anterior', 'consumo_mes', 'faturas_em_aberto_valor']


def test_o_modelo_recebe_as_instrucoes_da_unidade_com_o_caso(ia):
    vistas = []
    ia(ok(), instrucoes=vistas)
    pedir()
    assert vistas[0].startswith(INSTRUCOES_UNIDADE)
    assert '- o consumo subiu {variacao_consumo_ano_anterior}, de {consumo_ano_anterior} para {consumo_mes}.' in vistas[0]
    assert ('Avisos (a última frase do texto, exatamente neste molde, com os marcadores):\n'
            'Pontos a verificar: há {faturas_em_aberto_qtd} fatura em aberto, de {faturas_em_aberto_valor}.') in vistas[0]
    assert '(s)' not in vistas[0]
    sem_marcadores = re.sub(r'\{[a-z_]+\}', '', vistas[0])
    assert not [nome for nome in (*MOTIVOS, *AVISOS) if nome in sem_marcadores]   # categorias em palavras, sem ids


def test_aviso_de_faturas_no_caso_concorda_com_a_quantidade():
    duas = RepositorioComContas(conta=por_preco(412, 298, 0.85), meses=historico())
    duas.faturas_abertas = lambda id_uc: [_fatura('2024-11', 'EM ABERTO'), _fatura('2025-01', 'EM ABERTO')]
    caso = Caso(carregar_fatos_unidade(duas, 'UC-1')).instrucoes()
    assert 'Pontos a verificar: há {faturas_em_aberto_qtd} faturas em aberto, somando {faturas_em_aberto_valor}.' in caso
    assert '(s)' not in caso


def test_marcadores_so_do_que_o_caso_usa():
    m = Caso(fatos_base()).marcadores
    assert m['valor_conta_mes'] == 'R$ 350,20' and m['variacao_consumo_ano_anterior'] == '38%'
    assert m['mes_conexao_gd'] == 'fev/2025'                                  # GD de contexto entrou
    assert not {'media_consumo', 'base_media', 'desvio_consumo_media'} & m.keys()   # consumo é motivo: sem média
    assert not {'bandeira_mes', 'bandeira_ano_anterior', 'preco_kwh_mes'} & m.keys()
    assert all('-' not in v and '−' not in v for v in m.values())


def test_bandeira_so_entra_nos_marcadores_quando_acompanha_o_preco():
    repo = RepositorioComContas(conta=por_preco(305, 298, 1.0, bandeira='VERMELHA P2', bandeira_anterior='VERDE'),
                                meses=historico(**ESTAVEL))
    m = Caso(carregar_fatos_unidade(repo, 'UC-1')).marcadores
    assert (m['bandeira_ano_anterior'], m['bandeira_mes']) == ('verde', 'vermelha patamar 2')


# ---------- validador do time: nova tentativa e plano B ----------

def test_algarismo_fora_de_marcador_pede_nova_tentativa_e_a_segunda_vale(ia):
    ia(ok(texto=TEXTO_IA.replace('{variacao_consumo_ano_anterior}', '38%')), ok())
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (PREENCHIDO, [])


def test_algarismo_fora_de_marcador_persistente_vira_texto_por_regra(ia):
    # Número errado digitado: o insights.py devolve ao marcador só o valor que bate exatamente com um marcador
    ia(ok(texto=TEXTO_IA.replace('{variacao_consumo_ano_anterior}', '39%')))
    corpo = pedir()
    assert corpo['texto'] == regra()['texto']
    assert alternativo(corpo) == [OBSERVACAO_FALHA]


def test_marcador_inexistente_vira_texto_por_regra(ia):
    ia(ok(texto=TEXTO_IA + ' Tarifa de {tarifa_inventada}.'))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_FALHA])


def test_erro_do_modelo_vira_texto_por_regra(ia):
    ia(RuntimeError('provedor fora do ar'))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_FALHA])


def test_timeout_vira_texto_por_regra(ia, monkeypatch):
    def lento(valores, instrucoes=None):
        time.sleep(1)
        return {'titulo': 'Tarde', 'texto': 'Tarde demais.'}
    ia(escrever=lento)
    monkeypatch.setattr(insight_unidade, 'prazo_ia_s', lambda: 0.2)
    inicio = time.perf_counter()
    corpo = pedir()
    assert time.perf_counter() - inicio < 0.9                                  # a rota desiste no prazo
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_FALHA])


@pytest.mark.parametrize('ia_timeout_s, prazo_esperado', [(90, 20), (30, 20), (15, 10)])
def test_resumo_usa_prazo_proprio_com_o_ia_timeout_como_teto(ia, monkeypatch, ia_timeout_s, prazo_esperado):
    prazos = []

    def executar_gravando(funcao, prazo_s):
        prazos.append(prazo_s)
        return funcao()
    ia(ok())
    monkeypatch.setattr(config, 'IA_TIMEOUT_S', ia_timeout_s)
    monkeypatch.setattr(insight_unidade, 'executar_com_prazo', executar_gravando)
    assert alternativo(pedir()) == []
    assert prazos == [prazo_esperado]


def test_chat_e_receita_seguem_com_o_prazo_da_ponte(monkeypatch):
    from app.services import ia_service
    monkeypatch.setattr(config, 'IA_TIMEOUT_S', 90)
    assert ia_service.prazo_ia_s() == 85                                       # o prazo compartilhado não mudou
    assert insight_unidade.PRAZO_RESUMO_S == 20


# ---------- conferência de cobertura ----------

@pytest.mark.parametrize('texto', [
    TEXTO_IA.replace(' Vale verificar a fatura em aberto de {faturas_em_aberto_valor}.', ''),   # omite aviso
    TEXTO_IA.replace('O consumo subiu {variacao_consumo_ano_anterior}, ', 'O consumo subiu, '),  # omite motivo
    TEXTO_IA + ' Ótimo. Até logo.',                                             # mais de 4 frases
    TEXTO_IA.replace('Vale verificar', 'Vale auto-verificar'),                  # hífen
    TEXTO_IA.replace('O consumo subiu', 'Pelo consumo_subiu, o consumo subiu'),  # identificador interno
    TEXTO_IA.replace('Vale verificar', 'Vale { verificar'),                     # chave sobrando
    TEXTO_IA + ' A bandeira não mudou.',                                        # bandeira sem bandeira no caso
    TEXTO_IA.replace('Vale verificar', 'Sobre a conta, vale verificar'),        # "a conta" sozinho
], ids=['omite-aviso', 'omite-motivo', 'mais-de-4-frases', 'hifen', 'identificador', 'chave', 'bandeira',
        'a-conta'])
def test_conferencia_reprova_e_vale_o_texto_por_regra(ia, texto):
    ia(ok(texto=texto))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


@pytest.mark.parametrize('palavra', ['geração própria', 'painel', 'solar'])
def test_geracao_propria_sem_gd_no_caso_reprova(ia, palavra):
    repo = repo_base(ficha=SEM_GD)
    ia(ok(texto=TEXTO_IA + f' A unidade tem {palavra}.'), repo=repo)
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra(repo)['texto'], [OBSERVACAO_CONFERENCIA])


def test_geracao_propria_com_gd_no_caso_passa(ia):
    ia(ok(texto=TEXTO_IA.replace(' Vale verificar', ' A unidade tem geração própria desde {mes_conexao_gd}, já '
                                                    'presente no mesmo mês do ano anterior. Vale verificar')))
    corpo = pedir()
    assert alternativo(corpo) == []
    assert 'geração própria desde fev/2025' in corpo['texto']


# ---------- GD de antes do período e valor do ano anterior ----------

GD_SEM_ANO_ANTERIOR = ' A unidade tem geração própria desde {mes_conexao_gd}.'


@pytest.mark.parametrize('frase_gd', [
    ' A unidade tem geração própria desde {mes_conexao_gd}, já presente no mesmo mês do ano anterior.',
    ' A unidade já tinha painel solar em {mes_ano_anterior}, desde {mes_conexao_gd}.',
], ids=['ano-anterior-por-extenso', 'mes-do-ano-anterior'])
def test_gd_de_antes_do_periodo_citando_o_ano_anterior_passa(ia, frase_gd):
    ia(ok(texto=TEXTO_IA.replace(' Vale verificar', frase_gd + ' Vale verificar')))
    assert alternativo(pedir()) == []


@pytest.mark.parametrize('frase_gd', [
    GD_SEM_ANO_ANTERIOR,
    ' A unidade possui painel solar desde {mes_conexao_gd}.',
], ids=['geracao-propria', 'painel-solar'])
def test_gd_de_antes_do_periodo_sem_citar_o_ano_anterior_reprova(ia, frase_gd):
    ia(ok(texto=TEXTO_IA.replace(' Vale verificar', frase_gd + ' Vale verificar')))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


def test_gd_conectada_no_periodo_sem_ser_motivo_nao_exige_o_ano_anterior(ia):
    # Conectada em nov/2025 com o consumo subindo: contexto "passou a ter", a regra do ano anterior não vale
    repo = repo_base(ficha=FichaUC(CADASTRO, MEDIDOR, gd(date(2025, 11, 20))))
    caso = Caso(carregar_fatos_unidade(repo, 'UC-1'))
    assert caso.com_gd and not caso.gd_antes_do_periodo
    ia(ok(texto=TEXTO_IA.replace(' Vale verificar', ' A unidade passou a ter geração própria em {mes_conexao_gd}.'
                                                    ' Vale verificar')), repo=repo)
    assert alternativo(pedir()) == []


def test_o_caso_pede_o_ano_anterior_ao_citar_a_gd():
    assert 'diga sempre que ela já existia no mesmo mês do ano anterior' in Caso(fatos_base()).instrucoes()


def test_contexto_pede_frases_proprias_na_ordem_media_e_gd_com_o_molde_da_gd():
    caso = Caso(carregar_fatos_unidade(repo_media_e_gd(), 'UC-1')).instrucoes()
    bloco = caso.split('Contexto (', 1)[1].split('Avisos (', 1)[0]
    assert 'cada item numa frase própria' in bloco and 'primeiro a média, depois a geração própria' in bloco
    assert bloco.index('da {base_media}') < bloco.index('geração própria desde {mes_conexao_gd}')
    assert ('Molde da frase: "A unidade tem geração própria desde {mes_conexao_gd}, já presente no mesmo mês do '
            'ano anterior."') in bloco


# ---------- leitura estimada no mês analisado ----------

def repo_estimada(**tipos):
    return RepositorioComContas(conta=por_preco(412, 298, 0.85), meses=historico(**tipos))


AVISO_ESTIMADA = (' Vale verificar que a leitura de {mes_analisado} foi estimada e o consumo pode ser ajustado na '
                  'próxima leitura real.')


def test_caso_traz_a_consequencia_da_leitura_estimada_no_mes():
    caso = Caso(carregar_fatos_unidade(repo_estimada(tipo='ESTIMADA'), 'UC-1')).instrucoes()
    assert ('Pontos a verificar: a leitura de {mes_analisado} foi estimada e o consumo pode ser ajustado na '
            'próxima leitura real; há {faturas_em_aberto_qtd} fatura em aberto, de {faturas_em_aberto_valor}.') in caso


def test_caso_com_os_dois_meses_estimados_concorda_no_plural():
    caso = Caso(carregar_fatos_unidade(repo_estimada(tipo='ESTIMADA', tipo_anterior='ESTIMADA'), 'UC-1')).instrucoes()
    assert ('Pontos a verificar: as leituras de {mes_analisado} e de {mes_ano_anterior} foram estimadas e o '
            'consumo de {mes_analisado} pode ser ajustado na próxima leitura real;') in caso


def test_caso_sem_consequencia_quando_so_o_ano_anterior_foi_estimado():
    caso = Caso(carregar_fatos_unidade(repo_estimada(tipo_anterior='ESTIMADA'), 'UC-1')).instrucoes()
    assert 'Pontos a verificar: a leitura de {mes_ano_anterior} foi estimada;' in caso
    assert 'próxima leitura' not in caso


def test_leitura_estimada_no_mes_com_a_consequencia_passa(ia):
    ia(ok(texto=TEXTO_IA + AVISO_ESTIMADA), repo=repo_estimada(tipo='ESTIMADA'))
    assert alternativo(pedir()) == []


def test_leitura_estimada_no_mes_sem_a_consequencia_reprova(ia):
    # Como a IA fez na validação: só que a leitura foi estimada, sem dizer o que isso muda
    sem = TEXTO_IA + ' Vale verificar que a leitura de {mes_analisado} foi estimada.'
    repo = repo_estimada(tipo='ESTIMADA')
    ia(ok(texto=sem), repo=repo)
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra(repo)['texto'], [OBSERVACAO_CONFERENCIA])
    assert 'próxima leitura real' in corpo['texto']                         # o texto por regra traz


def test_so_o_ano_anterior_estimado_nao_exige_a_consequencia(ia):
    ia(ok(texto=TEXTO_IA + ' A leitura de {mes_ano_anterior} foi estimada.'), repo=repo_estimada(tipo_anterior='ESTIMADA'))
    assert alternativo(pedir()) == []


# ---------- os dois meses no formato da tela ----------

@pytest.mark.parametrize('texto', [
    # Como a IA fez na validação: o percentual e o valor, sem o mês da comparação
    TEXTO_IA.replace('{mes_ano_anterior} ({valor_conta_ano_anterior})', '{valor_conta_ano_anterior}'),
    # Como a IA fez na validação: o ano por extenso, fora do marcador
    TEXTO_IA.replace('Em {mes_analisado}', 'Em jun/dois mil vinte e seis'),
], ids=['sem-o-mes-do-ano-anterior', 'ano-por-extenso'])
def test_mes_fora_do_formato_da_tela_reprova(ia, texto):
    ia(ok(texto=texto))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


def test_os_dois_meses_entram_nos_numeros_chave_com_ano_anterior():
    chaves = Caso(fatos_base()).numeros_chave()
    assert 'jun/2026' in chaves and 'jun/2025' in chaves


def test_sem_ano_anterior_os_meses_nao_sao_exigidos(ia):
    meses = [_mes(m, 200) for m in JANELA[6:-1]] + [_mes(MES, 300)]
    repo = RepositorioComContas(conta=contas(valor_anterior=None), meses=meses, ficha=SEM_GD)
    ia(ok(texto='O valor da conta deste mês foi de {valor_conta_mes}; não há o mesmo mês do ano anterior para '
                'comparar. Vale verificar a fatura em aberto de {faturas_em_aberto_valor}.'), repo=repo)
    assert alternativo(pedir()) == []


# ---------- molde da frase de avisos e "verificar" ----------

def test_caso_traz_a_frase_de_avisos_inteira_como_molde():
    # Troca de medidor e faturas em aberto
    repo = repo_base()
    repo._meses = [replace(m, troca_medidor=True) if m.mes == '2025-12' else m for m in historico()]
    repo.faturas_abertas = lambda id_uc: [_fatura('2024-11', 'EM ABERTO'), _fatura('2025-01', 'EM ABERTO')]
    caso = Caso(carregar_fatos_unidade(repo, 'UC-1')).instrucoes()
    assert caso.endswith('Avisos (a última frase do texto, exatamente neste molde, com os marcadores):\n'
                         'Pontos a verificar: houve troca de medidor em {mes_troca_medidor}; há '
                         '{faturas_em_aberto_qtd} faturas em aberto, somando {faturas_em_aberto_valor}.')


def test_caso_sem_avisos_nao_traz_molde():
    repo = RepositorioComContas(conta=por_preco(412, 298, 0.85), meses=historico())
    repo.faturas_abertas = lambda id_uc: []
    caso = Caso(carregar_fatos_unidade(repo, 'UC-1'))
    assert caso.molde_avisos() is None and caso.instrucoes().endswith('Avisos:\n- nenhum')


def test_avisos_como_fatos_soltos_sem_verificar_reprova(ia):
    # Como a IA fez na validação: as faturas em aberto como fato solto, sem dizer que é ponto a verificar
    ia(ok(texto=TEXTO_IA.replace('Vale verificar a fatura em aberto de', 'Há uma fatura em aberto de')))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


@pytest.mark.parametrize('frase', ['Verifique a fatura em aberto de', 'Pontos a verificar: há uma fatura em aberto de'])
def test_avisos_com_verifique_ou_pontos_a_verificar_passam(ia, frase):
    ia(ok(texto=TEXTO_IA.replace('Vale verificar a fatura em aberto de', frase)))
    assert alternativo(pedir()) == []


def test_sem_avisos_verificar_nao_e_exigido(ia):
    repo = RepositorioComContas(conta=por_preco(412, 298, 0.85), meses=historico(), ficha=SEM_GD)
    repo.faturas_abertas = lambda id_uc: []
    ia(ok(texto=TEXTO_IA.replace(' Vale verificar a fatura em aberto de {faturas_em_aberto_valor}.', '')), repo=repo)
    assert alternativo(pedir()) == []


# ---------- número por extenso ----------

# O padrão de um texto recusado na validação final, com os números fictícios do caso base: tudo por extenso, fora dos
# marcadores, então o validador do agente (que só barra algarismos) deixa passar
TEXTO_TODO_POR_EXTENSO = (
    'O valor da conta de jun/dois mil e vinte e seis, de R$ trezentos e cinquenta reais e vinte centavos, ficou '
    'quarenta e sete por cento acima do valor da conta de jun/dois mil e vinte e cinco, de R$ duzentos e trinta e '
    'oito reais e quarenta centavos. O consumo subiu trinta e oito por cento, de duzentos e noventa e oito '
    'quilowatts hora para quatrocentos e doze. Pontos a verificar: há uma fatura em aberto de R$ quatrocentos e '
    'oitenta e seis reais.')


def test_texto_todo_por_extenso_reprova(ia):
    ia(ok(texto=TEXTO_TODO_POR_EXTENSO))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])
    assert 'número por extenso' in ' '.join(Caso(fatos_base()).conferir(TEXTO_TODO_POR_EXTENSO))


@pytest.mark.parametrize('acrescimo', [
    ' Isso se repete há três meses.',        # número inventado junto com todos os números certos
    ' O aumento foi de vinte por cento.',
    ' São dois mil kWh no ano.',
    ' A diferença passa de cem reais.',
], ids=['tres-meses', 'vinte-por-cento', 'dois-mil', 'cem-reais'])
def test_numero_inventado_por_extenso_com_os_numeros_certos_reprova(ia, acrescimo):
    ia(ok(texto=TEXTO_IA + acrescimo))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


def test_duas_faturas_por_extenso_reprova(ia):
    texto = TEXTO_IA.replace('Vale verificar a fatura em aberto de', 'Vale verificar as duas faturas em aberto, somando')
    ia(ok(texto=texto))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


@pytest.mark.parametrize('palavra', [
    'dois', 'duas', 'três', 'tres', 'dezenove', 'vinte', 'cinquenta', 'noventa', 'cem', 'cento', 'duzentos',
    'duzentas', 'quinhentas', 'novecentos', 'mil', 'milhão', 'milhões', 'por cento', 'reais', 'centavos',
    'quilowatt', 'Dez', 'dez faturas',
])
def test_cada_palavra_numerica_e_recusada(palavra):
    assert NUMERO_POR_EXTENSO.search(f'O valor foi de {palavra} no mês.')


@pytest.mark.parametrize('trecho', [
    'houve troca de medidor em dez/2025',     # mês abreviado seguido de "/" não é número
    'houve troca de medidor em dez / 2025',
    'há uma fatura em aberto',                # "um"/"uma" são artigo
    'um aumento dentro do normal',
    'o percentual ficou estável',             # só palavra inteira: "cento" dentro de "percentual" não conta
    'a milhagem e o cemitério',
    'o consumo dos 12 meses anteriores',
])
def test_sem_falso_positivo(trecho):
    assert not NUMERO_POR_EXTENSO.search(trecho)


def test_texto_aceito_com_dez_barra_ano_passa(ia):
    # Como textos aceitos na validação final: troca de medidor num mês abreviado como dez/2025
    repo = repo_base()
    repo._meses = [replace(m, troca_medidor=True) if m.mes == '2025-12' else m for m in historico()]
    texto = TEXTO_IA.replace('Vale verificar a fatura em aberto de {faturas_em_aberto_valor}.',
                             'Pontos a verificar: houve troca de medidor em {mes_troca_medidor}; há uma fatura em '
                             'aberto, de {faturas_em_aberto_valor}.')
    ia(ok(texto=texto), repo=repo)
    corpo = pedir()
    assert alternativo(corpo) == []
    assert 'dez/2025' in corpo['texto']


def test_instrucoes_proibem_numero_por_extenso():
    assert 'Nunca escreva números\n   por extenso; todo número, valor, percentual ou mês vem de um marcador.' in INSTRUCOES_UNIDADE


# ---------- unidade repetida ----------

# O marcador já traz a unidade; repeti-la fora dele duplica ("R$ R$ 350,20"), e o número-chave segue no texto
@pytest.mark.parametrize('com_marcador, preenchido, repetida', [
    (('de {valor_conta_mes}', 'de R$ {valor_conta_mes}'), ('de R$ 350,20', 'de R$ R$ 350,20'), 'R$ R$'),
    (('de {valor_conta_mes}', 'de R${valor_conta_mes}'), ('de R$ 350,20', 'de R$R$ 350,20'), 'R$R$'),
    (('para {consumo_mes}.', 'para {consumo_mes} kWh.'), ('para 412 kWh.', 'para 412 kWh kWh.'), 'kWh kWh'),
    (('subiu {variacao_consumo_ano_anterior}', 'subiu {variacao_consumo_ano_anterior} %'),
     ('subiu 38%', 'subiu 38% %'), '% %'),
], ids=['reais', 'reais-sem-espaco', 'kwh', 'percentual'])
def test_unidade_repetida_reprova(ia, com_marcador, preenchido, repetida):
    ia(ok(texto=TEXTO_IA.replace(*com_marcador)))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])
    # É a única falha: sem a checagem, o texto passaria (o número-chave continua lá)
    assert Caso(fatos_base()).conferir(PREENCHIDO.replace(*preenchido)) == [f'unidade repetida: {repetida}']


@pytest.mark.parametrize('trecho', [
    'de R$ 0,85 por kWh',                     # preço por kWh: R$ antes e kWh depois, sem repetir
    'de 298 kWh para 412 kWh',
    'subiu 38% e o preço 6%',
    'de R$ 238,40 para R$ 350,20',
])
def test_unidade_sem_repetir_nao_e_recusada(trecho):
    assert not UNIDADE_REPETIDA.search(trecho)


def test_instrucoes_dizem_que_o_marcador_ja_traz_a_unidade():
    assert ('Os marcadores de valor em reais,\n   de kWh e de percentual já trazem a unidade (R$, kWh, %): nunca '
            'repita a unidade antes ou depois do\n   marcador.') in INSTRUCOES_UNIDADE


def test_valor_do_ano_anterior_omitido_reprova(ia):
    ia(ok(texto=TEXTO_IA.replace(' ({valor_conta_ano_anterior})', '')))
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_CONFERENCIA])


def test_sem_ano_anterior_o_valor_do_ano_anterior_nao_e_exigido(ia):
    meses = [_mes(m, 200) for m in JANELA[6:-1]] + [_mes(MES, 300)]
    repo = RepositorioComContas(conta=contas(valor_anterior=None), meses=meses, ficha=SEM_GD)
    ia(ok(texto='O valor da conta de {mes_analisado} foi de {valor_conta_mes}; não há o mesmo mês do ano anterior '
                'para comparar. Vale verificar a fatura em aberto de {faturas_em_aberto_valor}.'), repo=repo)
    corpo = pedir()
    assert alternativo(corpo) == []
    assert corpo['titulo'] == 'Sem base de comparação'


# Caso com média e GD de contexto: consumo estável no ano e 36% abaixo da média, valor 13% abaixo (estável),
# GD desde fev/2025 e 1 fatura em aberto
ABAIXO_DA_MEDIA = {'ultimo': 52, 'ano_anterior': 60, 'base': 83}
TEXTO_MEDIA_E_GD = ('O valor da conta de {mes_analisado} foi de {valor_conta_mes}, {variacao_valor_conta} abaixo de '
                    '{mes_ano_anterior} ({valor_conta_ano_anterior}), dentro do normal. O consumo de {mes_analisado} '
                    '({consumo_mes}) ficou {desvio_consumo_media} abaixo da {base_media} ({media_consumo}). A unidade '
                    'tem geração própria desde {mes_conexao_gd}, já presente no mesmo mês do ano anterior. Vale '
                    'verificar a fatura em aberto de {faturas_em_aberto_valor}.')
# Caso com bandeira como detalhe do preço: consumo estável, preço +25% e bandeira de verde para vermelha patamar 2
TEXTO_BANDEIRA = ('O valor da conta de {mes_analisado} foi de {valor_conta_mes}, {variacao_valor_conta} acima de '
                  '{mes_ano_anterior} ({valor_conta_ano_anterior}). O preço médio por kWh subiu {variacao_preco_kwh}, '
                  'de {preco_kwh_ano_anterior} para {preco_kwh_mes}, com a bandeira passando de '
                  '{bandeira_ano_anterior} para {bandeira_mes}. Vale verificar a fatura em aberto de '
                  '{faturas_em_aberto_valor}.')


def repo_media_e_gd():
    return RepositorioComContas(conta=por_preco(52, 60, 0.8), meses=historico(**ABAIXO_DA_MEDIA))


def repo_bandeira():
    return RepositorioComContas(conta=por_preco(305, 298, 1.0, bandeira='VERMELHA P2', bandeira_anterior='VERDE'),
                                meses=historico(**ESTAVEL), ficha=SEM_GD)


def test_media_e_gd_em_frases_proprias_passam(ia):
    ia(ok(texto=TEXTO_MEDIA_E_GD), repo=repo_media_e_gd())
    corpo = pedir()
    assert alternativo(corpo) == []
    assert 'geração própria desde fev/2025' in corpo['texto'] and 'abaixo da média' in corpo['texto']


@pytest.mark.parametrize('juncao', [', e a unidade tem', ', enquanto a unidade tem', '; a unidade tem'])
def test_media_e_gd_na_mesma_frase_reprova(ia, juncao):
    ia(ok(texto=TEXTO_MEDIA_E_GD.replace('. A unidade tem', juncao)), repo=repo_media_e_gd())
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra(repo_media_e_gd())['texto'], [OBSERVACAO_CONFERENCIA])


def test_bandeira_do_caso_com_a_palavra_passa(ia):
    ia(ok(texto=TEXTO_BANDEIRA), repo=repo_bandeira())
    corpo = pedir()
    assert alternativo(corpo) == []
    assert 'com a bandeira passando de verde para vermelha patamar 2' in corpo['texto']


def test_bandeira_do_caso_sem_a_palavra_reprova(ia):
    # Como a IA fez na validação: "com a mudança de <uma bandeira> para <outra>", sem a palavra "bandeira"
    texto = TEXTO_BANDEIRA.replace('com a bandeira passando de', 'com a mudança de')
    ia(ok(texto=texto), repo=repo_bandeira())
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra(repo_bandeira())['texto'], [OBSERVACAO_CONFERENCIA])


def test_frases_nao_corta_no_ponto_do_milhar():
    assert frases('O valor foi de R$ 1.234,56. Ficou estável.') == ['O valor foi de R$ 1.234,56', 'Ficou estável']


def test_instrucoes_exigem_os_dois_valores_em_reais_na_primeira_frase():
    assert ('traz os dois valores em reais: o do mês ({valor_conta_mes}) e, quando houver, o do mesmo\n'
            '   mês do ano anterior ({valor_conta_ano_anterior})') in INSTRUCOES_UNIDADE


def test_conferencia_aceita_o_proprio_texto_por_regra():
    # O plano B passa na mesma régua que a IA
    for repo in (repo_base(), repo_base(ficha=SEM_GD), repo_media_e_gd(), repo_bandeira(),
                 RepositorioComContas(conta=por_preco(305, 298, 1.0, bandeira='VERMELHA P2', bandeira_anterior='VERDE'),
                                      meses=historico(**ESTAVEL))):
        fatos = carregar_fatos_unidade(repo, 'UC-1')
        assert Caso(fatos).conferir(texto_por_regra_unidade(fatos, METADADOS)['texto']) == []


# ---------- números do texto ----------

@pytest.mark.parametrize('valor, texto, esperado', [
    ('4%', 'O valor subiu 4%.', True),
    ('4%', 'O valor subiu 24%.', False),
    ('4%', 'O valor subiu 4,5%.', False),
    ('52 kWh', 'de 152 kWh para 160 kWh', False),
    ('52 kWh', 'de 52 kWh para 60 kWh', True),
    ('R$ 61,35', 'foi de R$ 61,35.', True),
    ('R$ 1,35', 'foi de R$ 61,35.', False),
])
def test_busca_do_valor_respeita_o_limite_do_numero(valor, texto, esperado):
    assert aparece(valor, texto) is esperado


def test_numeros_utilizados_so_os_que_aparecem_no_texto(ia):
    # O consumo do ano anterior não é número-chave: tirá-lo do texto passa e ele sai da lista
    ia(ok(texto=TEXTO_IA.replace('de {consumo_ano_anterior} para {consumo_mes}', 'chegando a {consumo_mes}')))
    corpo = pedir()
    assert alternativo(corpo) == []
    nomes = [n['nome'] for n in corpo['numeros_utilizados']]
    assert 'consumo_ano_anterior' not in nomes and 'consumo_mes' in nomes


# ---------- modos ----------

def test_mock_sai_com_o_texto_por_regra_marcado_como_alternativo(ia, monkeypatch):
    def nao_chamar(*args, **kwargs):
        raise AssertionError('o modelo não pode ser chamado no modo mock')
    ia(escrever=nao_chamar)
    monkeypatch.setattr(config, 'IA_MODO', 'mock')
    corpo = pedir()
    assert (corpo['texto'], alternativo(corpo)) == (regra()['texto'], [OBSERVACAO_SEM_IA])


def test_sem_valor_da_conta_nao_chama_o_modelo(ia):
    def nao_chamar(*args, **kwargs):
        raise AssertionError('sem situação não há o que redigir')
    # Só a conta do ano anterior: o mês analisado fica sem valor
    repo = RepositorioComContas(conta=contas(valor=None), meses=historico())
    ia(escrever=nao_chamar, repo=repo)
    assert alternativo(pedir()) == [OBSERVACAO_SEM_SITUACAO]


def test_receita_continua_chamando_o_escritor_sem_instrucoes():
    chamadas = []

    def escrever(*args, **kwargs):
        chamadas.append((args, kwargs))
        return {'titulo': 'Receita', 'texto': 'Texto.'}
    from types import SimpleNamespace
    filtros = SimpleNamespace(municipio=None, bairro=None, classe=None, periodo_atual='2025-07/2026-06',
                              periodo_comparacao='2022-07/2023-06')
    numeros = [{'nome': n, 'valor': 1.0} for n in ('receita_energia_atual', 'receita_energia_comparacao',
                                                   'variacao_volume', 'reajuste', 'efeito_preco', 'efeito_volume')]
    GeradorIA(escrever=escrever, prazo_s=5).gerar({'filtros': filtros, 'numeros_utilizados': numeros})
    assert len(chamadas) == 1 and chamadas[0][1] == {}                        # nenhum instrucoes passado
