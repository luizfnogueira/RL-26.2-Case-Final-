from typing import Annotated

from pydantic import AwareDatetime, StringConstraints

from app.schemas.common import Contexto, FiltrosDashboard, Indicador, Schema


class PerguntaIA(Schema):
    pergunta: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    contexto: Contexto | None = None


class PedidoInsight(Schema):
    contexto: FiltrosDashboard


class IndicadorUtilizado(Indicador):
    nome: str


class RespostaIA(Schema):
    resposta: str
    contexto: Contexto | None
    indicadores_utilizados: list[IndicadorUtilizado]
    gerado_em: AwareDatetime
