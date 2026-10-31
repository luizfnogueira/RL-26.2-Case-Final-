"""V1c: POST /ia/insight com contexto=unidade sobre a Gold real: fatos da conta e texto por regra.

Com GOLD_SOURCE=seed a rota segue no stub (stub_ia). Os números são os mesmos do GET /unidades/{id};
`indicadores` do pedido é ignorado, porque a resposta não usa nada do navegador. Até o modelo entrar
(passo 4), o texto é sempre o por regra, marcado como alternativo pelo mesmo prefixo da receita.
"""
from sqlalchemy.orm import Session

from app.core import config
from app.core.exceptions import AppException
from app.repositories.unidade_repository import SqlAlchemyUnidadeRepository, UnidadeRepositoryInterface
from app.schemas.common import duracao
from app.schemas.ia import PedidoInsight
from app.schemas.unidades import MESES_JANELA
from app.services.fatos_unidade import carregar_fatos_unidade
from app.services.insight_service import PREFIXO_TEXTO_ALTERNATIVO
from app.services.texto_unidade import texto_por_regra_unidade

OBSERVACAO_SEM_IA = (f'{PREFIXO_TEXTO_ALTERNATIVO} resumo montado por regra sobre os números da Gold; '
                     'o resumo por IA da unidade ainda não está ligado.')


def usa_gold_real() -> bool:
    """Lido a cada pedido, como a fonte da Gold do resto da API (os testes trocam pelo config)."""
    return config.GOLD_SOURCE == 'real'


def repositorio(db: Session) -> UnidadeRepositoryInterface:
    """O mesmo repository do GET /unidades/{id}; substituído nos testes."""
    return SqlAlchemyUnidadeRepository(db)


def gerar_insight_unidade(db: Session, dados: PedidoInsight) -> dict:
    periodo = dados.filtros.periodo_atual
    # Mesma janela do GET /unidades/{id}: 12 meses (lá validado no FiltroUnidade)
    if duracao(periodo) != MESES_JANELA:
        raise AppException(f'periodo_atual deve ter {MESES_JANELA} meses', codigo='DADOS_INVALIDOS',
                           status_code=422)
    repo = repositorio(db)
    # 503 GOLD_NAO_CARREGADA e 404 UC_INEXISTENTE saem daqui, como no GET
    fatos = carregar_fatos_unidade(repo, dados.id_uc, periodo)
    resposta = texto_por_regra_unidade(fatos, repo.metadados())
    resposta['metadados']['observacoes'].append(OBSERVACAO_SEM_IA)
    return resposta
