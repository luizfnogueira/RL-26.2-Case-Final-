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
# "Barra" no singular é nome de bairro (Barra de Jangada): só "barras" ou "gráfico de barra"
_BARRAS = re.compile(r"\bbarras\b|gr[aá]fico\s+(?:de\s+|em\s+)?barra\b", re.IGNORECASE)
# "linha" aparece em "linhas de distribuição": só "em linhas" ou "gráfico de linhas", fora da rede elétrica
_LINHAS = re.compile(r"(?:\bem|gr[aá]fico\s+(?:de|em))\s+linhas?\b(?!\s+(?:de\s+)?(?:distribui|transmiss|tens))",
                     re.IGNORECASE)
# O título é a pergunta interpretada, que às vezes cita o gráfico ("formatado para gráfico de pizza")
_MENCAO_AO_GRAFICO = re.compile(
    r"[,;]?\s*(?:(?:formatad|organizad|apresentad|estruturad|preparad)[oa]s?\s+)?(?:para|em|num|numa|no)\s+"
    r"(?:a\s+|o\s+|um\s+|uma\s+)?(?:(?:visualiza|exibi|gera)[çc][ãa]o\s+(?:em|de|no|num)\s+(?:um\s+)?)?"
    r"gr[aá]fico(?:\s+(?:de|em)\s+(?:pizza|barras?|linhas?|torta|rosca|colunas))?(?:\s+comparativo)?",
    re.IGNORECASE)
MAX_TITULO = 150

_TEMPORAIS = {"mes_referencia", "mes", "ano", "trimestre", "data", "ano_mes", "periodo"}
_DATA = re.compile(r"^\d{4}(-\d{2}){0,2}$")
_PERIODO = {"P1", "P2"}
_PAR_PERIODO = re.compile(r"(^|_)p([12])(?=_|$)")

# Quando o tipo pedido não serve, a nota começa dizendo isso: a Tela 7 a mostra acima do gráfico
_PEDIU_PIZZA = "Você pediu pizza, mas o gráfico está em barras: "
NOTA_PIZZA_NAO_SOMA = (_PEDIU_PIZZA + "a pizza mostra partes de um todo, e médias, taxas, percentuais e "
                       "indicadores como DEC e FEC não somam entre si.")
NOTA_PIZZA_NEGATIVO = (_PEDIU_PIZZA + "há valor negativo, que não cabe numa pizza; nas barras, ele fica à "
                       "esquerda do zero.")
NOTA_PIZZA_PARECIDAS = _PEDIU_PIZZA + "as fatias seriam quase iguais, e nas barras a diferença fica visível."
NOTA_PIZZA_PERIODOS = (_PEDIU_PIZZA + "períodos (P1 e P2, meses) não são partes de um todo; lado a lado, a "
                       "comparação fica clara.")
NOTA_PIZZA_COLUNAS = (_PEDIU_PIZZA + "indicadores diferentes (como receita total e receita de energia, que está "
                      "dentro dela) não são partes de um mesmo todo.")
NOTA_LINHAS_SEM_TEMPO = ("Você pediu linhas, mas o gráfico está em barras: linhas são para séries no tempo, "
                         "e estas categorias não seguem uma ordem no tempo.")
NOTA_UM_NUMERO = "Gráfico: com um número só, a resposta fica em texto."
NOTA_SEM_DADOS = "Gráfico: a consulta não trouxe valores numéricos para desenhar."


def ler_pedido(pergunta: str) -> tuple[bool, str | None]:
    """(a pessoa pediu gráfico?, tipo pedido ou None para o backend escolher)."""
    texto = pergunta or ""
    if _PIZZA.search(texto):
        return True, "pizza"
    if _BARRAS.search(texto):
        return True, "barras"
    if _LINHAS.search(texto):
        return True, "linhas"
    if _GRAFICO.search(texto):
        return True, None
    return False, None


def titulo_do_grafico(texto: str) -> str:
    """A pergunta interpretada sem "formatado para gráfico de pizza" (o tipo está no desenho), cortada
    numa palavra inteira."""
    titulo = _MENCAO_AO_GRAFICO.sub("", texto or "").strip().rstrip("?.,;: ").strip()
    if len(titulo) > MAX_TITULO:
        titulo = titulo[:MAX_TITULO - 1].rsplit(" ", 1)[0].rstrip(",;: ") + "…"
    return titulo


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
        "tipo": tipo, "titulo": titulo[:MAX_TITULO], "eixo": eixo,
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
    if any(v is not None and v < 0 for v in valores):
        return NOTA_PIZZA_NEGATIVO
    if not _somavel(coluna) or any(v is None for v in valores) or sum(valores) <= 0 or len(valores) < 2:
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


