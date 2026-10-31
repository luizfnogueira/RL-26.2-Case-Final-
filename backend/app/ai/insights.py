"""Agente de insight da Tela 2 (GENAI-25): o modelo escreve o texto, os números vêm da Gold.

O POST /ia/insight já calcula os seis números da ponte. O modelo recebe esses números já formatados e
escreve título e texto com marcadores ({efeito_preco}, {variacao_volume}...). O código troca cada
marcador pelo valor, então nenhum número do texto sai do modelo. Algarismo escrito fora de marcador ou
marcador inexistente pedem uma nova tentativa (ModelRetry); se repetir, a exceção sobe e o backend usa
o texto por regra.
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

INSTRUCOES = """
Você escreve o insight da tela de receita do portal da V-Energy, uma distribuidora de energia:
explique por que a receita de energia (sem tributos) mudou entre o período base e o período atual.

Regras:
1. Todo número vem dos marcadores listados na mensagem. Escreva o marcador entre chaves, como
   {efeito_preco}, no lugar do número. Nunca digite algarismos, nem anos, nem percentuais.
2. Use apenas os marcadores listados e não invente causas, recortes ou valores que não estão neles.
3. Texto de 2 a 4 frases, em português, para um diretor: quanto a receita mudou, quanto veio do preço
   (reajuste) e quanto do volume de energia faturada, e qual dos dois efeitos predominou.
4. Título curto, de até 8 palavras.
""".strip()


class TextoInsightIA(BaseModel):
    titulo: str = Field(max_length=150, description="Título curto, sem algarismos")
    texto: str = Field(max_length=1500, description="2 a 4 frases; todo número como marcador {nome}")


def construir_agente_insight(modelo: Model | None = None,
                             instrucoes: str | None = None) -> Agent[dict[str, str], TextoInsightIA]:
    """Agente pequeno, sem ferramentas, com raciocínio mínimo (perfil 'insight' do GENAI-1).

    `instrucoes` troca só o prompt de sistema; sem ele, vale o INSTRUCOES da receita, lido na chamada.
    Marcadores e validação não mudam.
    """
    agente = Agent(
        modelo or criar_modelo("insight"),
        deps_type=dict,
        output_type=TextoInsightIA,
        instructions=instrucoes if instrucoes is not None else INSTRUCOES,
        model_settings=obter_model_settings("insight"),
        retries=1,
    )

    @agente.output_validator
    def conferir(ctx: RunContext[dict[str, str]], saida: TextoInsightIA) -> TextoInsightIA:
        for campo in (saida.titulo, saida.texto):
            desconhecidos = sorted(set(MARCADOR.findall(campo)) - ctx.deps.keys())
            if desconhecidos:
                raise ModelRetry(f"Marcadores inexistentes: {', '.join(desconhecidos)}. Use só os listados.")
            if ALGARISMO.search(MARCADOR.sub("", campo)):
                raise ModelRetry("Há algarismos fora dos marcadores. Escreva todo número como {marcador}.")
        return saida

    return agente


def escrever_insight(valores: dict[str, str], modelo: Model | None = None,
                     instrucoes: str | None = None) -> dict[str, str]:
    """Recebe {marcador: valor já formatado} e devolve {titulo, texto} com os marcadores preenchidos.

    `instrucoes` é opcional (V1c: resumo da unidade); sem ele, vale o prompt da receita, como sempre.
    """
    lista = "\n".join(f"{{{nome}}} = {valor}" for nome, valor in valores.items())
    saida = construir_agente_insight(modelo, instrucoes).run_sync(
        f"Marcadores disponíveis:\n{lista}",
        deps=valores,
        usage_limits=UsageLimits(request_limit=3),
    ).output

    def preencher(texto: str) -> str:
        return MARCADOR.sub(lambda m: valores[m.group(1)], texto)

    return {"titulo": preencher(saida.titulo), "texto": preencher(saida.texto)}
