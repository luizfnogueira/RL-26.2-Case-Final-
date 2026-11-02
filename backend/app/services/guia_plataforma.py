"""Leitor do guia da plataforma (app/ai/guia/plataforma.md): o que o assistente pode contar sobre o portal.

O agente do guia responde só com as seções que este módulo entrega. Por isso o filtro falha fechado:
seção sem `{#id}`, sem a linha de metadados ou com nível desconhecido não sai daqui, e comentários
(as instruções para quem escreve) nunca entram no texto.

Formato de cada seção:
    ## Título {#id}
    <!-- nivel: publico | rota: /caminho | palavras: termo1, termo2 -->
    texto em Markdown
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

CAMINHO_GUIA = Path(__file__).resolve().parents[1] / "ai" / "guia" / "plataforma.md"

# Ordem dos níveis: quem tem um nível vê as seções dele e as dos níveis abaixo. Sem login, todo
# mundo é "publico"; quando o login entrar, o nível vem do token, nunca do texto da pergunta.
NIVEIS = {"publico": 0, "analista": 1, "gestor": 2}
NIVEL_PADRAO = "publico"

LIMITE_SECOES = 4
# ~2.500 tokens de guia por pergunta (cerca de 4 caracteres por token)
ORCAMENTO_CARACTERES = 10_000
# Sem nenhuma seção ligada à pergunta, o agente recebe a apresentação e os primeiros passos
SECOES_DE_PARTIDA = ("sobre", "primeiros-passos")

_TITULO = re.compile(r"^##\s+(?P<titulo>.+?)\s*\{#(?P<id>[a-z0-9]+(?:-[a-z0-9]+)*)\}\s*$")
_TITULO_SEM_ID = re.compile(r"^##\s+")
_METADADOS = re.compile(r"^<!--(?P<campos>.*?)-->\s*$")
_COMENTARIO = re.compile(r"<!--.*?-->", re.DOTALL)
_PALAVRA_DO_TITULO = re.compile(r"[a-z0-9]{4,}")
# Palavras do título que aparecem em quase toda pergunta e não ajudam a escolher a seção
_VAZIAS = {"como", "para", "qual", "quais", "onde", "esta", "essa", "isso", "sobre", "plataforma"}
_LIGACAO = {"o", "a", "os", "as", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "um", "uma",
            "que", "qual", "quais", "como", "onde", "para", "por", "com", "se", "eu", "me", "meu", "minha"}


@dataclass(frozen=True)
class SecaoGuia:
    id: str
    titulo: str
    nivel: str
    rota: str | None
    palavras: tuple[str, ...]
    texto: str


@dataclass(frozen=True)
class Guia:
    versao: str
    secoes: tuple[SecaoGuia, ...]
    # Seções deixadas de fora e por quê: o teste de segurança do guia (V2) confere que está vazio
    problemas: tuple[str, ...] = field(default=())

    def secao(self, id_secao: str) -> SecaoGuia | None:
        return next((s for s in self.secoes if s.id == id_secao), None)


def normalizar(texto: str) -> str:
    """Minúsculo, sem acento, só letras e números separados por um espaço: "Visão 360?" → "visao 360"."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFKD", texto or "") if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).split())


def _metadados(linha: str) -> dict[str, str] | None:
    achado = _METADADOS.match(linha.strip())
    if not achado:
        return None
    campos = {}
    for parte in achado.group("campos").split("|"):
        chave, _, valor = parte.partition(":")
        if valor:
            campos[chave.strip().lower()] = valor.strip()
    return campos if "nivel" in campos else None


def ler_guia(conteudo: str) -> Guia:
    """Separa as seções do texto do guia; o que estiver antes do primeiro `##` (título e instruções) fica de fora."""
    blocos: list[tuple[str, list[str]]] = []
    for linha in conteudo.splitlines():
        if _TITULO_SEM_ID.match(linha):
            blocos.append((linha, []))
        elif blocos:
            blocos[-1][1].append(linha)

    secoes: list[SecaoGuia] = []
    problemas: list[str] = []
    for titulo, linhas in blocos:
        cabecalho = _TITULO.match(titulo.strip())
        if not cabecalho:
            problemas.append(f"seção sem {{#id}}: {titulo.strip()}")
            continue
        id_secao = cabecalho.group("id")
        primeira = next((i for i, l in enumerate(linhas) if l.strip()), None)
        campos = _metadados(linhas[primeira]) if primeira is not None else None
        if campos is None:
            problemas.append(f"{id_secao}: falta a linha de metadados com o nível")
            continue
        nivel = campos["nivel"].lower()
        if nivel not in NIVEIS:
            problemas.append(f"{id_secao}: nível desconhecido '{nivel}'")
            continue
        if any(s.id == id_secao for s in secoes):
            problemas.append(f"{id_secao}: id repetido")
            continue
        rota = campos.get("rota", "-")
        palavras = tuple(p for p in (normalizar(x) for x in campos.get("palavras", "").split(",")) if p)
        texto = _COMENTARIO.sub("", "\n".join(linhas[primeira + 1:]))
        texto = re.sub(r"\n{3,}", "\n\n", texto).strip()
        secoes.append(SecaoGuia(id_secao, cabecalho.group("titulo").strip(), nivel,
                                None if rota in ("", "-") else rota, palavras, texto))
    versao = hashlib.sha1(conteudo.encode("utf-8")).hexdigest()[:12]
    return Guia(versao, tuple(secoes), tuple(problemas))


