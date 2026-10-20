from app.schemas.common import Disponibilidade, Indicador, Mes, Pagina, Paginacao, Schema, Texto


class FiltrosOperacao(Paginacao):
    periodo_atual: Mes
    alimentador: Texto | None = None


class OperacaoAlimentador(Schema):
    alimentador: str
    status_calculo: Disponibilidade
    motivo_indisponibilidade: str | None
    dec: Indicador
    fec: Indicador


class Operacao(Pagina[OperacaoAlimentador]):
    periodo_referencia: Mes
