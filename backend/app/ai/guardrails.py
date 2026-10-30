"""Pré-filtro da pergunta (GENAI-22): barra o óbvio antes de gastar chamada ao modelo.

Só pega casos claros. O que for sutil fica para o agente, que também recusa pelo prompt,
e para o banco, que de qualquer jeito só deixa ler.
"""
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal


@dataclass(frozen=True)
class Triagem:
    acao: Literal['seguir', 'bloquear', 'responder']
    pergunta: str              # pergunta já limpa, é ela que vai para o agente
    regra: str | None = None   # qual regra disparou, para o log
    texto: str | None = None   # resposta pronta quando não segue para o agente


# Remove acento e põe em minúsculas: "Jaboatão" e "JABOATAO" viram "jaboatao".
def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', sem_acento).strip().lower()


# NFKC troca letras "disfarçadas" (ｄｒｏｐ, ﬁ) pelas comuns; depois some com caracteres invisíveis
# (zero-width, controle), que servem para esconder texto do filtro.
def limpar(pergunta: str) -> str:
    texto = unicodedata.normalize('NFKC', pergunta)
    texto = ''.join(c for c in texto if c in '\n\t' or unicodedata.category(c) not in ('Cc', 'Cf'))
    return re.sub(r'\s+', ' ', texto).strip()


TEXTO_BLOQUEIO = {
    'escrita': 'Eu só consulto os dados da V-Energy, não altero nem apago nada.',
    'injecao': 'Não posso mudar minhas regras. Faça uma pergunta sobre os dados da V-Energy.',
    'prompt': 'Não compartilho minhas instruções internas nem credenciais. Posso ajudar com perguntas sobre os dados.',
    'dados_pessoais': 'Não tenho acesso a CPF, nome do titular, endereço ou contato dos clientes. '
                      'Posso responder por município, bairro, classe ou código da UC.',
    'acesso': 'Só consulto as tabelas de dados da V-Energy liberadas para o assistente.',
}

# Cada regra é (nome, padrão sobre o texto normalizado). A primeira que casar decide.
REGRAS_BLOQUEIO = [
    ('escrita', r'\b(drop|truncate|alter|grant|revoke)\s+\w+'
                r'|\bdelete\s+from\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b'
                r'|\bcreate\s+(table|role|user|schema|function|view|index)\b'
                # Apagar no imperativo nunca é pergunta sobre dados ("apagão" não casa)
                r'|\b(apague|apagar|apaga|deletar|destrua|destruir)\b'
                # Mudar só com o objeto: "quando foi atualizada a base?" tem que passar
                r'|\b(limpe|limpar|altere|alterar|modifique|modificar|atualize|atualizar|edite|editar)\s+'
                r'(a |o |as |os |toda |todo |todas |todos )*'
                r'(tabela|tabelas|banco|base|registros?|dados|cadastro|faturas?|clientes?)\b'),
    ('injecao', r'\b(ignor|desconsider|esquec)\w*\s+(a |as |o |os |todas |todos |suas |seus |tudo |essas |estas )*'
                r'(instruc|orientac|comando|diretriz|prompt|regras anteriores|regras do sistema)'
                r'|\bignore (all |any |the )*(previous |prior |above )*instructions\b'
                r'|\b(a partir de agora|agora) (voce|vc) (e|sera|vai ser)\b'
                r'|\b(finja|fingir|pretend|act as|aja como|se comporte como)\b'
                r'|\b(modo|mode) (desenvolvedor|developer|dev|admin|deus|god)\b|\bjailbreak\b'
                r'|\b(disregard|forget|override)\b'
                r'|\bnovas? (instrucao|instrucoes|regras|ordens)\b'
                r'|(^|\s|\[|<)(system|sistema|assistant|assistente) ?(:|\]|>)|</?(instrucoes|instructions|system)>'),
    ('prompt', r'\b(system prompt|prompt (do|de) sistema|seu prompt|suas instrucoes|suas regras'
               r'|instrucoes (do sistema|internas|originais|iniciais|anteriores)|mensagem (de|do) sistema'
               r'|chave (de|da) api|api key|senha do banco|string de conexao|credenciais)\b|\.env\b'),
    # "telefone" e "e-mail" sozinhos não: TELEFONE é canal de atendimento na Gold.
    ('dados_pessoais', r'\b(cpf|cnpj|rg|logradouro|cep|latitude|longitude|coordenadas)\b|\bendereco'
                       r'|\b(nome|nomes|telefone|telefones|celular|e-?mail|e-?mails|contato) d(o|os|a|as) '
                       r'(titular|titulares|cliente|clientes|consumidor|consumidores|dono|donos|morador|moradores)\b'
                       r'|\b(quem|qual) (e|eh|sao) o (titular|dono)\b'),
    # Tabela de outro schema citada na pergunta (portal.ordens_inspecao, ia.interacao, gold.dim_uc):
    # o agente só enxerga o schema agente, então isso só aparece em tentativa de ataque
    ('acesso', r'\b(portal|ia|gold|silver|bronze|public|pg_catalog|information_schema)\.\w+'),
]

