"""Validação determinística de saída, marcadores pt-BR, avisos de domínio e apresentação (GENAI-10, 14).

Garante que:
1. Todo marcador `{v1}`, `{v2}` usado no texto exista em `saida.marcadores` e corresponda a um valor
   presente nos resultados consultados no banco (tolerância para arredondamento de até 2 casas decimais).
2. Nenhum número inventado apareça fora dos marcadores no texto da resposta.
3. Nenhum consumo negativo seja exibido para perguntas normais de consumo.
4. Premissas falsas (ex.: 'Quanto a receita comercial cresceu em Jaboatão?' quando o dado mostra queda,
   ou 'Por que a receita despencou?' quando o dado mostra aumento) sejam obrigatoriamente corrigidas no texto.
5. Avisos obrigatórios de interpretação (fila de perdas, peso de jul/2025 no DEC) sejam anexados.
6. A apresentação ('texto' vs 'tabela') e o limite de 50 linhas sigam a regra determinística (GENAI-14).
"""

from __future__ import annotations

import math
import re
from decimal import Decimal
from typing import Any

from app.ai.contratos import (
    DepsAgente,
    ModoApresentacao,
    RespostaAgente,
    ResultadoConsulta,
)

# Aceita também o formato do Python que o modelo às vezes escreve ({v1:,.2f}); a formatação é sempre a pt-BR
REGEX_MARCADOR_NO_TEXTO = re.compile(r"\{(v\d+|[a-zA-Z_][a-zA-Z0-9_]*)(?::[^{}]*)?\}")
# "1.234.567,89" é um número só; sem o milhar, "9.88" e "12,5" também
REGEX_NUMERO_SOLTO = re.compile(
    r"(?<![a-zA-Z0-9_{.,])[-−]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![a-zA-Z0-9_}])"
)

# Números estruturais/contextuais permitidos fora de marcadores (anos da base, P1/P2, limites regulatórios citados)
NUMEROS_CONTEXTUAIS_PERMITIDOS = {
    0.0,
    1.0,
    2.0,
    3.0,
    12.0,
    24.0,
    30.0,
    48.0,
    50.0,
    100.0,
    360.0,
    2022.0,
    2023.0,
    2024.0,
    2025.0,
    2026.0,
}

AVISO_FILA_PERDAS = (
    "Nota metodológica: o score da fila de perdas representa prioridade operacional (0 a 100), "
    "não probabilidade estatística de fraude, e o kWh estimado é uma proxy de recuperação potencial."
)
AVISO_DEC_JULHO_2025 = (
    "Nota metodológica: em P2 (jul/2025 a jun/2026), 58,4% do DEC consolidado concentra-se "
    "no mês crítico de julho/2025."
)

AVISO_2026_INCOMPLETO = (
    "Os dados de 2026 vão só até junho (6 de 12 meses): o ano de 2026 não está completo na base."
)

# 2026 como ano: '2026', '2026%', ano = 2026, EXTRACT(YEAR ...) = 2026 ou de '2026-01' em diante
_ANO_2026_NO_SQL = re.compile(
    r"'2026%?'|\bano\s*=\s*'?2026\b|year\s+from[^)]*\)\s*=\s*'?2026\b|(?:between|>=)\s*'2026-01'")
_MES_ANTES = re.compile(
    r"\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:/|de\s+)?\s*$", re.IGNORECASE)


def menciona_ano_de_2026(pergunta: str, sql: str | None) -> bool:
    """O ano de 2026 entra na resposta; um mês só ("junho de 2026", "jun/2026") ou o P2 não contam."""
    if _ANO_2026_NO_SQL.search((sql or "").lower()):
        return True
    for achado in re.finditer(r"(?<![\d/-])2026(?![\d-])", pergunta or ""):
        if not _MES_ANTES.search(pergunta[:achado.start()]):
            return True
    return False


class ViolacaoFidelidadeSaida(ValueError):
    """Indica falha na validação da saída que exige ModelRetry ou fallback para nao_sei."""


