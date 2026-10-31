"""V1c: resumo da UC por regra (plano B do resumo por IA), só a partir dos fatos de fatos_unidade.

Três partes, nesta ordem: a situação do valor da conta contra o mesmo mês do ano anterior, os motivos
(uma frase cada, sem ligar um ao outro) e os avisos no fim, como pontos a verificar. O contexto (média,
GD fora do período) entra numa frase própria, sem palavra de causa, só se couber nas 4 frases.
Números no formato da tela e sem sinal: a direção vem das palavras.
"""
from datetime import datetime

from app.services.unidade_service import _base_media, _percentual, mes_texto

MAXIMO_FRASES = 4
TITULOS = {'subiu': 'Valor da conta subiu', 'caiu': 'Valor da conta caiu', 'estável': 'Valor da conta estável'}
BANDEIRAS = {'VERDE': 'verde', 'AMARELA': 'amarela', 'VERMELHA P1': 'vermelha patamar 1',
             'VERMELHA P2': 'vermelha patamar 2'}
# Rótulo de cada número: a direção vai no rótulo, porque o valor sai sem sinal.
ROTULO_VARIACAO = {'subiu': 'Aumento', 'caiu': 'Queda'}
ROTULO_MEDIA = {'subiu': 'acima', 'caiu': 'abaixo'}
# Motivos cuja frase fala da variação do consumo: com eles, a frase da média sai
MOTIVOS_DE_CONSUMO = ('consumo_subiu', 'consumo_caiu', 'consumo_e_preco_kwh')


def _milhar(valor: float, casas: int) -> str:
    texto = f'{valor:,.{casas}f}'
    return texto.replace(',', 'X').replace('.', ',').replace('X', '.')


def reais(valor: float) -> str:
    """'R$ 2.357,68', como as faturas na tela."""
    return f'R$ {_milhar(valor, 2)}'


def kwh(valor: float) -> str:
    """'3.681 kWh' ou '82,83 kWh': por extenso, até 2 casas (formatarEnergiaCompleta do front)."""
    texto = _milhar(valor, 2)
    return f"{texto.rstrip('0').rstrip(',')} kWh"


def bandeira(nome: str) -> str:
    return BANDEIRAS.get(nome, nome.lower())


def _juntar(itens: list[str]) -> str:
    return itens[0] if len(itens) == 1 else f"{', '.join(itens[:-1])} e {itens[-1]}"


