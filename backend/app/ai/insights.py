"""Agente de insight da Tela 2 (GENAI-25): o modelo escreve o texto, os números vêm da Gold.

O POST /ia/insight já calcula os seis números da ponte. O modelo recebe esses números já formatados e
escreve título e texto com marcadores ({efeito_preco}, {variacao_volume}...). O código troca cada
marcador pelo valor, então nenhum número do texto sai do modelo. Algarismo escrito fora de marcador ou
marcador inexistente pedem uma nova tentativa (ModelRetry); se repetir, a exceção sobe e o backend usa
o texto por regra. Além disso, o pós-processamento corrige deterministicamente defeitos de redação
("receita líquida", marcador sem rótulo, sinal negativo duplicado e inversão de períodos) sem derrubar
a resposta para texto alternativo.
"""
from __future__ import annotations

import os
import re

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models import Model
from pydantic_ai.usage import UsageLimits

from app.ai.modelo import criar_modelo, obter_model_settings

MARCADOR = re.compile(r"\{([a-z_]+)\}")
ALGARISMO = re.compile(r"\d")
CODIGO_PERIODO = re.compile(r"\bP[12]\b", re.IGNORECASE)

# Cache em memória para evitar chamadas repetidas ao provedor gratuito ao alternar filtros ou dar F5
_CACHE_INSIGHT: dict[tuple[tuple[tuple[str, str], ...], str], dict[str, str]] = {}

# Correções determinísticas de redação e informação para o insight da Receita (Seções 5.1 a 5.3):
_RECEITA_LIQUIDA_RE = re.compile(r"\breceitas?\s+l[íi]quidas?\b", re.IGNORECASE)
_LIQUIDA_SOLTA_RE = re.compile(r"\bl[íi]quid[ao]s?\b", re.IGNORECASE)
_PERIODOS_RECEITA_INVERTIDOS_RE = re.compile(
    r"\bde\s+\{receita_energia_atual\}\s+para\s+\{receita_energia_base\}",
    re.IGNORECASE,
)
_PERIODOS_DATAS_INVERTIDOS_RE = re.compile(
    r"\b(entre|de)\s+\{periodo_atual\}\s+(e|a|para)\s+\{periodo_base\}",
    re.IGNORECASE,
)
_ROTULO_FALTANTE_PRECO_RE = re.compile(
    r"(?<!efeito-preço )(?<!efeito preço )\b(pel[oa]s?|o|ao)\s+\{efeito_preco\}",
    re.IGNORECASE,
)
_ROTULO_FALTANTE_VOLUME_RE = re.compile(
    r"(?<!efeito-volume )(?<!efeito volume )\b(pel[oa]s?|o|ao)\s+\{efeito_volume\}",
    re.IGNORECASE,
)
_ROTULO_FALTANTE_REAJUSTE_RE = re.compile(
    r"(?<!reajuste )\b(pel[oa]s?|o|ao)\s+\{reajuste\}",
    re.IGNORECASE,
)
_SINAL_DUPLO_APOS_PALAVRA_NEGATIVA_RE = re.compile(
    r"(\b(?:queda|retra[çc][ãa]o|redu[çc][ãa]o|recuo|diminui[çc][ãa]o|encolhimento|perda|baixa)\s+(?:de\s+|em\s+)?)"
    r"[-−]\s*(?=R\$|\d)",
    re.IGNORECASE,
)
_SINAL_MENOS_DUPLICADO_RE = re.compile(r"[-−]\s*[-−]\s*(?=R\$|\d)")

INSTRUCOES = """
Você escreve o insight da tela de receita do portal da V-Energy, uma distribuidora de energia:
explique por que a receita de energia (sem tributos) mudou entre o período base e o período atual.

Regras:
1. Todo número vem dos marcadores listados na mensagem. Escreva o marcador entre chaves, como
   {efeito_preco}, no lugar do número. Nunca digite algarismos, nem anos, nem percentuais.
2. Cada marcador traz apenas o número formatado (sem o nome da grandeza). Escreva sempre o nome da
   grandeza antes do marcador: "efeito-preço de {efeito_preco}", "efeito-volume de {efeito_volume}" e
   "reajuste de {reajuste}".
3. Os marcadores negativos já incluem o sinal "−". Não escreva sinal de menos antes do marcador nem
   use "queda de {efeito_volume}" ou "retração de {efeito_volume}".
4. Chame a métrica sempre de "receita de energia" (nunca use "receita líquida" ou "lucro").
5. Cite primeiro o período base ({periodo_base}, {receita_energia_base}) e depois o período atual
   ({periodo_atual}, {receita_energia_atual}).
6. Use apenas os marcadores listados e não invente causas, recortes ou valores que não estão neles.
7. Texto de 2 a 4 frases, em português, para um diretor: quanto a receita mudou, quanto veio do preço
   (reajuste) e quanto do volume de energia faturada, e qual dos dois efeitos predominou.
8. Título curto, de até 8 palavras, sem algarismos.
""".strip()


class TextoInsightIA(BaseModel):
    titulo: str = Field(max_length=150, description="Título curto, sem algarismos")
    texto: str = Field(max_length=1500, description="2 a 4 frases; todo número como marcador {nome}")


