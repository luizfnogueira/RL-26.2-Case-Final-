"""Reconhece na pergunta nomes que existem no banco (GENAI-8, IR do CHESS).

"jaboatao", "Jaboatão" ou "JABOATAO" viram 'JABOATÃO DOS GUARARAPES', que é como está na Gold.
O resultado vai para o prompt do agente (`entidades_resolvidas`), que então filtra com o valor certo
em vez de chutar a grafia.
"""
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache

from app.ai.guardrails import normalizar

# Mesmo texto de esclarecimento_ia.TODOS (botão "Todos os municípios juntos").
# Não importo de lá porque app.services abre conexão com o banco ao ser importado.
TODOS = 'somando todos os municípios'

logger = logging.getLogger(__name__)

# Apelidos comuns. As chaves já estão sem acento e em minúsculas.
APELIDOS_MUNICIPIO = {
    'jaboatao': 'JABOATÃO DOS GUARARAPES',
    'cabo': 'CABO DE SANTO AGOSTINHO',
    'sao lourenco': 'SÃO LOURENÇO DA MATA',
    'itamaraca': 'ILHA DE ITAMARACÁ',
}

# No banco a classe fica sem acento e em maiúsculas.
APELIDOS_CLASSE = {
    'residencial': 'RESIDENCIAL', 'residenciais': 'RESIDENCIAL', 'residencia': 'RESIDENCIAL',
    'residencias': 'RESIDENCIAL',
    'comercial': 'COMERCIAL', 'comerciais': 'COMERCIAL', 'comercio': 'COMERCIAL',
    'industrial': 'INDUSTRIAL', 'industriais': 'INDUSTRIAL', 'industria': 'INDUSTRIAL', 'industrias': 'INDUSTRIAL',
    'rural': 'RURAL', 'rurais': 'RURAL',
    'poder publico': 'PODER PUBLICO', 'orgao publico': 'PODER PUBLICO', 'orgaos publicos': 'PODER PUBLICO',
    'setor publico': 'PODER PUBLICO',
}

# Bairros que também são palavras comuns ("oitenta por cento", "no centro da questão" não).
# Só contam quando vêm depois de "bairro".
BAIRROS_SO_COM_PREFIXO = {'oitenta', 'monte', 'nobre', 'socorro', 'barro', 'poco', 'torre', 'prado', 'pilar'}

def _chave(nome: str) -> str:
    """'ALTO DA CONQUISTA (BONANÇA)' -> 'alto da conquista'; "CAIXA D'ÁGUA" -> 'caixa dagua'."""
    return normalizar(re.sub(r'\s*\(.*?\)', '', nome)).replace("'", '')


@dataclass(frozen=True)
class Catalogo:
    municipios: dict[str, str] = field(default_factory=dict)              # chave -> nome no banco
    bairros: dict[str, list[tuple[str, str]]] = field(default_factory=dict)  # chave -> [(bairro, municipio)]
    alimentadores: frozenset[str] = frozenset()


def montar_catalogo(pares_municipio_bairro, alimentadores=()) -> Catalogo:
    municipios, bairros = {}, {}
    for municipio, bairro in pares_municipio_bairro:
        municipios[_chave(municipio)] = municipio
        bairros.setdefault(_chave(bairro), []).append((bairro, municipio))
    for apelido, oficial in APELIDOS_MUNICIPIO.items():
        if oficial in municipios.values():
            municipios.setdefault(apelido, oficial)
    return Catalogo(municipios, bairros, frozenset(alimentadores))


@lru_cache(maxsize=1)
def carregar_catalogo() -> Catalogo:
    """Lê os nomes uma vez por processo, com o mesmo usuário somente leitura do agente."""
    from app.ai.consulta import executar_consulta  # import tardio: os testes rodam sem banco
    pares = executar_consulta('SELECT DISTINCT municipio, bairro FROM dim_uc').linhas
    alimentadores = executar_consulta('SELECT alimentador FROM dim_alimentador').linhas
    return montar_catalogo(pares, [linha[0] for linha in alimentadores])


def _procurar(texto: str, chaves) -> list[re.Match]:
    """Acha as chaves no texto, preferindo a mais longa ('jardim caetes' antes de 'caetes i')."""
    if not chaves:
        return []
    ordenadas = sorted(chaves, key=len, reverse=True)
    padrao = re.compile(r'(?<!\w)(' + '|'.join(re.escape(c) for c in ordenadas) + r')(?!\w)')
    return list(padrao.finditer(texto))


