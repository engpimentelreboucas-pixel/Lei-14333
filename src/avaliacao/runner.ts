import type { Corpus } from "../corpus/corpus.js";
import type { BuscaHibrida } from "../busca/hibrida.js";

export interface PerguntaDeReferencia {
  id: string;
  perfil: "fornecedor" | "agente_publico";
  pergunta: string;
  /** Ids dos artigos que precisam aparecer na busca. Basta um para contar acerto. */
  artigosEsperados: string[];
}

export interface ResultadoPergunta {
  id: string;
  pergunta: string;
  /** Posição (1 = primeiro) do primeiro artigo esperado nos resultados; null se ausente. */
  posicao: number | null;
  artigosRetornados: string[];
}

export interface RelatorioDeBusca {
  total: number;
  /** Proporção de perguntas com artigo esperado na 1ª posição e entre os k primeiros. */
  acertoNoPrimeiro: number;
  acertoNosK: number;
  k: number;
  resultados: ResultadoPergunta[];
}

/** Garante que o gabarito aponta para artigos que existem e estão vigentes. */
export function validarGabarito(corpus: Corpus, perguntas: PerguntaDeReferencia[]): string[] {
  const erros: string[] = [];
  for (const p of perguntas) {
    for (const id of p.artigosEsperados) {
      const d = corpus.obter(id);
      if (!d) erros.push(`${p.id}: ${id} não existe no corpus`);
      else if (!d.vigente) erros.push(`${p.id}: ${id} não está vigente`);
    }
  }
  return erros;
}

/**
 * Avalia a etapa de busca: para cada pergunta, o artigo esperado aparece entre os k
 * primeiros artigos distintos retornados?
 */
export async function avaliarBusca(
  busca: BuscaHibrida,
  perguntas: PerguntaDeReferencia[],
  k = 5,
): Promise<RelatorioDeBusca> {
  const resultados: ResultadoPergunta[] = [];
  for (const p of perguntas) {
    const achados = await busca.buscar(p.pergunta, { k: k * 4 });
    const artigos: string[] = [];
    for (const r of achados) {
      if (!artigos.includes(r.dispositivo.idArtigo)) artigos.push(r.dispositivo.idArtigo);
    }
    const topo = artigos.slice(0, k);
    const indice = topo.findIndex((a) => p.artigosEsperados.includes(a));
    resultados.push({
      id: p.id,
      pergunta: p.pergunta,
      posicao: indice === -1 ? null : indice + 1,
      artigosRetornados: topo,
    });
  }
  const total = resultados.length;
  return {
    total,
    acertoNoPrimeiro: total ? resultados.filter((r) => r.posicao === 1).length / total : 0,
    acertoNosK: total ? resultados.filter((r) => r.posicao !== null).length / total : 0,
    k,
    resultados,
  };
}
