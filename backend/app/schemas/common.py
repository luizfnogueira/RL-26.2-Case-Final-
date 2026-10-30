from typing import Annotated, Generic, TypeVar

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

Mes = Annotated[str, StringConstraints(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')]
Texto = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def limites(periodo: str) -> tuple[str, str]:
    inicio, _, fim = periodo.partition('/')
    return inicio, fim or inicio


def duracao(periodo: str) -> int:
    inicio, fim = (int(m[:4]) * 12 + int(m[5:]) for m in limites(periodo))
    return fim - inicio + 1


def _validar_periodo(periodo: str) -> str:
    inicio, fim = limites(periodo)
    if inicio > fim:
        raise ValueError('O início do período deve ser anterior ou igual ao fim')
    return periodo


# YYYY-MM ou YYYY-MM/YYYY-MM, com início e fim inclusivos.
Periodo = Annotated[str, StringConstraints(
    pattern=r'^\d{4}-(0[1-9]|1[0-2])(/\d{4}-(0[1-9]|1[0-2]))?$'), AfterValidator(_validar_periodo)]


class Schema(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Erro(Schema):
    codigo: str
    mensagem: str


class Indicador(Schema):
    valor: float | None
    unidade: str
    periodo_referencia: Periodo


class IndicadorContagem(Indicador):
    """Contagem (ex.: interrupções): inteiro no JSON, nunca 3.0. Medidas seguem em Indicador."""
    valor: int | None


class IndicadorNomeado(Indicador):
    nome: str
    rotulo: str


class Metadados(Schema):
    dados_ficticios: bool
    gold_atualizada_em: AwareDatetime | None
    observacoes: list[str] = Field(default_factory=list)


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
    periodo_atual: Periodo
    periodo_comparacao: Periodo | None = None

    @model_validator(mode='after')
    def validar_periodos(self):
        if self.periodo_comparacao is None:
            return self
        if self.periodo_atual == self.periodo_comparacao:
            raise ValueError('Os períodos devem ser diferentes')
        if duracao(self.periodo_atual) != duracao(self.periodo_comparacao):
            raise ValueError('Os períodos devem ter a mesma duração')
        return self


class Paginacao(Schema):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


T = TypeVar('T')


class Pagina(Schema, Generic[T]):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