def formatar_numero_pt_br(valor: int | float | Decimal) -> str:
    """Formata um número no padrão brasileiro (ex.: 1234.5 -> '1.234,50', 181 -> '181')."""
    if isinstance(valor, bool):
        return str(valor)
    if isinstance(valor, int):
        return f"{valor:,}".replace(",", ".")
    num = float(valor)
    if num.is_integer():
        return f"{int(num):,}".replace(",", ".")
    return f"{num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def substituir_marcadores_pt_br(texto: str, marcadores: dict[str, str | int | float]) -> str:
    """Preenche os marcadores `{v1}`, `{v2}` no texto com valores formatados em pt-BR (GENAI-10.1)."""
    if not texto or not marcadores:
        return texto

    valores = {str(chave).strip("{}"): valor for chave, valor in marcadores.items()}

    def preencher(marcador: re.Match) -> str:
        if marcador.group(1) not in valores:
            return marcador.group(0)
        valor = valores[marcador.group(1)]
        if isinstance(valor, (int, float, Decimal)) and not isinstance(valor, bool):
            return formatar_numero_pt_br(valor)
        return str(valor)

    return REGEX_MARCADOR_NO_TEXTO.sub(preencher, texto)


def _adicionar_derivados_entre_pares(numeros: list[float], valores: list[float]) -> None:
    """Adiciona diferenças, somas e variações percentuais entre pares de números (ex.: P2 vs P1)."""
    for i in range(len(valores)):
        for j in range(len(valores)):
            if i != j:
                dif = valores[j] - valores[i]
                numeros.append(dif)
                if abs(dif) >= 1_000_000:
                    numeros.append(dif / 1_000_000.0)
                if abs(dif) >= 1_000:
                    numeros.append(dif / 1_000.0)
                if abs(valores[i]) > 1e-9:
                    numeros.append((dif / valores[i]) * 100.0)
                    numeros.append((valores[j] / valores[i]) * 100.0)


def extrair_numeros_do_resultado(resultado: ResultadoConsulta | None) -> list[float]:
    """Coleta todos os valores numéricos presentes nas células do ResultadoConsulta (e variações de escala)."""
    if resultado is None or not resultado.linhas:
        return []

    numeros: list[float] = []
    todos_valores_curtos: list[float] = []
    for idx_linha, linha in enumerate(resultado.linhas):
        vals_linha: list[float] = []
        for celula in linha:
            if isinstance(celula, bool) or celula is None:
                continue
            if isinstance(celula, (int, float, Decimal)):
                val = float(celula)
                if math.isfinite(val):
                    numeros.append(val)
                    vals_linha.append(val)
                    if idx_linha < 6:
                        todos_valores_curtos.append(val)
                    # Suporta conversão automática em milhões (mi) ou milhares (mil) ou GWh (kWh / 1e6)
                    if abs(val) >= 1_000_000:
                        numeros.append(val / 1_000_000.0)
                    if abs(val) >= 1_000:
                        numeros.append(val / 1_000.0)
            elif isinstance(celula, str):
                try:
                    val = float(celula.replace(",", "."))
                    if math.isfinite(val):
                        numeros.append(val)
                        vals_linha.append(val)
                        if idx_linha < 6:
                            todos_valores_curtos.append(val)
                except ValueError:
                    pass
        if idx_linha < 10 and len(vals_linha) > 1:
            _adicionar_derivados_entre_pares(numeros, vals_linha)

    # Se a consulta retornou poucas linhas (ex.: 2 linhas para P1 e P2 no GROUP BY periodo),
    # inclui também as diferenças e variações percentuais entre linhas!
    if 1 < len(resultado.linhas) <= 6 and len(todos_valores_curtos) <= 12:
        _adicionar_derivados_entre_pares(numeros, todos_valores_curtos)

    # Inclui também o total de linhas retornadas como número válido de contagem
    numeros.append(float(resultado.n_linhas))
    numeros.append(float(len(resultado.linhas)))
    return numeros


