/**
 * Minimal, dependency-light .xlsx reader: returns cell VALUES only (no formatting).
 * Robust to comments, data validation, drawings etc. because it only reads the
 * workbook, shared strings and the chosen worksheet XML.
 *   const sheet = await readSheet(buffer, "Products");   // -> { name, get(row, col), rowCount, colCount }
 */
const JSZip = require("jszip");

const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
               : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()]);
const texts = xml => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join("");
const attr = (s, name) => { const m = s.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
const colNum = letters => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

async function readSheet(buffer, wantedName) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch (e) { throw Object.assign(new Error("This file is not a valid .xlsx workbook."), { status: 400 }); }
  const read = async p => { const f = zip.file(p); return f ? f.async("string") : null; };
  const wb = await read("xl/workbook.xml");
  if (!wb) throw Object.assign(new Error("This file is not a valid .xlsx workbook."), { status: 400 });
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: decode(attr(m[0], "name") || ""), rid: attr(m[0], "r:id") }));
  const sheet = sheets.find(s => s.name.toLowerCase() === String(wantedName).toLowerCase()) || sheets[0];
  if (!sheet) throw Object.assign(new Error("No worksheet found."), { status: 400 });
  const rels = await read("xl/_rels/workbook.xml.rels") || "";
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => attr(r, "Id") === sheet.rid);
  let target = rel ? attr(rel, "Target") : "worksheets/sheet1.xml";
  target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  const xml = await read(target);
  if (!xml) throw Object.assign(new Error("Worksheet data not found."), { status: 400 });
  const sst = await read("xl/sharedStrings.xml");
  const shared = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1])) : [];

  const cells = new Map(); let rowCount = 0, colCount = 0;
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], "r"); if (!ref) continue;
    const [, letters, rowStr] = ref.match(/^([A-Z]+)(\d+)$/) || [];
    if (!letters) continue;
    const r = Number(rowStr), c = colNum(letters), t = attr(m[1], "t"), body = m[2] || "";
    const vm = body.match(/<v>([\s\S]*?)<\/v>/);
    let v = null;
    if (t === "s") v = vm ? shared[Number(vm[1])] ?? null : null;
    else if (t === "inlineStr") v = texts(body);
    else if (t === "str" || t === "e") v = vm ? decode(vm[1]) : null;
    else if (t === "b") v = vm ? vm[1] === "1" : null;
    else if (vm) { const n = Number(vm[1]); v = isNaN(n) ? decode(vm[1]) : n; }
    if (v === "" || v == null) continue;
    cells.set(`${r}:${c}`, v);
    rowCount = Math.max(rowCount, r); colCount = Math.max(colCount, c);
  }
  return { name: sheet.name, rowCount, colCount, get: (r, c) => cells.has(`${r}:${c}`) ? cells.get(`${r}:${c}`) : null };
}

module.exports = { readSheet };
