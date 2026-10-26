from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.models.gold_source import UnidadeConsumidora


def listar_municipios(db: Session) -> list[str]:
    consulta = select(distinct(UnidadeConsumidora.municipio)).order_by(UnidadeConsumidora.municipio)
    return list(db.scalars(consulta).all())


def listar_bairros(db: Session) -> list[tuple[str, str]]:
    # O mesmo nome de bairro existe em vários municípios: o par (município, bairro) é a chave
    consulta = (
        select(UnidadeConsumidora.municipio, UnidadeConsumidora.bairro)
        .distinct()
        .order_by(UnidadeConsumidora.municipio, UnidadeConsumidora.bairro)
    )
    return [tuple(linha) for linha in db.execute(consulta).all()]


def listar_classes(db: Session) -> list[str]:
    consulta = select(distinct(UnidadeConsumidora.classe)).order_by(UnidadeConsumidora.classe)
    return list(db.scalars(consulta).all())


def listar_alimentadores(db: Session) -> list[tuple[str, str]]:
    consulta = (
        select(UnidadeConsumidora.alimentador, UnidadeConsumidora.municipio)
        .distinct()
        .order_by(UnidadeConsumidora.alimentador)
    )
    return [tuple(linha) for linha in db.execute(consulta).all()]
