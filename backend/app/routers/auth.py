from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import CadastroAuth, LoginAuth, SessaoAuth, UsuarioPublico
from app.schemas.common import Erro
from app.services import auth_service

router = APIRouter(prefix='/auth', tags=['Autenticação (fluxo provisório)'])
ERROS = {
    401: {'model': Erro, 'description': 'Credenciais inválidas ou sessão inválida/expirada.'},
    409: {'model': Erro, 'description': 'E-mail já cadastrado.'},
    422: {'model': Erro, 'description': 'DADOS_INVALIDOS: campos inválidos ou extras.'},
    503: {'model': Erro, 'description': 'Configuração de autenticação/cadastro indisponível.'},
}


def sem_cache(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Pragma'] = 'no-cache'


@router.post('/register', status_code=201, response_model=UsuarioPublico,
             summary='Criar conta', dependencies=[Depends(sem_cache)],
             responses={s: ERROS[s] for s in (409, 422, 503)})
def registrar(entrada: CadastroAuth, db: Annotated[Session, Depends(get_db)]):
    return auth_service.cadastrar(db, entrada)


@router.post('/login', response_model=SessaoAuth, summary='Entrar com e-mail e senha',
             dependencies=[Depends(sem_cache)], responses={s: ERROS[s] for s in (401, 422, 503)})
def login(entrada: LoginAuth, db: Annotated[Session, Depends(get_db)]):
    return auth_service.entrar(db, entrada)


@router.get('/me', response_model=UsuarioPublico, summary='Consultar a sessão atual',
            dependencies=[Depends(sem_cache)], responses={s: ERROS[s] for s in (401, 503)})
def me(usuario: Annotated[Usuario, Depends(get_current_user)]):
    return UsuarioPublico.model_validate(usuario)
