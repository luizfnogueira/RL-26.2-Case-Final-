from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Protocol

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import OrdemAtivaExistenteException
from app.models.gold_source import UnidadeConsumidora
from app.core.config import GOLD_SOURCE
from app.models.portal import NOME_INDICE_ORDEM_ATIVA, OrdemHistorico, OrdemInspecao
from app.schemas.common import limites
from app.schemas.inspecao import (
    STATUS_ATIVOS,
    HistoricoOrdem,
    OrdemInspecaoResponse,
    ResultadoInspecao,
    StatusOrdem,
)


class OrdemInspecaoRepositoryInterface(Protocol):
    def obter_por_id(self, id_ordem: int) -> Optional[OrdemInspecaoResponse]:
        ...

    def obter_ativa_por_uc(self, id_uc: str) -> Optional[OrdemInspecaoResponse]:
        ...

    def listar(
        self,
        status: Optional[StatusOrdem] = None,
        id_uc: Optional[str] = None,
    ) -> list[OrdemInspecaoResponse]:
        ...

    def consultar(
        self,
        *,
        status: Optional[StatusOrdem | str] = None,
        id_uc: Optional[str] = None,
        periodo_atual: Optional[str] = None,
        municipio: Optional[str] = None,
        bairro: Optional[str] = None,
        classe: Optional[str] = None,
        alimentador: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[OrdemInspecaoResponse], int, dict[str, int]]:
        ...

    def salvar(
        self,
        ordem: OrdemInspecaoResponse,
        evento_historico: Optional[HistoricoOrdem] = None,
    ) -> OrdemInspecaoResponse:
        ...

    def salvar_varias(
        self,
        ordens: list[tuple[OrdemInspecaoResponse, Optional[HistoricoOrdem]]],
    ) -> list[OrdemInspecaoResponse]:
        """Grava todas ou nenhuma."""
        ...

    def existe_uc(self, id_uc: str) -> bool:
        ...


def _valor_status(status: StatusOrdem | str) -> str:
    return status.value if isinstance(status, StatusOrdem) else status


def _inicio_mes(referencia: str) -> datetime:
    ano, mes = (int(parte) for parte in referencia.split("-"))
    return datetime(ano, mes, 1, tzinfo=timezone.utc)


def _mes_seguinte(referencia: str) -> datetime:
    ano, mes = (int(parte) for parte in referencia.split("-"))
    if mes == 12:
        return datetime(ano + 1, 1, 1, tzinfo=timezone.utc)
    return datetime(ano, mes + 1, 1, tzinfo=timezone.utc)


def _intervalo_periodo(periodo: str) -> tuple[datetime, datetime]:
    inicio, fim = limites(periodo)
    return _inicio_mes(inicio), _mes_seguinte(fim)


def _flutuante(valor: Decimal | float | None) -> float | None:
    return float(valor) if valor is not None else None


def _para_response(modelo: OrdemInspecao) -> OrdemInspecaoResponse:
    return OrdemInspecaoResponse(
        id_ordem=modelo.id_ordem,
        id_uc=modelo.id_uc,
        status=StatusOrdem(modelo.status),
        equipe_responsavel=modelo.equipe_responsavel,
        data_criacao=modelo.data_criacao,
        data_prevista=modelo.data_prevista,
        data_inicio_campo=modelo.data_inicio_campo,
        data_conclusao=modelo.data_conclusao,
        data_cancelamento=modelo.data_cancelamento,
        justificativa_cancelamento=modelo.justificativa_cancelamento,
        motivo=modelo.motivo,
        kwh_estimado=_flutuante(modelo.kwh_estimado),
        observacoes=modelo.observacoes,
        resultado=(
            ResultadoInspecao.model_validate(modelo.resultado)
            if modelo.resultado is not None
            else None
        ),
        historico=[
            HistoricoOrdem(
                id_historico=evento.id_historico,
                id_ordem=evento.id_ordem,
                status_anterior=(
                    StatusOrdem(evento.status_anterior)
                    if evento.status_anterior is not None
                    else None
                ),
                status_novo=StatusOrdem(evento.status_novo),
                data_mudanca=evento.data_mudanca,
                usuario=evento.usuario,
                justificativa_ou_motivo=evento.justificativa_ou_motivo,
                detalhes=evento.detalhes,
            )
            for evento in modelo.historico
        ],
    )


