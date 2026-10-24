"""Gera um banco local com dados fictícios nas tabelas da Gold.

Uso: python -m app.db.seed [--ucs 400] [--semente 2026]

Recarrega somente o schema `gold`, numa única transação (se algo falhar, nada muda).
O schema `portal` (ordens de inspeção) é criado se faltar e nunca é apagado.
Os domínios e formatos seguem as Silvers de data-engineering/bronze-to-silver.
"""
import argparse
import json
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Engine, insert, text

from app.db.base import GOLD_SCHEMA, PORTAL_SCHEMA, GoldBase, PortalBase
from app.models import gold, portal  # noqa: F401

FUSO = timezone(timedelta(hours=-3))  # Recife, sem horário de verão
PRIMEIRO_MES = date(2022, 7, 1)
MESES = 48                            # jul/2022 a jun/2026, fim do histórico das Silvers
LOTE = 5_000

# Município -> prefixo do alimentador (ALIMENTADOR_MUNICIPIO do silver_cadastro) e bairros fictícios
REGIOES = {
    "RECIFE": ("REC", ["BOA VISTA", "CASA AMARELA", "BOA VIAGEM", "AFOGADOS", "VÁRZEA"]),
    "JABOATÃO DOS GUARARAPES": ("JAB", ["PIEDADE", "CANDEIAS", "PRAZERES"]),
    "OLINDA": ("OLI", ["CASA CAIADA", "RIO DOCE", "BAIRRO NOVO"]),
    "PAULISTA": ("PAU", ["JANGA", "PAU AMARELO"]),
    "CAMARAGIBE": ("CAM", ["ALDEIA", "TIMBI"]),
}
CLASSES = {  # peso, subgrupo (CLASSE_SUBGRUPO), dígitos do documento, faixa de consumo mensal (kWh)
    "RESIDENCIAL": (0.80, "B1", 11, (120, 380)),
    "COMERCIAL": (0.11, "B3", 14, (700, 3_000)),
    "INDUSTRIAL": (0.03, "A4", 14, (5_000, 20_000)),
    "RURAL": (0.04, "B2", 11, (180, 600)),
    "PODER PUBLICO": (0.02, "B3", 14, (900, 4_000)),
}
MODELO_TIPO = {
    "CG-500": "ELETROMECANICO", "EM-1200": "ELETROMECANICO", "EM-1400": "ELETROMECANICO",
    "EL-2200": "ELETRONICO", "EL-3000": "ELETRONICO", "NX-700": "ELETRONICO",
    "SM-4100": "SMART", "SM-4500": "SMART", "IQ-900": "SMART",
}
TIPOS_LEITURA = {"REAL": 0.90, "ESTIMADA": 0.07, "MEDIA": 0.02, "AUTENTICADA": 0.01}
BANDEIRAS = {"VERDE": (0.60, 0.0), "AMARELA": (0.20, 0.0189),  # peso, adicional R$/kWh
             "VERMELHA P1": (0.12, 0.0446), "VERMELHA P2": (0.08, 0.0789)}
TARIFA_ANO = [0.62, 0.66, 0.70, 0.74]                           # R$/kWh por ano do histórico
SAZONALIDADE = [1.00, 0.97, 1.00, 1.03, 1.06, 1.10, 1.12, 1.10, 1.05, 0.98, 0.93, 0.95]  # jul..jun
MODALIDADES_GD = ["GERACAO NA PROPRIA UC", "AUTOCONSUMO REMOTO", "GERACAO COMPARTILHADA"]
TIPOS_IRREGULARIDADE = ["BY-PASS", "MEDIDOR ADULTERADO", "LIGACAO CLANDESTINA", "DESVIO DE ENERGIA"]
TIPOS_OCORRENCIA = ["FALTA DE ENERGIA", "DANO EM EQUIPAMENTO", "OSCILACAO", "SOBRECARGA", "FIO PARTIDO"]
CAUSAS = ["CLIMATICA", "NAO IDENTIFICADA", "SOBRECARGA", "VEGETACAO", "TERCEIROS", "FALHA DE EQUIPAMENTO",
          "NAO INFORMADA"]
