"""Roteador de intenção: a primeira decisão sobre a pergunta, antes de montar qualquer consulta.

Cada pergunta sai daqui com uma rota, todas decididas por código e sem chamar o modelo:
- seguranca: escrita, injeção, prompt ou dados pessoais (pré-filtro do guardrails), bloqueada na hora;
- apresentacao: saudação ou "o que você faz?";
- fora_de_escopo: assunto alheio à V-Energy (piada, clima, figuras históricas);
- esclarecimento: pergunta do negócio que falta contexto ("receita do Centro", "este ano");
- dados_ausentes: período fora da base (jul/2022 a jun/2026), que nenhuma consulta comprova;
- consulta: segue para o agente. Se ele não conseguir provar o número, ainda responde `nao_sei`.
"""
import re
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from app.ai.guardrails import Triagem, normalizar, resposta_da_triagem, triar
from app.services import esclarecimento_ia

Rota = Literal['seguranca', 'apresentacao', 'fora_de_escopo', 'esclarecimento', 'dados_ausentes', 'consulta']

PRIMEIRO_ANO, ULTIMO_ANO = 2022, 2026
# Ano solto na pergunta; "ALM-REC-2030" ou "UC2021" são códigos, não anos
_ANO = re.compile(r'(?<![\w-])(19\d{2}|20\d{2})(?![\w-])')
# O cadastro da dim_uc tem datas desde 1997 (ligação, instalação do medidor): essas perguntas seguem
_CADASTRO = re.compile(r'\b(ligad|ligac|religad|instalad|instalac|medidor|conectad|conexao|cadastr)\w*')
TEXTO_DADOS_AUSENTES = ('Entendi sua pergunta, mas os dados atuais não me permitem confirmar esses números: '
                        'a base da V-Energy vai de julho de 2022 a junho de 2026.')


class Intencao(BaseModel):
    model_config = ConfigDict(frozen=True, extra='forbid')

    rota: Rota
    pergunta: str                       # já limpa pelo pré-filtro; é ela que vai para o agente
    regra: str | None = None            # qual regra decidiu, para o log
    texto: str | None = None            # resposta pronta das rotas que não consultam
    esclarecimento: dict | None = None  # pergunta e opções da rota esclarecimento


def fora_da_base(pergunta: str) -> bool:
    """Todos os anos citados ficam fora da base; misturar 2021 com 2023 ainda vai para o agente."""
    if _CADASTRO.search(normalizar(pergunta)):
        return False
    anos = [int(ano) for ano in _ANO.findall(pergunta)]
    return bool(anos) and all(not PRIMEIRO_ANO <= ano <= ULTIMO_ANO for ano in anos)


def classificar(pergunta: str, historico: list[dict] = (), bairros_ambiguos: dict[str, set[str]] | None = None,
                municipios: set[str] = frozenset()) -> Intencao:
    triagem = triar(pergunta)
    if triagem.acao == 'bloquear':
        return Intencao(rota='seguranca', pergunta=triagem.pergunta, regra=triagem.regra, texto=triagem.texto)
    if triagem.acao == 'responder':
        rota = 'apresentacao' if triagem.regra == 'saudacao' else 'fora_de_escopo'
        return Intencao(rota=rota, pergunta=triagem.pergunta, regra=triagem.regra, texto=triagem.texto)
    esclarecer = esclarecimento_ia.detectar(pergunta, list(historico), bairros_ambiguos or {}, municipios)
    if esclarecer:
        return Intencao(rota='esclarecimento', pergunta=triagem.pergunta, regra='esclarecimento',
                        esclarecimento=esclarecer)
    if fora_da_base(triagem.pergunta):
        return Intencao(rota='dados_ausentes', pergunta=triagem.pergunta, regra='fora_da_base',
                        texto=TEXTO_DADOS_AUSENTES)
    return Intencao(rota='consulta', pergunta=triagem.pergunta)


def resposta_sem_consulta(intencao: Intencao, gold_atualizada_em: Any = None) -> dict:
    """RespostaIA das rotas que não consultam o banco (todas menos `consulta`)."""
    if intencao.rota == 'esclarecimento':
        return esclarecimento_ia.resposta(intencao.esclarecimento, gold_atualizada_em)
    if intencao.rota == 'dados_ausentes':
        return {
            'resposta': intencao.texto, 'sql': None, 'tabelas': [], 'dados': {'colunas': [], 'linhas': []},
            'status': 'nao_sei', 'gerado_em': datetime.now(timezone.utc), 'apresentacao': 'texto',
            'metadados': {'dados_ficticios': False, 'gold_atualizada_em': gold_atualizada_em,
                          'observacoes': [f'Respondido pelo roteador de intenção (regra: {intencao.regra}), '
                                          'sem chamar o modelo.']},
        }
    acao = 'bloquear' if intencao.rota == 'seguranca' else 'responder'
    triagem = Triagem(acao, intencao.pergunta, intencao.regra, intencao.texto)
    return resposta_da_triagem(triagem, gold_atualizada_em=gold_atualizada_em)