def _normalizar_valores_literais_para_marcadores(texto: str, valores: dict[str, str]) -> str:
    """Se o modelo copiou literalmente um valor exato da tabela de marcadores (ex.: 'jul/2022 a jun/2023'
    ou 'R$ 14,4 milhões'), converte para o respectivo `{marcador}` antes de checar algarismos soltos.
    """
    resultado = texto
    # Ordena do maior valor para o menor para evitar substituições parciais
    pares = sorted(
        ((nome, val) for nome, val in valores.items() if val and ALGARISMO.search(val)),
        key=lambda item: len(item[1]),
        reverse=True,
    )
    for nome, val in pares:
        # Remove duplicação "{marcador} (valor)" -> "{marcador}"
        resultado = resultado.replace(f"{{{nome}}} ({val})", f"{{{nome}}}")
        resultado = resultado.replace(f"{val} ({{{nome}}})", f"{{{nome}}}")
        resultado = resultado.replace(val, f"{{{nome}}}")
        # Também aceita hífen comum "-" no lugar de "−"
        val_hifen = val.replace("−", "-")
        if val_hifen != val:
            resultado = resultado.replace(f"{{{nome}}} ({val_hifen})", f"{{{nome}}}")
            resultado = resultado.replace(val_hifen, f"{{{nome}}}")
    return resultado


def _corrigir_antes_de_preencher(texto: str, eh_receita: bool) -> str:
    """Corrige inversão de períodos, 'receita líquida' e falta de rótulo antes de substituir marcadores."""
    if not eh_receita:
        return texto

    corrigido = _RECEITA_LIQUIDA_RE.sub("receita de energia", texto)
    corrigido = _LIQUIDA_SOLTA_RE.sub("de energia", corrigido)
    corrigido = _PERIODOS_RECEITA_INVERTIDOS_RE.sub(
        "de {receita_energia_base} para {receita_energia_atual}",
        corrigido,
    )
    corrigido = _PERIODOS_DATAS_INVERTIDOS_RE.sub(
        r"\1 {periodo_base} \2 {periodo_atual}",
        corrigido,
    )
    corrigido = _ROTULO_FALTANTE_PRECO_RE.sub(r"\1 efeito-preço de {efeito_preco}", corrigido)
    corrigido = _ROTULO_FALTANTE_VOLUME_RE.sub(r"\1 efeito-volume de {efeito_volume}", corrigido)
    corrigido = _ROTULO_FALTANTE_REAJUSTE_RE.sub(r"\1 reajuste de {reajuste}", corrigido)
    return corrigido


def _corrigir_depois_de_preencher(texto: str) -> str:
    """Remove sinais negativos duplicados (ex.: 'retração de −R$ 5,0 milhões' -> 'retração de R$ 5,0 milhões')."""
    corrigido = _SINAL_MENOS_DUPLICADO_RE.sub("−", texto)
    corrigido = _SINAL_DUPLO_APOS_PALAVRA_NEGATIVA_RE.sub(r"\1", corrigido)
    return corrigido


def construir_agente_insight(
    modelo: Model | None = None,
    *,
    instrucoes: str = INSTRUCOES,
) -> Agent[dict[str, str], TextoInsightIA]:
    """Agente pequeno, sem ferramentas, com raciocínio mínimo (perfil 'insight' do GENAI-1)."""
    agente = Agent(
        modelo or criar_modelo("insight"),
        deps_type=dict,
        output_type=TextoInsightIA,
        instructions=instrucoes,
        model_settings=obter_model_settings("insight"),
        retries=2,
    )

    @agente.output_validator
    def conferir(ctx: RunContext[dict[str, str]], saida: TextoInsightIA) -> TextoInsightIA:
        titulo_norm = _normalizar_valores_literais_para_marcadores(saida.titulo, ctx.deps)
        texto_norm = _normalizar_valores_literais_para_marcadores(saida.texto, ctx.deps)
        for campo in (titulo_norm, texto_norm):
            desconhecidos = sorted(set(MARCADOR.findall(campo)) - ctx.deps.keys())
            if desconhecidos:
                raise ModelRetry(f"Marcadores inexistentes: {', '.join(desconhecidos)}. Use só os listados.")
            sem_marcadores = CODIGO_PERIODO.sub("", MARCADOR.sub("", campo))
            if ALGARISMO.search(sem_marcadores):
                raise ModelRetry("Há algarismos fora dos marcadores. Escreva todo número como {marcador}.")
        return TextoInsightIA(titulo=titulo_norm, texto=texto_norm)

    return agente


def escrever_insight(
    valores: dict[str, str],
    modelo: Model | None = None,
    *,
    instrucoes: str = INSTRUCOES,
) -> dict[str, str]:
    """Recebe {marcador: valor já formatado} e devolve {titulo, texto} com os marcadores preenchidos."""
    usar_cache = modelo is None and os.getenv("AI_CACHE_ENABLED", "1").strip() != "0"
    chave_cache = (tuple(sorted(valores.items())), instrucoes)
    if usar_cache and chave_cache in _CACHE_INSIGHT:
        return dict(_CACHE_INSIGHT[chave_cache])

    lista = "\n".join(f"{{{nome}}} = {valor}" for nome, valor in valores.items())
    saida = construir_agente_insight(modelo, instrucoes=instrucoes).run_sync(
        f"Marcadores disponíveis:\n{lista}",
        deps=valores,
        usage_limits=UsageLimits(request_limit=4),
    ).output

    eh_receita = instrucoes == INSTRUCOES and (
        "efeito_preco" in valores or "receita_energia_atual" in valores
    )

    def preencher(texto: str) -> str:
        preparado = _corrigir_antes_de_preencher(texto, eh_receita=eh_receita)
        preenchido = MARCADOR.sub(lambda m: valores[m.group(1)], preparado)
        return _corrigir_depois_de_preencher(preenchido)

    resultado = {"titulo": preencher(saida.titulo), "texto": preencher(saida.texto)}
    if usar_cache:
        _CACHE_INSIGHT[chave_cache] = dict(resultado)
    return resultado