# Só quando a mensagem INTEIRA é isso; "oi, qual a receita?" segue para o agente.
SAUDACAO = re.compile(r'^(oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|hello|hi|tudo bem|obrigad[oa]|valeu)'
                      r'[\s,!.?]*(tudo bem)?[\s!.?]*$')
AJUDA = re.compile(r'^(ajuda|help|o que (voce|vc) (faz|sabe fazer|pode fazer)|como (funciona|te uso|usar)'
                   r'|quem e (voce|vc))[\s!.?]*$')
TEXTO_APRESENTACAO = ('Olá! Respondo perguntas sobre os dados da V-Energy (jul/2022 a jun/2026): receita, consumo, '
                      'continuidade (DEC/FEC), perdas, atendimento e geração distribuída. '
                      'Exemplo: "Qual bairro mais perdeu volume residencial no último ano?"')

# Assuntos claramente fora da V-Energy. Lista curta de propósito: na dúvida, segue para o agente.
FORA_DO_ESCOPO = re.compile(r'\b(receita de (bolo|torta|pao|comida)|piada|poema|poesia|letra da musica|horoscopo'
                            r'|previsao do tempo|futebol|bitcoin|criptomoeda|bolsa de valores'
                            r'|escreva (um|uma) (redacao|carta|historia)|traduza)\b')
TEXTO_FORA_DO_ESCOPO = ('Essa pergunta está fora do que eu sei responder. Pergunte sobre receita, consumo, '
                        'continuidade, perdas, atendimento ou geração distribuída da V-Energy.')

# Só as regras de escrita, injeção e prompt: um valor pode citar "endereço" ou "gold.x" sem ser ataque.
REGRAS_DE_INSTRUCAO = [padrao for regra, padrao in REGRAS_BLOQUEIO if regra not in ('dados_pessoais', 'acesso')]

def parece_instrucao(texto: str) -> bool:
    normalizado = normalizar(limpar(texto))
    return any(re.search(padrao, normalizado) for padrao in REGRAS_DE_INSTRUCAO)


def triar(pergunta: str) -> Triagem:
    limpa = limpar(pergunta)
    texto = normalizar(limpa)
    for regra, padrao in REGRAS_BLOQUEIO:
        if re.search(padrao, texto):
            return Triagem('bloquear', limpa, regra, TEXTO_BLOQUEIO[regra])
    if SAUDACAO.match(texto) or AJUDA.match(texto):
        return Triagem('responder', limpa, 'saudacao', TEXTO_APRESENTACAO)
    if FORA_DO_ESCOPO.search(texto):
        return Triagem('responder', limpa, 'fora_do_escopo', TEXTO_FORA_DO_ESCOPO)
    return Triagem('seguir', limpa)


# Monta a resposta no mesmo formato do agente (RespostaIA), sem SQL nem dados.
def resposta_da_triagem(triagem: Triagem, *, conversa_id: str | None = None,
                        gold_atualizada_em: datetime | None = None) -> dict:
    if triagem.acao == 'bloquear':
        status = 'bloqueado'
    else:
        status = 'ok' if triagem.regra == 'saudacao' else 'nao_sei'
    resposta = {
        'resposta': triagem.texto,
        'sql': None,
        'tabelas': [],
        'dados': {'colunas': [], 'linhas': []},
        'status': status,
        'gerado_em': datetime.now(timezone.utc),
        'metadados': {
            'dados_ficticios': False,
            'gold_atualizada_em': gold_atualizada_em,
            'observacoes': [f'Respondido pelo pré-filtro (regra: {triagem.regra}), sem chamar o modelo.'],
        },
        'apresentacao': 'texto',
    }
    if conversa_id is not None:
        resposta['conversa_id'] = conversa_id
    return resposta