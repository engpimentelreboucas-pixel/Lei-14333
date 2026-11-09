import type { Corpus } from "../corpus/corpus.js";
import type { Dispositivo } from "../corpus/tipos.js";
import { IndiceLexical, type Documento, type Pontuado } from "./lexical.js";
import { ehNormaDoCorpus, extrairReferencias, resolverReferencia } from "./referencia.js";

/**
 * Busca vetorial plugável. Em produção, implementada sobre pgvector com embeddings
 * de um provedor externo. Sem ela, a busca funciona com referência exata + lexical.
 */
export interface IndiceVetorial {
  buscar(consulta: string, k: number): Promise<Pontuado[]>;
}

export interface Resultado {
  dispositivo: Dispositivo;
  score: number;
  /** De onde veio o resultado. */
  origens: ("referencia" | "lexical" | "vetorial")[];
}

export interface OpcoesBusca {
  k?: number;
  /** Inclui redações anteriores, vetados e revogados. Padrão: só vigentes. */
  incluirNaoVigentes?: boolean;
}

const K_RRF = 60;

export class BuscaHibrida {
  private readonly lexical: IndiceLexical;

  constructor(
    private readonly corpus: Corpus,
    private readonly vetorial?: IndiceVetorial,
  ) {
    this.lexical = new IndiceLexical(corpus.dispositivos.map((d) => this.documento(d)));
  }

  /** O dispositivo é indexado com o texto dos ascendentes e os títulos da estrutura. */
  private documento(d: Dispositivo): Documento {
    const ascendentes = this.corpus
      .cadeia(d.id)
      .slice(0, -1)
      .map((a) => a.texto.slice(0, 400))
      .join(" ");
    const estrutura = [d.contexto.capitulo, d.contexto.secao, d.contexto.subsecao]
      .filter(Boolean)
      .join(" ");
    return {
      id: d.id,
      campos: [
        { texto: d.texto, peso: 3 },
        { texto: ascendentes, peso: 1 },
        { texto: estrutura, peso: 2 },
      ],
    };
  }

  async buscar(consulta: string, opcoes: OpcoesBusca = {}): Promise<Resultado[]> {
    const k = opcoes.k ?? 8;
    const aceita = (d: Dispositivo) => opcoes.incluirNaoVigentes || d.vigente;
    const acumulado = new Map<string, Resultado>();
    const somar = (id: string, score: number, origem: Resultado["origens"][number]) => {
      const d = this.corpus.obter(id);
      if (!d || !aceita(d)) return;
      const r = acumulado.get(id);
      if (r) {
        r.score += score;
        if (!r.origens.includes(origem)) r.origens.push(origem);
      } else {
        acumulado.set(id, { dispositivo: d, score, origens: [origem] });
      }
    };

    // 1. Referência exata ("art. 75, II") vence qualquer outro sinal.
    // O trecho da referência sai da consulta lexical para não gerar ruído ("75", "II").
    let consultaLivre = consulta;
    for (const ref of extrairReferencias(consulta)) {
      consultaLivre = consultaLivre.replace(ref.trecho, " ");
      if (!ehNormaDoCorpus(ref.normaCitada, this.corpus.norma.numero)) continue;
      const res = resolverReferencia(this.corpus, ref);
      const alvo = res.dispositivo ?? (opcoes.incluirNaoVigentes ? res.naoVigente : undefined);
      if (alvo) somar(alvo.id, 10, "referencia");
    }

    // 2. Lexical e vetorial, fundidos por reciprocal rank fusion.
    const profundidade = Math.max(k * 5, 40);
    this.lexical.buscar(consultaLivre, profundidade).forEach((p, i) => somar(p.id, 1 / (K_RRF + i + 1), "lexical"));
    if (this.vetorial) {
      const vet = await this.vetorial.buscar(consultaLivre.trim() || consulta, profundidade);
      vet.forEach((p, i) => somar(p.id, 1 / (K_RRF + i + 1), "vetorial"));
    }

    return [...acumulado.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}
