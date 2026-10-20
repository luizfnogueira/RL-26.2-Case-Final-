from datetime import date, datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StatusOrdem(str, Enum):
    ABERTA = "ABERTA"
    EM_CAMPO = "EM_CAMPO"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"

    @classmethod
    def _missing_(cls, value: Any) -> Optional["StatusOrdem"]:
        if isinstance(value, str):
            normalized = (
                value.strip()
                .upper()
                .replace(" ", "_")
                .replace("Í", "I")
                .replace("Ú", "U")
            )
            for member in cls:
                if member.value == normalized:
                    return member
        return None


STATUS_ATIVOS: set[StatusOrdem] = {StatusOrdem.ABERTA, StatusOrdem.EM_CAMPO}
STATUS_FINAIS: set[StatusOrdem] = {StatusOrdem.CONCLUIDA, StatusOrdem.CANCELADA}


class ResultadoInspecao(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    irregularidade_detectada: bool = Field(..., alias="irregularidade")
    tipo_irregularidade: Optional[str] = None
    kwh_recuperado: float = Field(0.0, ge=0.0)
    observacoes: str
    data_inspecao: Optional[datetime] = None
    inspetor: Optional[str] = None

    @field_validator("observacoes")
    @classmethod
    def validar_observacoes(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("As observações de campo são obrigatórias e não podem ser vazias.")
        return v.strip()

    @field_validator("tipo_irregularidade")
    @classmethod
    def normalizar_tipo(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_limpo = v.strip().upper()
            return v_limpo if v_limpo else None
        return None

    @model_validator(mode="after")
    def validar_consistencia_resultado(self) -> "ResultadoInspecao":
        if self.irregularidade_detectada:
            if not self.tipo_irregularidade:
                raise ValueError(
                    "O tipo de irregularidade é obrigatório quando há irregularidade confirmada."
                )
            if self.kwh_recuperado is None or self.kwh_recuperado < 0:
                raise ValueError(
                    "O valor de kWh recuperado deve ser informado e ser maior ou igual a zero."
                )
        else:
            if self.kwh_recuperado and self.kwh_recuperado > 0:
                raise ValueError(
                    "O kWh recuperado deve ser 0 quando o resultado for 'SEM IRREGULARIDADE'."
                )
            if self.tipo_irregularidade:
                raise ValueError(
                    "Tipo de irregularidade não deve ser preenchido quando não houver irregularidade detectada."
                )
            self.tipo_irregularidade = None
            self.kwh_recuperado = 0.0
        return self


class OrdemInspecaoCreate(BaseModel):
    id_uc: str = Field(..., min_length=1)
    equipe_responsavel: str = Field(..., min_length=1)
    data_prevista: Optional[date] = None
    motivo: Optional[str] = None
    kwh_estimado: Optional[float] = Field(None, ge=0.0)
    observacoes: Optional[str] = None

    @field_validator("id_uc", "equipe_responsavel")
    @classmethod
    def validar_campos_obrigatorios(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Campo obrigatório não pode ser vazio.")
        return v.strip()


class OrdemInspecaoAvancarCampo(BaseModel):
    equipe_responsavel: Optional[str] = None
    data_inicio_campo: Optional[datetime] = None
    observacoes: Optional[str] = None

    @field_validator("equipe_responsavel")
    @classmethod
    def limpar_equipe(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_limpo = v.strip()
            return v_limpo if v_limpo else None
        return None


class OrdemInspecaoCancelar(BaseModel):
    justificativa: str = Field(..., min_length=1)
    usuario: Optional[str] = None

    @field_validator("justificativa")
    @classmethod
    def validar_justificativa(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("A justificativa de cancelamento é obrigatória e não pode ser vazia.")
        return v.strip()


class HistoricoOrdem(BaseModel):
    id_historico: Optional[int] = None
    id_ordem: int
    status_anterior: Optional[StatusOrdem] = None
    status_novo: StatusOrdem
    data_mudanca: datetime
    usuario: Optional[str] = None
    justificativa_ou_motivo: Optional[str] = None
    detalhes: Optional[dict[str, Any]] = None


class OrdemInspecaoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id_ordem: int
    id_uc: str
    status: StatusOrdem
    equipe_responsavel: str
    data_criacao: datetime
    data_prevista: Optional[date] = None
    data_inicio_campo: Optional[datetime] = None
    data_conclusao: Optional[datetime] = None
    data_cancelamento: Optional[datetime] = None
    justificativa_cancelamento: Optional[str] = None
    motivo: Optional[str] = None
    kwh_estimado: Optional[float] = None
    observacoes: Optional[str] = None
    resultado: Optional[ResultadoInspecao] = None
    historico: list[HistoricoOrdem] = Field(default_factory=list)
