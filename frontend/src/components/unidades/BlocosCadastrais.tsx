import { Gauge, SunMedium } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { Cadastro, GeracaoDistribuida, Medidor } from '@/types/unidades'
import { formatarData } from '@/utils/datas'
import { formatarIndicador, formatarNome } from '@/utils/formatacao'
import ListaDados from './ListaDados'

const NAO_INFORMADO = 'Não informado'
const leitura = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const potencia = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

/** Bloco 1: quem é o cliente e onde está a UC. */
export function BlocoCadastro({ cadastro: c }: { cadastro: Cadastro }) {
  return (
    <Card titulo="Cadastro" aria-label="Cadastro">
      <ListaDados
        itens={[
          { rotulo: 'Titular', valor: formatarNome(c.nome_titular) },
          { rotulo: 'CPF/CNPJ', valor: c.cpf_cnpj_mascarado },
          // Telefone fica de fora: não há fonte na Gold e viria null em todas as UCs.
          {
            rotulo: 'Endereço',
            valor: `${formatarNome(c.logradouro)}, ${c.numero} · ${formatarNome(c.bairro)}, ${formatarNome(c.municipio)} – ${c.uf}`,
          },
          { rotulo: 'CEP', valor: c.cep ?? NAO_INFORMADO },
          {
            rotulo: 'Classe e subgrupo',
            valor: `${formatarNome(c.classe)} · ${c.subgrupo_tarifario}`,
          },
          { rotulo: 'Alimentador', valor: c.alimentador },
          {
            rotulo: 'Ligada em',
            valor: c.data_ligacao ? formatarData(c.data_ligacao) : 'Não informada',
          },
        ]}
      />
    </Card>
  )
}

/** Bloco 6: medidor ativo e a última leitura registrada. */
export function BlocoMedidor({ medidor }: { medidor: Medidor | null }) {
  if (!medidor) {
    return (
      <Card titulo="Medidor" aria-label="Medidor">
        <EmptyState
          icone={<Gauge size={26} strokeWidth={1.5} />}
          titulo="Sem medidor ativo"
          descricao="Não há medidor ativo cadastrado para esta unidade."
        />
      </Card>
    )
  }
  const ultima = medidor.ultima_leitura
  return (
    <Card titulo="Medidor" aria-label="Medidor">
      <ListaDados
        className="sm:grid-cols-1"
        itens={[
          { rotulo: 'Número', valor: medidor.id_medidor },
          { rotulo: 'Tipo e modelo', valor: `${formatarNome(medidor.tipo)} · ${medidor.modelo}` },
          { rotulo: 'Instalado em', valor: formatarData(medidor.data_instalacao) },
          {
            rotulo: 'Última leitura',
            valor: ultima ? (
              <span className="flex flex-wrap items-center gap-2">
                {/* Valor exato do registrador, para conferir com o visor do medidor. */}
                {`${leitura.format(ultima.leitura_kwh)} kWh em ${formatarData(ultima.data)}`}
                <Badge variante={ultima.tipo_leitura === 'ESTIMADA' ? 'alerta' : 'neutro'}>
                  {formatarNome(ultima.tipo_leitura)}
                </Badge>
              </span>
            ) : (
              'Sem leitura registrada'
            ),
          },
        ]}
      />
    </Card>
  )
}

/** Bloco 7: geração distribuída (painel solar etc.). O bloco inteiro é null quando a UC não tem. */
export function BlocoGeracao({ gd }: { gd: GeracaoDistribuida | null }) {
  if (!gd) {
    return (
      <Card titulo="Geração distribuída" aria-label="Geração distribuída">
        <EmptyState
          icone={<SunMedium size={26} strokeWidth={1.5} />}
          titulo="Sem geração distribuída"
          descricao="Esta unidade não tem painel solar ou outra geração própria cadastrada."
        />
      </Card>
    )
  }
  return (
    <Card titulo="Geração distribuída" aria-label="Geração distribuída">
      <ListaDados
        className="sm:grid-cols-1"
        itens={[
          { rotulo: 'Potência instalada', valor: `${potencia.format(gd.potencia_kwp)} kWp` },
          // Código de domínio da Gold: formatarNome estragaria a sigla ("UC" → "Uc").
          { rotulo: 'Modalidade', valor: gd.modalidade },
          { rotulo: 'Conectada em', valor: formatarData(gd.data_conexao) },
          {
            rotulo: 'Energia injetada (média mensal)',
            valor: formatarIndicador(gd.energia_injetada_media_mensal),
          },
        ]}
      />
      <p className="mt-3 text-legenda text-ink-2">
        Média do cadastro da GD, não a geração medida no período.
      </p>
    </Card>
  )
}
