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
const VALORES = "corpus/fontes/valores-decreto-12807.json";

const dispositivos = parsearLei(readFileSync(FONTE, "utf8"));

// Valores em reais atualizados por decreto: prevalecem sobre os escritos no texto da lei.
const atualizacao = JSON.parse(readFileSync(VALORES, "utf8")) as {
  norma: string;
  vigenteDesde: string;
  valores: { dispositivo: string; valor: string }[];
};
for (const v of atualizacao.valores) {
  const d = dispositivos.find((x) => x.id === v.dispositivo);
  if (!d || !d.vigente) throw new Error(`Valor atualizado aponta para dispositivo ausente ou não vigente: ${v.dispositivo}`);
  if (!/R\$/.test(d.texto)) throw new Error(`Dispositivo sem valor em reais no texto: ${v.dispositivo}`);
  d.valorAtualizado = { valor: v.valor, norma: atualizacao.norma, vigenteDesde: atualizacao.vigenteDesde };
}
// Todo dispositivo vigente que remete a decreto de atualização precisa ter valor atualizado.
const semValor = dispositivos.filter(
  (d) => d.vigente && /R\$/.test(d.texto) && d.anotacoes.some((a) => /Vide Decreto nº 12\.807/.test(a)) && !d.valorAtualizado,
);
if (semValor.length) throw new Error(`Sem valor atualizado: ${semValor.map((d) => d.id).join(", ")}`);

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
console.log(`Valores atualizados: ${atualizacao.valores.length} (${atualizacao.norma})`);
console.log(`Gravado em ${SAIDA}`);
