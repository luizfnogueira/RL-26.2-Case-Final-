"""Agente de insight da Tela 2 (GENAI-25): o modelo escreve o texto, os números vêm da Gold.

O POST /ia/insight já calcula os seis números da ponte. O modelo recebe esses números já formatados e
escreve título e texto com marcadores ({efeito_preco}, {variacao_volume}...). O código troca cada
marcador pelo valor, então nenhum número do texto sai do modelo. Algarismo escrito fora de marcador,
marcador inexistente ou defeito semântico (como chamar receita de energia de 'líquida', duplicar sinal
negativo, omitir o rótulo da grandeza ou inverter período base e atual) pedem uma nova tentativa
(ModelRetry); se repetir, a exceção sobe e o backend usa o texto por regra.
"""
from __future__ import annotations

import re

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models import Model
from pydantic_ai.usage import UsageLimits

from app.ai.modelo import criar_modelo, obter_model_settings

MARCADOR = re.compile(r"\{([a-z_]+)\}")
ALGARISMO = re.compile(r"\d")

# Defeitos semânticos e de redação identificados na validação com modelo real (Receita / V1c):
PALAVRAS_PROIBIDAS_RECEITA = re.compile(r"\b(?:l[íi]quid[ao]s?|lucros?)\b", re.IGNORECASE)
SINAL_ANTES_DE_MARCADOR = re.compile(r"[-−]\s*(?:R\$\s*)?\{([a-z_]+)\}")
DIRECAO_NEGATIVA_ANTES_DE_MARCADOR = re.compile(
    r"\b(?:queda|retra[çc][ãa]o|redu[çc][ãa]o|recuo|diminui[çc][ãa]o|encolhimento|perda)\s+de\s+\{([a-z_]+)\}",
    re.IGNORECASE,
)
MARCADOR_SEM_ROTULO = re.compile(
    r"\b(?:pel[oa]s?|o|a|no|na|do|da)\s+\{(efeito_preco|efeito_volume|reajuste|variacao_volume)\}",
    re.IGNORECASE,
)
PERIODOS_INVERTIDOS = re.compile(
    r"\bde\s+\{receita_energia_atual\}\s+para\s+\{receita_energia_base\}"
    r"|\b(?:entre|de)\s+\{periodo_atual\}\s+(?:e|a|para)\s+\{periodo_base\}",
    re.IGNORECASE,
)

ROTULOS_RECEITA: dict[str, str] = {
    "recorte": "recorte analisado",
    "periodo_base": "período base (anterior, ponto de partida da comparação)",
    "periodo_atual": "período atual (mais recente, ponto de chegada da comparação)",
    "receita_energia_base": "receita de energia no período base (sem tributos)",
    "receita_energia_atual": "receita de energia no período atual (sem tributos)",
    "reajuste": "reajuste tarifário percentual entre os períodos",
    "variacao_volume": "variação percentual do volume de energia faturada (já inclui sinal + ou −)",
    "efeito_preco": "efeito-preço em R$ na variação da receita (já inclui sinal se negativo)",
    "efeito_volume": "efeito-volume em R$ na variação da receita (já inclui sinal + ou −)",
}

INSTRUCOES = """
Você escreve o insight da tela de receita do portal da V-Energy, uma distribuidora de energia:
explique por que a receita de energia (sem tributos) mudou entre o período base e o período atual.

Regras:
1. Todo número vem dos marcadores listados na mensagem. Escreva o marcador entre chaves, como
   {efeito_preco}, no lugar do número. Nunca digite algarismos, nem anos, nem percentuais.
2. Cada marcador é substituído APENAS pelo número formatado (por exemplo, {efeito_preco} vira só o valor
   em R$, sem a palavra "efeito-preço"). Por isso, escreva sempre o nome da grandeza antes do marcador:
   use "efeito-preço de {efeito_preco}", "efeito-volume de {efeito_volume}" e "reajuste de {reajuste}".
   Nunca escreva "pelo {efeito_preco}" ou "o {efeito_volume}" sem o nome da grandeza.
3. Os marcadores {efeito_volume} e {variacao_volume} já trazem o sinal negativo ("−") embutido quando há
   queda. Nunca escreva sinal de menos antes de um marcador nem expressões como "queda de {efeito_volume}"
   ou "retração de {efeito_volume}" (isso geraria sinal duplo como "retração de −R$ ..."). Prefira
   "efeito-volume de {efeito_volume}" ou "o volume ({variacao_volume})".
4. Chame a métrica sempre de "receita de energia". NUNCA use as palavras "receita líquida", "líquida"
   ou "lucro" (a tela mostra receita de energia sem tributos, que é outro conceito).
5. Respeite a ordem cronológica: cite a evolução de {periodo_base} ({receita_energia_base}) para
   {periodo_atual} ({receita_energia_atual}), nunca invertendo o período base com o atual.
6. Use apenas os marcadores listados e não invente causas, recortes ou valores que não estão neles.
7. Texto de 2 a 4 frases, em português, para um diretor: quanto a receita de energia mudou, quanto veio
   do preço (reajuste / efeito-preço) e quanto do volume faturado (efeito-volume), e qual efeito predominou.
8. Título curto, de até 8 palavras, sem algarismos e sem a palavra "líquida".
""".strip()


