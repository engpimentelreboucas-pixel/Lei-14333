import type { Corpus } from "../corpus/corpus.js";
import type { Dispositivo } from "../corpus/tipos.js";
import type { BuscaHibrida } from "../busca/hibrida.js";
import { extrairReferencias } from "../busca/referencia.js";
import { verificarCitacoes, type CitacaoVerificada } from "../citacoes/verificador.js";
import { montarContexto } from "./contexto.js";
import type { ModeloDeLinguagem, Nivel, Uso } from "./modelo.js";
import { montarMensagem, REGRAS, SEM_COBERTURA, type Perfil } from "./prompt.js";

export type Desfecho =
  /** Resposta entregue, com todas as citações conferidas. */
  | "resposta"
  /** A busca não achou nada ou o modelo declarou que o contexto não responde. */
  | "sem_cobertura"
  /** O modelo insistiu em citação que não confere; nada é entregue. */
  | "bloqueada";

export interface RespostaDoExpert {
  desfecho: Desfecho;
  /** Texto a exibir ao usuário. */
  texto: string;
  citacoes: CitacaoVerificada[];
  /** Motivos da reprovação, quando `bloqueada`. */
  motivos: string[];
  /** Dispositivos entregues ao modelo como contexto. */
  dispositivos: Dispositivo[];
  /** Chamadas ao modelo (0 quando a busca não achou nada). */
  tentativas: number;
  nivel: Nivel | null;
  modelos: string[];
  uso: Uso;
}

export interface OpcoesDoExpert {
  /** Novas tentativas após reprovação de citação. Padrão: 1. */
  novasTentativas?: number;
  /** Dispositivos buscados. Padrão: 10. */
  k?: number;
}

const TEXTO_SEM_COBERTURA =
  "O corpus não cobre essa pergunta. O expert prefere não responder a responder de memória.";
const TEXTO_BLOQUEADA =
  "A resposta foi bloqueada porque trazia citação que não confere com o texto da lei. Reformule a pergunta.";

/**
 * Escolhe o nível do modelo. Pergunta curta que só pede o conteúdo de um dispositivo
 * citado vai para o modelo rápido; o resto, para o padrão.
 */
export function escolherNivel(pergunta: string): Nivel {
  const refs = extrairReferencias(pergunta);
  if (refs.length === 0) return "padrao";
  let resto = pergunta;
  for (const r of refs) resto = resto.replace(r.trecho, " ");
  const palavras = resto.split(/\s+/).filter((p) => p.length > 2);
  const soLeitura = /\b(o que diz|que diz|explique|explica|resuma|resumo|texto d|conte[uú]do d|qual o teor)\b/i.test(pergunta);
  return soLeitura && palavras.length <= 8 ? "rapido" : "padrao";
}

export class Expert {
  constructor(
    private readonly corpus: Corpus,
    private readonly busca: BuscaHibrida,
    private readonly modelo: ModeloDeLinguagem,
    private readonly opcoes: OpcoesDoExpert = {},
  ) {}

  async responder(pergunta: string, perfil?: Perfil): Promise<RespostaDoExpert> {
    const uso: Uso = { tokensEntrada: 0, tokensSaida: 0 };
    const modelos: string[] = [];
    const base = { citacoes: [], motivos: [], dispositivos: [], tentativas: 0, nivel: null, modelos, uso };

    const resultados = await this.busca.buscar(pergunta, { k: this.opcoes.k ?? 10 });
    if (resultados.length === 0) {
      return { ...base, desfecho: "sem_cobertura", texto: TEXTO_SEM_COBERTURA };
    }

    const contexto = montarContexto(this.corpus, resultados);
    const dispositivos = contexto.ids.map((id) => this.corpus.obter(id)!);
    const nivel = escolherNivel(pergunta);
    const limite = 1 + (this.opcoes.novasTentativas ?? 1);

    let motivos: string[] | undefined;
    let citacoes: CitacaoVerificada[] = [];
    let tentativas = 0;

    while (tentativas < limite) {
      tentativas++;
      const geracao = await this.modelo.gerar({
        sistema: REGRAS,
        mensagem: montarMensagem({ pergunta, contexto: contexto.texto, perfil, motivos }),
        // Depois de uma reprovação, a nova tentativa sempre usa o modelo padrão.
        nivel: tentativas === 1 ? nivel : "padrao",
      });
      modelos.push(geracao.modelo);
      uso.tokensEntrada += geracao.uso.tokensEntrada;
      uso.tokensSaida += geracao.uso.tokensSaida;

      if (geracao.texto.includes(SEM_COBERTURA)) {
        return { ...base, desfecho: "sem_cobertura", texto: TEXTO_SEM_COBERTURA, dispositivos, tentativas, nivel };
      }

      const verificacao = verificarCitacoes(this.corpus, geracao.texto);
      citacoes = verificacao.citacoes;
      if (verificacao.aprovada) {
        return { ...base, desfecho: "resposta", texto: geracao.texto, citacoes, dispositivos, tentativas, nivel };
      }
      motivos = verificacao.motivos;
    }

    return {
      ...base,
      desfecho: "bloqueada",
      texto: TEXTO_BLOQUEADA,
      citacoes,
      motivos: motivos ?? [],
      dispositivos,
      tentativas,
      nivel,
    };
  }
}
