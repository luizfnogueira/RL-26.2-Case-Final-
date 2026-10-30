from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.usuario import Usuario


class EmailJaCadastradoError(ValueError):
    pass


def por_email(db: Session, email: str) -> Usuario | None:
    return db.scalar(select(Usuario).where(Usuario.email == email))


def por_id(db: Session, id_usuario: str) -> Usuario | None:
    return db.get(Usuario, id_usuario)


def criar(db: Session, *, nome: str, email: str, senha_hash: str, perfil: str = 'usuario') -> Usuario:
    usuario = Usuario(nome=nome, email=email, senha_hash=senha_hash, perfil=perfil)
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # A restrição única resolve também cadastros concorrentes, sem depender
        # apenas de uma consulta antes do INSERT. Outros erros continuam sendo erros.
        if por_email(db, email) is not None:
            raise EmailJaCadastradoError() from None
        raise
    db.refresh(usuario)
    return usuario
