from app.schemas.common import Erro
from app.services.stubs import exemplo

STUB = (
    'Stub do P1: dados fictícios, sem banco ou IA. '
    'Os indicadores e datas são fixos nos exemplos de agosto/setembro de 2026. '
    'Parâmetros são validados, mas não há cálculo real. '
    'POST/PATCH não persistem: chamadas posteriores de GET não mudam.'
)


def respostas(nome: str, status: int = 200, erros: tuple[int, ...] = (422, 500)) -> dict:
    codigos = {404: 'RECURSO_NAO_ENCONTRADO', 409: 'CONFLITO',
               422: 'DADOS_INVALIDOS', 500: 'ERRO_INTERNO', 503: 'DADOS_INDISPONIVEIS'}
    respostas = {
        status: {'description': 'Exemplo simulado do contrato P1',
                 'content': {'application/json': {'example': exemplo(nome)}}}
    }
    for erro in erros:
        respostas[erro] = {'model': Erro, 'description': codigos[erro],
                          'content': {'application/json': {'example': {
                              'codigo': codigos[erro], 'mensagem': 'Não foi possível concluir a requisição.'}}}}
    return respostas
