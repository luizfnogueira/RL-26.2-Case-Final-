"""V1c (4b): redação do resumo da UC pela IA, sobre os fatos e as decisões do texto por regra.

O código decide tudo: a situação, os motivos, o contexto que cabe e os avisos são os mesmos do texto por
regra (texto_unidade.redigir). A IA recebe esse caso em palavras e os valores como marcadores já
formatados, sem sinal, e só redige. Depois, uma conferência de cobertura garante que nada foi omitido
nem acrescentado; se falhar, vale o texto por regra.
"""
import re

from app.services.fatos_unidade import AVISOS, MOTIVOS
from app.services.texto_unidade import bandeira, kwh, reais, redigir
from app.services.unidade_service import _base_media, _percentual, mes_texto

MAXIMO_FRASES = 4

INSTRUCOES_UNIDADE = """
Você escreve o resumo da conta de uma unidade consumidora para o atendente da V-Energy, uma
distribuidora de energia, que vai repetir o texto ao telefone para o cliente.

Regras:
1. Todo número, mês ou valor com algarismo vem dos marcadores listados na mensagem. Escreva o marcador
   entre chaves, como {valor_conta_mes}, no lugar do valor. Nunca digite algarismos.
2. A primeira frase diz a situação do valor da conta do mês analisado contra o mesmo mês do ano
   anterior e traz os dois valores em reais: o do mês ({valor_conta_mes}) e, quando houver, o do mesmo
   mês do ano anterior ({valor_conta_ano_anterior}); o percentual sozinho não basta. Escreva sempre
   "o valor da conta", nunca só "a conta".
3. Explique a mudança só com os motivos listados no caso, um por frase, sem acrescentar causas e sem
   ligar um motivo ao outro. Use todos os motivos e todos os avisos listados.
4. Nunca some, subtraia ou divida os percentuais, nem diga quanto da mudança veio de cada parte.
5. Os avisos são pontos a verificar, numa frase curta no fim; nunca os apresente como causa.
6. O contexto só entra numa frase própria, sem palavras de causa como "por isso", "devido a", "porque"
   ou "explica".
7. Com o valor estável e sem motivo, diga que a variação está dentro do normal.
8. Sem base de comparação, diga isso e não compare.
9. A direção vem das palavras (subiu, caiu, acima, abaixo); nunca use sinal de menos nem hífen.
10. Não mencione nada que não esteja no caso: nada de bandeira, geração própria, tarifa ou tributos se
    o caso não trouxer.
11. No máximo 4 frases, em português simples. Título curto, sem algarismos.
""".strip()

# Palavras que só podem aparecer se o caso trouxer o assunto
GD = re.compile(r'gera[cç][aã]o pr[oó]pria|gerar a pr[oó]pria|solar|painel|pain[eé]is|fotovoltaic|gera[cç][aã]o distribu',
                re.IGNORECASE)
BANDEIRA = re.compile(r'bandeira', re.IGNORECASE)
CONTA_SOZINHA = re.compile(r'(?<!\w)a conta\b', re.IGNORECASE)
FIM_DE_FRASE = re.compile(r'[.!?](?=\s|$)')


def _formatado(numero: dict) -> str:
    """O valor como aparece no texto por regra: R$, kWh ou % inteiro, sempre sem sinal."""
    if numero['unidade'] == 'BRL':
        return reais(numero['valor'])
    if numero['unidade'] == 'kWh':
        return kwh(numero['valor'])
    return _percentual(numero['valor'])


def _sentido(atual: float, anterior: float) -> str:
    return 'subiu' if atual > anterior else 'caiu'


def pode_redigir(fatos: dict) -> bool:
    """Sem mês analisado ou sem valor da conta do mês, só o texto por regra (não há situação a redigir)."""
    return fatos['mes_analisado'] is not None and fatos['valor_conta_mes'] is not None


