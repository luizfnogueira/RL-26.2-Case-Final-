from datetime import datetime, timezone
from typing import Any, Optional, Union
from pydantic import ValidationError

from app.core.exceptions import (
    AppException,
    JustificativaObrigatoriaException,
    OrdemAtivaExistenteException,
    OrdemNaoEncontradaException,
    ResultadoIncompletoException,
    TransicaoInvalidaException,
    UCInexistenteException,
)
from app.repositories.inspecao_repository import (
    MemoriaOrdemInspecaoRepository,
    OrdemInspecaoRepositoryInterface,
)
from app.schemas.inspecao import (
    STATUS_ATIVOS,
    HistoricoOrdem,
    OrdemInspecaoAvancarCampo,
    OrdemInspecaoCancelar,
    OrdemInspecaoCreate,
    OrdemInspecaoResponse,
    ResultadoInspecao,
    StatusOrdem,
)


class OrdemInspecaoService:
    def __init__(
        self,
        repository: Optional[OrdemInspecaoRepositoryInterface] = None,
    ) -> None:
        self.repository: OrdemInspecaoRepositoryInterface = (
            repository if repository is not None else MemoriaOrdemInspecaoRepository()
        )

    def criar_ordem(
        self,
        dados: Union[OrdemInspecaoCreate, dict[str, Any]],
        usuario: Optional[str] = None,
    ) -> OrdemInspecaoResponse:
        if isinstance(dados, dict):
            try:
                dados = OrdemInspecaoCreate(**dados)
            except ValidationError as e:
                raise AppException(
                    "Dados inválidos para criação da ordem.",
                    codigo="DADOS_INVALIDOS",
                    status_code=422,
                ) from e

        id_uc = dados.id_uc.strip()

        if not self.repository.existe_uc(id_uc):
            raise UCInexistenteException(
                f"Unidade Consumidora '{id_uc}' não encontrada no cadastro."
            )

        ordem_ativa = self.repository.obter_ativa_por_uc(id_uc)
        if ordem_ativa is not None:
            raise OrdemAtivaExistenteException(
                f"A Unidade Consumidora '{id_uc}' já possui a ordem ativa #{ordem_ativa.id_ordem} "
                f"com status '{ordem_ativa.status.value}'."
            )

        agora = datetime.now(timezone.utc)

        nova_ordem = OrdemInspecaoResponse(
            id_ordem=0,
            id_uc=id_uc,
            status=StatusOrdem.ABERTA,
            equipe_responsavel=dados.equipe_responsavel.strip(),
            data_criacao=agora,
            data_prevista=dados.data_prevista,
            motivo=dados.motivo.strip() if dados.motivo else None,
            kwh_estimado=dados.kwh_estimado,
            observacoes=dados.observacoes.strip() if dados.observacoes else None,
            resultado=None,
            historico=[],
        )

        evento_historico = HistoricoOrdem(
            id_ordem=0,
            status_anterior=None,
            status_novo=StatusOrdem.ABERTA,
            data_mudanca=agora,
            usuario=usuario,
            justificativa_ou_motivo=dados.motivo or "Criação da ordem de inspeção",
            detalhes={"equipe": dados.equipe_responsavel, "data_prevista": str(dados.data_prevista)},
        )

        return self.repository.salvar(nova_ordem, evento_historico=evento_historico)

    def avancar_para_campo(
        self,
        id_ordem: int,
        dados: Optional[Union[OrdemInspecaoAvancarCampo, dict[str, Any]]] = None,
        usuario: Optional[str] = None,
    ) -> OrdemInspecaoResponse:
        ordem = self.repository.obter_por_id(id_ordem)
        if not ordem:
            raise OrdemNaoEncontradaException(
                f"Ordem de inspeção #{id_ordem} não encontrada."
            )

        if ordem.status != StatusOrdem.ABERTA:
            raise TransicaoInvalidaException(
                f"Transição inválida: a ordem #{id_ordem} está '{ordem.status.value}'. "
                f"Apenas ordens no status 'ABERTA' podem avançar para 'EM_CAMPO'."
            )

        if isinstance(dados, dict):
            dados = OrdemInspecaoAvancarCampo(**dados)

        agora = datetime.now(timezone.utc)
        data_inicio = (
            dados.data_inicio_campo
            if dados and dados.data_inicio_campo
            else agora
        )

        status_anterior = ordem.status
        ordem.status = StatusOrdem.EM_CAMPO
        ordem.data_inicio_campo = data_inicio

        if dados and dados.equipe_responsavel:
            ordem.equipe_responsavel = dados.equipe_responsavel

        if dados and dados.observacoes:
            ordem.observacoes = (
                f"{ordem.observacoes}\n[Despacho] {dados.observacoes}".strip()
                if ordem.observacoes
                else dados.observacoes
            )

        evento_historico = HistoricoOrdem(
            id_ordem=ordem.id_ordem,
            status_anterior=status_anterior,
            status_novo=StatusOrdem.EM_CAMPO,
            data_mudanca=agora,
            usuario=usuario,
            justificativa_ou_motivo="Ordem despachada para execução em campo.",
            detalhes={"equipe": ordem.equipe_responsavel, "inicio_campo": str(data_inicio)},
        )

        return self.repository.salvar(ordem, evento_historico=evento_historico)

    def concluir_ordem(
        self,
        id_ordem: int,
        resultado: Union[ResultadoInspecao, dict[str, Any]],
        usuario: Optional[str] = None,
    ) -> OrdemInspecaoResponse:
        ordem = self.repository.obter_por_id(id_ordem)
        if not ordem:
            raise OrdemNaoEncontradaException(
                f"Ordem de inspeção #{id_ordem} não encontrada."
            )

        if ordem.status == StatusOrdem.ABERTA:
            raise TransicaoInvalidaException(
                f"Transição inválida: a ordem #{id_ordem} está 'ABERTA'. "
                f"É obrigatório avançar para 'EM_CAMPO' antes de concluir com o resultado da vistoria."
            )

        if ordem.status != StatusOrdem.EM_CAMPO:
            raise TransicaoInvalidaException(
                f"Transição inválida: a ordem #{id_ordem} está '{ordem.status.value}'. "
                f"Apenas ordens no status 'EM_CAMPO' podem ser concluídas."
            )

        if isinstance(resultado, dict):
            try:
                resultado_validado = ResultadoInspecao(**resultado)
            except (ValidationError, ValueError) as e:
                raise AppException(
                    "Resultado de campo inválido.",
                    codigo="DADOS_INVALIDOS",
                    status_code=422,
                ) from e
        elif isinstance(resultado, ResultadoInspecao):
            resultado_validado = resultado
        else:
            raise ResultadoIncompletoException(
                "O resultado deve ser uma instância de ResultadoInspecao ou um dicionário compatível."
            )

        agora = datetime.now(timezone.utc)
        data_conclusao = resultado_validado.data_inspecao or agora

        status_anterior = ordem.status
        ordem.status = StatusOrdem.CONCLUIDA
        ordem.resultado = resultado_validado
        ordem.data_conclusao = data_conclusao

        evento_historico = HistoricoOrdem(
            id_ordem=ordem.id_ordem,
            status_anterior=status_anterior,
            status_novo=StatusOrdem.CONCLUIDA,
            data_mudanca=agora,
            usuario=usuario,
            justificativa_ou_motivo=(
                f"Inspeção concluída: "
                f"{'IRREGULARIDADE CONFIRMADA' if resultado_validado.irregularidade_detectada else 'SEM IRREGULARIDADE'}."
            ),
            detalhes=resultado_validado.model_dump(mode="json"),
        )

        return self.repository.salvar(ordem, evento_historico=evento_historico)

    def cancelar_ordem(
        self,
        id_ordem: int,
        justificativa: Union[str, OrdemInspecaoCancelar, dict[str, Any]],
        usuario: Optional[str] = None,
    ) -> OrdemInspecaoResponse:
        ordem = self.repository.obter_por_id(id_ordem)
        if not ordem:
            raise OrdemNaoEncontradaException(
                f"Ordem de inspeção #{id_ordem} não encontrada."
            )

        if ordem.status not in (StatusOrdem.ABERTA, StatusOrdem.EM_CAMPO):
            raise TransicaoInvalidaException(
                f"Transição inválida: a ordem #{id_ordem} está '{ordem.status.value}'. "
                f"Apenas ordens 'ABERTA' ou 'EM_CAMPO' podem ser canceladas."
            )

        texto_justificativa: str = ""
        user_override: Optional[str] = usuario

        if isinstance(justificativa, str):
            texto_justificativa = justificativa
        elif isinstance(justificativa, OrdemInspecaoCancelar):
            texto_justificativa = justificativa.justificativa
            if justificativa.usuario:
                user_override = justificativa.usuario
        elif isinstance(justificativa, dict):
            try:
                dados_canc = OrdemInspecaoCancelar(**justificativa)
                texto_justificativa = dados_canc.justificativa
                if dados_canc.usuario:
                    user_override = dados_canc.usuario
            except (ValidationError, ValueError) as e:
                raise JustificativaObrigatoriaException(
                    f"Justificativa de cancelamento inválida: {e}"
                )

        if not texto_justificativa or not texto_justificativa.strip():
            raise JustificativaObrigatoriaException(
                "A justificativa de cancelamento é obrigatória e não pode ser vazia."
            )

        agora = datetime.now(timezone.utc)
        status_anterior = ordem.status
        ordem.status = StatusOrdem.CANCELADA
        ordem.justificativa_cancelamento = texto_justificativa.strip()
        ordem.data_cancelamento = agora

        evento_historico = HistoricoOrdem(
            id_ordem=ordem.id_ordem,
            status_anterior=status_anterior,
            status_novo=StatusOrdem.CANCELADA,
            data_mudanca=agora,
            usuario=user_override,
            justificativa_ou_motivo=f"Cancelamento: {texto_justificativa.strip()}",
            detalhes={"justificativa": texto_justificativa.strip()},
        )

        return self.repository.salvar(ordem, evento_historico=evento_historico)

    def obter_ordem(self, id_ordem: int) -> OrdemInspecaoResponse:
        ordem = self.repository.obter_por_id(id_ordem)
        if not ordem:
            raise OrdemNaoEncontradaException(
                f"Ordem de inspeção #{id_ordem} não encontrada."
            )
        return ordem

    def listar_ordens(
        self,
        status: Optional[StatusOrdem] = None,
        id_uc: Optional[str] = None,
    ) -> list[OrdemInspecaoResponse]:
        return self.repository.listar(status=status, id_uc=id_uc)

    def obter_ordem_ativa(self, id_uc: str) -> Optional[OrdemInspecaoResponse]:
        return self.repository.obter_ativa_por_uc(id_uc)

    def tem_ordem_ativa(self, id_uc: str) -> bool:
        return self.obter_ordem_ativa(id_uc) is not None
