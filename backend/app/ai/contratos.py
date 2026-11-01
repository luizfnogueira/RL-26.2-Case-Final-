"""Contratos internos e schemas estruturados da arquitetura CHESS (GENAI-9, 10, 13, 14, 17)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field

StatusRespostaIA = Literal["ok", "nao_sei", "bloqueado"]
NivelConfianca = Literal["alta", "media", "baixa"]
ModoApresentacao = Literal["texto", "tabela"]


class ErroConsulta(RuntimeError):
    """Erro recuperável na execução ou sintaxe do SQL (aciona ModelRetry no agente)."""


class SQLBloqueado(RuntimeError):
    """Violação de segurança determinística (A2); encerra sem nova tentativa e vira status='bloqueado'."""

    def __init__(self, motivo: str) -> None:
        super().__init__(motivo)
        self.motivo = motivo


class PlanoConsulta(BaseModel):
    """Representação estruturada da consulta antes do SQL (aula de Introdução a Text-to-SQL).

    Alimenta também o bloco 'Estrutura de pensamento' no painel de detalhes técnicos.
    """

    tabelas: list[str] = Field(default_factory=list, description="Tabelas ou views da Gold consultadas")
    colunas: list[str] = Field(default_factory=list, description="Colunas selecionadas ou calculadas")
    filtros: list[str] = Field(
        default_factory=list,
        description="Filtros WHERE aplicados (incluindo flag_consumo_negativo = FALSE quando aplicável)",
    )
    agregacao: str | None = Field(default=None, description="Agregação principal (SUM, AVG, MIN, MAX, COUNT)")
    ordenacao: str | None = Field(default=None, description="Critério de ORDER BY")
    limite: int | None = Field(default=None, description="LIMIT aplicado na consulta")
    periodo: str = Field(
        default="P2 (2025-07 a 2026-06)",
        description="Período temporal considerado na consulta (ex.: P1, P2, 2025-07/2026-06)",
    )
    inclui_consumo_negativo_explicito: bool = Field(
        default=False,
        description=(
            "True SOMENTE se o usuário pediu explicitamente casos de erro de medidor ou "
            "consumo negativo. False em todas as consultas normais de consumo."
        ),
    )


class RespostaAgente(BaseModel):
    """Saída estruturada produzida pelo Candidate Generator (CG do CHESS)."""

    status: StatusRespostaIA = Field(description="Status da resposta: 'ok', 'nao_sei' ou 'bloqueado'")
    pergunta_interpretada: str = Field(
        description="Pergunta completa interpretada (resolvendo referências a turnos anteriores)"
    )
    plano: PlanoConsulta | None = Field(
        default=None,
        description="Plano estruturado da consulta antes de gerar o SQL",
    )
    sql: str | None = Field(default=None, description="Consulta SQL SELECT executada pela ferramenta consultar_gold")
    premissas: list[str] = Field(
        default_factory=list,
        description="Premissas assumidas (período, métrica sem/com tributos, filtro de consumo válido, etc.)",
    )
    marcadores: dict[str, str | int | float] = Field(
        default_factory=dict,
        description="Mapa de marcadores {v1: valor_exato, v2: valor_exato} extraídos do resultado da consulta",
    )
    texto: str = Field(
        description=(
            "Texto claro em português respondendo à pergunta, usando marcadores {v1}, {v2} "
            "para números vindos do banco e citando período, unidade e métrica."
        )
    )
    justificativa: str = Field(
        default="",
        description="Justificativa curta declarada pelo modelo sobre como chegou à resposta",
    )
    confianca: NivelConfianca = Field(
        default="alta",
        description="Grau de confiança do agente na resposta ('alta', 'media' ou 'baixa')",
    )


class ResultadoConsulta(BaseModel):
    """Retorno padronizado da ferramenta de consulta à camada Gold."""

    colunas: list[str] = Field(default_factory=list)
    linhas: list[list[Any]] = Field(default_factory=list)
    n_linhas: int = 0
    truncado: bool = False
    bloqueado: bool = False
    motivo_bloqueio: str | None = None
    sql_executado: str | None = None
    tabelas_usadas: list[str] = Field(default_factory=list)

    @classmethod
    def bloqueada(cls, motivo: str, sql: str | None = None) -> "ResultadoConsulta":
        return cls(
            colunas=[],
            linhas=[],
            n_linhas=0,
            truncado=False,
            bloqueado=True,
            motivo_bloqueio=motivo,
            sql_executado=sql,
        )


class AcaoFerramenta(BaseModel):
    """Registro de um passo 'pensamento -> ação -> observação' do loop ReAct (GENAI-17)."""

    ordem: int
    ferramenta: str
    argumentos: dict[str, Any] = Field(default_factory=dict)
    resumo_retorno: str = ""
    sucesso: bool = True


class TelemetriaExecucao(BaseModel):
    """Métricas de uso, tempo e trilha de execução extraídas do run do PydanticAI (GENAI-17)."""

    modelo: str
    provedor: str
    tokens_entrada: int = 0
    tokens_saida: int = 0
    tokens_raciocinio: int = 0
    chamadas_modelo: int = 0
    tentativas_sql: int = 0
    latencia_total_ms: int = 0
    etapas_ms: dict[str, int] = Field(default_factory=dict)
    cache_hit: bool = False
    skills_utilizadas: list[str] = Field(default_factory=list)
    acoes: list[AcaoFerramenta] = Field(default_factory=list)
    verificacoes: dict[str, Any] = Field(default_factory=dict)


class TrocaHistorico(BaseModel):
    """Representação enxuta de uma interação anterior para o message_history (GENAI-13)."""

    pergunta_interpretada: str
    resposta_resumo: str
    sql_executado: str | None = None
    filtros: dict[str, Any] = Field(default_factory=dict)


@dataclass
class DepsAgente:
    """Dependências injetadas no RunContext do agente PydanticAI."""

    pergunta_original: str
    skills_ativas: list[str] = field(default_factory=list)
    contexto_skills: str = ""
    entidades_resolvidas: dict[str, Any] = field(default_factory=dict)
    consumo_negativo_solicitado: bool = False
    executar_sql_fn: Callable[[str], ResultadoConsulta] | None = None
    valores_distintos_fn: Callable[[str, str], list[str]] | None = None
    descrever_tabela_fn: Callable[[str], str] | None = None
    ultimo_resultado: ResultadoConsulta | None = None
    ultimo_sql: str | None = None
    historico_resultados: list[ResultadoConsulta] = field(default_factory=list)
    bloqueio: str | None = None
    tentativas_sql: int = 0
    tentativas_validacao_saida: int = 0
