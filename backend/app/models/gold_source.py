"""Selecao explicita do contrato lido pela API; nunca mistura real e seed."""
from app.core.config import GOLD_SOURCE

if GOLD_SOURCE == 'real':
    from app.models.gold_real import DimUC as UnidadeConsumidora, FilaPerdas, FilaPerdasAuditoria
else:
    from app.models.gold import UnidadeConsumidora, FilaPerdas, FilaPerdasAuditoria
