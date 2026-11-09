/**
 * Ingestão: texto compilado da norma -> JSON de dispositivos.
 *
 * Uso: npm run ingerir
 * O texto-fonte é gerado a partir do PDF com: pdftotext -layout L14133.pdf corpus/fontes/lei-14133.txt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parsearLei } from "../src/corpus/parser.js";
import type { Norma } from "../src/corpus/tipos.js";

const FONTE = "corpus/fontes/lei-14133.txt";
const SAIDA = "corpus/gerado/lei-14133.json";

const dispositivos = parsearLei(readFileSync(FONTE, "utf8"));

const norma: Norma = {
  id: "lei-14133-2021",
  tipo: "lei",
  numero: "14.133",
  ano: 2021,
  nome: "Lei de Licitações e Contratos Administrativos",
  esfera: "federal",
  fonte: "Texto compilado do Planalto (PDF fornecido em 2026-11-09)",
  compiladoEm: "2026-11-09",
  dispositivos,
};

writeFileSync(SAIDA, JSON.stringify(norma, null, 1) + "\n");

const porTipo: Record<string, number> = {};
const porStatus: Record<string, number> = {};
for (const d of dispositivos) {
  porTipo[d.tipo] = (porTipo[d.tipo] ?? 0) + 1;
  porStatus[d.status] = (porStatus[d.status] ?? 0) + 1;
}
const artigosVigentes = dispositivos.filter((d) => d.tipo === "artigo" && d.vigente).length;
console.log(`Dispositivos: ${dispositivos.length}`);
console.log("Por tipo:", porTipo);
console.log("Por status:", porStatus);
console.log(`Artigos vigentes: ${artigosVigentes}`);
console.log(`Gravado em ${SAIDA}`);