def extrair_textos_do_resultado(resultado: ResultadoConsulta | None) -> set[str]:
    """Coleta todos os valores textuais presentes nas células do ResultadoConsulta."""
    if resultado is None or not resultado.linhas:
        return set()
    textos: set[str] = set()
    for linha in resultado.linhas:
        for celula in linha:
            if isinstance(celula, str) and celula.strip():
                textos.add(celula.strip().upper())
    return textos


def _numero_bate_com_dados(valor: float, numeros_banco: list[float], tolerancia_rel: float = 0.015) -> bool:
    """Verifica se `valor` corresponde a algum número retornado pelo banco (com tolerância de arredondamento)."""
    for ref in numeros_banco:
        if math.isclose(valor, ref, rel_tol=tolerancia_rel, abs_tol=0.05):
            return True
        # Também aceita valor absoluto quando o modelo expressa "-2,09%" como "caiu 2,09%"
        if math.isclose(abs(valor), abs(ref), rel_tol=tolerancia_rel, abs_tol=0.05):
            return True
    return False


# Valor numérico com unidade opcional, como o modelo às vezes escreve num marcador: "9,88 horas", "R$ 1.200,50", "12,5%"
REGEX_VALOR_COM_UNIDADE = re.compile(r"^\s*(?:R\$\s*)?([-−]?\d[\d.,]*)\s*(?:%|[a-zA-ZÀ-ÿ/²]+(?:\s+[a-zA-ZÀ-ÿ/²]+)*)?\s*$")
# Códigos de UC e alimentador (UC-0010, ALM-ABR-001) e rótulos como P1, B3, A4: não são números da resposta
REGEX_CODIGO = re.compile(r"\b(?:UC|ALM|P|B|A)(?:[-_][A-Z]+)*[-_]?\d+(?:[-_]\d+)?\b", re.IGNORECASE)


def _leituras_do_numero(token: str) -> list[float]:
    """Leituras possíveis de um número escrito: "1.234,56" é pt-BR; "9.88" é decimal; "1.234" pode ser os dois."""
    t = token.replace("−", "-").rstrip(".,")
    if "." in t and "," in t:
        candidatos = [t.replace(".", "").replace(",", ".")]
    elif "," in t:
        candidatos = [t.replace(",", ".")]
    elif re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+", t):
        candidatos = [t.replace(".", ""), t]
    else:
        candidatos = [t]
    leituras = []
    for candidato in candidatos:
        try:
            leituras.append(float(candidato))
        except ValueError:
            pass
    return leituras


def _extrair_numeros_da_pergunta(pergunta: str) -> set[float]:
    """Números já presentes na própria pergunta do usuário não contam como alucinação."""
    encontrados: set[float] = set()
    for match in REGEX_NUMERO_SOLTO.findall(pergunta or ""):
        try:
            encontrados.add(float(match.replace("−", "-").replace(",", ".")))
        except ValueError:
            pass
    return encontrados


