from app.schemas.common import Metadados, Schema


class OpcaoBairro(Schema):
    municipio: str
    bairro: str


class OpcaoAlimentador(Schema):
    alimentador: str
    municipio: str


class OpcoesFiltros(Schema):
    """Valores aceitos nos filtros de região, exatamente como estão na Gold (ex.: RECIFE, BOA VISTA)."""
    municipios: list[str]
    bairros: list[OpcaoBairro]
    classes: list[str]
    alimentadores: list[OpcaoAlimentador]
    metadados: Metadados