_NOMES_DAS_CATEGORIAS = {"municipio": "municípios", "bairro": "bairros", "classe": "classes",
                         "alimentador": "alimentadores", "subestacao": "subestações"}
_UNIDADE_LEGIVEL = {"brl": "R$", "kwh": "kWh", "pct": "%", "h": "horas"}
_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
_ANO_MES = re.compile(r"^(\d{4})-(\d{2})$")
# Faixas de meses que o SQL pediu ("mes_referencia BETWEEN '2022-07' AND '2026-06'"): o eixo vai até elas
_FAIXA_DO_SQL = re.compile(r"\b(?:mes_referencia|ano_mes|mes)\s+BETWEEN\s+'(\d{4}-\d{2})'\s+AND\s+'(\d{4}-\d{2})'",
                           re.IGNORECASE)
_LIMIT = re.compile(r"\bLIMIT\s+(\d+)\s*;?\s*$", re.IGNORECASE)
# Acima disso a faixa do SQL não completa o eixo (BETWEEN '2000-01' AND '2030-12' só porque sim)
_MAX_MESES_COMPLETADOS = 120


def mes_legivel(rotulo: str) -> str:
    """"2025-07" → "jul/2025"; outro rótulo fica como está."""
    m = _ANO_MES.match(rotulo)
    return f"{_MESES[int(m.group(2)) - 1]}/{m.group(1)}" if m and 1 <= int(m.group(2)) <= 12 else rotulo


def _meses_entre(inicio: str, fim: str) -> list[str]:
    ano, mes = map(int, inicio.split("-"))
    meses = []
    while f"{ano}-{mes:02d}" <= fim:
        meses.append(f"{ano}-{mes:02d}")
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return meses


def _faixas(meses: list[str], todos: list[str]) -> str:
    """Meses seguidos viram faixa: "jul/2023 a jun/2025, ago/2025"."""
    posicao = {t: i for i, t in enumerate(todos)}
    faixas: list[list[str]] = []
    for t in meses:
        if faixas and posicao[t] == posicao[faixas[-1][-1]] + 1:
            faixas[-1].append(t)
        else:
            faixas.append([t])
    textos = [mes_legivel(f[0]) if len(f) == 1 else f"{mes_legivel(f[0])} a {mes_legivel(f[-1])}" for f in faixas]
    return ", ".join(textos[:3]) + (f" e mais {len(textos) - 3} trechos" if len(textos) > 3 else "")


def _lista(nomes: list[str]) -> str:
    return nomes[0] if len(nomes) == 1 else ", ".join(nomes[:-1]) + " e " + nomes[-1]


def _nome_das_categorias(coluna: str) -> str:
    return next((plural for chave, plural in _NOMES_DAS_CATEGORIAS.items() if chave in coluna.lower()), "itens")


