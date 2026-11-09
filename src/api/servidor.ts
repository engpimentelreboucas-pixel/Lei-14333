import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Expert } from "../expert/expert.js";
import type { Perfil } from "../expert/prompt.js";

const MAX_CORPO = 16 * 1024;
const MAX_PERGUNTA = 2000;

async function lerCorpo(req: IncomingMessage): Promise<string> {
  let corpo = "";
  for await (const pedaco of req) {
    corpo += pedaco;
    if (corpo.length > MAX_CORPO) throw new Error("corpo grande demais");
  }
  return corpo;
}

/**
 * API HTTP mínima do expert.
 *   GET  /saude      -> { ok: true }
 *   POST /perguntar  -> corpo { pergunta, perfil? }; devolve a resposta do expert
 * Sem autenticação nem limite de uso: não exponha na internet antes da fase de venda.
 */
export function criarServidor(expert: Expert): Server {
  return createServer(async (req, res) => {
    const enviar = (status: number, dados: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(dados));
    };
    try {
      if (req.method === "GET" && req.url === "/saude") return enviar(200, { ok: true });
      if (req.method !== "POST" || req.url !== "/perguntar") return enviar(404, { erro: "rota não encontrada" });

      let dados: { pergunta?: unknown; perfil?: unknown };
      try {
        dados = JSON.parse(await lerCorpo(req));
      } catch {
        return enviar(400, { erro: "corpo inválido: envie JSON com o campo pergunta" });
      }
      const pergunta = typeof dados.pergunta === "string" ? dados.pergunta.trim() : "";
      if (!pergunta) return enviar(400, { erro: "o campo pergunta é obrigatório" });
      if (pergunta.length > MAX_PERGUNTA) return enviar(400, { erro: `a pergunta passa de ${MAX_PERGUNTA} caracteres` });
      const perfil: Perfil | undefined =
        dados.perfil === "fornecedor" || dados.perfil === "agente_publico" ? dados.perfil : undefined;

      const r = await expert.responder(pergunta, perfil);
      return enviar(200, {
        desfecho: r.desfecho,
        texto: r.texto,
        citacoes: r.citacoes.map((c) => ({ trecho: c.trecho, status: c.status, id: c.dispositivo?.id })),
        motivos: r.motivos,
        dispositivos: r.dispositivos.map((d) => ({
          id: d.id,
          citacao: d.citacao,
          texto: d.texto,
          valorAtualizado: d.valorAtualizado,
        })),
        tentativas: r.tentativas,
        nivel: r.nivel,
        modelos: r.modelos,
        uso: r.uso,
      });
    } catch (erro) {
      console.error(erro);
      return enviar(500, { erro: "falha interna ao responder" });
    }
  });
}
