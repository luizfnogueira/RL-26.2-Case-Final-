"""Gráfico na conversa: o backend escolhe barras, pizza ou linhas pela forma dos dados (contrato, seção 9).

O modelo não desenha nem escreve números: os valores do gráfico são as células de `dados`, que vêm
do banco. Regras de leitura (Nastengraph, "Bar/Pie/Line charts best practices"):
- barras: eixo do zero; maior → menor, ou na ordem natural (P1 → P2, meses); horizontais para
  categorias, verticais para períodos; até 20 barras.
- pizza: só parte de um todo (somas, nunca médias ou %); até 5 fatias, "Outros" no fim; fatias
  parecidas viram barras.
- linhas: só tempo, da esquerda para a direita; até 4 linhas; mês sem dado fica como buraco.

Sem pedido de gráfico, só comparação (P1 × P2) e série no tempo viram gráfico; ranking continua tabela.
"""
import re
from typing import Any

MAX_BARRAS = 20
MAX_BARRAS_TEMPO = 24
MAX_PONTOS_LINHA = 48
MAX_SERIES = 4
MAX_FATIAS = 5
# Diferença entre a maior e a menor fatia abaixo disso: a pizza não mostra nada, vira barras
FATIAS_PARECIDAS = 0.05

_GRAFICO = re.compile(r"\bgr[aá]fico", re.IGNORECASE)
_PIZZA = re.compile(r"\b(pizza|torta|rosca)\b", re.IGNORECASE)
_BARRAS = re.compile(r"\bbarras?\b", re.IGNORECASE)
# "linha" sozinha aparece em "linha de distribuição": só vale perto de "gráfico" ou como "em linhas"
_LINHAS = re.compile(r"\b(?:de|em)\s+linhas?\b", re.IGNORECASE)

_TEMPORAIS = {"mes_referencia", "mes", "ano", "trimestre", "data", "ano_mes", "periodo"}
_DATA = re.compile(r"^\d{4}(-\d{2}){0,2}$")
_PERIODO = {"P1", "P2"}
_PAR_PERIODO = re.compile(r"(^|_)p([12])(?=_|$)")

NOTA_PIZZA_NAO_SOMA = "Pizza mostra partes de um todo; para médias e percentuais, o gráfico é de barras."
NOTA_PIZZA_PARECIDAS = "As fatias seriam quase iguais; em barras a diferença fica visível."
NOTA_PIZZA_PERIODOS = "Comparação entre períodos fica em barras, não em pizza."
NOTA_PIZZA_COLUNAS = "Pizza mostra partes de um todo; indicadores diferentes ficam em barras."
NOTA_LINHAS_SEM_TEMPO = "Linhas são para séries no tempo; para categorias, o gráfico é de barras."
NOTA_UM_NUMERO = "Gráfico: com um número só, a resposta fica em texto."
NOTA_SEM_DADOS = "Gráfico: a consulta não trouxe valores numéricos para desenhar."


def ler_pedido(pergunta: str) -> tuple[bool, str | None]:
    """(a pessoa pediu gráfico?, tipo pedido ou None para o backend escolher)."""
    texto = pergunta or ""
    if _PIZZA.search(texto):
        return True, "pizza"
    if _BARRAS.search(texto):
        return True, "barras"
    if _LINHAS.search(texto) or (_GRAFICO.search(texto) and re.search(r"\blinhas?\b", texto, re.I)):
        return True, "linhas"
    if _GRAFICO.search(texto):
        return True, None
    return False, None


def unidade_da_coluna(coluna: str) -> str | None:
    """Unidade pelo nome do alias que o agente usa no SQL (GENAI-14.2)."""
    nome = coluna.lower()
    if nome.endswith("_pct") or any(k in nome for k in ("pct", "percent", "variacao", "taxa", "inadimplencia")):
        return "pct"
    if nome.endswith("_brl") or any(k in nome for k in ("receita", "valor", "tributo", "efeito", "brl")):
        return "brl"
    if nome.endswith("_kwh") or any(k in nome for k in ("kwh", "consumo", "energia")):
        return "kwh"
    if re.search(r"(^|_)dec(_|$)", nome) or nome.endswith("_h") or "horas" in nome:
        return "h"
    return None