def _apagar(texto: str, achados: list[re.Match]) -> str:
    """Troca o trecho já reconhecido por espaços, para não ser lido de novo como outra coisa."""
    for achado in achados:
        texto = texto[:achado.start()] + ' ' * (achado.end() - achado.start()) + texto[achado.end():]
    return texto


def resolver_entidades(pergunta: str, catalogo: Catalogo | None = None) -> dict:
    if catalogo is None:
        try:
            catalogo = carregar_catalogo()
        except Exception:
            # Sem banco, ainda reconhece classe, UC e alimentador pelo formato
            logger.warning('Não foi possível carregar os nomes da Gold para reconhecer entidades', exc_info=True)
            catalogo = Catalogo()

    texto = normalizar(pergunta).replace("'", '')
    entidades: dict[str, list] = {'municipio': [], 'bairro': [], 'classe': [], 'alimentador': [], 'id_uc': []}
    avisos: list[str] = []

    # Município primeiro: "Cabo de Santo Agostinho" não pode virar o bairro SANTO AGOSTINHO.
    achados = _procurar(texto, catalogo.municipios)
    for achado in achados:
        oficial = catalogo.municipios[achado.group(1)]
        if oficial not in entidades['municipio']:
            entidades['municipio'].append(oficial)
    texto = _apagar(texto, achados)

    # Bairro, filtrando pelo município quando a pergunta disser qual.
    achados = []
    for achado in _procurar(texto, catalogo.bairros):
        chave = achado.group(1)
        if chave in BAIRROS_SO_COM_PREFIXO and not re.search(r'bairros? (d[aeo]s? )?$', texto[:achado.start()]):
            continue
        achados.append(achado)
        opcoes = catalogo.bairros[chave]
        no_municipio = [(b, m) for b, m in opcoes if m in entidades['municipio']]
        if entidades['municipio'] and not no_municipio:
            onde = ', '.join(sorted({m for _, m in opcoes}))
            avisos.append(f'O bairro {opcoes[0][0]} não fica em {", ".join(entidades["municipio"])} (fica em {onde}).')
        escolhidos = no_municipio or opcoes
        if len(escolhidos) > 1 and normalizar(TODOS) in texto:
            # Botão "Todos os municípios juntos" do esclarecimento: a pessoa já escolheu somar
            avisos.append(f'A pessoa pediu o bairro {escolhidos[0][0]} somando todos os municípios: '
                          'some sem separar por municipio e diga isso na resposta.')
        elif len(escolhidos) > 1:
            onde = ', '.join(sorted(m for _, m in escolhidos))
            avisos.append(f'Existe bairro {escolhidos[0][0]} em {len(escolhidos)} municípios ({onde}). '
                          'Agrupe por municipio e deixe isso claro na resposta.')
        for bairro, municipio in escolhidos:
            item = {'bairro': bairro, 'municipio': municipio}
            if item not in entidades['bairro']:
                entidades['bairro'].append(item)
    texto = _apagar(texto, achados)

    # Classe: depois do bairro, para "Distrito Industrial" não virar classe INDUSTRIAL.
    for achado in _procurar(texto, APELIDOS_CLASSE):
        oficial = APELIDOS_CLASSE[achado.group(1)]
        if oficial not in entidades['classe']:
            entidades['classe'].append(oficial)

    # Códigos com formato fixo: UC100000 e ALM-ABR-001.
    for numero in re.findall(r'\buc\s*-?\s*(\d{6})\b', texto):
        entidades['id_uc'].append(f'UC{numero}')
    for sigla, numero in re.findall(r'\balm\s*-?\s*([a-z]{3})\s*-?\s*(\d{3})\b', texto):
        codigo = f'ALM-{sigla.upper()}-{numero}'
        entidades['alimentador'].append(codigo)
        if catalogo.alimentadores and codigo not in catalogo.alimentadores:
            avisos.append(f'O alimentador {codigo} não existe na Gold.')

    resultado = {nome: valores for nome, valores in entidades.items() if valores}
    if avisos:
        resultado['avisos'] = avisos
    return resultado