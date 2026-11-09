import { readFileSync } from "node:fs";
import type { Dispositivo, Norma } from "./tipos.js";

/** Corpus em memória de uma norma, com acesso por id e por artigo. */
export class Corpus {
  readonly norma: Norma;
  private readonly porId = new Map<string, Dispositivo>();
  private readonly filhosDe = new Map<string, Dispositivo[]>();

  constructor(norma: Norma) {
    this.norma = norma;
    for (const d of norma.dispositivos) {
      this.porId.set(d.id, d);
      if (d.idPai) {
        const lista = this.filhosDe.get(d.idPai);
        if (lista) lista.push(d);
        else this.filhosDe.set(d.idPai, [d]);
      }
    }
  }

  static deArquivo(caminho: string): Corpus {
    return new Corpus(JSON.parse(readFileSync(caminho, "utf8")) as Norma);
  }

  get dispositivos(): readonly Dispositivo[] {
    return this.norma.dispositivos;
  }

  obter(id: string): Dispositivo | undefined {
    return this.porId.get(id);
  }

  filhos(id: string): readonly Dispositivo[] {
    return this.filhosDe.get(id) ?? [];
  }

  /** Cadeia do artigo até o dispositivo, inclusive. */
  cadeia(id: string): Dispositivo[] {
    const cadeia: Dispositivo[] = [];
    let atual = this.porId.get(id);
    while (atual) {
      cadeia.unshift(atual);
      atual = atual.idPai ? this.porId.get(atual.idPai) : undefined;
    }
    return cadeia;
  }
}
