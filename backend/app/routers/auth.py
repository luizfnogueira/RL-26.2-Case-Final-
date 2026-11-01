from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.usuario import Usuario
from app.schemas.auth import AtualizacaoPerfil, CadastroAuth, LoginAuth, SessaoAuth, UsuarioPublico
from app.schemas.common import Erro
from app.services import auth_service

class RotaAuth(APIRoute):
    """Indica campos inválidos sem expor senhas, convites ou entradas do usuário."""

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def validar(request: Request):
            try:
                return await handler(request)
            except RequestValidationError as erro:
                campos = {item['loc'][1] for item in erro.errors()
                          if len(item['loc']) > 1 and item['loc'][0] == 'body'}
                if 'email' in campos:
                    mensagem = ('Informe um e-mail válido. Domínios reservados, como .test, '
                                'não são aceitos. Confira também os demais campos.')
                else:
                    rotulos = {'nome': 'nome', 'senha': 'senha', 'convite': 'código de convite',
                               'cargo': 'cargo ou área (até 80 caracteres)'}
                    invalidos = [rotulo for campo, rotulo in rotulos.items() if campo in campos]
                    mensagem = ('Confira os campos: ' + ', '.join(invalidos) + '.' if invalidos
                                else 'Os dados enviados são inválidos. Confira os campos e tente novamente.')
                return JSONResponse(status_code=422,
                                    content={'codigo': 'DADOS_INVALIDOS', 'mensagem': mensagem},
                                    headers={'Cache-Control': 'no-store', 'Pragma': 'no-cache'})

        return validar


router = APIRouter(prefix='/auth', tags=['Autenticação'], route_class=RotaAuth)
ERROS = {
    401: {'model': Erro, 'description': 'Credenciais inválidas ou sessão inválida/expirada.'},
    403: {'model': Erro, 'description': 'Código de convite inválido.'},
    409: {'model': Erro, 'description': 'E-mail já cadastrado.'},
    422: {'model': Erro, 'description': 'DADOS_INVALIDOS: campos inválidos ou extras.'},
    503: {'model': Erro, 'description': 'Configuração de autenticação/cadastro indisponível.'},
}


def sem_cache(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Pragma'] = 'no-cache'


@router.post('/register', status_code=201, response_model=UsuarioPublico,
             summary='Criar conta', dependencies=[Depends(sem_cache)],
             responses={s: ERROS[s] for s in (403, 409, 422, 503)})
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


@router.patch('/me', response_model=UsuarioPublico, summary='Atualizar cargo ou área da própria conta',
              dependencies=[Depends(sem_cache)], responses={s: ERROS[s] for s in (401, 422, 503)})
def atualizar_me(entrada: AtualizacaoPerfil, usuario: Annotated[Usuario, Depends(get_current_user)],
                 db: Annotated[Session, Depends(get_db)]):
    return auth_service.atualizar_perfil(db, usuario, entrada)
