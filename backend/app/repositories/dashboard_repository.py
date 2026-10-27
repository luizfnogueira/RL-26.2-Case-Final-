from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.orm import Session

from app.core.config import GOLD_SOURCE
if GOLD_SOURCE == 'real':
    from app.models.gold_real import AggPrecoVolume, AggDecFecMensal as DecFecAlimentadorMes, FatoUCMes as Fatura, FatoUCMes as Leitura, DimUC as UnidadeConsumidora
    from app.models.gold_real import AggReceitaMensal, DimMes
else:
    from app.models.gold import DecFecAlimentadorMes, Fatura, UnidadeConsumidora, Leitura, AggPrecoVolume
    AggReceitaMensal = DimMes = None  # o seed não tem as tabelas agregadas da Gold

ENERGIA = Leitura.consumo_kwh_valido if GOLD_SOURCE == 'real' else Leitura.consumo_kwh
UCS = DecFecAlimentadorMes.ucs_atendidas if GOLD_SOURCE == 'real' else DecFecAlimentadorMes.ucs_total


def _usa_agregada(filtros: dict) -> bool:
    """Gold real sem filtro de alimentador: receita e kWh já vêm somados por mês × município × bairro × classe.

    A agg_receita_mensal tem 53 mil linhas contra 2,15 milhões da fato_uc_mes, com os mesmos totais
    (receita_total = Σ valor_total; consumo_kwh = Σ consumo_kwh_valido). Ela não tem alimentador.
    """
    return GOLD_SOURCE == 'real' and filtros.get('alimentador') is None


def _filtrar_agregada(consulta, filtros: dict):
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(AggReceitaMensal, campo) == valor)
    return consulta


def _somar_agregada(db: Session, coluna, inicio: str, fim: str, filtros: dict) -> Decimal:
    consulta = select(func.sum(coluna)).where(AggReceitaMensal.mes_referencia.between(inicio, fim))
    return db.execute(_filtrar_agregada(consulta, filtros)).scalar_one()


def _serie_agregada(db: Session, coluna, inicio: str, fim: str, filtros: dict) -> list[tuple[str, Decimal]]:
    consulta = (
        select(AggReceitaMensal.mes_referencia, func.sum(coluna))
        .where(AggReceitaMensal.mes_referencia.between(inicio, fim))
        .group_by(AggReceitaMensal.mes_referencia)
        .order_by(AggReceitaMensal.mes_referencia)
    )
    return [tuple(linha) for linha in db.execute(_filtrar_agregada(consulta, filtros)).all()]


def somar_receita(db: Session, inicio: str, fim: str, filtros: dict) -> Decimal:
    if _usa_agregada(filtros):
        return _somar_agregada(db, AggReceitaMensal.receita_total, inicio, fim, filtros)
    consulta = (
        select((func.sum(Fatura.valor_total) if GOLD_SOURCE == 'real' else func.coalesce(func.sum(Fatura.valor_total), 0)))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Fatura.id_uc)
        .where(Fatura.mes_referencia.between(inicio, fim))
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return db.execute(consulta).scalar_one()

