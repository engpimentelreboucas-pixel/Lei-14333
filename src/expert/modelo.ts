/** Nível do modelo: `rapido` para consultas simples, `padrao` para consulta técnica. */
export type Nivel = "rapido" | "padrao";

export interface Uso {
  tokensEntrada: number;
  tokensSaida: number;
}

export interface Geracao {
  texto: string;
  modelo: string;
  uso: Uso;
}

export interface PedidoDeGeracao {
  sistema: string;
  mensagem: string;
  nivel: Nivel;
  maxTokens?: number;
}

/** Contrato do modelo de linguagem. O expert não conhece o provedor. */
export interface ModeloDeLinguagem {
  gerar(pedido: PedidoDeGeracao): Promise<Geracao>;
}

/**
 * Modelo simulado para testes: devolve respostas programadas, em ordem, e registra os pedidos.
 */
export class ModeloSimulado implements ModeloDeLinguagem {
  readonly pedidos: PedidoDeGeracao[] = [];
  private readonly fila: string[];

  constructor(respostas: string[]) {
    this.fila = [...respostas];
  }

  async gerar(pedido: PedidoDeGeracao): Promise<Geracao> {
    this.pedidos.push(pedido);
    const texto = this.fila.shift();
    if (texto === undefined) throw new Error("ModeloSimulado: sem resposta programada");
    return { texto, modelo: `simulado-${pedido.nivel}`, uso: { tokensEntrada: 0, tokensSaida: 0 } };
  }
}
