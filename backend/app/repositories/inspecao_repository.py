from copy import deepcopy
from datetime import datetime, timezone
from typing import Optional, Protocol
from app.schemas.inspecao import (
    STATUS_ATIVOS,
    HistoricoOrdem,
    OrdemInspecaoCreate,
    OrdemInspecaoResponse,
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

    def salvar(
        self,
        ordem: OrdemInspecaoResponse,
        evento_historico: Optional[HistoricoOrdem] = None,
    ) -> OrdemInspecaoResponse:
        ...

    def existe_uc(self, id_uc: str) -> bool:
        ...

    def cadastrar_uc(self, id_uc: str) -> None:
        ...


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
