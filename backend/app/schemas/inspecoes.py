"""Adaptadores de transporte da API V2 sobre o modelo de ordens do Gabriel (schemas/inspecao.py)."""
from datetime import date
from typing import Annotated, Any, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from app.schemas.common import (
    Contexto, FiltrosRegiao, Indicador, Metadados, Pagina, Paginacao, Periodo, Schema, Texto,
)
from app.schemas.inspecao import ResultadoInspecao

StatusOrdem = Literal['ABERTA', 'EM_CAMPO', 'CONCLUIDA', 'CANCELADA']
TextoLongo = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class FiltrosCandidatos(Contexto):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    sem_ordem_ativa: bool = False


AcaoRecomendada = Literal['INSPECAO_PRIORITARIA', 'VALIDACAO_DOCUMENTAL']


class Candidato(Schema):
    id_uc: str
    municipio: str
    bairro: str
    classe: str
    alimentador: str
    posicao: int = Field(ge=1)
    motivos: list[str]
    acao_recomendada: AcaoRecomendada
    energia_estimada: Indicador
    score: float = Field(ge=0, le=100)
    confianca_evidencia: Literal['ALTA', 'MEDIA', 'BAIXA', 'INDETERMINADA']
    ordem_ativa: bool
    id_ordem_ativa: int | None


class ResumoCandidatos(Schema):
    ucs_analisadas: Indicador
    ucs_priorizadas: Indicador
    potencial_recuperacao: Indicador
    ordens_ativas: Indicador


class Candidatos(Pagina[Candidato]):
    page_size: int = Field(default=50, ge=1, le=200)
    periodo_referencia: Periodo
    resumo: ResumoCandidatos
    metadados: Metadados


class FiltrosInspecoes(FiltrosRegiao, Paginacao):
    id_uc: Texto | None = None
    status: StatusOrdem | None = None
    periodo_atual: Periodo | None = None


class FiltrosIndicadoresOrdens(FiltrosRegiao):
    # Janela pela data de conclusão; sem ela, todas as ordens concluídas
    periodo_conclusao: Periodo | None = None


class AcertoPorMotivo(Schema):
    motivo: str
    concluidas: int
    com_irregularidade: int
    taxa_acerto_pct: float


class IndicadoresOrdens(Schema):
    concluidas: int
    com_irregularidade: int
    taxa_acerto_pct: float | None
    # Comparação de kWh por mês, só com as ordens que têm estimativa da fila
    ordens_comparadas: int
    kwh_mes_campo: float
    kwh_mes_fila: float
    por_motivo: list[AcertoPorMotivo]
    metadados: Metadados


class Resultado(Schema):
    irregularidade_detectada: bool
    tipo_irregularidade: Texto | None = None
    kwh_recuperado: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    observacoes: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    data_inspecao: AwareDatetime | None = None
    inspetor: Texto | None = None

    @model_validator(mode='after')
    def validar_resultado(self):
        # Reaproveita as regras de consistência do modelo do Gabriel; erro vira 422.
        ResultadoInspecao(**self.model_dump())
        return self


class Historico(Schema):
    id_historico: int
    id_ordem: int
    status_anterior: StatusOrdem | None
    status_novo: StatusOrdem
    data_mudanca: AwareDatetime
    usuario: str | None
    justificativa_ou_motivo: str | None
    detalhes: dict[str, Any] | None


class Ordem(Schema):
    id_ordem: int = Field(ge=1)
    id_uc: str
    status: StatusOrdem
    equipe_responsavel: str
    data_criacao: AwareDatetime
    data_prevista: date | None
    data_inicio_campo: AwareDatetime | None
    data_conclusao: AwareDatetime | None
    data_cancelamento: AwareDatetime | None
    justificativa_cancelamento: str | None
    motivo: str | None
    kwh_estimado: float | None
    observacoes: str | None
    resultado: Resultado | None
    historico: list[Historico]


class ContagemStatus(Schema):
    ABERTA: int
    EM_CAMPO: int
    CONCLUIDA: int
    CANCELADA: int


class Ordens(Pagina[Ordem]):
    contagem_status: ContagemStatus
    metadados: Metadados


class CriarInspecao(Schema):
    id_uc: Texto
    equipe_responsavel: Texto
    data_prevista: date | None = None
    motivo: TextoLongo | None = None
    kwh_estimado: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    observacoes: TextoLongo | None = None


MAX_ORDENS_LOTE = 200


class CriarInspecoesLote(Schema):
    ordens: list[CriarInspecao] = Field(min_length=1, max_length=MAX_ORDENS_LOTE)


class OrdensCriadas(Schema):
    items: list[Ordem]
    total: int


class AtualizarInspecao(Schema):
    status: StatusOrdem
    equipe_responsavel: Texto | None = None
    observacoes: TextoLongo | None = None
    resultado: Resultado | None = None
    justificativa: TextoLongo | None = None

    @model_validator(mode='after')
    def validar_campos(self):
        # Ausência de resultado/justificativa é regra de negócio (400); aqui só combinações (422).
        if self.status != 'EM_CAMPO' and (self.equipe_responsavel is not None or self.observacoes is not None):
            raise ValueError('equipe_responsavel e observacoes só são aceitos ao iniciar campo')
        if self.status != 'CONCLUIDA' and self.resultado is not None:
            raise ValueError('resultado só é aceito na conclusão')
        if self.status != 'CANCELADA' and self.justificativa is not None:
            raise ValueError('justificativa só é aceita no cancelamento')
        return self