def _preencher_modelo(modelo: OrdemInspecao, ordem: OrdemInspecaoResponse) -> None:
    modelo.id_uc = ordem.id_uc
    modelo.status = ordem.status.value
    modelo.equipe_responsavel = ordem.equipe_responsavel
    modelo.data_criacao = ordem.data_criacao
    modelo.data_prevista = ordem.data_prevista
    modelo.data_inicio_campo = ordem.data_inicio_campo
    modelo.data_conclusao = ordem.data_conclusao
    modelo.data_cancelamento = ordem.data_cancelamento
    modelo.justificativa_cancelamento = ordem.justificativa_cancelamento
    modelo.motivo = ordem.motivo
    modelo.kwh_estimado = (
        Decimal(str(ordem.kwh_estimado)) if ordem.kwh_estimado is not None else None
    )
    modelo.observacoes = ordem.observacoes
    modelo.resultado = (
        ordem.resultado.model_dump(mode="json") if ordem.resultado is not None else None
    )


def _violou_indice_ordem_ativa(exc: IntegrityError) -> bool:
    origem = getattr(exc, "orig", None)
    diagnostico = getattr(origem, "diag", None)
    return (
        getattr(diagnostico, "constraint_name", None) == NOME_INDICE_ORDEM_ATIVA
        or NOME_INDICE_ORDEM_ATIVA in str(exc)
    )


class SqlAlchemyOrdemInspecaoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def existe_uc(self, id_uc: str) -> bool:
        return self.db.get(UnidadeConsumidora, id_uc.strip()) is not None

    def validar_acao(self, id_uc: str) -> None:
        from app.models.gold_source import FilaPerdas
        from app.core.exceptions import AppException

        acao = self.db.scalar(select(FilaPerdas.acao_recomendada).where(FilaPerdas.id_uc == id_uc))
        if acao == 'VALIDACAO_DOCUMENTAL':
            raise AppException(
                'UC requer validacao documental antes de gerar inspecao.',
                codigo='DADOS_INVALIDOS',
                status_code=422,
            )

    def obter_por_id(self, id_ordem: int) -> Optional[OrdemInspecaoResponse]:
        modelo = self.db.get(OrdemInspecao, id_ordem)
        return _para_response(modelo) if modelo is not None else None

    def obter_ativa_por_uc(self, id_uc: str) -> Optional[OrdemInspecaoResponse]:
        modelo = self.db.scalar(
            select(OrdemInspecao)
            .where(
                OrdemInspecao.id_uc == id_uc.strip(),
                OrdemInspecao.status.in_([status.value for status in STATUS_ATIVOS]),
            )
            .limit(1)
        )
        return _para_response(modelo) if modelo is not None else None

    def listar(
        self,
        status: Optional[StatusOrdem] = None,
        id_uc: Optional[str] = None,
    ) -> list[OrdemInspecaoResponse]:
        ordens, _, _ = self.consultar(status=status, id_uc=id_uc, page_size=100_000)
        return ordens

    def consultar(
        self,
        *,
        status: Optional[StatusOrdem | str] = None,
        id_uc: Optional[str] = None,
        periodo_atual: Optional[str] = None,
        municipio: Optional[str] = None,
        bairro: Optional[str] = None,
        classe: Optional[str] = None,
        alimentador: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[OrdemInspecaoResponse], int, dict[str, int]]:
        condicoes = []
        if id_uc:
            condicoes.append(OrdemInspecao.id_uc == id_uc.strip())
        if periodo_atual:
            inicio, fim = _intervalo_periodo(periodo_atual)
            condicoes.append(OrdemInspecao.data_criacao >= inicio)
            condicoes.append(OrdemInspecao.data_criacao < fim)
        if municipio:
            condicoes.append(UnidadeConsumidora.municipio == municipio.strip())
        if bairro:
            condicoes.append(UnidadeConsumidora.bairro == bairro.strip())
        if classe:
            condicoes.append(UnidadeConsumidora.classe == classe.strip())
        if alimentador:
            condicoes.append(UnidadeConsumidora.alimentador == alimentador.strip())
        join_uc = any((municipio, bairro, classe, alimentador))

        contagem = {status.value: 0 for status in StatusOrdem}
        consulta_contagem = select(
            OrdemInspecao.status, func.count(OrdemInspecao.id_ordem)
        ).group_by(OrdemInspecao.status)
        consulta_contagem = self._aplicar_filtros(consulta_contagem, condicoes, join_uc)
        for status_encontrado, quantidade in self.db.execute(consulta_contagem):
            if status_encontrado in contagem:
                contagem[status_encontrado] = int(quantidade)

        if status is not None:
            condicoes.append(OrdemInspecao.status == _valor_status(status))

        consulta_total = self._aplicar_filtros(
            select(func.count(OrdemInspecao.id_ordem)), condicoes, join_uc
        )
        total = int(self.db.scalar(consulta_total) or 0)

        consulta = (
            self._aplicar_filtros(select(OrdemInspecao), condicoes, join_uc)
            .order_by(OrdemInspecao.data_criacao.desc(), OrdemInspecao.id_ordem.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        ordens = [_para_response(modelo) for modelo in self.db.scalars(consulta)]
        return ordens, total, contagem

    @staticmethod
    def _aplicar_filtros(consulta, condicoes, join_uc: bool):
        if join_uc:
            consulta = consulta.join(
                UnidadeConsumidora, UnidadeConsumidora.id_uc == OrdemInspecao.id_uc
            )
        if condicoes:
            consulta = consulta.where(*condicoes)
        return consulta

    def salvar(
        self,
        ordem: OrdemInspecaoResponse,
        evento_historico: Optional[HistoricoOrdem] = None,
    ) -> OrdemInspecaoResponse:
        return self.salvar_varias([(ordem, evento_historico)])[0]

    def salvar_varias(
        self,
        ordens: list[tuple[OrdemInspecaoResponse, Optional[HistoricoOrdem]]],
    ) -> list[OrdemInspecaoResponse]:
        """Um commit para todas: se uma falhar (ex.: ordem ativa criada em paralelo), nenhuma fica gravada."""
        modelos = []
        id_uc = None
        try:
            for ordem, evento_historico in ordens:
                id_uc = ordem.id_uc
                modelo = self.db.get(OrdemInspecao, ordem.id_ordem) if ordem.id_ordem > 0 else None
                if modelo is None:
                    modelo = OrdemInspecao()
                    self.db.add(modelo)
                _preencher_modelo(modelo, ordem)
                self.db.flush()
                if evento_historico is not None:
                    modelo.historico.append(
                        OrdemHistorico(
                            status_anterior=(
                                evento_historico.status_anterior.value
                                if evento_historico.status_anterior is not None
                                else None
                            ),
                            status_novo=evento_historico.status_novo.value,
                            data_mudanca=evento_historico.data_mudanca,
                            usuario=evento_historico.usuario,
                            justificativa_ou_motivo=evento_historico.justificativa_ou_motivo,
                            detalhes=evento_historico.detalhes,
                        )
                    )
                modelos.append(modelo)
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            if _violou_indice_ordem_ativa(exc):
                raise OrdemAtivaExistenteException(
                    f"A Unidade Consumidora '{id_uc}' já possui uma ordem de inspeção ativa."
                ) from exc
            raise

        return [self.obter_por_id(modelo.id_ordem) for modelo in modelos]


class MemoriaOrdemInspecaoRepository:
    def __init__(self, ucs_iniciais: Optional[set[str]] = None) -> None:
        self._ordens: dict[int, OrdemInspecaoResponse] = {}
        self._ucs: set[str] = set(ucs_iniciais) if ucs_iniciais else set()
        self._proximo_id_ordem: int = 1
        self._proximo_id_historico: int = 1

    def existe_uc(self, id_uc: str) -> bool:
        return id_uc.strip() in self._ucs

    def cadastrar_uc(self, id_uc: str) -> None:
        self._ucs.add(id_uc.strip())

    def remover_uc(self, id_uc: str) -> None:
        self._ucs.discard(id_uc.strip())

    def obter_por_id(self, id_ordem: int) -> Optional[OrdemInspecaoResponse]:
        ordem = self._ordens.get(id_ordem)
        return deepcopy(ordem) if ordem else None

    def obter_ativa_por_uc(self, id_uc: str) -> Optional[OrdemInspecaoResponse]:
        id_uc_limpo = id_uc.strip()
        for ordem in self._ordens.values():
            if ordem.id_uc == id_uc_limpo and ordem.status in STATUS_ATIVOS:
                return deepcopy(ordem)
        return None

    def listar(
        self,
        status: Optional[StatusOrdem] = None,
        id_uc: Optional[str] = None,
    ) -> list[OrdemInspecaoResponse]:
        resultado: list[OrdemInspecaoResponse] = []
        id_uc_limpo = id_uc.strip() if id_uc else None

        for ordem in self._ordens.values():
            if status is not None and ordem.status != status:
                continue
            if id_uc_limpo is not None and ordem.id_uc != id_uc_limpo:
                continue
            resultado.append(deepcopy(ordem))

        resultado.sort(key=lambda o: o.id_ordem)
        return resultado

    def consultar(
        self,
        *,
        status: Optional[StatusOrdem | str] = None,
        id_uc: Optional[str] = None,
        periodo_atual: Optional[str] = None,
        municipio: Optional[str] = None,
        bairro: Optional[str] = None,
        classe: Optional[str] = None,
        alimentador: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[OrdemInspecaoResponse], int, dict[str, int]]:
        if any((municipio, bairro, classe, alimentador)):
            raise NotImplementedError("O repositório em memória não conhece a região das UCs.")

        todas = self.listar(id_uc=id_uc)
        if periodo_atual:
            inicio, fim = _intervalo_periodo(periodo_atual)
            todas = [ordem for ordem in todas if inicio <= ordem.data_criacao < fim]

        contagem = {valor.value: 0 for valor in StatusOrdem}
        for ordem in todas:
            contagem[ordem.status.value] += 1

        if status is not None:
            valor = status.value if isinstance(status, StatusOrdem) else status
            todas = [ordem for ordem in todas if ordem.status.value == valor]

        inicio_pagina = (page - 1) * page_size
        return todas[inicio_pagina:inicio_pagina + page_size], len(todas), contagem

    def salvar(
        self,
        ordem: OrdemInspecaoResponse,
        evento_historico: Optional[HistoricoOrdem] = None,
    ) -> OrdemInspecaoResponse:
        ordem_salva = deepcopy(ordem)

        if ordem_salva.id_ordem <= 0 or ordem_salva.id_ordem not in self._ordens:
            ordem_salva.id_ordem = self._proximo_id_ordem
            self._proximo_id_ordem += 1

        if evento_historico:
            evento = deepcopy(evento_historico)
            evento.id_ordem = ordem_salva.id_ordem
            if not evento.id_historico:
                evento.id_historico = self._proximo_id_historico
                self._proximo_id_historico += 1
            ordem_salva.historico.append(evento)

        self._ordens[ordem_salva.id_ordem] = deepcopy(ordem_salva)
        return deepcopy(ordem_salva)

    def salvar_varias(
        self,
        ordens: list[tuple[OrdemInspecaoResponse, Optional[HistoricoOrdem]]],
    ) -> list[OrdemInspecaoResponse]:
        return [self.salvar(ordem, evento_historico) for ordem, evento_historico in ordens]
