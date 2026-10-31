from app.repositories.candidato_repository import (
    CandidatoFila,
    CandidatoRepositoryInterface,
    ResumoFila,
)
from app.schemas.inspecoes import FiltrosCandidatos
from app.services.stubs import verificar_cenario


def _indicador(valor: float | int, unidade: str, periodo: str) -> dict:
    return {"valor": valor, "unidade": unidade, "periodo_referencia": periodo}


def _item(candidato: CandidatoFila, periodo: str) -> dict:
    return {
        "id_uc": candidato.id_uc,
        "municipio": candidato.municipio,
        "bairro": candidato.bairro,
        "classe": candidato.classe,
        "alimentador": candidato.alimentador,
        "posicao": candidato.posicao,
        "motivos": candidato.motivos,
        "acao_recomendada": candidato.acao_recomendada,
        "energia_estimada": _indicador(
            round(float(candidato.kwh_estimado), 2), "kWh", periodo
        ),
        "score": round(float(candidato.score), 2),
        "confianca_evidencia": candidato.confianca_evidencia,
        "ordem_ativa": candidato.id_ordem_ativa is not None,
        "id_ordem_ativa": candidato.id_ordem_ativa,
    }


def _resumo(resumo: ResumoFila, periodo: str) -> dict:
    return {
        "ucs_analisadas": _indicador(resumo.ucs_analisadas, "UCs", periodo),
        "ucs_priorizadas": _indicador(resumo.ucs_priorizadas, "UCs", periodo),
        "potencial_recuperacao": _indicador(
            round(float(resumo.potencial_recuperacao), 2), "kWh", periodo
        ),
        "ordens_ativas": _indicador(resumo.ordens_ativas, "ordens", periodo),
    }


class CandidatoService:
    def __init__(self, repository: CandidatoRepositoryInterface) -> None:
        self.repository = repository

    def listar(self, filtros: FiltrosCandidatos) -> dict:
        # A exportacao da fila e um snapshot da janela P2, sem historico por janela.
        verificar_cenario(filtros.periodo_atual, filtros.periodo_comparacao)
        manifest = getattr(self.repository, 'metadados', lambda: None)()

        itens, total, resumo = self.repository.consultar(
            municipio=filtros.municipio,
            bairro=filtros.bairro,
            classe=filtros.classe,
            alimentador=filtros.alimentador,
            sem_ordem_ativa=filtros.sem_ordem_ativa,
            page=filtros.page,
            page_size=filtros.page_size,
        )
        periodo = filtros.periodo_atual

        return {
            "items": [_item(candidato, periodo) for candidato in itens],
            "page": filtros.page,
            "page_size": filtros.page_size,
            "total": total,
            "periodo_referencia": periodo,
            "resumo": _resumo(resumo, periodo),
            "metadados": {
                "dados_ficticios": manifest is None,
                "gold_atualizada_em": manifest['exportado_em_utc'] if manifest else None,
                "observacoes": [
                    ("Gold V10 real: a fila inclui INSPECAO_PRIORITARIA e VALIDACAO_DOCUMENTAL; "
                     "casos documentais requerem revisao antes de ordem de campo. Score nao e probabilidade de fraude; "
                     "kWh estimado e heuristico. Janela fixa P2 da exportacao."
                     if manifest else "Fila ficticia do seed; ordens ativas do portal.")
                ],
            },
        }
