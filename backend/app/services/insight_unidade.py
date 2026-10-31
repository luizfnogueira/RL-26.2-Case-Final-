"""V1c: POST /ia/insight com contexto=unidade sobre a Gold real: fatos da conta, redação pela IA e plano B.

Com GOLD_SOURCE=seed a rota segue no stub (stub_ia). Os números são os mesmos do GET /unidades/{id};
`indicadores` do pedido é ignorado, porque a resposta não usa nada do navegador.

IA_MODO=real: o modelo redige pelo escrever_insight com as instruções da unidade, no prazo da ponte de IA.
Qualquer falha (prazo, validador, provedor, conferência de cobertura) vira o texto por regra, marcado
como alternativo pelo mesmo prefixo da receita. IA_MODO=mock: sempre o texto por regra, também marcado.
"""
import logging
from typing import Callable

from sqlalchemy.orm import Session

from app.core import config
from app.core.exceptions import AppException
from app.repositories.unidade_repository import SqlAlchemyUnidadeRepository, UnidadeRepositoryInterface
from app.schemas.common import duracao
from app.schemas.ia import PedidoInsight
from app.schemas.unidades import MESES_JANELA
from app.services.fatos_unidade import carregar_fatos_unidade
from app.services.ia_service import executar_com_prazo, prazo_ia_s
from app.services.insight_service import PREFIXO_TEXTO_ALTERNATIVO
from app.services.redacao_ia_unidade import Caso, pode_redigir
from app.services.texto_unidade import texto_por_regra_unidade

logger = logging.getLogger(__name__)

OBSERVACAO_SEM_IA = (f'{PREFIXO_TEXTO_ALTERNATIVO} IA_MODO=mock; resumo montado por regra sobre os números '
                     'da Gold.')
OBSERVACAO_FALHA = (f'{PREFIXO_TEXTO_ALTERNATIVO} o módulo de IA não respondeu; resumo montado por regra '
                    'sobre os mesmos números.')
OBSERVACAO_CONFERENCIA = (f'{PREFIXO_TEXTO_ALTERNATIVO} o texto da IA não passou na conferência; resumo '
                          'montado por regra sobre os mesmos números.')
OBSERVACAO_SEM_SITUACAO = (f'{PREFIXO_TEXTO_ALTERNATIVO} sem valor da conta no mês para a IA redigir; resumo '
                           'montado por regra.')


def usa_gold_real() -> bool:
    """Lido a cada pedido, como a fonte da Gold do resto da API (os testes trocam pelo config)."""
    return config.GOLD_SOURCE == 'real'


def repositorio(db: Session) -> UnidadeRepositoryInterface:
    """O mesmo repository do GET /unidades/{id}; substituído nos testes."""
    return SqlAlchemyUnidadeRepository(db)


def escritor() -> Callable[..., dict]:
    from app.ai.insights import escrever_insight  # o PydanticAI só é importado no modo real
    return escrever_insight


def _alternativo(regra: dict, observacao: str) -> dict:
    regra['metadados']['observacoes'].append(observacao)
    return regra


def gerar_insight_unidade(db: Session, dados: PedidoInsight) -> dict:
    periodo = dados.filtros.periodo_atual
    # Mesma janela do GET /unidades/{id}: 12 meses (lá validado no FiltroUnidade)
    if duracao(periodo) != MESES_JANELA:
        raise AppException(f'periodo_atual deve ter {MESES_JANELA} meses', codigo='DADOS_INVALIDOS',
                           status_code=422)
    repo = repositorio(db)
    # 503 GOLD_NAO_CARREGADA e 404 UC_INEXISTENTE saem daqui, como no GET
    fatos = carregar_fatos_unidade(repo, dados.id_uc, periodo)
    regra = texto_por_regra_unidade(fatos, repo.metadados())
    if config.IA_MODO != 'real':
        return _alternativo(regra, OBSERVACAO_SEM_IA)
    if not pode_redigir(fatos):
        return _alternativo(regra, OBSERVACAO_SEM_SITUACAO)

    caso = Caso(fatos)
    try:
        escrever = escritor()
        saida = executar_com_prazo(lambda: escrever(caso.marcadores, instrucoes=caso.instrucoes()), prazo_ia_s())
        texto = saida['texto'].strip()
    except Exception as erro:
        # Só o tipo vai para o log: mensagens do provedor podem trazer URL ou cabeçalhos
        logger.warning('Resumo da unidade por IA indisponível; usando texto por regra (%s)', type(erro).__name__)
        return _alternativo(regra, OBSERVACAO_FALHA)
    if problemas := caso.conferir(texto):
        logger.warning('Resumo da unidade por IA reprovado na conferência: %s', '; '.join(problemas))
        return _alternativo(regra, OBSERVACAO_CONFERENCIA)
    # Título do código (a situação não é decidida pelo modelo); texto e números da redação da IA
    return {**regra, 'texto': texto, 'numeros_utilizados': caso.numeros_no_texto(texto)}
