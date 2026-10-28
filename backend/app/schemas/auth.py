"""Claims internos do JWT previstos no cronograma; não define corpos de /auth."""
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ClaimsToken(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, hide_input_in_errors=True)

    sub: Annotated[str, Field(min_length=1)]
    perfil: Annotated[str, Field(min_length=1)]
    iat: Annotated[int, Field(ge=0)]
    exp: Annotated[int, Field(ge=0)]

    @model_validator(mode='after')
    def validar_claims(self):
        if not self.sub.strip() or not self.perfil.strip():
            raise ValueError('Identidade e perfil devem estar preenchidos.')
        if self.exp <= self.iat:
            raise ValueError('A expiração deve ser posterior à emissão.')
        return self