class Caso:
    """Marcadores e descrição do caso, a partir das mesmas decisões do texto por regra."""

    def __init__(self, fatos: dict) -> None:
        self.f = fatos
        self.titulo, self.frases, self.numeros = redigir(fatos)
        contexto = [frase for tipo, frase in self.frases if tipo == 'contexto']
        motivos = ' '.join(frase for tipo, frase in self.frases if tipo == 'motivo')
        self.com_media = any('média' in frase for frase in contexto)
        self.gd_contexto = next((frase for frase in contexto if 'geração própria' in frase), None)
        self.com_bandeira = 'bandeira' in motivos
        self.com_gd = self.gd_contexto is not None or 'gd_conectada' in fatos['motivos']
        self.marcadores = self._marcadores()

    def _marcadores(self) -> dict[str, str]:
        f = self.f
        m = {n['nome']: _formatado(n) for n in self.numeros}
        m['mes_analisado'] = mes_texto(f['mes_analisado'])
        if f['mes_ano_anterior']:
            m['mes_ano_anterior'] = mes_texto(f['mes_ano_anterior'])
        if self.com_bandeira:
            m['bandeira_ano_anterior'] = bandeira(f['bandeira_ano_anterior'])
            m['bandeira_mes'] = bandeira(f['bandeira_mes'])
        if self.com_gd:
            m['mes_conexao_gd'] = mes_texto(f['mes_conexao_gd'])
        if self.com_media:
            m['base_media'] = _base_media(f['meses_na_media'])
        if 'troca_medidor' in f['avisos']:
            m['mes_troca_medidor'] = mes_texto(f['mes_troca_medidor'])
        if 'faturas_em_aberto' in f['avisos']:
            m['faturas_em_aberto_qtd'] = str(f['faturas_em_aberto_qtd'])
        return m

    # ---------- o caso em palavras, com marcadores ----------

    def situacao(self) -> str:
        f, m = self.f, self.marcadores
        if f['direcao_valor_conta'] is None:
            return ('o valor da conta de {mes_analisado} foi {valor_conta_mes}; não há o mesmo mês do ano '
                    'anterior para comparar.')
        if 'variacao_valor_conta' not in m:
            return 'o valor da conta de {mes_analisado} ({valor_conta_mes}) ficou igual a {mes_ano_anterior} ({valor_conta_ano_anterior}).'
        lado = 'acima' if f['valor_conta_mes'] > f['valor_conta_ano_anterior'] else 'abaixo'
        frase = ('o valor da conta de {mes_analisado} ({valor_conta_mes}) ficou {variacao_valor_conta} '
                 f'{lado} de {{mes_ano_anterior}} ({{valor_conta_ano_anterior}})')
        if f['direcao_valor_conta'] == 'estável':
            return frase + ', uma variação dentro do normal; não há mudança a explicar.'
        return frase + '.'

    def _bandeira(self) -> str:
        return (', com a bandeira passando de {bandeira_ano_anterior} para {bandeira_mes} (detalhe do preço, '
                'não é um motivo à parte)') if self.com_bandeira else ''

    def motivos(self) -> list[str]:
        f, itens = self.f, []
        for motivo in f['motivos']:
            if motivo in ('consumo_subiu', 'consumo_caiu'):
                itens.append(f"o consumo {f['direcao_consumo_ano_anterior']} {{variacao_consumo_ano_anterior}}, "
                             'de {consumo_ano_anterior} para {consumo_mes}.')
            elif motivo in ('preco_kwh_subiu', 'preco_kwh_caiu'):
                itens.append(f"o preço médio por kWh {_sentido(f['preco_kwh_mes'], f['preco_kwh_ano_anterior'])} "
                             '{variacao_preco_kwh}, de {preco_kwh_ano_anterior} para {preco_kwh_mes}'
                             f'{self._bandeira()}.')
            elif motivo == 'consumo_e_preco_kwh':
                consumo = _sentido(f['consumo_mes_kwh'], f['consumo_ano_anterior_kwh'])
                preco = _sentido(f['preco_kwh_mes'], f['preco_kwh_ano_anterior'])
                itens.append(f'o consumo {consumo} {{variacao_consumo_ano_anterior}} (de {{consumo_ano_anterior}} '
                             f'para {{consumo_mes}}) e o preço médio por kWh {preco} {{variacao_preco_kwh}}'
                             f'{self._bandeira()}; diga os dois lado a lado, numa frase só.')
            else:
                itens.append('a unidade passou a gerar a própria energia em {mes_conexao_gd}.')
        if not itens and f['direcao_valor_conta'] in ('subiu', 'caiu'):
            itens.append('nenhum fator identificado nos dados explica a mudança; diga isso, sem sugerir causas.')
        return itens

    def contexto(self) -> list[str]:
        itens = []
        if self.com_media:
            lado = 'acima' if self.f['direcao_consumo_media'] == 'subiu' else 'abaixo'
            itens.append(f'o consumo de {{mes_analisado}} ({{consumo_mes}}) ficou {{desvio_consumo_media}} {lado} '
                         'da {base_media} ({media_consumo}).')
        if self.gd_contexto:
            itens.append('a unidade tem geração própria desde {mes_conexao_gd}, já presente no mesmo mês do ano '
                         'anterior.' if 'já presente' in self.gd_contexto
                         else 'a unidade passou a ter geração própria em {mes_conexao_gd}.')
        return itens

    def avisos(self) -> list[str]:
        f, itens = self.f, []
        if 'leitura_estimada' in f['avisos']:
            meses = [nome for nome, estimada in (('{mes_analisado}', f['leitura_estimada_mes']),
                                                  ('{mes_ano_anterior}', f['leitura_estimada_ano_anterior']))
                     if estimada]
            itens.append(f"a leitura de {' e de '.join(meses)} foi estimada.")
        if 'troca_medidor' in f['avisos']:
            itens.append('houve troca de medidor em {mes_troca_medidor}.')
        if 'faturas_em_aberto' in f['avisos']:
            # Plural decidido aqui: o modelo copia "fatura(s)" ou erra a concordância
            itens.append('há {faturas_em_aberto_qtd} fatura em aberto, de {faturas_em_aberto_valor}.'
                         if f['faturas_em_aberto_qtd'] == 1
                         else 'há {faturas_em_aberto_qtd} faturas em aberto, somando {faturas_em_aberto_valor}.')
        if 'preco_kwh_fora_do_padrao' in f['avisos']:
            itens.append('o preço por kWh deste mês está fora do padrão; vale conferir a fatura.')
        return itens

    def instrucoes(self) -> str:
        def lista(itens: list[str]) -> str:
            return '\n'.join(f'- {item}' for item in itens) if itens else '- nenhum'
        return (f'{INSTRUCOES_UNIDADE}\n\nCaso desta unidade (decidido pelo código; não acrescente nada):\n'
                f'Situação: {self.situacao()}\n'
                f'Motivos (use todos, um por frase):\n{lista(self.motivos())}\n'
                f'Contexto (opcional, frase própria, sem palavra de causa):\n{lista(self.contexto())}\n'
                f'Avisos (pontos a verificar, numa frase curta no fim):\n{lista(self.avisos())}')

    # ---------- depois da IA ----------

    def numeros_chave(self) -> list[str]:
        """Valores que precisam aparecer no texto: o valor da conta e um por motivo e por aviso."""
        f, m = self.f, self.marcadores
        chaves = [m['valor_conta_mes']]
        for motivo in f['motivos']:
            if motivo in ('consumo_subiu', 'consumo_caiu'):
                chaves.append(m['variacao_consumo_ano_anterior'])
            elif motivo in ('preco_kwh_subiu', 'preco_kwh_caiu'):
                chaves.append(m['variacao_preco_kwh'])
            elif motivo == 'consumo_e_preco_kwh':
                chaves += [m['variacao_consumo_ano_anterior'], m['variacao_preco_kwh']]
            else:
                chaves.append(m['mes_conexao_gd'])
        if 'leitura_estimada' in f['avisos']:
            chaves += [m['mes_analisado']] if f['leitura_estimada_mes'] else []
            chaves += [m['mes_ano_anterior']] if f['leitura_estimada_ano_anterior'] else []
        if 'troca_medidor' in f['avisos']:
            chaves.append(m['mes_troca_medidor'])
        if 'faturas_em_aberto' in f['avisos']:
            chaves.append(m['faturas_em_aberto_valor'])
        return chaves

    def conferir(self, texto: str) -> list[str]:
        """Problemas do texto da IA; lista vazia quando ele pode ir para a tela."""
        problemas = [f'falta {chave}' for chave in self.numeros_chave() if not aparece(chave, texto)]
        if 'preco_kwh_fora_do_padrao' in self.f['avisos'] and 'padrão' not in texto:
            problemas.append('falta o aviso de preço fora do padrão')
        if len(FIM_DE_FRASE.findall(texto)) > MAXIMO_FRASES:
            problemas.append('mais de 4 frases')
        if '−' in texto or '-' in texto:
            problemas.append('sinal ou hífen')
        internos = [nome for nome in (*MOTIVOS, *AVISOS, *self.marcadores) if nome in texto]
        if internos or '{' in texto or '}' in texto:
            problemas.append(f'identificador interno ou chave: {internos}')
        if BANDEIRA.search(texto) and not self.com_bandeira:
            problemas.append('bandeira sem bandeira no caso')
        if self.com_bandeira and not BANDEIRA.search(texto):
            problemas.append('bandeira do caso sem a palavra "bandeira"')
        # O contexto da média e o da GD são frases próprias: juntos, soariam como causa um do outro
        if any('média' in frase and GD.search(frase) for frase in frases(texto)):
            problemas.append('média e geração própria na mesma frase')
        if GD.search(texto) and not self.com_gd:
            problemas.append('geração própria sem GD no caso')
        if CONTA_SOZINHA.search(texto):
            problemas.append('"a conta" sem "o valor da"')
        return problemas

    def numeros_no_texto(self, texto: str) -> list[dict]:
        """Os números do caso cujo valor formatado aparece no texto, na ordem do texto por regra."""
        return [n for n in self.numeros if aparece(_formatado(n), texto)]


def frases(texto: str) -> list[str]:
    """Frases do texto, cortadas no ponto final (o '.' do milhar, como em 'R$ 2.357,68', não corta)."""
    return [f.strip() for f in FIM_DE_FRASE.split(texto) if f.strip()]


def aparece(valor: str, texto: str) -> bool:
    """O valor como número inteiro no texto: '4%' não casa dentro de '24%', nem '52 kWh' em '152 kWh'."""
    return re.search(rf'(?<![\d.,]){re.escape(valor)}(?![\d])', texto) is not None
