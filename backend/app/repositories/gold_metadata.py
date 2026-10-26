"""Proveniência da fonte selecionada, sem confundir Gold real com o seed."""
import json

from sqlalchemy import text

from app.core.config import GOLD_SOURCE


def metadados_gold(db, tabela, observacao_seed):
    if GOLD_SOURCE != 'real':
        return {
            'dados_ficticios': True,
            'gold_atualizada_em': None,
            'observacoes': [observacao_seed],
        }
    value = db.execute(text(
        'SELECT metadata_json FROM gold._carga_metadata WHERE tabela=:tabela'
    ), {'tabela': tabela}).scalar_one()
    manifest = json.loads(value)['manifest']
    return {
        'dados_ficticios': False,
        'gold_atualizada_em': manifest['exportado_em_utc'],
        'observacoes': ['Dados reais da Gold importada; atualização referente à exportação.'],
    }
