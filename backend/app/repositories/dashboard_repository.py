from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.orm import Session

from app.core.config import GOLD_SOURCE
if GOLD_SOURCE == 'real':
    from app.models.gold_real import AggPrecoVolume, AggDecFecMensal as DecFecAlimentadorMes, FatoUCMes as Fatura, FatoUCMes as Leitura, DimUC as UnidadeConsumidora
else:
    from app.models.gold import DecFecAlimentadorMes, Fatura, UnidadeConsumidora, Leitura, AggPrecoVolume

ENERGIA = Leitura.consumo_kwh_valido if GOLD_SOURCE == 'real' else Leitura.consumo_kwh
UCS = DecFecAlimentadorMes.ucs_atendidas if GOLD_SOURCE == 'real' else DecFecAlimentadorMes.ucs_total

def somar_receita(db: Session, inicio: str, fim: str, filtros: dict) -> Decimal:
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
        select((func.sum(Fatura.valor_total) if GOLD_SOURCE == 'real' else func.coalesce(func.sum(Fatura.valor_total), 0)))
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
    """Calendário da base (papel da gold.dim_mes): todos os meses com fatura, sem filtro de região."""
    consulta = select(Fatura.mes_referencia).distinct().order_by(Fatura.mes_referencia)
    return list(db.scalars(consulta).all())

def serie_receita(db: Session, inicio: str, fim: str, filtros: dict) -> list[tuple[str, Decimal]]:
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
