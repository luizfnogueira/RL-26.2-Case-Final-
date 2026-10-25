import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.gold_source import FilaPerdas, FilaPerdasAuditoria, UnidadeConsumidora
from app.core.config import GOLD_SOURCE
from app.models.portal import OrdemInspecao
from app.schemas.inspecao import STATUS_ATIVOS

STATUS_ELEGIVEL = "ELEGIVEL"


@dataclass(frozen=True)
class CandidatoFila:
    id_uc: str
    municipio: str
    bairro: str
    classe: str
    alimentador: str
    posicao: int
    motivos: list[str]
    kwh_estimado: Decimal
    score: Decimal
    confianca_evidencia: str
    id_ordem_ativa: Optional[int]


@dataclass(frozen=True)
class ResumoFila:
    ucs_analisadas: int
    ucs_priorizadas: int
    potencial_recuperacao: Decimal
    ordens_ativas: int


class CandidatoRepositoryInterface(Protocol):
    def consultar(
        self,
        *,
        municipio: Optional[str] = None,
        bairro: Optional[str] = None,
        classe: Optional[str] = None,
        alimentador: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[CandidatoFila], int, ResumoFila]:
        ...


def _condicoes_regiao(
    municipio: Optional[str],
    bairro: Optional[str],
    classe: Optional[str],
    alimentador: Optional[str],
) -> list:
    """Filtros geográficos por AND, sem diferenciar maiúsculas/minúsculas.

    O seed usa os domínios das Silvers (RECIFE, RESIDENCIAL), enquanto o contrato
    exemplifica rótulos de tela (Recife, Residencial). A API aceita os dois.
    """
    condicoes = []
    for campo, valor in (
        ("municipio", municipio),
        ("bairro", bairro),
        ("classe", classe),
        ("alimentador", alimentador),
    ):
        if valor is not None:
            condicoes.append(
                func.lower(getattr(UnidadeConsumidora, campo)) == valor.strip().lower()
            )
    return condicoes


def _ordem_fila() -> list:
    if GOLD_SOURCE == 'real':
        return [FilaPerdas.posicao_fila.asc()]
    return [
        FilaPerdas.score.desc(),
        FilaPerdas.kwh_estimado.desc(),
        FilaPerdas.id_uc.asc(),
    ]


def _motivos(motivos_json: str | None) -> list[str]:
    """A Gold grava `motivos_json` como texto JSON (F.to_json no notebook)."""
    if not motivos_json:
        return []
    try:
        decodificado = json.loads(motivos_json)
    except (TypeError, ValueError):
        return []
    return [str(motivo) for motivo in decodificado] if isinstance(decodificado, list) else []


def _subconsulta_ordens_ativas():
    return (
        select(OrdemInspecao.id_uc, OrdemInspecao.id_ordem)
        .where(OrdemInspecao.status.in_([status.value for status in STATUS_ATIVOS]))
        .subquery()
    )


class SqlAlchemyCandidatoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def metadados(self):
        if GOLD_SOURCE != 'real':
            return None
        from sqlalchemy import text
        value = self.db.execute(text("SELECT metadata_json FROM gold._carga_metadata WHERE tabela='tb_fila_perdas'")).scalar_one()
        return json.loads(value)['manifest']

    def consultar(
        self,
        *,
        municipio: Optional[str] = None,
        bairro: Optional[str] = None,
        classe: Optional[str] = None,
        alimentador: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[CandidatoFila], int, ResumoFila]:
        regiao = _condicoes_regiao(municipio, bairro, classe, alimentador)
        elegivel = FilaPerdas.status_triagem == STATUS_ELEGIVEL
        if GOLD_SOURCE == 'real':
            # A rota existente gera ordens; validacao documental fica na auditoria.
            elegivel = elegivel & (FilaPerdas.acao_recomendada == 'INSPECAO_PRIORITARIA')
        ativas = _subconsulta_ordens_ativas()

        # A posição é global dentro do resultado filtrado, antes da paginação.
        posicao = func.row_number().over(order_by=_ordem_fila()).label("posicao")
        fila = (
            select(
                FilaPerdas.id_uc,
                UnidadeConsumidora.municipio,
                UnidadeConsumidora.bairro,
                UnidadeConsumidora.classe,
                UnidadeConsumidora.alimentador,
                posicao,
                FilaPerdas.motivos_json,
                FilaPerdas.kwh_estimado,
                FilaPerdas.score,
                FilaPerdas.confianca_evidencia,
                ativas.c.id_ordem.label("id_ordem_ativa"),
            )
            .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == FilaPerdas.id_uc)
            .outerjoin(ativas, ativas.c.id_uc == FilaPerdas.id_uc)
            .where(elegivel, *regiao)
            .subquery("fila_filtrada")
        )

        linhas = self.db.execute(
            select(fila)
            .order_by(fila.c.posicao)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        itens = [
            CandidatoFila(
                id_uc=linha.id_uc,
                municipio=linha.municipio,
                bairro=linha.bairro,
                classe=linha.classe,
                alimentador=linha.alimentador,
                posicao=linha.posicao,
                motivos=_motivos(linha.motivos_json),
                kwh_estimado=linha.kwh_estimado,
                score=linha.score,
                confianca_evidencia=linha.confianca_evidencia,
                id_ordem_ativa=linha.id_ordem_ativa,
            )
            for linha in linhas
        ]

        total = int(self.db.scalar(
            select(func.count(FilaPerdas.id_uc))
            .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == FilaPerdas.id_uc)
            .where(elegivel, *regiao)
        ) or 0)

        analisadas = int(self.db.scalar(
            select(func.count(func.distinct(FilaPerdasAuditoria.id_uc)))
            .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == FilaPerdasAuditoria.id_uc)
            .where(*regiao)
        ) or 0)

        priorizadas, potencial = self.db.execute(
            select(
                func.count(FilaPerdas.id_uc),
                func.coalesce(func.sum(FilaPerdas.kwh_estimado), 0),
            )
            .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == FilaPerdas.id_uc)
            .where(elegivel, *regiao)
        ).one()

        ordens_ativas = int(self.db.scalar(
            select(func.count(OrdemInspecao.id_ordem))
            .select_from(FilaPerdas)
            .join(UnidadeConsumidora, UnidadeConsumidora.id_uc == FilaPerdas.id_uc)
            .join(
                OrdemInspecao,
                (OrdemInspecao.id_uc == FilaPerdas.id_uc)
                & OrdemInspecao.status.in_([status.value for status in STATUS_ATIVOS]),
            )
            .where(elegivel, *regiao)
        ) or 0)

        return itens, total, ResumoFila(
            ucs_analisadas=analisadas,
            ucs_priorizadas=int(priorizadas),
            potencial_recuperacao=potencial,
            ordens_ativas=ordens_ativas,
        )
