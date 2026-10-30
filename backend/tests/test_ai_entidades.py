"""GENAI-8: reconhecimento de entidades. Catálogo pequeno montado no teste, sem banco."""
from app.ai.entidades import montar_catalogo, resolver_entidades

CATALOGO = montar_catalogo(
    [
        ('JABOATÃO DOS GUARARAPES', 'PIEDADE'),
        ('JABOATÃO DOS GUARARAPES', 'GUARARAPES'),
        ('RECIFE', 'IPUTINGA'),
        ('RECIFE', 'RECIFE'),
        ('RECIFE', 'TORRE'),
        ('RECIFE', "CAIXA D'ÁGUA"),
        ('OLINDA', 'CENTRO'),
        ('PAULISTA', 'CENTRO'),
        ('CABO DE SANTO AGOSTINHO', 'SANTO AGOSTINHO'),
        ('CABO DE SANTO AGOSTINHO', 'DISTRITO INDUSTRIAL SANTO ESTEVÃO'),
        ('ABREU E LIMA', 'ALTO DA CONQUISTA (BONANÇA)'),
    ],
    ['ALM-REC-001'],
)


def resolver(pergunta):
    return resolver_entidades(pergunta, CATALOGO)


def test_apelido_e_acento_viram_o_nome_do_banco():
    assert resolver('Quanto a receita comercial cresceu em jaboatao?') == {
        'municipio': ['JABOATÃO DOS GUARARAPES'], 'classe': ['COMERCIAL']}


def test_bairro_vem_com_o_municipio():
    assert resolver('consumo residencial na Iputinga')['bairro'] == [{'bairro': 'IPUTINGA', 'municipio': 'RECIFE'}]


def test_nome_de_municipio_nao_vira_bairro():
    assert resolver('receita de Recife') == {'municipio': ['RECIFE']}
    assert resolver('DEC no Cabo de Santo Agostinho') == {'municipio': ['CABO DE SANTO AGOSTINHO']}


def test_bairro_em_varios_municipios_gera_aviso():
    resultado = resolver('Quantas UCs tem no Centro?')
    assert len(resultado['bairro']) == 2 and 'OLINDA, PAULISTA' in resultado['avisos'][0]


def test_municipio_na_pergunta_desfaz_a_ambiguidade():
    resultado = resolver('Quantas UCs tem no centro de Olinda?')
    assert resultado['bairro'] == [{'bairro': 'CENTRO', 'municipio': 'OLINDA'}] and 'avisos' not in resultado


def test_bairro_no_municipio_errado_gera_aviso():
    resultado = resolver('receita da Iputinga em Olinda')
    assert 'não fica em OLINDA' in resultado['avisos'][0]


def test_bairro_que_e_palavra_comum_so_conta_com_prefixo():
    assert 'bairro' not in resolver('a torre de energia caiu')
    assert resolver('consumo do bairro da Torre')['bairro'] == [{'bairro': 'TORRE', 'municipio': 'RECIFE'}]


def test_distrito_industrial_e_bairro_e_nao_classe():
    resultado = resolver('receita do distrito industrial santo estevao')
    assert 'classe' not in resultado and resultado['bairro'][0]['bairro'] == 'DISTRITO INDUSTRIAL SANTO ESTEVÃO'


def test_parenteses_e_apostrofo_no_nome():
    assert resolver('alto da conquista')['bairro'][0]['bairro'] == 'ALTO DA CONQUISTA (BONANÇA)'
    assert resolver("consumo da Caixa d'Água")['bairro'][0]['bairro'] == "CAIXA D'ÁGUA"


def test_codigos_de_uc_e_alimentador():
    assert resolver('histórico da uc 100000 no alm-rec-001') == {
        'alimentador': ['ALM-REC-001'], 'id_uc': ['UC100000']}
    assert 'não existe' in resolver('DEC do ALM-XYZ-999')['avisos'][0]


def test_sem_nada_reconhecido_devolve_vazio():
    assert resolver('Qual foi a inadimplência em 2025?') == {}