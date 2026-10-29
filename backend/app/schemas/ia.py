from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.common import Contexto, IndicadorNomeado, Metadados, Schema, Texto

# `esclarecer`: a pergunta é ambígua e volta com opções, sem consulta (contrato, seção 9).
StatusIA = Literal['ok', 'nao_sei', 'bloqueado', 'esclarecer']


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


class SerieGrafico(Schema):
    nome: str
    # Um valor por categoria, na mesma ordem; null = sem dado (buraco na linha, barra ausente).
    valores: list[float | None]


class GraficoIA(Schema):
    """Gráfico montado pelo backend a partir de `dados` (contrato, seção 9); os valores vêm do banco."""
    tipo: Literal['barras', 'pizza', 'linhas']
    titulo: str = Field(max_length=150)
    # Como o front formata as categorias: nomes (formatarNome), meses (jul/2025) ou P1/P2 como estão.
    eixo: Literal['categoria', 'tempo', 'periodo']
    orientacao: Literal['horizontal', 'vertical'] | None = None
    unidade: Literal['brl', 'kwh', 'pct', 'h'] | None = None
    categorias: list[str] = Field(min_length=1, max_length=48)
    series: list[SerieGrafico] = Field(min_length=1, max_length=4)
    origem: Literal['automatico', 'pedido']
    # Categorias ou séries que ficaram de fora do limite do gráfico (a tabela completa segue em dados).
    omitidos: int = Field(default=0, ge=0)
    nota: str | None = None

    @model_validator(mode='after')
    def validar_formato(self):
        if any(len(s.valores) != len(self.categorias) for s in self.series):
            raise ValueError('Cada série deve ter um valor por categoria')
        if self.tipo == 'pizza':
            if len(self.series) != 1 or len(self.categorias) > 5:
                raise ValueError('Pizza tem uma série e até 5 fatias')
            if any(v is None or v < 0 for v in self.series[0].valores):
                raise ValueError('Fatias da pizza não podem ser negativas nem vazias')
        if self.tipo == 'barras' and self.orientacao is None:
            raise ValueError('Barras exigem orientação')
        return self


class OpcaoEsclarecimento(Schema):
    rotulo: str = Field(max_length=120)
    # A pergunta já completa: o front a reenvia como se a pessoa tivesse digitado.
    pergunta: Annotated[str, StringConstraints(min_length=1, max_length=2000)]


class EsclarecimentoIA(Schema):
    pergunta: str
    opcoes: list[OpcaoEsclarecimento] = Field(min_length=2, max_length=10)


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
    apresentacao: Literal['texto', 'tabela', 'grafico'] | None = None
    detalhes_tecnicos: DetalhesTecnicos | None = None
    grafico: GraficoIA | None = None
    esclarecimento: EsclarecimentoIA | None = None

    @model_validator(mode='after')
    def validar_grafico(self):
        if (self.apresentacao == 'grafico') != (self.grafico is not None):
            raise ValueError('apresentacao "grafico" e o campo grafico andam juntos')
        if (self.status == 'esclarecer') != (self.esclarecimento is not None):
            raise ValueError('status "esclarecer" e o campo esclarecimento andam juntos')
        return self


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
