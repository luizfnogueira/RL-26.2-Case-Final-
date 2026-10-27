"""Validação determinística de saída, marcadores pt-BR, avisos de domínio e apresentação (GENAI-10, 14).

Garante que:
1. Todo marcador `{v1}`, `{v2}` usado no texto exista em `saida.marcadores` e corresponda a um valor
   presente no `ultimo_resultado` do banco (tolerância para arredondamento de até 2 casas decimais).
2. Nenhum número inventado apareça fora dos marcadores no texto da resposta.
3. Nenhum consumo negativo seja exibido para perguntas normais de consumo.
4. Premissas falsas (ex.: 'Quanto a receita comercial cresceu em Jaboatão?' quando o dado mostra queda)
   sejam obrigatoriamente corrigidas no texto.
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

REGEX_MARCADOR_NO_TEXTO = re.compile(r"\{(v\d+|[a-zA-Z_][a-zA-Z0-9_]*)\}")
REGEX_NUMERO_SOLTO = re.compile(r"(?<![a-zA-Z0-9_{])[-−]?\d+(?:[.,]\d+)?(?![a-zA-Z0-9_}])")

# Números estruturais/contextuais permitidos fora de marcadores (anos da base, P1/P2, limites regulatórios citados)
NUMEROS_CONTEXTUAIS_PERMITIDOS = {
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

    texto_final = texto
    for chave, valor in marcadores.items():
        chave_limpa = str(chave).strip("{}")
        placeholder = "{" + chave_limpa + "}"
        if isinstance(valor, (int, float, Decimal)) and not isinstance(valor, bool):
            valor_str = formatar_numero_pt_br(valor)
        else:
            valor_str = str(valor)
        texto_final = texto_final.replace(placeholder, valor_str)
    return texto_final


def extrair_numeros_do_resultado(resultado: ResultadoConsulta | None) -> list[float]:
    """Coleta todos os valores numéricos presentes nas células do ResultadoConsulta (e variações de escala)."""
    if resultado is None or not resultado.linhas:
        return []

    numeros: list[float] = []
    for linha in resultado.linhas:
        for celula in linha:
            if isinstance(celula, bool) or celula is None:
                continue
            if isinstance(celula, (int, float, Decimal)):
                val = float(celula)
                if math.isfinite(val):
                    numeros.append(val)
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
                except ValueError:
                    pass
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
    """Valida determinísticamente a saída do agente contra `deps.ultimo_resultado` (GENAI-10.2).

    Levanta `ViolacaoFidelidadeSaida` se detectar:
    - Resposta `ok` sem execução de SQL ou com resultado vazio.
    - SQL em `saida.sql` divergente de `deps.ultimo_sql`.
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

    # 1. Conferência do SQL executado vs declarado
    if deps.ultimo_sql and saida.sql:
        sql_declarado_norm = " ".join(saida.sql.strip().rstrip(";").split()).lower()
        sql_executado_norm = " ".join(deps.ultimo_sql.strip().rstrip(";").split()).lower()
        if sql_declarado_norm != sql_executado_norm:
            raise ViolacaoFidelidadeSaida(
                "O campo `sql` da resposta difere do último SQL executado em `consultar_gold`. "
                "Use exatamente o SQL executado."
            )

    # 2. Conferência de marcadores no texto
    marcadores_no_texto = REGEX_MARCADOR_NO_TEXTO.findall(saida.texto or "")
    for m_key in marcadores_no_texto:
        if m_key not in saida.marcadores:
            raise ViolacaoFidelidadeSaida(
                f"O texto usa o marcador `{{{m_key}}}`, mas `{m_key}` não foi preenchido em `marcadores`."
            )

    numeros_banco = extrair_numeros_do_resultado(ultimo_res)
    textos_banco = extrair_textos_do_resultado(ultimo_res)
    numeros_pergunta = _extrair_numeros_da_pergunta(deps.pergunta_original)

    # 3. Conferência dos valores dentro de `saida.marcadores` contra os dados retornados
    for m_key, m_val in (saida.marcadores or {}).items():
        if isinstance(m_val, (int, float, Decimal)) and not isinstance(m_val, bool):
            val_float = float(m_val)
            if not _numero_bate_com_dados(val_float, numeros_banco):
                raise ViolacaoFidelidadeSaida(
                    f"O valor `{m_val}` do marcador `{m_key}` não consta nos dados retornados pela consulta "
                    f"(valores disponíveis: {numeros_banco[:10]}). Nunca invente números."
                )
        elif isinstance(m_val, str):
            limpo = m_val.strip().replace("R$", "").replace("%", "").strip()
            try:
                val_float = float(limpo.replace(".", "").replace(",", "."))
                if not _numero_bate_com_dados(val_float, numeros_banco):
                    raise ViolacaoFidelidadeSaida(
                        f"O valor numérico `{m_val}` do marcador `{m_key}` não consta no resultado da consulta."
                    )
            except ValueError:
                if m_val.strip().upper() not in textos_banco and textos_banco:
                    raise ViolacaoFidelidadeSaida(
                        f"O texto `{m_val}` do marcador `{m_key}` não consta no resultado da consulta."
                    )

    # 4. Conferência de números soltos fora dos marcadores no texto
    texto_sem_marcadores = REGEX_MARCADOR_NO_TEXTO.sub(" ", saida.texto or "")
    # Remove códigos identificadores como UC-0010, ALM-REC-001, P1, P2, B1, B2, B3, A4
    texto_limpo = re.sub(r"\b(?:UC|ALM|P|B|A)[-_]?\d+(?:[-_]\d+)?\b", " ", texto_sem_marcadores, flags=re.IGNORECASE)
    # Remove datas ISO YYYY-MM
    texto_limpo = re.sub(r"\b202[2-6]-(?:0[1-9]|1[0-2])\b", " ", texto_limpo)

    for token_num in REGEX_NUMERO_SOLTO.findall(texto_limpo):
        token_norm = token_num.replace("−", "-")
        # Se tem ponto de milhar e vírgula decimal (ex.: 1.234,56)
        if "." in token_norm and "," in token_norm:
            token_norm = token_norm.replace(".", "").replace(",", ".")
        elif "," in token_norm:
            token_norm = token_norm.replace(",", ".")
        try:
            num_solto = float(token_norm)
        except ValueError:
            continue

        if abs(num_solto) in NUMEROS_CONTEXTUAIS_PERMITIDOS or abs(num_solto) in numeros_pergunta:
            continue
        if not _numero_bate_com_dados(num_solto, numeros_banco):
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

    # 6. Verificação de Premissa Falsa (GENAI-10.4): pergunta fala em "cresceu/aumento" mas variação é < 0
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

    return saida


def enriquecer_avisos_e_premissas(
    saida: RespostaAgente,
    sql_executado: str | None,
    resultado: ResultadoConsulta | None,
) -> list[str]:
    """Adiciona avisos de interpretação de domínio (GENAI-10.5) e aviso de truncamento de tabela (GENAI-14.3)."""
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
