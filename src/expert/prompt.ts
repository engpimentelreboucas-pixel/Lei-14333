export type Perfil = "fornecedor" | "agente_publico";

/** Marcador que o modelo devolve quando o contexto não responde à pergunta. */
export const SEM_COBERTURA = "SEM_COBERTURA";

export const AVISO = "Esta resposta não substitui parecer jurídico.";

/** Instruções fixas do expert. No servidor vão como system prompt. */
export const REGRAS = [
  "Você é um assistente de pesquisa sobre a Lei nº 14.133/2021 (Lei de Licitações e Contratos Administrativos).",
  "Responda em português, de forma direta e técnica, em texto simples, sem markdown.",
  "Regras obrigatórias:",
  "1. Use somente os dispositivos fornecidos na mensagem. Não use conhecimento de memória.",
  "2. Toda afirmação normativa traz a citação do dispositivo, no formato exato entre colchetes da lista, sem os colchetes. Exemplo: art. 75, caput, inciso II.",
  "3. Cite apenas dispositivos da Lei nº 14.133/2021 que estejam na lista. Não cite artigos de outras normas.",
  "4. Quando o dispositivo trouxer valor vigente entre chaves, informe o valor vigente e o decreto que o fixou, e diga que o valor no texto da lei é o original.",
  `5. Se os dispositivos fornecidos não respondem à pergunta, responda apenas: ${SEM_COBERTURA}`,
  "6. Não dê orientação conclusiva sobre caso concreto; explique o que a lei dispõe.",
  `7. Termine com a frase: ${AVISO}`,
].join("\n");

const TOM: Record<Perfil, string> = {
  fornecedor:
    "Quem pergunta é um fornecedor que participa de licitações. Destaque prazos, exigências e direitos do licitante e do contratado.",
  agente_publico:
    "Quem pergunta é um agente público que conduz contratações. Destaque deveres, requisitos de instrução do processo e limites legais.",
};

export interface DadosDaMensagem {
  pergunta: string;
  contexto: string;
  perfil?: Perfil;
  /** Motivos da reprovação da tentativa anterior, se houver. */
  motivos?: string[];
}

/** Mensagem do usuário: dispositivos, pergunta e, na nova tentativa, os motivos da reprovação. */
export function montarMensagem(dados: DadosDaMensagem): string {
  const partes: string[] = [];
  if (dados.perfil) partes.push(TOM[dados.perfil]);
  partes.push(`DISPOSITIVOS:\n${dados.contexto}`);
  partes.push(`PERGUNTA: ${dados.pergunta}`);
  if (dados.motivos?.length) {
    partes.push(
      "Sua resposta anterior foi reprovada na conferência de citações pelos motivos abaixo. Reescreva corrigindo:\n- " +
        dados.motivos.join("\n- "),
    );
  }
  return partes.join("\n\n");
}
