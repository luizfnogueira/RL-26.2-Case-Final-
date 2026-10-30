"""Contrato provisório de AUTH-b, seguindo o fluxo do cronograma."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator, model_validator


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


class EntradaAuth(BaseModel):
    # Não herdar Schema: str_strip_whitespace alteraria a senha digitada.
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)

    email: Annotated[EmailStr, Field(max_length=254)]

    @field_validator('email', mode='before')
    @classmethod
    def normalizar_email(cls, valor):
        return valor.strip().lower() if isinstance(valor, str) else valor


class CadastroAuth(EntradaAuth):
    nome: Annotated[str, Field(min_length=2, max_length=120)]
    senha: Annotated[SecretStr, Field(min_length=8, max_length=128)]

    @field_validator('nome', mode='before')
    @classmethod
    def limpar_nome(cls, valor):
        return valor.strip() if isinstance(valor, str) else valor


class LoginAuth(EntradaAuth):
    senha: Annotated[SecretStr, Field(min_length=1, max_length=128)]


class UsuarioPublico(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra='forbid')

    id: str
    nome: str
    email: str
    perfil: Literal['usuario', 'administrador']


class SessaoAuth(BaseModel):
    access_token: str
    token_type: Literal['bearer'] = 'bearer'
    usuario: UsuarioPublico
