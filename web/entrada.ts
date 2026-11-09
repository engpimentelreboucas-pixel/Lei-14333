/** Ponto de entrada do núcleo para o navegador (página de teste). */
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida, type Resultado } from "../src/busca/hibrida.js";
import { verificarCitacoes } from "../src/citacoes/verificador.js";
import { montarContexto } from "../src/expert/contexto.js";
import { montarMensagem, REGRAS, SEM_COBERTURA } from "../src/expert/prompt.js";
import type { Norma } from "../src/corpus/tipos.js";

export function criar(norma: Norma) {
  const corpus = new Corpus(norma);
  const busca = new BuscaHibrida(corpus);
  return {
    corpus,
    SEM_COBERTURA,
    buscar: (consulta: string, k = 8) => busca.buscar(consulta, { k }),
    verificar: (resposta: string) => verificarCitacoes(corpus, resposta),
    /** Prompt único (regras + dispositivos + pergunta), igual ao usado no servidor. */
    prompt: (pergunta: string, resultados: Resultado[], motivos?: string[]) =>
      `${REGRAS}\n\n${montarMensagem({ pergunta, contexto: montarContexto(corpus, resultados).texto, motivos })}`,
  };
}
