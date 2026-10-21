from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from app.schemas.common import Contexto, IndicadorNomeado, Metadados, Schema, Texto

StatusIA = Literal['ok', 'nao_sei', 'bloqueado']


class PerguntaIA(Schema):
    pergunta: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    contexto: Contexto | None = None


class DadosIA(Schema):
    colunas: list[str]
    linhas: list[list[str | float | int | bool | None]]

    @model_validator(mode='after')
    def validar_linhas(self):
        if any(len(linha) != len(self.colunas) for linha in self.linhas):
            raise ValueError('Cada linha deve seguir a ordem e a quantidade de colunas')
        return self


class RespostaIA(Schema):
    resposta: str
    sql: str | None
    tabelas: list[str]
    dados: DadosIA
    status: StatusIA
    gerado_em: AwareDatetime
    metadados: Metadados


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