def somar_energia(db: Session, inicio: str, fim: str, filtros: dict) -> Decimal:
    if _usa_agregada(filtros):
        return _somar_agregada(db, AggReceitaMensal.consumo_kwh, inicio, fim, filtros)
    consulta = (
        select(func.sum(ENERGIA) if GOLD_SOURCE == 'real' else func.coalesce(func.sum(ENERGIA), 0))
        .join(UnidadeConsumidora, Leitura.id_uc == UnidadeConsumidora.id_uc)
        .where(Leitura.mes_referencia.between(inicio, fim), *([] if GOLD_SOURCE == 'real' else [Leitura.flag_consumo_negativo == False]))
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return db.execute(consulta).scalar_one()

def contar_ucs_ativas(db: Session, inicio: str, fim: str, filtros: dict) -> int:
    # Regra da Gold (fato_alimentador_mes): UC ligada até o fim do último mês; sem data de ligação, conta sempre.
    ano, mes = int(fim[:4]), int(fim[5:])
    ultimo_dia = date(ano, mes, monthrange(ano, mes)[1])
    consulta = select(func.count()).select_from(UnidadeConsumidora).where(
        (UnidadeConsumidora.data_ligacao.is_(None)) | (UnidadeConsumidora.data_ligacao <= ultimo_dia)
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return db.execute(consulta).scalar_one()

def somar_inadimplencia(db: Session, inicio: str, fim: str, filtros: dict) -> Decimal:
    consulta = (
        select(func.coalesce(func.sum(Fatura.valor_total), 0))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Fatura.id_uc)
        .where(
            Fatura.mes_referencia.between(inicio, fim),
            Fatura.status == "EM ABERTO",
        )
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return db.execute(consulta).scalar_one()

def somar_continuidade(db: Session, inicio: str, fim: str, municipio: str | None) -> tuple[Decimal | None, Decimal | None]:
    """DEC e FEC da janela, como na Gold: o Cc muda a cada mês, então soma o DEC/FEC de cada mês."""
    condicoes = [DecFecAlimentadorMes.mes_referencia.between(inicio, fim)]
    if municipio is not None:
        condicoes.append(DecFecAlimentadorMes.municipio == municipio)

    # 1 linha por mês: horas, interrupções e UCs (Cc) somadas nos alimentadores daquele mês
    por_mes = (
        select(
            func.sum(DecFecAlimentadorMes.horas_interrupcao).label("horas"),
            func.sum(DecFecAlimentadorMes.interrupcoes).label("interrupcoes"),
            func.sum(UCS).label("ucs"),
        )
        .where(*condicoes)
        .group_by(DecFecAlimentadorMes.mes_referencia)
        .subquery()
    )
    dec, fec = db.execute(
        select(
            # sem coalesce: sem alimentador no recorte o DEC/FEC é ausente (None), não 0
            func.sum(por_mes.c.horas / por_mes.c.ucs),
            # cast: no PostgreSQL, inteiro ÷ inteiro descarta as casas decimais e o FEC viraria 0
            func.sum(cast(por_mes.c.interrupcoes, Numeric) / por_mes.c.ucs),
        )
    ).one()
    return dec, fec

def meses_da_base(db: Session) -> list[str]:
    """Calendário da base: a gold.dim_mes na Gold real; no seed, os meses com fatura, sem filtro de região."""
    if GOLD_SOURCE == 'real':
        return list(db.scalars(select(DimMes.mes_referencia).order_by(DimMes.mes_referencia)).all())
    consulta = select(Fatura.mes_referencia).distinct().order_by(Fatura.mes_referencia)
    return list(db.scalars(consulta).all())

def serie_receita(db: Session, inicio: str, fim: str, filtros: dict) -> list[tuple[str, Decimal]]:
    if _usa_agregada(filtros):
        return _serie_agregada(db, AggReceitaMensal.receita_total, inicio, fim, filtros)
    consulta = (
        select(Fatura.mes_referencia, func.sum(Fatura.valor_total))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Fatura.id_uc)
        .where(Fatura.mes_referencia.between(inicio, fim))
        .group_by(Fatura.mes_referencia)
        .order_by(Fatura.mes_referencia)
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return [tuple(linha) for linha in db.execute(consulta).all()]

def serie_energia(db: Session, inicio: str, fim: str, filtros: dict) -> list[tuple[str, Decimal]]:
    if _usa_agregada(filtros):
        return _serie_agregada(db, AggReceitaMensal.consumo_kwh, inicio, fim, filtros)
    consulta = (
        select(Leitura.mes_referencia, func.sum(ENERGIA))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Leitura.id_uc)
        .where(Leitura.mes_referencia.between(inicio, fim), *([] if GOLD_SOURCE == 'real' else [Leitura.flag_consumo_negativo == False]))
        .group_by(Leitura.mes_referencia)
        .order_by(Leitura.mes_referencia)
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return [tuple(linha) for linha in db.execute(consulta).all()]

def linhas_preco_volume(db: Session, filtros: dict) -> list[AggPrecoVolume]:
    """Recortes da gold.agg_preco_volume que batem com os filtros de município, bairro e classe."""
    consulta = select(AggPrecoVolume)
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(AggPrecoVolume, campo) == valor)
    return list(db.scalars(consulta).all())