class _Redacao:
    """Junta as frases (com o tipo de cada uma) e registra cada número que entra no texto."""

    def __init__(self, fatos: dict) -> None:
        self.f, self.numeros = fatos, {}

    def numero(self, nome: str, rotulo: str, valor: float, unidade: str, periodo: str) -> float:
        self.numeros.setdefault(nome, {'nome': nome, 'rotulo': rotulo, 'valor': valor, 'unidade': unidade,
                                       'periodo_referencia': periodo})
        return valor

    def valor_conta(self) -> str:
        f = self.f
        return reais(self.numero('valor_conta_mes', 'Valor da conta', f['valor_conta_mes'], 'BRL',
                                 f['mes_analisado']))

    def valor_conta_anterior(self) -> str:
        f = self.f
        return reais(self.numero('valor_conta_ano_anterior', 'Valor da conta no mesmo mês do ano anterior',
                                 f['valor_conta_ano_anterior'], 'BRL', f['mes_ano_anterior']))

    def consumo_mes(self) -> str:
        f = self.f
        return kwh(self.numero('consumo_mes', 'Consumo do mês', f['consumo_mes_kwh'], 'kWh', f['mes_analisado']))

    def situacao(self) -> list[tuple[str, str]]:
        """(a) O valor da conta contra o mesmo mês do ano anterior; sem base, diz que não compara."""
        f = self.f
        mes = mes_texto(f['mes_analisado'])
        if f['valor_conta_mes'] is None:
            return [('situacao', f'Não há valor da conta registrado para {mes}.')]
        direcao, valor = f['direcao_valor_conta'], self.valor_conta()
        if direcao is None:
            return [('situacao', f'O valor da conta de {mes} foi de {valor}.'),
                    ('situacao', 'Não há o mesmo mês do ano anterior para comparar.')]
        # Estável também diz o sentido, pela comparação dos dois valores (o percentual vem sem sinal)
        sentido = 'subiu' if f['valor_conta_mes'] > f['valor_conta_ano_anterior'] else 'caiu'
        pct = f['variacao_valor_conta_pct']
        if _percentual(pct) == '0%':
            comparacao, final = 'igual a', ''
        else:
            self.numero('variacao_valor_conta', f'{ROTULO_VARIACAO[sentido]} do valor da conta', pct, '%',
                        f['mes_analisado'])
            comparacao = f"{_percentual(pct)} {'acima' if sentido == 'subiu' else 'abaixo'} de"
            final = ', uma variação dentro do normal' if direcao == 'estável' else ''
        anterior = f'{mes_texto(f["mes_ano_anterior"])} ({self.valor_conta_anterior()})'
        return [('situacao', f'O valor da conta de {mes} foi de {valor}, {comparacao} {anterior}{final}.')]

    def variacao_consumo(self) -> str:
        """'subiu 19%' ou 'caiu 5%', com o sentido pela comparação dos dois consumos (o % vem sem sinal)."""
        f = self.f
        sentido = 'subiu' if f['consumo_mes_kwh'] > f['consumo_ano_anterior_kwh'] else 'caiu'
        pct = self.numero('variacao_consumo_ano_anterior', f'{ROTULO_VARIACAO[sentido]} do consumo',
                          f['variacao_consumo_ano_anterior_pct'], '%', f['mes_analisado'])
        return 'ficou igual' if _percentual(pct) == '0%' else f'{sentido} {_percentual(pct)}'

    def consumos(self) -> str:
        f = self.f
        anterior = kwh(self.numero('consumo_ano_anterior', 'Consumo no mesmo mês do ano anterior',
                                   f['consumo_ano_anterior_kwh'], 'kWh', f['mes_ano_anterior']))
        return f'de {anterior} para {self.consumo_mes()}'

    def variacao_preco(self) -> tuple[str, str]:
        """('subiu 3%', sentido) do preço médio por kWh; o sentido decide se a bandeira entra como detalhe."""
        f = self.f
        sentido = 'subiu' if f['preco_kwh_mes'] > f['preco_kwh_ano_anterior'] else 'caiu'
        pct = self.numero('variacao_preco_kwh', f'{ROTULO_VARIACAO[sentido]} do preço médio por kWh',
                          f['variacao_preco_kwh_pct'], '%', f['mes_analisado'])
        return ('ficou igual' if _percentual(pct) == '0%' else f'{sentido} {_percentual(pct)}'), sentido

    def bandeira_do_preco(self, sentido: str) -> str:
        """A bandeira é detalhe do preço, e só quando anda no mesmo sentido dele."""
        f = self.f
        if (f['direcao_bandeira'], sentido) not in (('mais_cara', 'subiu'), ('mais_barata', 'caiu')):
            return ''
        return (f", com a bandeira passando de {bandeira(f['bandeira_ano_anterior'])} para "
                f"{bandeira(f['bandeira_mes'])}")

    def motivo(self, motivo: str) -> str:
        f = self.f
        if motivo in ('consumo_subiu', 'consumo_caiu'):
            return f'O consumo {self.variacao_consumo()}, {self.consumos()}.'
        if motivo in ('preco_kwh_subiu', 'preco_kwh_caiu'):
            variacao, sentido = self.variacao_preco()
            anterior = reais(self.numero('preco_kwh_ano_anterior', 'Preço médio por kWh no mesmo mês do ano anterior',
                                         f['preco_kwh_ano_anterior'], 'BRL', f['mes_ano_anterior']))
            atual = reais(self.numero('preco_kwh_mes', 'Preço médio por kWh', f['preco_kwh_mes'], 'BRL',
                                      f['mes_analisado']))
            return f'O preço médio por kWh {variacao}, de {anterior} para {atual}{self.bandeira_do_preco(sentido)}.'
        if motivo == 'consumo_e_preco_kwh':
            # Os dois percentuais lado a lado, sem somar nem dividir a mudança do valor entre eles
            consumo = f'O consumo {self.variacao_consumo()} ({self.consumos()})'
            variacao, sentido = self.variacao_preco()
            return f'{consumo} e o preço médio por kWh {variacao}{self.bandeira_do_preco(sentido)}.'
        return f"A unidade passou a gerar a própria energia em {mes_texto(f['mes_conexao_gd'])}."

    def motivos(self) -> list[tuple[str, str]]:
        """(b) Uma frase por motivo; sem motivo e com o valor mudando, diz que nada nos dados explica.

        Valor estável sem motivo: nenhuma frase, porque "uma variação dentro do normal" já diz isso.
        """
        f = self.f
        if f['motivos']:
            return [('motivo', self.motivo(m)) for m in f['motivos']]
        if f['direcao_valor_conta'] in ('subiu', 'caiu'):
            return [('motivo', 'Nenhum fator identificado nos dados explica essa mudança.')]
        return []

    def contexto_media(self) -> list[tuple[str, str]]:
        """Consumo contra a média, só sem motivo que fale do consumo (junto de "subiu 27%" soaria contraditório)."""
        f = self.f
        direcao = f['direcao_consumo_media']
        if direcao not in ROTULO_MEDIA or set(MOTIVOS_DE_CONSUMO) & set(f['motivos']):
            return []
        consumo = self.consumo_mes()
        self.numero('desvio_consumo_media', f'Consumo {ROTULO_MEDIA[direcao]} da média',
                    f['desvio_consumo_media_pct'], '%', f['mes_analisado'])
        # Mesma conta e mesmo arredondamento do texto do veredito, sobre o consumo e a média da tela
        desvio = _percentual((f['consumo_mes_kwh'] / f['media_consumo_kwh'] - 1) * 100)
        media = kwh(self.numero('media_consumo', 'Média de consumo', f['media_consumo_kwh'], 'kWh',
                                f['periodo_media']))
        return [('contexto', f"O consumo de {mes_texto(f['mes_analisado'])} ({consumo}) ficou "
                             f"{desvio} {ROTULO_MEDIA[direcao]} da {_base_media(f['meses_na_media'])} ({media}).")]

    def contexto_gd(self) -> list[tuple[str, str]]:
        """GD que existe e não é motivo, numa frase própria; conectada depois do mês analisado, não entra."""
        f = self.f
        conexao = f['mes_conexao_gd']
        if not f['tem_gd'] or conexao is None or 'gd_conectada' in f['motivos'] or conexao > f['mes_analisado']:
            return []
        if conexao <= f['mes_ano_anterior']:
            return [('contexto', f'A unidade tem geração própria desde {mes_texto(conexao)}, '
                                 'já presente no mesmo mês do ano anterior.')]
        return [('contexto', f'A unidade passou a ter geração própria em {mes_texto(conexao)}.')]

    def avisos(self) -> list[tuple[str, str]]:
        """(c) Uma frase curta no fim: pontos a verificar, nunca causa."""
        f, itens = self.f, []
        if 'leitura_estimada' in f['avisos']:
            meses = [mes_texto(m) for m, estimada in ((f['mes_analisado'], f['leitura_estimada_mes']),
                                                       (f['mes_ano_anterior'], f['leitura_estimada_ano_anterior']))
                     if estimada]
            itens.append(f'a leitura de {meses[0]} foi estimada' if len(meses) == 1
                         else f'as leituras de {_juntar(meses)} foram estimadas')
        if 'troca_medidor' in f['avisos']:
            itens.append(f"houve troca de medidor em {mes_texto(f['mes_troca_medidor'])}")
        if 'faturas_em_aberto' in f['avisos']:
            qtd = f['faturas_em_aberto_qtd']
            valor = reais(self.numero('faturas_em_aberto_valor', 'Faturas em aberto (valor somado)',
                                      f['faturas_em_aberto_valor'], 'BRL', f['mes_analisado']))
            itens.append(f'há 1 fatura em aberto, de {valor}' if qtd == 1
                         else f'há {qtd} faturas em aberto, somando {valor}')
        if 'preco_kwh_fora_do_padrao' in f['avisos']:
            itens.append('o preço por kWh deste mês está fora do padrão; vale conferir a fatura')
        return [('aviso', f'Pontos a verificar: {_juntar(itens)}.')] if itens else []