def validar_fidelidade_saida(deps: DepsAgente, saida: RespostaAgente) -> RespostaAgente:
    """Valida determinísticamente a saída do agente contra os resultados de `consultar_gold` (GENAI-10.2).

    Levanta `ViolacaoFidelidadeSaida` se detectar:
    - Resposta `ok` sem execução de SQL ou com resultado vazio.
    - Marcador `{v1}` no texto ausente de `saida.marcadores` ou valor de marcador ausente dos dados.
    - Número solto no texto fora de `saida.marcadores` que não exista nos dados.
    - Consumo negativo exibido sem que o usuário tenha pedido explicitamente.
    - Premissa falsa de crescimento quando os dados mostram queda (ou vice-versa).
    """
    if deps.bloqueio:
        return saida

    if saida.status != "ok":
        return saida

    ultimo_res = deps.ultimo_resultado
    if ultimo_res is None or ultimo_res.bloqueado:
        raise ViolacaoFidelidadeSaida(
            "Status 'ok' exige que a ferramenta `consultar_gold` tenha sido executada com sucesso."
        )

    if ultimo_res.n_linhas == 0 or not ultimo_res.linhas:
        raise ViolacaoFidelidadeSaida(
            "A consulta retornou 0 linhas. Quando o resultado é vazio, retorne `status='nao_sei'` "
            "explicando que não foram encontrados registros para o filtro/período informado."
        )

    # 0. Conferência de texto não vazio
    if not (saida.texto or "").strip() or len((saida.texto or "").strip()) < 10:
        raise ViolacaoFidelidadeSaida(
            "O campo `texto` está vazio ou curto demais. Escreva uma resposta completa em português explicando os números retornados pela consulta."
        )

    # 1. Conferência do SQL executado vs declarado:
    # Se o modelo executou mais de uma query na mesma rodada, ou reformatou o SQL, sincronizamos `saida.sql`
    # automaticamente em `agent.py` sem gastar retry desnecessário.

    # 2. Conferência de marcadores no texto
    marcadores_no_texto = REGEX_MARCADOR_NO_TEXTO.findall(saida.texto or "")
    for m_key in marcadores_no_texto:
        if m_key not in saida.marcadores:
            raise ViolacaoFidelidadeSaida(
                f"O texto usa o marcador `{{{m_key}}}`, mas `{m_key}` não foi preenchido em `marcadores`."
            )

    # Coleta todos os números e textos retornados por TODAS as consultas executadas nesta pergunta
    numeros_banco = extrair_numeros_do_resultado(ultimo_res)
    textos_banco = extrair_textos_do_resultado(ultimo_res)
    for res_hist in (deps.historico_resultados or []):
        if res_hist is not ultimo_res and not res_hist.bloqueado:
            numeros_banco.extend(extrair_numeros_do_resultado(res_hist))
            textos_banco |= extrair_textos_do_resultado(res_hist)

    numeros_pergunta = _extrair_numeros_da_pergunta(deps.pergunta_original)

    # Limites que o próprio SQL executado usa (ex.: > 0, < -30) estão no "Como cheguei nisso"; não são invenção.
    numeros_pergunta |= _extrair_numeros_da_pergunta(deps.ultimo_sql or "")

    # 3. Conferência dos valores dentro de `saida.marcadores` contra os dados retornados
    marcadores_normalizados = dict(saida.marcadores or {})
    for m_key, m_val in (saida.marcadores or {}).items():
        if isinstance(m_val, (int, float, Decimal)) and not isinstance(m_val, bool):
            val_float = float(m_val)
            if not _numero_bate_com_dados(val_float, numeros_banco):
                raise ViolacaoFidelidadeSaida(
                    f"O valor `{m_val}` do marcador `{m_key}` não consta nos dados retornados pela consulta "
                    f"(valores disponíveis: {numeros_banco[:10]}). Nunca invente números."
                )
        elif isinstance(m_val, str):
            valor_com_unidade = REGEX_VALOR_COM_UNIDADE.match(m_val)
            if valor_com_unidade:
                leituras = [v for v in _leituras_do_numero(valor_com_unidade.group(1))
                            if _numero_bate_com_dados(v, numeros_banco)]
                if not leituras:
                    raise ViolacaoFidelidadeSaida(
                        f"O valor numérico `{m_val}` do marcador `{m_key}` não consta no resultado da consulta. "
                        "Preencha os marcadores numéricos com o número da célula, sem unidade (ex.: 9.88)."
                    )
                # Número puro em texto ("9.88") vira número para sair formatado em pt-BR ("9,88")
                if re.fullmatch(r"\s*[-−]?\d[\d.,]*\s*", m_val):
                    marcadores_normalizados[m_key] = leituras[0]
            elif m_val.strip().upper() not in textos_banco and textos_banco:
                raise ViolacaoFidelidadeSaida(
                    f"O texto `{m_val}` do marcador `{m_key}` não consta no resultado da consulta."
                )

    # 4. Conferência de números soltos fora dos marcadores no texto
    texto_limpo = REGEX_MARCADOR_NO_TEXTO.sub(" ", saida.texto or "")
    # Textos que vieram do banco (ALM-ABR-007, nomes de bairro com número) não são números inventados
    for valor_texto in sorted(textos_banco, key=len, reverse=True):
        if any(c.isdigit() for c in valor_texto):
            texto_limpo = re.sub(re.escape(valor_texto), " ", texto_limpo, flags=re.IGNORECASE)
    texto_limpo = REGEX_CODIGO.sub(" ", texto_limpo)
    # Remove datas ISO YYYY-MM
    texto_limpo = re.sub(r"\b202[2-6]-(?:0[1-9]|1[0-2])\b", " ", texto_limpo)

    for token_num in REGEX_NUMERO_SOLTO.findall(texto_limpo):
        leituras = _leituras_do_numero(token_num)
        if not leituras:
            continue
        if any(abs(v) in NUMEROS_CONTEXTUAIS_PERMITIDOS or abs(v) in numeros_pergunta for v in leituras):
            continue
        if not any(_numero_bate_com_dados(v, numeros_banco) for v in leituras):
            raise ViolacaoFidelidadeSaida(
                f"Número `{token_num}` escrito fora dos marcadores não foi encontrado no resultado da consulta. "
                "Coloque todos os números vindos do banco em `marcadores` ({v1}, {v2}) e use apenas valores reais."
            )

    # 5. Proteção contra consumo negativo na saída quando não solicitado
    if not deps.consumo_negativo_solicitado:
        for col_idx, nome_col in enumerate(ultimo_res.colunas):
            col_lower = nome_col.lower()
            eh_coluna_consumo_absoluto = (
                "consumo" in col_lower
                and "variacao" not in col_lower
                and "queda" not in col_lower
                and "efeito" not in col_lower
                and "dif" not in col_lower
            )
            if eh_coluna_consumo_absoluto:
                for linha in ultimo_res.linhas:
                    cel = linha[col_idx] if col_idx < len(linha) else None
                    if isinstance(cel, (int, float, Decimal)) and float(cel) < 0:
                        raise ViolacaoFidelidadeSaida(
                            "Foram detectados valores de consumo negativo no resultado para uma pergunta normal. "
                            "Filtre `flag_consumo_negativo = FALSE AND consumo_kwh_valido >= 0`."
                        )

    # 6. Verificação de Premissa Falsa (GENAI-10.4):
    # - Pergunta fala em "cresceu/aumentou" mas variação é < 0
    # - Pergunta fala em "despencou/caiu/diminuiu" mas variação é > 0
    pergunta_lower = (deps.pergunta_original or "").lower()
    if any(p in pergunta_lower for p in ("cresceu", "crescimento", "subiu", "aumentou")):
        for col_idx, nome_col in enumerate(ultimo_res.colunas):
            if any(k in nome_col.lower() for k in ("variacao", "crescimento", "delta", "dif")):
                val_cel = ultimo_res.linhas[0][col_idx] if ultimo_res.linhas[0] else None
                if isinstance(val_cel, (int, float, Decimal)) and float(val_cel) < 0:
                    texto_check = (saida.texto or "").lower()
                    palavras_queda = ("caiu", "queda", "redução", "reducao", "retração", "retracao", "diminuiu", "negativ", "-")
                    if not any(pq in texto_check for pq in palavras_queda):
                        raise ViolacaoFidelidadeSaida(
                            "A pergunta assume crescimento, mas os dados mostram queda/variação negativa. "
                            "Corrija explicitamente a premissa falsa no texto informando que houve queda/redução."
                        )
    elif any(p in pergunta_lower for p in ("despencou", "caiu", "queda", "diminuiu", "reduziu", "encolheu")):
        for col_idx, nome_col in enumerate(ultimo_res.colunas):
            if any(k in nome_col.lower() for k in ("variacao", "crescimento", "delta", "dif")):
                val_cel = ultimo_res.linhas[0][col_idx] if ultimo_res.linhas[0] else None
                if isinstance(val_cel, (int, float, Decimal)) and float(val_cel) > 0:
                    texto_check = (saida.texto or "").lower()
                    palavras_alta = ("cresceu", "crescimento", "aumentou", "aumento", "subiu", "alta", "positiv", "+")
                    if not any(pa in texto_check for pa in palavras_alta):
                        raise ViolacaoFidelidadeSaida(
                            "A pergunta assume queda, mas os dados mostram crescimento/aumento. "
                            "Corrija explicitamente a premissa falsa no texto informando que houve aumento/crescimento."
                        )

    if marcadores_normalizados != saida.marcadores:
        return saida.model_copy(update={"marcadores": marcadores_normalizados})
    return saida


