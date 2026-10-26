from app.schemas.common import Erro
from app.services.stubs import PERIODO_ATUAL, PERIODO_COMPARACAO, exemplo

STUB = (
    'Stub do P1 (contrato V2): dados fictícios, sem banco ou IA. '
    f'Cenários simulados: periodo_atual={PERIODO_ATUAL} e periodo_comparacao={PERIODO_COMPARACAO}; '
    'outros intervalos válidos retornam 422 CENARIO_STUB_INDISPONIVEL. '
    'Escritas em rotas de exemplo não persistem; GET/POST/PATCH /inspecoes usam o schema portal.'
)

ERROS = {
    'TRANSICAO_INVALIDA': 400,
    'JUSTIFICATIVA_OBRIGATORIA': 400,
    'RESULTADO_INCOMPLETO': 400,
    'UC_INEXISTENTE': 404,
    'ORDEM_NAO_ENCONTRADA': 404,
    'ORDEM_ATIVA_EXISTENTE': 409,
    'DADOS_INVALIDOS': 422,
    'CENARIO_STUB_INDISPONIVEL': 422,
    'DECOMPOSICAO_INDISPONIVEL': 422,
    'ERRO_INTERNO': 500,
    'AGENTE_INDISPONIVEL': 503,
}


def respostas(nome: str, status: int = 200, erros: tuple[str, ...] = ()) -> dict:
    respostas = {
        status: {'description': 'Exemplo simulado do contrato V2',
                 'content': {'application/json': {'example': exemplo(nome)}}}
    }
    for codigo in (*erros, 'DADOS_INVALIDOS', 'ERRO_INTERNO'):
        http = ERROS[codigo]
        exemplos = respostas.setdefault(http, {'model': Erro, 'description': 'Erro {codigo, mensagem}',
                                               'content': {'application/json': {'examples': {}}}})
        exemplos['content']['application/json']['examples'][codigo] = {
            'value': {'codigo': codigo, 'mensagem': 'Não foi possível concluir a requisição.'}}
    return respostas
