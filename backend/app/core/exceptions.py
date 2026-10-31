from typing import Any, Optional


class AppException(Exception):
    status_code: int = 400
    codigo: str = "ERRO_APLICACAO"
    mensagem: str = "Ocorreu um erro na aplicação."

    def __init__(
        self,
        mensagem: Optional[str] = None,
        codigo: Optional[str] = None,
        status_code: Optional[int] = None,
        detalhes: Optional[dict[str, Any]] = None,
    ):
        if mensagem:
            self.mensagem = mensagem
        if codigo:
            self.codigo = codigo
        if status_code:
            self.status_code = status_code
        self.detalhes = detalhes or {}
        super().__init__(self.mensagem)

    def to_dict(self) -> dict[str, Any]:
        resp: dict[str, Any] = {
            "codigo": self.codigo,
            "mensagem": self.mensagem,
        }
        if self.detalhes:
            resp["detalhes"] = self.detalhes
        return resp


class LoteRejeitadoException(AppException):
    status_code = 422
    codigo = "LOTE_REJEITADO"
    mensagem = "Nenhuma ordem do lote foi criada: corrija as UCs listadas em detalhes.falhas."


class UCInexistenteException(AppException):
    status_code = 404
    codigo = "UC_INEXISTENTE"
    mensagem = "Unidade Consumidora não encontrada no cadastro."


class OrdemAtivaExistenteException(AppException):
    status_code = 409
    codigo = "ORDEM_ATIVA_EXISTENTE"
    mensagem = "A Unidade Consumidora já possui uma ordem de inspeção ativa."


class OrdemNaoEncontradaException(AppException):
    status_code = 404
    codigo = "ORDEM_NAO_ENCONTRADA"
    mensagem = "Ordem de inspeção não encontrada."


class TransicaoInvalidaException(AppException):
    status_code = 400
    codigo = "TRANSICAO_INVALIDA"
    mensagem = "Transição de status inválida para a ordem de inspeção."


class JustificativaObrigatoriaException(AppException):
    status_code = 400
    codigo = "JUSTIFICATIVA_OBRIGATORIA"
    mensagem = "Justificativa é obrigatória para o cancelamento da ordem de inspeção."


class ResultadoIncompletoException(AppException):
    status_code = 400
    codigo = "RESULTADO_INCOMPLETO"
    mensagem = "Resultado de campo incompleto ou inconsistente."


class CenarioStubIndisponivelException(AppException):
    status_code = 422
    codigo = "CENARIO_STUB_INDISPONIVEL"
    mensagem = "Consulta válida, mas fora dos cenários simulados pelo stub."


class AgenteIndisponivelException(AppException):
    """O agente de IA não respondeu a tempo, caiu ou devolveu uma resposta fora do contrato."""
    status_code = 503
    codigo = "AGENTE_INDISPONIVEL"
    mensagem = "O assistente está indisponível no momento. Tente novamente em alguns instantes."


class GoldNaoCarregadaException(AppException):
    """A Gold não está carregada no banco (gold.dim_mes vazia): não há como montar a janela de meses."""
    status_code = 503
    codigo = "GOLD_NAO_CARREGADA"
    mensagem = ("Os dados da Gold ainda não foram carregados no banco. "
                "Tente novamente depois da próxima carga.")