def enriquecer_avisos_e_premissas(
    saida: RespostaAgente,
    sql_executado: str | None,
    resultado: ResultadoConsulta | None,
) -> list[str]:
    """Adiciona avisos de interpretação de domínio (GENAI-10.5), de 2026 incompleto e de truncamento de tabela (GENAI-14.3)."""
    observacoes = list(saida.premissas or [])
    sql_lower = (sql_executado or "").lower()
    texto_lower = (saida.texto or "").lower()

    if "tb_fila_perdas" in sql_lower and not any("probabilidade" in obs.lower() for obs in observacoes):
        observacoes.append(AVISO_FILA_PERDAS)

    if ("agg_dec_fec_mensal" in sql_lower or "uc_interrupcoes" in sql_lower or "dec" in texto_lower) and (
        "2025" in sql_lower or "p2" in sql_lower or "p2" in texto_lower
    ):
        if not any("58" in obs for obs in observacoes):
            observacoes.append(AVISO_DEC_JULHO_2025)

    if menciona_ano_de_2026(saida.pergunta_interpretada, sql_executado) and AVISO_2026_INCOMPLETO not in observacoes:
        observacoes.append(AVISO_2026_INCOMPLETO)

    if resultado and resultado.n_linhas > 50:
        aviso_trunc = f"Exibindo as primeiras 50 linhas de um total de {resultado.n_linhas} registros encontrados."
        if aviso_trunc not in observacoes:
            observacoes.append(aviso_trunc)

    return observacoes