class TextoInsightIA(BaseModel):
    titulo: str = Field(max_length=150, description="Título curto, sem algarismos")
    texto: str = Field(max_length=1500, description="2 a 4 frases; todo número como marcador {nome}")


def validar_texto_insight(
    saida: TextoInsightIA,
    valores: dict[str, str],
    *,
    validar_regras_receita: bool = True,
) -> None:
    """Valida marcadores, ausência de algarismos soltos e regras semânticas do insight."""
    for campo in (saida.titulo, saida.texto):
        desconhecidos = sorted(set(MARCADOR.findall(campo)) - valores.keys())
        if desconhecidos:
            raise ModelRetry(f"Marcadores inexistentes: {', '.join(desconhecidos)}. Use só os listados.")
        if ALGARISMO.search(MARCADOR.sub("", campo)):
            raise ModelRetry("Há algarismos fora dos marcadores. Escreva todo número como {marcador}.")
        if SINAL_ANTES_DE_MARCADOR.search(campo):
            raise ModelRetry(
                "Não escreva sinal de menos (- ou −) antes de um marcador; o valor do marcador já traz o sinal."
            )

    if not validar_regras_receita:
        return

    texto_completo = f"{saida.titulo} {saida.texto}"
    if PALAVRAS_PROIBIDAS_RECEITA.search(texto_completo):
        raise ModelRetry(
            "Não use 'receita líquida', 'líquida' nem 'lucro'. Use sempre 'receita de energia'."
        )

    for match_dir in DIRECAO_NEGATIVA_ANTES_DE_MARCADOR.finditer(saida.texto):
        nome_marcador = match_dir.group(1)
        valor_formatado = valores.get(nome_marcador, "").strip()
        if valor_formatado.startswith(("−", "-")):
            raise ModelRetry(
                f"O marcador {{{nome_marcador}}} já inclui o sinal negativo ({valor_formatado}). "
                f"Não escreva '{match_dir.group(0)}' para evitar sinal duplo; use 'efeito-volume de {{{nome_marcador}}}'."
            )

    match_sem_rotulo = MARCADOR_SEM_ROTULO.search(saida.texto)
    if match_sem_rotulo:
        nome_m = match_sem_rotulo.group(1)
        raise ModelRetry(
            f"O marcador {{{nome_m}}} contém apenas o número, sem o nome da grandeza. "
            f"Não escreva '{match_sem_rotulo.group(0)}'; escreva o rótulo antes (ex.: 'efeito-preço de {{{nome_m}}}')."
        )

    if PERIODOS_INVERTIDOS.search(saida.texto):
        raise ModelRetry(
            "Os períodos base e atual estão invertidos. A receita passou de {receita_energia_base} "
            "(em {periodo_base}) para {receita_energia_atual} (em {periodo_atual})."
        )


def construir_agente_insight(
    modelo: Model | None = None,
    *,
    instrucoes: str = INSTRUCOES,
) -> Agent[dict[str, str], TextoInsightIA]:
    """Agente pequeno, sem ferramentas, com raciocínio mínimo (perfil 'insight' do GENAI-1)."""
    validar_receita = instrucoes == INSTRUCOES
    agente = Agent(
        modelo or criar_modelo("insight"),
        deps_type=dict,
        output_type=TextoInsightIA,
        instructions=instrucoes,
        model_settings=obter_model_settings("insight"),
        retries=1,
    )

    @agente.output_validator
    def conferir(ctx: RunContext[dict[str, str]], saida: TextoInsightIA) -> TextoInsightIA:
        validar_texto_insight(
            saida,
            ctx.deps,
            validar_regras_receita=validar_receita and ("efeito_preco" in ctx.deps or "receita_energia_atual" in ctx.deps),
        )
        return saida

    return agente


def escrever_insight(
    valores: dict[str, str],
    modelo: Model | None = None,
    *,
    instrucoes: str = INSTRUCOES,
) -> dict[str, str]:
    """Recebe {marcador: valor já formatado} e devolve {titulo, texto} com os marcadores preenchidos."""
    lista = "\n".join(f"{{{nome}}} = {valor}" for nome, valor in valores.items())
    significados = [
        f"- {{{nome}}}: {ROTULOS_RECEITA[nome]}"
        for nome in valores
        if nome in ROTULOS_RECEITA
    ]
    prompt = f"Marcadores disponíveis:\n{lista}"
    if significados and instrucoes == INSTRUCOES:
        prompt += "\n\nSignificado de cada marcador (escreva o rótulo da grandeza antes do marcador):\n" + "\n".join(significados)

    saida = construir_agente_insight(modelo, instrucoes=instrucoes).run_sync(
        prompt,
        deps=valores,
        usage_limits=UsageLimits(request_limit=3),
    ).output

    def preencher(texto: str) -> str:
        return MARCADOR.sub(lambda m: valores[m.group(1)], texto)

    return {"titulo": preencher(saida.titulo), "texto": preencher(saida.texto)}