@lru_cache(maxsize=4)
def _guia_em_cache(caminho: str, _modificado_em: int) -> Guia:
    return ler_guia(Path(caminho).read_text(encoding="utf-8"))


def carregar_guia(caminho: Path = CAMINHO_GUIA) -> Guia:
    """O guia lido do arquivo; relido quando o arquivo muda (a versão muda junto e invalida o cache de respostas)."""
    return _guia_em_cache(str(caminho), caminho.stat().st_mtime_ns)


def permitidas(guia: Guia, nivel: str = NIVEL_PADRAO) -> list[SecaoGuia]:
    """As seções que esse nível pode receber; nível desconhecido não recebe nenhuma."""
    teto = NIVEIS.get(nivel)
    if teto is None:
        return []
    return [s for s in guia.secoes if NIVEIS[s.nivel] <= teto]


def _pontos_da_expressao(expressao: str, texto: str, palavras_da_pergunta: set[str]) -> int:
    termos = expressao.split()
    importantes = [t for t in termos if t not in _LIGACAO and len(t) > 1]
    # Expressão só de palavras de ligação ("o que e") cabe em qualquer pergunta: não ajuda a escolher
    if not importantes:
        return 0
    if f" {expressao} " in texto:
        return 2 + len(termos)
    # Mesmas palavras em outra ordem ("como o assistente funciona" ~ "como funciona o assistente") ou
    # flexionadas ("cancelo uma ordem" ~ "cancelar ordem"): compara pelo radical
    radicais = {_radical(p) for p in palavras_da_pergunta}
    if all(_radical(t) in radicais for t in importantes):
        return 2 + len(importantes)
    return 0


def _radical(palavra: str) -> str:
    """Radical grosseiro de 4 letras: "cancelo" e "cancelar" → "canc", "ordem" e "ordens" → "orde"."""
    return palavra[:4]


def _pontos(secao: SecaoGuia, pergunta: str) -> int:
    texto = f" {pergunta} "
    palavras_da_pergunta = set(pergunta.split())
    # Expressão de várias palavras ("ordem de inspecao") vale mais que uma palavra solta ("inspecao")
    pontos = sum(_pontos_da_expressao(p, texto, palavras_da_pergunta) for p in secao.palavras)
    titulo = set(_PALAVRA_DO_TITULO.findall(normalizar(secao.titulo))) - _VAZIAS
    return pontos + len(titulo & palavras_da_pergunta)


def secoes_para(pergunta: str, nivel: str = NIVEL_PADRAO, limite: int = LIMITE_SECOES,
                guia: Guia | None = None) -> list[SecaoGuia]:
    """Até `limite` seções ligadas à pergunta, da mais para a menos ligada, dentro do orçamento de tamanho."""
    guia = guia or carregar_guia()
    candidatas = permitidas(guia, nivel)
    texto = normalizar(pergunta)
    pontuadas = [(p, i, s) for i, s in enumerate(candidatas) if (p := _pontos(s, texto)) > 0]
    escolhidas = [s for _, _, s in sorted(pontuadas, key=lambda x: (-x[0], x[1]))]
    if not escolhidas:
        escolhidas = [s for s in candidatas if s.id in SECOES_DE_PARTIDA]

    selecionadas: list[SecaoGuia] = []
    tamanho = 0
    for secao in escolhidas[:limite]:
        if selecionadas and tamanho + len(secao.texto) > ORCAMENTO_CARACTERES:
            break
        selecionadas.append(secao)
        tamanho += len(secao.texto)
    return selecionadas


def texto_para_o_agente(secoes: list[SecaoGuia]) -> str:
    """As seções no formato que o agente do guia recebe e cita: `[id] Título`, seguido do texto."""
    return "\n\n".join(f"### [{s.id}] {s.titulo}\n{s.texto}" for s in secoes)
