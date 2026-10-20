from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from app.schemas.common import (
    Contexto, Disponibilidade, FiltrosRegiao, Indicador, Mes, Pagina,
    Paginacao, Schema, Texto,
)

StatusOrdem = Literal['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']
Motivo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class FiltrosCandidatos(Contexto, Paginacao):
    pass


class Candidato(Schema):
    id_uc: str
    municipio: str
    bairro: str
    classe: str
    alimentador: str
    posicao: int = Field(ge=1)
    motivos: list[str]
    energia_estimada_recuperar: Indicador


class Candidatos(Pagina[Candidato]):
    periodo_referencia: Mes
    status_analise: Disponibilidade
    motivo_indisponibilidade: str | None


class FiltrosInspecoes(FiltrosRegiao, Paginacao):
    id_uc: Texto | None = None
    status: StatusOrdem | None = None
    periodo_atual: Mes | None = None


class Resultado(Schema):
    data: date
    inspetor: Texto
    classificacao: Literal['IRREGULARIDADE_CONFIRMADA', 'SEM_IRREGULARIDADE', 'INCONCLUSIVA']
    tipo_irregularidade: Texto | None = None
    kwh_recuperado: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    observacoes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode='after')
    def validar_resultado(self):
        if self.classificacao == 'IRREGULARIDADE_CONFIRMADA':
            if not self.tipo_irregularidade:
                raise ValueError('Informe o tipo de irregularidade')
        elif self.tipo_irregularidade is not None:
            raise ValueError('Tipo de irregularidade exige confirmação')
        if self.classificacao == 'SEM_IRREGULARIDADE' and self.kwh_recuperado != 0:
            raise ValueError('Sem irregularidade, kwh_recuperado deve ser zero')
        if self.classificacao == 'INCONCLUSIVA' and self.kwh_recuperado is not None:
            raise ValueError('Resultado inconclusivo exige kwh_recuperado nulo')
        return self


class CriarInspecao(Schema):
    id_uc: Texto
    motivo: Motivo


class AtualizarInspecao(Schema):
    status: StatusOrdem
    motivo_cancelamento: Motivo | None = None
    resultado: Resultado | None = None

    @model_validator(mode='after')
    def validar_status(self):
        if self.status == 'CONCLUIDA':
            if self.resultado is None or self.motivo_cancelamento is not None:
                raise ValueError('Conclusão exige resultado e não aceita motivo de cancelamento')
        elif self.status == 'CANCELADA':
            if not self.motivo_cancelamento or self.resultado is not None:
                raise ValueError('Cancelamento exige motivo e não aceita resultado')
        elif self.resultado is not None or self.motivo_cancelamento is not None:
            raise ValueError('Status não aceita resultado ou cancelamento')
        return self


class Ordem(Schema):
    id: str
    id_uc: str
    status: StatusOrdem
    motivo: str
    criado_em: AwareDatetime
    atualizado_em: AwareDatetime
    motivo_cancelamento: str | None
    resultado: Resultado | None
