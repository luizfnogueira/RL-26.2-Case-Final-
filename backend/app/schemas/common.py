from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Mes = Annotated[str, StringConstraints(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')]
Texto = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Disponibilidade = Literal['disponivel', 'indisponivel']


class Schema(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Erro(Schema):
    codigo: str
    mensagem: str


class Indicador(Schema):
    valor: float | None
    unidade: str
    periodo_referencia: Mes


class FiltrosRegiao(Schema):
    municipio: Texto | None = None
    bairro: Texto | None = None
    classe: Texto | None = None
    alimentador: Texto | None = None

    @model_validator(mode='after')
    def validar_bairro(self):
        if self.bairro and not self.municipio:
            raise ValueError('bairro exige municipio')
        return self


class Contexto(FiltrosRegiao):
    periodo_atual: Mes
    periodo_comparacao: Mes | None = None

    @model_validator(mode='after')
    def validar_periodos(self):
        if self.periodo_atual == self.periodo_comparacao:
            raise ValueError('Os períodos devem ser diferentes')
        return self


class FiltrosDashboard(Contexto):
    periodo_comparacao: Mes


class Paginacao(Schema):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


T = TypeVar('T')


class Pagina(Schema, Generic[T]):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