CANAIS = ["TELEFONE", "APP", "WHATSAPP", "SITE", "PRESENCIAL"]
ASSUNTO_SUBASSUNTOS = {
    "DANO ELETRICO": ["VISTORIA", "RESSARCIMENTO"],
    "FALTA DE ENERGIA": ["INTERRUPCAO PARCIAL", "INTERRUPCAO TOTAL", "OSCILACAO"],
    "FATURA": ["CONTESTACAO", "SEGUNDA VIA", "VALOR ALTO", "PARCELAMENTO"],
    "GERACAO DISTRIBUIDA": ["VISTORIA", "HOMOLOGACAO", "CREDITOS"],
    "LIGACAO NOVA": ["SOLICITACAO", "VISTORIA", "PRAZO"],
    "RELIGACAO": ["URGENCIA", "APOS PAGAMENTO"],
}
MOTIVOS_FILA = [
    "Queda de consumo sem geração distribuída",
    "Consumo acima do mesmo mês do ano anterior",
    "Leitura estimada no último mês",
    "Consumo zerado em meses consecutivos",
    "Variação atípica entre meses consecutivos",
    "Histórico de religação",
    "Medidor sem manutenção há mais de 5 anos",
    "Consumo abaixo da média da classe",
]
STATUS_TRIAGEM = {"ELEGIVEL": 0.90, "EM_ANALISE": 0.06, "DESCLASSIFICADO": 0.04}
CONFIANCA_EVIDENCIA = {"ALTA": 0.35, "MEDIA": 0.40, "BAIXA": 0.20, "INDETERMINADA": 0.05}