def rotulo_da_coluna(coluna: str) -> str:
    """"receita_energia_p2_brl" → "Receita energia p2"; o sufixo de unidade sai."""
    base = re.sub(r"_(brl|kwh|pct|h)$", "", coluna.lower())
    texto = _PAR_PERIODO.sub(lambda m: f"{m.group(1)}P{m.group(2)}", base).replace("_", " ").strip()
    return texto[:1].upper() + texto[1:]


def _somavel(coluna: str) -> bool:
    """Valores que somam um todo (receita, kWh, contagens); médias, taxas e índices não."""
    nome = coluna.lower()
    if any(k in nome for k in ("medi", "taxa", "pct", "percent", "tarifa", "score", "nota", "satisf",
                               "indice", "variacao", "inadimplencia")):
        return False
    if re.search(r"(^|_)(dec|fec)(_|$)", nome):
        return False
    return unidade_da_coluna(coluna) in ("brl", "kwh") or bool(
        re.search(r"(^|_)(qtd|quantidade|total|n|numero|ucs|faturas|interrupcoes|atendimentos|inspecoes)(_|$)",
                  nome))


def _numero(valor: Any) -> float | None:
    if isinstance(valor, bool) or valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    return None


def _e_numerica(linhas: list[list[Any]], j: int) -> bool:
    valores = [linha[j] for linha in linhas if linha[j] is not None]
    return bool(valores) and all(_numero(v) is not None for v in valores)


def _e_temporal(coluna: str, linhas: list[list[Any]], j: int) -> bool:
    nome = coluna.lower()
    if nome in _TEMPORAIS or nome.startswith("data_"):
        return True
    valores = [linha[j] for linha in linhas if linha[j] is not None]
    return bool(valores) and all(isinstance(v, str) and _DATA.match(v) for v in valores)


def _ordenadas(valores: list[float | None]) -> bool:
    presentes = [v for v in valores if v is not None]
    return presentes == sorted(presentes) or presentes == sorted(presentes, reverse=True)


def _grafico(tipo: str, titulo: str, eixo: str, categorias: list[str], series: list[dict], unidade: str | None,
             pedido: bool, *, orientacao: str | None = None, omitidos: int = 0, nota: str | None = None) -> dict:
    return {
        "tipo": tipo, "titulo": titulo[:150], "eixo": eixo,
        "orientacao": orientacao if tipo == "barras" else None,
        "unidade": unidade, "categorias": categorias, "series": series,
        "origem": "pedido" if pedido else "automatico", "omitidos": omitidos, "nota": nota,
    }


def _barras_por_categoria(titulo, categorias, series, unidade, pedido, nota=None) -> dict:
    """Barras horizontais: ordem do SQL quando já vem ordenada (o agente respeitou "maior"/"menor"); senão,
    maior → menor pela última série (em P1 × P2, o período atual)."""
    ordem = list(range(len(categorias)))
    if not _ordenadas(series[-1]["valores"]):
        ordem.sort(key=lambda i: -(series[-1]["valores"][i] or 0))
    omitidos = max(0, len(ordem) - MAX_BARRAS)
    ordem = ordem[:MAX_BARRAS]
    return _grafico("barras", titulo, "categoria", [categorias[i] for i in ordem],
                    [{**s, "valores": [s["valores"][i] for i in ordem]} for s in series],
                    unidade, pedido, orientacao="horizontal", omitidos=omitidos, nota=nota)


def _pizza(titulo, categorias, serie, coluna, pedido) -> dict | str:
    """Pizza ou o motivo para não ser pizza."""
    valores = serie["valores"]
    if not _somavel(coluna) or any(v is None or v < 0 for v in valores) or sum(valores) <= 0 or len(valores) < 2:
        return NOTA_PIZZA_NAO_SOMA
    pares = sorted(zip(categorias, valores), key=lambda p: -p[1])
    if len(pares) > MAX_FATIAS:
        pares = pares[:MAX_FATIAS - 1] + [("Outros", sum(v for _, v in pares[MAX_FATIAS - 1:]))]
    total = sum(v for _, v in pares)
    partes = [v / total for _, v in pares]
    if max(partes) - min(partes) < FATIAS_PARECIDAS:
        return NOTA_PIZZA_PARECIDAS
    return _grafico("pizza", titulo, "categoria", [c for c, _ in pares],
                    [{**serie, "valores": [v for _, v in pares]}], unidade_da_coluna(coluna), pedido)