def decidir_modo_apresentacao(status: str, resultado: ResultadoConsulta | None) -> ModoApresentacao:
    """Regra determinística de apresentação (GENAI-14.1):
    - 1 linha com até 2 colunas (ou status != 'ok') -> 'texto'
    - Várias linhas (ranking, lista, 'por bairro') ou 1 linha com 3+ colunas -> 'tabela'
    """
    if status != "ok" or resultado is None or resultado.bloqueado:
        return "texto"
    if resultado.n_linhas > 1:
        return "tabela"
    if resultado.n_linhas == 1 and len(resultado.colunas) > 2:
        return "tabela"
    return "texto"


def complementar_texto_para_tabela(
    texto: str,
    apresentacao: ModoApresentacao,
    resultado: ResultadoConsulta | None,
    periodo: str | None = None,
) -> str:
    """Garante que respostas em tabela informem o total real quando > 50 linhas (GENAI-14.3, 14.4)."""
    if apresentacao != "tabela" or resultado is None:
        return texto

    texto_final = texto.strip()
    if resultado.n_linhas > 50 and str(resultado.n_linhas) not in texto_final:
        texto_final += f" (Mostrando os primeiros 50 de {resultado.n_linhas} registros no total.)"
    if periodo and periodo.lower() not in texto_final.lower() and not any(
        ano in texto_final for ano in ("2022", "2023", "2024", "2025", "2026", "P1", "P2")
    ):
        texto_final += f" Período considerado: {periodo}."
    return texto_final
