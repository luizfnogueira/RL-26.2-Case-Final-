import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core import auth_config
from app.core.security import criar_token, gerar_hash_senha, verificar_senha
from app.repositories import auth_repository as repo
from app.schemas.auth import CadastroAuth, LoginAuth, SessaoAuth, UsuarioPublico

# Usuário inexistente também percorre a verificação Argon2; não há senha de conta padrão.
_HASH_INEXISTENTE = gerar_hash_senha(secrets.token_urlsafe(32))


def exigir_configuracao():
    if not auth_config.JWT_SECRET:
        raise HTTPException(503, detail={
            'codigo': 'AUTH_INDISPONIVEL', 'mensagem': 'O acesso está indisponível no momento.'})


def cadastrar(db: Session, entrada: CadastroAuth) -> UsuarioPublico:
    exigir_configuracao()
    try:
        usuario = repo.criar(db, nome=entrada.nome, email=str(entrada.email),
                             senha_hash=gerar_hash_senha(entrada.senha.get_secret_value()))
    except repo.EmailJaCadastradoError:
        raise HTTPException(409, detail={
            'codigo': 'EMAIL_JA_CADASTRADO', 'mensagem': 'Já existe um acesso com este e-mail.'}) from None
    return UsuarioPublico.model_validate(usuario)


def entrar(db: Session, entrada: LoginAuth) -> SessaoAuth:
    exigir_configuracao()
    usuario = repo.por_email(db, str(entrada.email))
    senha_valida = verificar_senha(entrada.senha.get_secret_value(),
                                   usuario.senha_hash if usuario else _HASH_INEXISTENTE)
    if not senha_valida or usuario is None or not usuario.ativo:
        raise HTTPException(401, detail={
            'codigo': 'CREDENCIAIS_INVALIDAS', 'mensagem': 'E-mail ou senha inválidos.'},
            headers={'WWW-Authenticate': 'Bearer'})
    return SessaoAuth(
        access_token=criar_token(usuario.id, usuario.perfil, segredo=auth_config.JWT_SECRET),
        usuario=UsuarioPublico.model_validate(usuario))
