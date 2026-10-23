from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.gold import DecFecAlimentadorMes, Fatura, UnidadeConsumidora, Leitura

def somar_receita(db: Session, inicio: str, fim: str, filtros: dict) -> Decimal:
    consulta = (
        select(func.coalesce(func.sum(Fatura.valor_total), 0))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Fatura.id_uc)
        .where(Fatura.mes_referencia.between(inicio, fim))
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return db.execute(consulta).scalar_one()

def somar_energia(db: Session, inicio: str, fim: str, filtros: dict) -> Decimal:
    consulta = (
        select(func.coalesce(func.sum(Leitura.consumo_kwh), 0))
        .join(UnidadeConsumidora, Leitura.id_uc == UnidadeConsumidora.id_uc)
        .where(Leitura.mes_referencia.between(inicio, fim), Leitura.flag_consumo_negativo == False)
    )
    for campo, valor in filtros.items():
            if valor is not None:
                consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return db.execute(consulta).scalar_one()

def contar_ucs_ativas(db: Session, inicio: str, fim: str, filtros: dict) -> int:
    consulta = (
        select(func.count(Fatura.id_uc.distinct()))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Fatura.id_uc)
        .where(Fatura.mes_referencia == fim)
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

def somar_continuidade(db: Session, inicio: str, fim: str, municipio: str | None) -> tuple[Decimal, int, int]:
    condicoes = [DecFecAlimentadorMes.mes_referencia.between(inicio, fim)]
    if municipio is not None:
        condicoes.append(DecFecAlimentadorMes.municipio == municipio)

    horas, interrupcoes = db.execute(
        select(
            func.coalesce(func.sum(DecFecAlimentadorMes.horas_interrupcao), 0),
            func.coalesce(func.sum(DecFecAlimentadorMes.interrupcoes), 0),
        ).where(*condicoes)
    ).one()

    ucs_por_alimentador = (
        select(func.max(DecFecAlimentadorMes.ucs_total).label("ucs"))
        .where(*condicoes)
        .group_by(DecFecAlimentadorMes.alimentador)
        .subquery()
    )
    ucs = db.execute(select(func.coalesce(func.sum(ucs_por_alimentador.c.ucs), 0))).scalar_one()
    return horas, interrupcoes, ucs

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
        select(Leitura.mes_referencia, func.sum(Leitura.consumo_kwh))
        .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == Leitura.id_uc)
        .where(Leitura.mes_referencia.between(inicio, fim), Leitura.flag_consumo_negativo == False)
        .group_by(Leitura.mes_referencia)
        .order_by(Leitura.mes_referencia)
    )
    for campo, valor in filtros.items():
        if valor is not None:
            consulta = consulta.where(getattr(UnidadeConsumidora, campo) == valor)
    return [tuple(linha) for linha in db.execute(consulta).all()]