def redigir(fatos: dict) -> tuple[str, list[tuple[str, str]], list[dict]]:
    """Título, frases com o tipo de cada uma (situacao, motivo, contexto, aviso) e os números usados."""
    if fatos['mes_analisado'] is None:
        return 'Sem dados no período', [('situacao', 'Não há dados desta unidade no período analisado.')], []
    r = _Redacao(fatos)
    # No máximo 2 motivos (consumo e preço, ou consumo e GD, que não decompõe): situação, motivos e avisos
    # sempre cabem nas 4 frases; o contexto entra só se sobrar espaço.
    situacao, motivos, avisos = r.situacao(), r.motivos(), r.avisos()
    frases = situacao + motivos
    # Os números dos avisos entram por último, para a lista seguir a ordem do texto
    numeros_avisos = {n: r.numeros.pop(n) for n in ('faturas_em_aberto_valor',) if n in r.numeros}
    for contexto in (r.contexto_media, r.contexto_gd):       # na ordem de prioridade, se couber
        antes = dict(r.numeros)
        candidatas = contexto()
        if len(frases) + len(candidatas) + len(avisos) <= MAXIMO_FRASES:
            frases += candidatas
        else:
            r.numeros = antes                                 # contexto que não coube não deixa número
    frases += avisos
    direcao = fatos['direcao_valor_conta']
    titulo = TITULOS[direcao] if direcao else 'Sem base de comparação'
    return titulo, frases, [*r.numeros.values(), *numeros_avisos.values()]


def texto_por_regra_unidade(fatos: dict, metadados: dict, agora: datetime | None = None) -> dict:
    """Resumo por regra já no formato da resposta do /ia/insight (titulo, texto, numeros_utilizados...)."""
    titulo, frases, numeros = redigir(fatos)
    return {
        'titulo': titulo,
        'texto': ' '.join(frase for _, frase in frases),
        'numeros_utilizados': numeros,
        'gerado_em': (agora or datetime.now()).astimezone(),
        'metadados': {**metadados, 'observacoes': list(metadados.get('observacoes', []))},
    }
