import type { Corpus } from "../corpus/corpus.js";
import type { Dispositivo } from "../corpus/tipos.js";
import { ehNormaDoCorpus, extrairReferencias, resolverReferencia } from "../busca/referencia.js";

export type StatusCitacao =
  /** O dispositivo existe e está vigente. */
  | "ok"
  /** O dispositivo citado não existe na norma. */
  | "inexistente"
  /** O dispositivo existe, mas foi vetado, revogado ou teve a redação substituída. */
  | "nao_vigente"
  /** A citação é de norma que ainda não está no corpus; não pode ser conferida. */
  | "norma_fora_do_corpus";

export interface CitacaoVerificada {
  trecho: string;
  status: StatusCitacao;
  dispositivo?: Dispositivo;
  normaCitada?: string;
}

export interface Verificacao {
  /** A resposta só pode ser entregue se `aprovada` for verdadeiro. */
  aprovada: boolean;
  /** Motivos de reprovação, em linguagem para log e para nova tentativa de geração. */
  motivos: string[];
  citacoes: CitacaoVerificada[];
}

export interface OpcoesVerificacao {
  /** Exige ao menos uma citação conferida. Padrão: verdadeiro. */
  exigirCitacao?: boolean;
  /** Reprova citação de norma fora do corpus, que não pode ser conferida. Padrão: verdadeiro. */
  reprovarNormaForaDoCorpus?: boolean;
}

/**
 * Confere cada citação de dispositivo de uma resposta contra o corpus.
 * Roda depois da geração e antes de a resposta sair para o usuário.
 */
export function verificarCitacoes(
  corpus: Corpus,
  resposta: string,
  opcoes: OpcoesVerificacao = {},
): Verificacao {
  const exigir = opcoes.exigirCitacao ?? true;
  const reprovarFora = opcoes.reprovarNormaForaDoCorpus ?? true;
  const citacoes: CitacaoVerificada[] = [];
  const motivos: string[] = [];

  for (const ref of extrairReferencias(resposta)) {
    if (!ehNormaDoCorpus(ref.normaCitada, corpus.norma.numero)) {
      citacoes.push({ trecho: ref.trecho, status: "norma_fora_do_corpus", normaCitada: ref.normaCitada });
      if (reprovarFora) {
        motivos.push(`"${ref.trecho}" cita ${ref.normaCitada}, que não está no corpus e não pode ser conferida.`);
      }
      continue;
    }
    const res = resolverReferencia(corpus, ref);
    if (res.dispositivo) {
      citacoes.push({ trecho: ref.trecho, status: "ok", dispositivo: res.dispositivo });
    } else if (res.naoVigente) {
      citacoes.push({ trecho: ref.trecho, status: "nao_vigente", dispositivo: res.naoVigente });
      motivos.push(`"${ref.trecho}" existe, mas não está vigente (${res.naoVigente.status}).`);
    } else {
      citacoes.push({ trecho: ref.trecho, status: "inexistente" });
      motivos.push(`"${ref.trecho}" não existe na Lei nº ${corpus.norma.numero}.`);
    }
  }

  if (exigir && !citacoes.some((c) => c.status === "ok")) {
    motivos.push("A resposta não traz nenhuma citação conferida de dispositivo.");
  }

  return { aprovada: motivos.length === 0, motivos, citacoes };
}