def montar_grafico(pergunta: str, resposta: dict) -> tuple[dict | None, str | None]:
    """(gráfico no formato do contrato ou None, nota para as observações quando pediram e não deu)."""
    pedido, tipo_pedido = ler_pedido(pergunta)
    if resposta.get("status") != "ok":
        return None, None
    colunas: list[str] = resposta["dados"]["colunas"]
    linhas: list[list[Any]] = resposta["dados"]["linhas"]
    detalhes = resposta.get("detalhes_tecnicos") or {}
    titulo = ((detalhes.get("estrutura_pensamento") or {}).get("pergunta_interpretada") or pergunta).rstrip("?")
    if not linhas:
        return None, NOTA_SEM_DADOS if pedido else None

    indices = range(len(colunas))
    temporais = [j for j in indices if _e_temporal(colunas[j], linhas, j)]
    numericas = [j for j in indices if j not in temporais and _e_numerica(linhas, j)]
    categoria = next((j for j in indices if j not in temporais and j not in numericas), None)
    # Várias colunas de tempo (ano e mês) viram um rótulo só; um único mês não é série no tempo
    momento = {id(l): tuple(l[j] for j in temporais) for l in linhas}
    tempo = temporais[0] if temporais and len(set(momento.values())) > 1 else None
    if not numericas:
        return None, NOTA_SEM_DADOS if pedido else None
    unidade = unidade_da_coluna(colunas[numericas[0]])
    mesma_unidade = [j for j in numericas if unidade_da_coluna(colunas[j]) == unidade][:MAX_SERIES]

    def serie(j: int, nome: str | None = None, linhas_serie=None) -> dict:
        return {"nome": nome or rotulo_da_coluna(colunas[j]), "valores": [_numero(l[j]) for l in (linhas_serie or linhas)]}

    def nota_do_tipo(nota_pizza: str) -> str | None:
        return {"pizza": nota_pizza, "linhas": NOTA_LINHAS_SEM_TEMPO}.get(tipo_pedido)

    # 1. Formato largo: receita_p1 e receita_p2 na mesma linha (comparação P1 × P2)
    pares: dict[str, dict[str, int]] = {}
    for j in mesma_unidade:
        marca = _PAR_PERIODO.search(colunas[j].lower())
        if marca:
            pares.setdefault(_PAR_PERIODO.sub("", colunas[j].lower()), {})[f"P{marca.group(2)}"] = j
    pares = {base: js for base, js in pares.items() if set(js) == _PERIODO}
    if pares:
        nota = nota_do_tipo(NOTA_PIZZA_PERIODOS)
        if categoria is not None and len(linhas) > 1:
            js = next(iter(pares.values()))
            return _barras_por_categoria(titulo, [str(l[categoria]) for l in linhas],
                                         [serie(js["P2"], "P2"), serie(js["P1"], "P1")][::-1],
                                         unidade, pedido, nota), None
        series = [{"nome": rotulo_da_coluna(base) or "Valor",
                   "valores": [_numero(linhas[0][js["P1"]]), _numero(linhas[0][js["P2"]])]}
                  for base, js in list(pares.items())[:MAX_SERIES]]
        return _grafico("barras", titulo, "periodo", ["P1", "P2"], series, unidade, pedido,
                        orientacao="vertical", nota=nota), None

    # 2. Coluna de período (P1/P2) ou de tempo (mês, ano)
    if tempo is not None:
        def rotulo_tempo(l) -> str:
            return "/".join(str(v) for v in momento[id(l)])

        def chave_tempo(l):
            return tuple((0, v, "") if isinstance(v, (int, float)) else (1, 0, str(v)) for v in momento[id(l)])

        rotulos_tempo = list(dict.fromkeys(rotulo_tempo(l) for l in sorted(linhas, key=chave_tempo)
                                           if l[tempo] is not None))
        e_periodo = set(rotulos_tempo) <= _PERIODO
        principal = mesma_unidade[0]
        if categoria is not None:
            # Uma série por categoria (ex.: município × mês); as maiores ficam, as outras são contadas
            totais: dict[str, float] = {}
            for l in linhas:
                totais[str(l[categoria])] = totais.get(str(l[categoria]), 0) + abs(_numero(l[principal]) or 0)
            nomes = sorted(totais, key=lambda n: -totais[n])
            omitidos = max(0, len(nomes) - MAX_SERIES)
            valores = {(str(l[categoria]), rotulo_tempo(l)): _numero(l[principal]) for l in linhas}
            series = [{"nome": n, "valores": [valores.get((n, t)) for t in rotulos_tempo]} for n in nomes[:MAX_SERIES]]
            if e_periodo:
                # Categorias no eixo, P1 e P2 lado a lado
                categorias = nomes
                series_p = [{"nome": p, "valores": [valores.get((n, p)) for n in nomes]} for p in rotulos_tempo]
                return _barras_por_categoria(titulo, categorias, series_p, unidade, pedido,
                                             nota_do_tipo(NOTA_PIZZA_PERIODOS)), None
        else:
            omitidos = 0
            por_tempo = {rotulo_tempo(l): l for l in linhas}
            series = [{"nome": rotulo_da_coluna(colunas[j]),
                       "valores": [_numero(por_tempo[t][j]) for t in rotulos_tempo]} for j in mesma_unidade]
        eixo = "periodo" if e_periodo else "tempo"
        if tipo_pedido != "barras" and not e_periodo and len(rotulos_tempo) >= 3:
            corte = max(0, len(rotulos_tempo) - MAX_PONTOS_LINHA)
            nota = NOTA_PIZZA_PERIODOS if tipo_pedido == "pizza" else None
            return _grafico("linhas", titulo, eixo, rotulos_tempo[corte:],
                            [{**s, "valores": s["valores"][corte:]} for s in series], unidade, pedido,
                            omitidos=omitidos, nota=nota), None
        corte = max(0, len(rotulos_tempo) - MAX_BARRAS_TEMPO)
        nota = NOTA_PIZZA_PERIODOS if tipo_pedido == "pizza" else None
        return _grafico("barras", titulo, eixo, rotulos_tempo[corte:],
                        [{**s, "valores": s["valores"][corte:]} for s in series], unidade, pedido,
                        orientacao="vertical", omitidos=omitidos, nota=nota), None

    # 3. Categorias (ranking, lista por município): só com pedido
    if not pedido:
        return None, None
    if categoria is not None:
        categorias = [str(l[categoria]) for l in linhas]
        if tipo_pedido == "pizza":
            pizza = _pizza(titulo, categorias, serie(mesma_unidade[0]), colunas[mesma_unidade[0]], pedido)
            if isinstance(pizza, dict):
                return pizza, None
            return _barras_por_categoria(titulo, categorias, [serie(mesma_unidade[0])], unidade, pedido, pizza), None
        return _barras_por_categoria(titulo, categorias, [serie(j) for j in mesma_unidade], unidade, pedido,
                                     nota_do_tipo(NOTA_PIZZA_NAO_SOMA)), None

    # 4. Uma linha com várias colunas da mesma unidade ("receita total e receita de energia")
    if len(mesma_unidade) < 2:
        return None, NOTA_UM_NUMERO
    # Colunas diferentes não são partes de um todo (a receita de energia está dentro da total): nunca pizza
    categorias = [rotulo_da_coluna(colunas[j]) for j in mesma_unidade]
    valores = {"nome": "Valor", "valores": [_numero(linhas[0][j]) for j in mesma_unidade]}
    return _barras_por_categoria(titulo, categorias, [valores], unidade, pedido,
                                 nota_do_tipo(NOTA_PIZZA_COLUNAS)), None
