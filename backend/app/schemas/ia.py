from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.common import Contexto, IndicadorNomeado, Metadados, Schema, Texto

StatusIA = Literal['ok', 'nao_sei', 'bloqueado']


class PerguntaIA(Schema):
    pergunta: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    # Liga as perguntas de uma conversa; sem ele, o backend abre uma conversa nova (GENAI-12).
    conversa_id: UUID | None = None


class DadosIA(Schema):
    colunas: list[str]
    linhas: list[list[str | float | int | bool | None]]

    @model_validator(mode='after')
    def validar_linhas(self):
        if any(len(linha) != len(self.colunas) for linha in self.linhas):
            raise ValueError('Cada linha deve seguir a ordem e a quantidade de colunas')
        return self


# Detalhes técnicos (GENAI-18): os blocos vêm da telemetria do agente. Campos novos da telemetria são
# aceitos (extra='allow') para não derrubar a resposta com 503; o front mostra só os campos daqui.
class BlocoDetalhes(Schema):
    model_config = ConfigDict(extra='allow')


class PlanoIA(BlocoDetalhes):
    tabelas: list[str] = Field(default_factory=list)
    colunas: list[str] = Field(default_factory=list)
    filtros: list[str] = Field(default_factory=list)
    agregacao: str | None = None
    ordenacao: str | None = None
    limite: int | None = None
    periodo: str | None = None


class EstruturaPensamento(BlocoDetalhes):
    pergunta_interpretada: str
    plano: PlanoIA | None = None
    skills: list[str] = Field(default_factory=list)
    premissas: list[str] = Field(default_factory=list)
    justificativa: str = ''


class AcaoIA(BlocoDetalhes):
    ordem: int
    ferramenta: str
    argumentos: dict[str, Any] = Field(default_factory=dict)
    resumo_retorno: str = ''
    sucesso: bool = True


class ConsultaIA(BlocoDetalhes):
    sql_executado: str | None = None
    tentativas: int = 0
    linhas: int = 0


class TokensTempo(BlocoDetalhes):
    tokens_entrada: int = 0
    tokens_saida: int = 0
    tokens_raciocinio: int = 0
    chamadas: int = 0
    latencia_total_ms: int = 0
    etapas_ms: dict[str, int] = Field(default_factory=dict)
    modelo: str | None = None
    provedor: str | None = None
    cache: bool = False


class Verificacoes(BlocoDetalhes):
    sql_validado: bool | None = None
    numeros_conferidos: bool | None = None
    confianca: Literal['alta', 'media', 'baixa'] | None = None


class DetalhesTecnicos(BlocoDetalhes):
    estrutura_pensamento: EstruturaPensamento
    acoes: list[AcaoIA] = Field(default_factory=list)
    consulta: ConsultaIA
    tokens_tempo: TokensTempo
    verificacoes: Verificacoes
    # Resumo do último run da avaliação (avaliacao_ultima.json, GENAI-19); null quando ainda não houve.
    avaliacao: dict[str, Any] | None = None


class RespostaIA(Schema):
    resposta: str
    sql: str | None
    tabelas: list[str]
    dados: DadosIA
    status: StatusIA
    gerado_em: AwareDatetime
    metadados: Metadados
    # Campos da sprint de GenAI, todos opcionais: o mock e respostas antigas continuam válidos (GENAI-3).
    conversa_id: UUID | None = None
    apresentacao: Literal['texto', 'tabela'] | None = None
    detalhes_tecnicos: DetalhesTecnicos | None = None


class PedidoInsight(Schema):
    contexto: Literal['receita', 'unidade']
    filtros: Contexto
    id_uc: Texto | None = None
    indicadores: list[IndicadorNomeado] = Field(default_factory=list)

    @model_validator(mode='after')
    def validar_contexto(self):
        if self.contexto == 'receita':
            if self.id_uc is not None:
                raise ValueError('Insight de receita não aceita id_uc')
            if self.filtros.periodo_comparacao is None:
                raise ValueError('Insight de receita exige periodo_comparacao')
        elif self.id_uc is None:
            raise ValueError('Insight de unidade exige id_uc')
        return self


class RespostaInsight(Schema):
    titulo: str
    texto: str
    numeros_utilizados: list[IndicadorNomeado]
    gerado_em: AwareDatetime
    metadados: Metadados
