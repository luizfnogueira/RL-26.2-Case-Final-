"""Mapeamentos reais isolados dos modelos provisorios usados pelo seed."""
from sqlalchemy.orm import registry
from app.db.gold_contract import TABLES, metadata

mapper_registry = registry(metadata=metadata)


def model(name, table):
    cls = type(name, (), {})
    mapper_registry.map_imperatively(cls, TABLES[table])
    return cls


DimUC = model('DimUC', 'dim_uc')
FilaPerdas = model('FilaPerdas', 'tb_fila_perdas')
FilaPerdasAuditoria = model('FilaPerdasAuditoria', 'tb_fila_perdas_auditoria')
FatoUCMes = model('FatoUCMes', 'fato_uc_mes')
UCConsumoComparativo = model('UCConsumoComparativo', 'uc_consumo_comparativo')
UCInterrupcoes = model('UCInterrupcoes', 'uc_interrupcoes')
UCAtendimentos = model('UCAtendimentos', 'uc_atendimentos')
AggDecFecMensal = model('AggDecFecMensal', 'agg_dec_fec_mensal')

AggPrecoVolume = model('AggPrecoVolume', 'agg_preco_volume')
AggReceitaMensal = model('AggReceitaMensal', 'agg_receita_mensal')
DimMes = model('DimMes', 'dim_mes')