def _mes(i: int) -> date:
    total = PRIMEIRO_MES.year * 12 + PRIMEIRO_MES.month - 1 + i
    return date(total // 12, total % 12 + 1, 1)


def _brl(valor: float) -> Decimal:
    return Decimal(str(round(valor, 2)))


def _escolher(rng: random.Random, pesos: dict) -> str:
    nomes = list(pesos)
    return rng.choices(nomes, weights=[p[0] if isinstance(p, tuple) else p for p in pesos.values()])[0]


def _instante(rng: random.Random, dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, rng.randint(6, 21), rng.randint(0, 59), tzinfo=FUSO)


def _alimentadores() -> dict[tuple[str, str], str]:
    """Cada bairro é atendido por um alimentador do seu município (formato ALM-REC-001)."""
    mapa = {}
    for municipio, (prefixo, bairros) in REGIOES.items():
        for i, bairro in enumerate(bairros):
            mapa[(municipio, bairro)] = f"ALM-{prefixo}-{i // 2 + 1:03d}"
    return mapa


def gerar(n_ucs: int = 400, semente: int = 2026) -> dict[type, list[dict]]:
    rng = random.Random(semente)
    alimentadores = _alimentadores()
    regioes = list(alimentadores)
    dados: dict[type, list[dict]] = {modelo: [] for modelo in (
        gold.UnidadeConsumidora, gold.Medidor, gold.Fatura, gold.Leitura, gold.GeracaoDistribuida,
        gold.Inspecao, gold.OcorrenciaRede, gold.Atendimento, gold.AtendimentoHistorico,
        gold.DecFecAlimentadorMes, gold.FilaPerdasAuditoria, gold.FilaPerdas)}
    seq = {nome: 0 for nome in ("medidor", "fatura", "inspecao", "ocorrencia", "atendimento")}

    def proximo(nome: str) -> int:
        seq[nome] += 1
        return seq[nome]

    ucs = []
    for i in range(n_ucs):
        municipio, bairro = rng.choice(regioes)
        classe = _escolher(rng, CLASSES)
        _, subgrupo, digitos, _ = CLASSES[classe]
        uc = {
            "id_uc": f"UC{100001 + i:06d}",
            "cpf_cnpj": "".join(str(rng.randint(0, 9)) for _ in range(digitos)),
            "nome_titular": f"TITULAR FICTÍCIO {i + 1:04d}",
            "logradouro": f"RUA FICTÍCIA {rng.randint(1, 300)}",
            "numero": str(rng.randint(1, 2_000)),
            "bairro": bairro,
            "municipio": municipio,
            "uf": "PE",
            "cep": f"5{rng.randint(0, 6)}{rng.randint(0, 999_999):06d}" if rng.random() > 0.05 else None,
            "classe": classe,
            "subgrupo_tarifario": subgrupo,
            "alimentador": alimentadores[(municipio, bairro)],
            "data_ligacao": date(rng.randint(1990, 2021), rng.randint(1, 12), rng.randint(1, 28)),
            "status": "ATIVA",
            "latitude": Decimal(f"{-8.05 + rng.uniform(-0.15, 0.15):.6f}"),
            "longitude": Decimal(f"{-34.90 + rng.uniform(-0.12, 0.12):.6f}"),
        }
        ucs.append(uc)
        dados[gold.UnidadeConsumidora].append(uc)

    for uc in ucs:
        _gerar_uc(rng, uc, dados, proximo)

    _gerar_fila_perdas(rng, ucs, dados)
    _gerar_ocorrencias(rng, ucs, dados, proximo)
    return dados


def _gerar_fila_perdas(rng: random.Random, ucs: list[dict], dados: dict) -> None:
    for uc in ucs:
        dados[gold.FilaPerdasAuditoria].append({"id_uc": uc["id_uc"]})

    if not ucs:
        return

    escolhidas = rng.sample(ucs, k=max(1, round(len(ucs) * 0.30)))
    for uc in escolhidas:
        dados[gold.FilaPerdas].append({
            "id_uc": uc["id_uc"],
            "posicao_fila": None,
            "status_triagem": _escolher(rng, STATUS_TRIAGEM),
            "score": _brl(rng.uniform(10, 99.9)),
            "kwh_estimado": _brl(rng.uniform(80, 2_500)),
            "motivos_json": json.dumps(rng.sample(MOTIVOS_FILA, k=rng.randint(1, 3)), ensure_ascii=False),
            "confianca_evidencia": _escolher(rng, CONFIANCA_EVIDENCIA),
        })
    elegiveis = sorted(
        (linha for linha in dados[gold.FilaPerdas] if linha["status_triagem"] == "ELEGIVEL"),
        key=lambda linha: (-linha["score"], -linha["kwh_estimado"], linha["id_uc"]),
    )
    for posicao, linha in enumerate(elegiveis, start=1):
        linha["posicao_fila"] = posicao


def _gerar_uc(rng: random.Random, uc: dict, dados: dict, proximo) -> None:
    """Medidores, GD, leituras, faturas, inspeções e atendimentos de uma UC."""
    id_uc, classe = uc["id_uc"], uc["classe"]
    base_kwh = rng.uniform(*CLASSES[classe][3])

    # Medidor ativo; ~10% trocaram de medidor dentro do histórico.
    modelos = list(MODELO_TIPO)
    instalacao = max(uc["data_ligacao"], date(2015, 1, 1)) + timedelta(days=rng.randint(0, 400))
    instalacao = min(instalacao, PRIMEIRO_MES - timedelta(days=1))
    troca = _mes(rng.randint(6, MESES - 6)) + timedelta(days=rng.randint(0, 20)) if rng.random() < 0.10 else None
    medidores = []
    for inicio, fim in ([(instalacao, troca), (troca, None)] if troca else [(instalacao, None)]):
        modelo = rng.choice(modelos)
        medidor = {"id_medidor": f"MD{proximo('medidor'):07d}", "id_uc": id_uc, "modelo": modelo,
                   "tipo": MODELO_TIPO[modelo], "data_instalacao": inicio, "data_retirada": fim,
                   "data_ultima_manutencao": None, "status": "RETIRADO" if fim else "ATIVO"}
        medidores.append(medidor)
        dados[gold.Medidor].append(medidor)

    # Geração distribuída: ~10% das residenciais/comerciais; reduz o consumo faturado após a conexão.
    conexao_gd = None
    if classe in ("RESIDENCIAL", "COMERCIAL") and rng.random() < 0.10:
        potencia = round(rng.uniform(3, 75 if classe == "COMERCIAL" else 12), 2)
        conexao_gd = _mes(rng.randint(0, MESES - 2)) + timedelta(days=rng.randint(0, 27))
        dados[gold.GeracaoDistribuida].append({
            "id_uc": id_uc, "potencia_kwp": _brl(potencia), "data_conexao": conexao_gd,
            "modalidade": rng.choice(MODALIDADES_GD),
            "energia_injetada_kwh_media_mensal": _brl(potencia * rng.uniform(105, 130)),
        })

    leitura_acumulada = {m["id_medidor"]: rng.uniform(1_000, 30_000) for m in medidores}
    if troca:
        leitura_acumulada[medidores[-1]["id_medidor"]] = 0.0     # medidor novo parte do zero
    for i in range(MESES):
        mes = _mes(i)
        referencia = mes.strftime("%Y-%m")
        data_leitura = mes + timedelta(days=rng.randint(24, 27))
        medidor = next(m for m in reversed(medidores) if m["data_instalacao"] <= data_leitura)
        tendencia = 1 - 0.012 * (i / 12)                        # volume caindo ~1,2% ao ano
        fator_gd = 0.55 if conexao_gd and data_leitura >= conexao_gd else 1.0
        consumo = round(base_kwh * SAZONALIDADE[i % 12] * tendencia * fator_gd * rng.uniform(0.9, 1.1), 2)
        primeira = troca is not None and medidor is medidores[-1] and leitura_acumulada[medidor["id_medidor"]] == 0
        anterior = None if primeira else round(leitura_acumulada[medidor["id_medidor"]], 2)
        atual = round((anterior or 0) + consumo, 2)
        leitura_acumulada[medidor["id_medidor"]] = atual
        tipo_leitura = _escolher(rng, TIPOS_LEITURA)
        dados[gold.Leitura].append({
            "id_medidor": medidor["id_medidor"], "mes_referencia": referencia, "id_uc": id_uc,
            "data_leitura": data_leitura, "leitura_anterior": _brl(anterior) if anterior is not None else None,
            "leitura_atual": _brl(atual), "consumo_kwh": _brl(atual - (anterior or 0)),
            "tipo_leitura": tipo_leitura, "flag_primeira_leitura_pos_troca": False,
            "flag_leitura_anterior_ausente": anterior is None,
            "flag_leitura_estimada": tipo_leitura in ("ESTIMADA", "MEDIA"),
            "flag_consumo_negativo": False, "flag_consumo_inconsistente": False,
        })

        bandeira = _escolher(rng, BANDEIRAS)
        tarifa = (TARIFA_ANO[i // 12] + BANDEIRAS[bandeira][1]) * (1.05 if classe == "COMERCIAL" else 1.0)
        valor_energia = _brl(consumo * tarifa)
        tributos = _brl(float(valor_energia) * 0.28)
        emissao = date(mes.year + mes.month // 12, mes.month % 12 + 1, 1) + timedelta(days=rng.randint(0, 3))
        vencimento = emissao + timedelta(days=12)
        aberta = rng.random() < (0.30 if i == MESES - 1 else 0.07)
        dados[gold.Fatura].append({
            "id_fatura": f"FT{proximo('fatura'):08d}", "id_uc": id_uc, "mes_referencia": referencia,
            "valor_energia": valor_energia, "tributos": tributos, "valor_total": valor_energia + tributos,
            "bandeira_tarifaria": bandeira, "data_emissao": emissao, "data_vencimento": vencimento,
            "data_pagamento": None if aberta else vencimento + timedelta(days=rng.randint(-10, 15)),
            "status": "EM ABERTO" if aberta else "PAGA",
            "flag_total_inconsistente": False, "flag_status_pagamento_inconsistente": False,
        })

    # Histórico de inspeções da fonte (abas ago-set, out-nov e dez de 2025).
    if rng.random() < 0.04:
        data = date(2025, rng.randint(8, 12), rng.randint(1, 28))
        confirmada = rng.random() < 0.4
        dados[gold.Inspecao].append({
            "id_inspecao": f"INS{proximo('inspecao'):06d}", "id_uc": id_uc, "data": data,
            "inspetor": f"INSPETOR FICTÍCIO {rng.randint(1, 8):02d}",
            "resultado": "IRREGULARIDADE CONFIRMADA" if confirmada else "SEM IRREGULARIDADE",
            "tipo_irregularidade": rng.choice(TIPOS_IRREGULARIDADE) if confirmada else None,
            "kwh_recuperado": _brl(rng.uniform(100, 3_000)) if confirmada else Decimal("0.00"),
            **{f: False for f in ("flag_recuperacao_negativa", "flag_resultado_tipo_inconsistente",
                                  "flag_confirmada_sem_tipo", "flag_recuperacao_sem_irregularidade",
                                  "flag_inspecao_fora_historico", "flag_data_fora_periodo_aba")},
        })

    # Atendimentos com histórico de eventos.
    for _ in range(rng.choices([0, 1, 2], weights=[0.85, 0.12, 0.03])[0]):
        assunto = rng.choices(list(ASSUNTO_SUBASSUNTOS), weights=[1, 3, 4, 1, 1, 1])[0]
        canal = rng.choice(CANAIS)
        abertura = _instante(rng, _mes(rng.randint(0, MESES - 1)) + timedelta(days=rng.randint(0, 27)))
        fechamento = abertura + timedelta(hours=rng.randint(1, 120))
        protocolo = f"AT{proximo('atendimento'):08d}"
        dados[gold.Atendimento].append({
            "protocolo": protocolo, "id_uc": id_uc, "canal": canal, "assunto": assunto,
            "subassunto": rng.choice(ASSUNTO_SUBASSUNTOS[assunto]), "data_abertura": abertura,
            "data_fechamento": fechamento,
            "nota_satisfacao": Decimal(str(rng.randint(2, 10) / 2)) if rng.random() < 0.7 else None,
            "flag_fechamento_antes_abertura": False, "flag_assunto_subassunto_inconsistente": False,
        })
        acoes = ["ABERTURA", "ANALISE"] + (["DESPACHO"] if rng.random() < 0.5 else []) + [
            "RETORNO AO CLIENTE", "ENCERRAMENTO"]
        passo = (fechamento - abertura) / (len(acoes) - 1)
        for sequencia, acao in enumerate(acoes, start=1):
            dados[gold.AtendimentoHistorico].append({
                "protocolo": protocolo, "sequencia": sequencia, "data": abertura + passo * (sequencia - 1),
                "acao": acao, "canal": canal, "flag_sequencia_inconsistente": False,
                "flag_evento_fora_atendimento": False, "flag_canal_diferente_atendimento": False,
            })


def _gerar_ocorrencias(rng: random.Random, ucs: list[dict], dados: dict, proximo) -> None:
    """Interrupções por UC (uma linha por UC afetada) e o DEC/FEC mensal por alimentador."""
    por_alimentador: dict[str, list[dict]] = {}
    for uc in ucs:
        por_alimentador.setdefault(uc["alimentador"], []).append(uc)
    for alimentador, ucs_alim in sorted(por_alimentador.items()):
        for i in range(MESES):
            mes = _mes(i)
            interrupcoes, minutos = 0, 0
            for _ in range(rng.choices([0, 1, 2, 3], weights=[0.35, 0.35, 0.2, 0.1])[0]):
                abertura = _instante(rng, mes + timedelta(days=rng.randint(0, 27)))
                duracao = rng.randint(1_441, 2_000) if rng.random() < 0.02 else rng.randint(10, 600)
                tipo, causa = rng.choice(TIPOS_OCORRENCIA), rng.choice(CAUSAS)
                for uc in rng.sample(ucs_alim, k=rng.randint(1, max(1, len(ucs_alim) // 2))):
                    dados[gold.OcorrenciaRede].append({
                        "id_ocorrencia": f"OC{proximo('ocorrencia'):07d}", "id_uc": uc["id_uc"],
                        "alimentador": alimentador, "tipo": tipo, "causa": causa,
                        "data_abertura": abertura, "data_encerramento": abertura + timedelta(minutes=duracao),
                        "duracao_min": duracao, "flag_longa_duracao": duracao > 1_440,
                        "flag_duracao_teto": duracao >= 2_880, "flag_sobreposicao": False,
                        "flag_duracao_inconsistente": False, "flag_encerramento_antes_abertura": False,
                        "flag_alimentador_inconsistente": False,
                    })
                    interrupcoes += 1
                    minutos += duracao
            total = len(ucs_alim)
            dados[gold.DecFecAlimentadorMes].append({
                "alimentador": alimentador, "mes_referencia": mes.strftime("%Y-%m"),
                "municipio": ucs_alim[0]["municipio"], "ucs_total": total, "interrupcoes": interrupcoes,
                "horas_interrupcao": _brl(minutos / 60),
                "dec": Decimal(f"{minutos / 60 / total:.4f}"), "fec": Decimal(f"{interrupcoes / total:.4f}"),
            })


def preparar_schemas(engine: Engine) -> None:
    """Cria os schemas e as tabelas do portal que faltarem. Nunca apaga nada do portal."""
    with engine.begin() as conn:
        for schema in (GOLD_SCHEMA, PORTAL_SCHEMA):
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        PortalBase.metadata.create_all(conn)


def recarregar_gold(engine: Engine, dados: dict[type, list[dict]]) -> dict[str, int]:
    """Recria somente as tabelas do schema gold e insere os dados, numa única transação."""
    preparar_schemas(engine)
    with engine.begin() as conn:
        GoldBase.metadata.drop_all(conn)
        GoldBase.metadata.create_all(conn)
        for modelo, linhas in dados.items():
            for inicio in range(0, len(linhas), LOTE):
                conn.execute(insert(modelo), linhas[inicio:inicio + LOTE])
    return {modelo.__tablename__: len(linhas) for modelo, linhas in dados.items()}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Gera dados fictícios nas tabelas da Gold (schema gold).")
    parser.add_argument("--ucs", type=int, default=400, help="quantidade de unidades consumidoras")
    parser.add_argument("--semente", type=int, default=2026, help="semente do gerador (mesma semente, mesmos dados)")
    args = parser.parse_args(argv)

    from app.db.session import engine

    contagem = recarregar_gold(engine, gerar(args.ucs, args.semente))
    print(f"Gold recarregada em {engine.url.render_as_string(hide_password=True)}:")
    for tabela, linhas in contagem.items():
        print(f"  {GOLD_SCHEMA}.{tabela}: {linhas:,} linhas")


if __name__ == "__main__":
    main()
