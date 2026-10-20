import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)

HTTP_ERRORS = {
    400: ("REQUISICAO_INVALIDA", "A requisição é inválida."),
    401: ("NAO_AUTENTICADO", "É necessário se autenticar."),
    403: ("ACESSO_NEGADO", "Você não tem permissão para esta operação."),
    404: ("RECURSO_NAO_ENCONTRADO", "O recurso solicitado não foi encontrado."),
    405: ("METODO_NAO_PERMITIDO", "O método HTTP não é permitido nesta rota."),
    409: ("CONFLITO", "A operação conflita com o estado atual do recurso."),
}


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    codigo, mensagem = HTTP_ERRORS.get(
        exc.status_code,
        (f"HTTP_{exc.status_code}", "Não foi possível concluir a requisição."),
    )
    if isinstance(exc.detail, dict):
        if isinstance(exc.detail.get("codigo"), str):
            codigo = exc.detail["codigo"]
        if isinstance(exc.detail.get("mensagem"), str):
            mensagem = exc.detail["mensagem"]
    elif isinstance(exc.detail, str) and (exc.status_code, exc.detail) not in (
        (404, "Not Found"),
        (405, "Method Not Allowed"),
    ):
        mensagem = exc.detail
    return JSONResponse(
        status_code=exc.status_code,
        content={"codigo": codigo, "mensagem": mensagem},
        headers=exc.headers,
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "codigo": "DADOS_INVALIDOS",
            "mensagem": "Os dados enviados são inválidos. Confira os campos e tente novamente.",
        },
    )


async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Erro inesperado em %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={
            "codigo": "ERRO_INTERNO",
            "mensagem": "Ocorreu um erro interno. Tente novamente mais tarde.",
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, internal_error_handler)
