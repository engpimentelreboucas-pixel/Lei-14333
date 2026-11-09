import Anthropic from "@anthropic-ai/sdk";
import type { Geracao, ModeloDeLinguagem, Nivel, PedidoDeGeracao } from "./modelo.js";

/** Modelos por nível. Sobrescreva com MODELO_RAPIDO e MODELO_PADRAO no ambiente. */
const MODELOS_PADRAO: Record<Nivel, string> = {
  rapido: "claude-haiku-5-5",
  padrao: "claude-sonnet-5-5",
};

/**
 * Modelo de linguagem sobre a API do Claude.
 * A chave é lida da variável de ambiente ANTHROPIC_API_KEY; nunca fica no código.
 */
export class ModeloClaude implements ModeloDeLinguagem {
  private readonly cliente: Anthropic;
  private readonly modelos: Record<Nivel, string>;

  constructor(opcoes: { cliente?: Anthropic; modelos?: Partial<Record<Nivel, string>> } = {}) {
    if (!opcoes.cliente && !process.env.ANTHROPIC_API_KEY) {
      throw new Error("Defina a variável de ambiente ANTHROPIC_API_KEY para usar o modelo real.");
    }
    this.cliente = opcoes.cliente ?? new Anthropic();
    this.modelos = {
      rapido: opcoes.modelos?.rapido ?? process.env.MODELO_RAPIDO ?? MODELOS_PADRAO.rapido,
      padrao: opcoes.modelos?.padrao ?? process.env.MODELO_PADRAO ?? MODELOS_PADRAO.padrao,
    };
  }

  async gerar(pedido: PedidoDeGeracao): Promise<Geracao> {
    const modelo = this.modelos[pedido.nivel];
    const resposta = await this.cliente.messages.create({
      model: modelo,
      max_tokens: pedido.maxTokens ?? 1200,
      system: pedido.sistema,
      messages: [{ role: "user", content: pedido.mensagem }],
    });
    const texto = resposta.content
      .map((bloco) => (bloco.type === "text" ? bloco.text : ""))
      .join("")
      .trim();
    return {
      texto,
      modelo,
      uso: { tokensEntrada: resposta.usage.input_tokens, tokensSaida: resposta.usage.output_tokens },
    };
  }
}
