from sqlalchemy.orm import Session

from app.repositories import filtros_repository
from app.repositories.gold_metadata import metadados_gold


def montar_filtros(db: Session) -> dict:
    """Opções dos filtros de região lidas do cadastro de UCs, para o front não adivinhar os nomes."""
    return {
        "municipios": filtros_repository.listar_municipios(db),
        "bairros": [
            {"municipio": municipio, "bairro": bairro}
            for municipio, bairro in filtros_repository.listar_bairros(db)
        ],
        "classes": filtros_repository.listar_classes(db),
        "alimentadores": [
            {"alimentador": alimentador, "municipio": municipio}
            for alimentador, municipio in filtros_repository.listar_alimentadores(db)
        ],
        "metadados": metadados_gold(db, "dim_uc", "Dados fictícios do seed, com os nomes como estão na Gold."),
    }