def montar_grafico(pergunta: str, resposta: dict) -> tuple[dict | None, str | None]:
    """(gráfico no formato do contrato ou None, nota para as observações quando pediram e não deu).

    A `nota` do gráfico diz por que o tipo pedido não foi usado e o que ficou fora do desenho (meses além
    do limite, séries além de 4, colunas de outra unidade, meses sem dado); a tabela leva tudo.
    """
    pedido, tipo_pedido = ler_pedido(pergunta)
    if resposta.get("status") != "ok":
        return None, None
    colunas: list[str] = resposta["dados"]["colunas"]
    linhas: list[list[Any]] = resposta["dados"]["linhas"]
    detalhes = resposta.get("detalhes_tecnicos") or {}
    titulo = titulo_do_grafico((detalhes.get("estrutura_pensamento") or {}).get("pergunta_interpretada") or pergunta)
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
    nome = _nome_das_categorias(colunas[categoria]) if categoria is not None else "itens"
    sql = resposta.get("sql") or ""

    # O que ficou fora do desenho, na ordem em que aparece na nota
    avisos: list[str] = []
    limite = _LIMIT.search(sql)
    limite_atingido = bool(limite) and len(linhas) == int(limite.group(1))
    if limite_atingido:
        avisos.append(f"A consulta parou no limite de {limite.group(1)} linhas (LIMIT), então o gráfico pode "
                      "estar incompleto; pergunte de novo pedindo todos os dados.")

    def colunas_fora(usadas: list[int]) -> None:
        fora = [j for j in numericas if j not in usadas]
        outra_unidade = [rotulo_da_coluna(colunas[j]) for j in fora if unidade_da_coluna(colunas[j]) != unidade]
        alem_do_limite = [rotulo_da_coluna(colunas[j]) for j in fora if unidade_da_coluna(colunas[j]) == unidade]
        eixo = _UNIDADE_LEGIVEL.get(unidade)
        if outra_unidade:
            avisos.append(f"{_lista(outra_unidade)} {'ficou' if len(outra_unidade) == 1 else 'ficaram'} fora do "
                          f"gráfico, que tem um eixo só{f' (em {eixo})' if eixo else ''}; os valores estão em "
                          "“Ver como tabela”.")
        if alem_do_limite:
            avisos.append(f"{_lista(alem_do_limite)} {'ficou' if len(alem_do_limite) == 1 else 'ficaram'} fora "
                          "do gráfico pelo limite de séries; os valores estão em “Ver como tabela”.")

    def categorias_fora(grafico: dict) -> None:
        if grafico["omitidos"]:
            avisos.append(f"Aparecem os {len(grafico['categorias'])} primeiros {nome}; os outros "
                          f"{grafico['omitidos']} estão em “Ver como tabela”.")

    def pronto(grafico: dict) -> tuple[dict, None]:
        """O motivo do tipo vem primeiro na nota; depois, o que ficou de fora."""
        partes = [p for p in (grafico.get("nota"), *avisos) if p]
        grafico["nota"] = " ".join(partes) or None
        return grafico, None

    def serie(j: int, nome_serie: str | None = None, linhas_serie=None) -> dict:
        return {"nome": nome_serie or rotulo_da_coluna(colunas[j]),
                "valores": [_numero(l[j]) for l in (linhas_serie or linhas)]}

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
            colunas_fora([js["P1"], js["P2"]])
            grafico = _barras_por_categoria(titulo, [str(l[categoria]) for l in linhas],
                                            [serie(js["P1"], "P1"), serie(js["P2"], "P2")], unidade, pedido, nota)
            categorias_fora(grafico)
            return pronto(grafico)
        usados = list(pares.items())[:MAX_SERIES]
        colunas_fora([j for _, js in usados for j in js.values()])
        series = [{"nome": rotulo_da_coluna(base) or "Valor",
                   "valores": [_numero(linhas[0][js["P1"]]), _numero(linhas[0][js["P2"]])]}
                  for base, js in usados]
        return pronto(_grafico("barras", titulo, "periodo", ["P1", "P2"], series, unidade, pedido,
                               orientacao="vertical", nota=nota))

    # 2. Coluna de período (P1/P2) ou de tempo (mês, ano)
    if tempo is not None:
        def rotulo_tempo(l) -> str:
            return "/".join(str(v) for v in momento[id(l)])

        def chave_tempo(l):
            return tuple((0, v, "") if isinstance(v, (int, float)) else (1, 0, str(v)) for v in momento[id(l)])

        rotulos_tempo = list(dict.fromkeys(rotulo_tempo(l) for l in sorted(linhas, key=chave_tempo)
                                           if l[tempo] is not None))
        e_periodo = set(rotulos_tempo) <= _PERIODO
        # Série mensal: o eixo vai do primeiro ao último mês (ou à faixa do SQL) e mês sem linha fica vazio
        if not e_periodo and len(temporais) == 1 and all(_ANO_MES.match(t) for t in rotulos_tempo):
            inicio, fim = rotulos_tempo[0], rotulos_tempo[-1]
            faixas = _FAIXA_DO_SQL.findall(sql)
            if faixas and not limite_atingido:
                inicio, fim = min(inicio, *(f[0] for f in faixas)), max(fim, *(f[1] for f in faixas))
            todos = _meses_entre(inicio, fim)
            if len(todos) > _MAX_MESES_COMPLETADOS:
                todos = _meses_entre(rotulos_tempo[0], rotulos_tempo[-1])
            presentes = set(rotulos_tempo)
            faltando = [t for t in todos if t not in presentes]
            if faltando:
                avisos.append(f"A consulta não trouxe {len(faltando)} {'mês' if len(faltando) == 1 else 'meses'} "
                              f"({_faixas(faltando, todos)}); no gráfico, ficam em branco.")
            rotulos_tempo = todos
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
            colunas_fora([principal])
            if e_periodo:
                # Categorias no eixo, P1 e P2 lado a lado
                series_p = [{"nome": p, "valores": [valores.get((n, p)) for n in nomes]} for p in rotulos_tempo]
                grafico = _barras_por_categoria(titulo, nomes, series_p, unidade, pedido,
                                                nota_do_tipo(NOTA_PIZZA_PERIODOS))
                categorias_fora(grafico)
                return pronto(grafico)
            if omitidos:
                avisos.append(f"O gráfico mostra os {MAX_SERIES} {nome} de maior valor; os outros {omitidos} "
                              "estão em “Ver como tabela”.")
        else:
            omitidos = 0
            por_tempo = {rotulo_tempo(l): l for l in linhas}
            colunas_fora(mesma_unidade)
            series = [{"nome": rotulo_da_coluna(colunas[j]),
                       "valores": [_numero(por_tempo[t][j]) if t in por_tempo else None for t in rotulos_tempo]}
                      for j in mesma_unidade]
        eixo = "periodo" if e_periodo else "tempo"
        nota = NOTA_PIZZA_PERIODOS if tipo_pedido == "pizza" else None
        em_linhas = tipo_pedido != "barras" and not e_periodo and len(rotulos_tempo) >= 3
        maximo = MAX_PONTOS_LINHA if em_linhas else MAX_BARRAS_TEMPO
        corte = max(0, len(rotulos_tempo) - maximo)
        if corte:
            # Os mais recentes ficam; o começo da série está na tabela
            unidade_tempo = "meses" if all(_ANO_MES.match(t) for t in rotulos_tempo) else "pontos"
            visiveis = rotulos_tempo[corte:]
            avisos.insert(0, f"{'Linhas' if em_linhas else 'Barras'} mostram até {maximo} {unidade_tempo}: "
                             f"aparecem os últimos {maximo} ({mes_legivel(visiveis[0])} a {mes_legivel(visiveis[-1])})"
                             f"; os {corte} anteriores estão em “Ver como tabela”."
                             + ("" if em_linhas else f" Em linhas cabem até {MAX_PONTOS_LINHA}."))
        return pronto(_grafico("linhas" if em_linhas else "barras", titulo, eixo, rotulos_tempo[corte:],
                               [{**s, "valores": s["valores"][corte:]} for s in series], unidade, pedido,
                               orientacao=None if em_linhas else "vertical", omitidos=omitidos + corte, nota=nota))

    # 3. Categorias (ranking, lista por município): só com pedido
    if not pedido:
        return None, None
    if categoria is not None:
        categorias = [str(l[categoria]) for l in linhas]
        if tipo_pedido == "pizza":
            colunas_fora([mesma_unidade[0]])
            pizza = _pizza(titulo, categorias, serie(mesma_unidade[0]), colunas[mesma_unidade[0]], pedido)
            if isinstance(pizza, dict):
                return pronto(pizza)
            grafico = _barras_por_categoria(titulo, categorias, [serie(mesma_unidade[0])], unidade, pedido, pizza)
            categorias_fora(grafico)
            return pronto(grafico)
        colunas_fora(mesma_unidade)
        grafico = _barras_por_categoria(titulo, categorias, [serie(j) for j in mesma_unidade], unidade, pedido,
                                        nota_do_tipo(NOTA_PIZZA_NAO_SOMA))
        categorias_fora(grafico)
        return pronto(grafico)

    # 4. Uma linha com várias colunas da mesma unidade ("receita total e receita de energia")
    if len(mesma_unidade) < 2:
        return None, NOTA_UM_NUMERO
    # Colunas diferentes não são partes de um todo (a receita de energia está dentro da total): nunca pizza
    colunas_fora(mesma_unidade)
    categorias = [rotulo_da_coluna(colunas[j]) for j in mesma_unidade]
    valores = {"nome": "Valor", "valores": [_numero(linhas[0][j]) for j in mesma_unidade]}
    return pronto(_barras_por_categoria(titulo, categorias, [valores], unidade, pedido,
                                        nota_do_tipo(NOTA_PIZZA_COLUNAS)))
