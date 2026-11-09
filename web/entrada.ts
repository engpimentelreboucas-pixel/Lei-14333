/** Ponto de entrada do núcleo para o navegador (página de teste). */
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";
import { verificarCitacoes } from "../src/citacoes/verificador.js";
import type { Norma } from "../src/corpus/tipos.js";

export function criar(norma: Norma) {
  const corpus = new Corpus(norma);
  const busca = new BuscaHibrida(corpus);
  return {
    corpus,
    buscar: (consulta: string, k = 8) => busca.buscar(consulta, { k }),
    verificar: (resposta: string) => verificarCitacoes(corpus, resposta),
  };
}
