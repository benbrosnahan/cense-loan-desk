// Cense Loan Desk — the smallest .xlsx that opens everywhere. Created with Claude Code.
//
// The app only ever writes spreadsheets and never reads one, so this replaces SheetJS with a
// stored ZIP of a few XML parts: nothing to patch on npm and nothing to fetch at export time,
// so a download also works offline. Text is always a literal t="str" cell and there is no way
// to emit an <f> element, so a nickname like =HYPERLINK(...) stays text.

export type Cell = string | number | null;
export type SheetData = { name: string; rows: Cell[][]; widths: number[] };

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  }
  return ~c >>> 0;
}

const le = (n: number, size: 2 | 4) =>
  Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 255);

function zip(files: [name: string, xml: string][]): ArrayBuffer {
  const enc = new TextEncoder();
  const body: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, xml] of files) {
    const path = enc.encode(name);
    const data = enc.encode(xml);
    // Version 2.0, UTF-8 names, stored, 1980-01-01, CRC, both sizes, name length, no extra.
    const common = [
      ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2),
      ...le(crc32(data), 4), ...le(data.length, 4), ...le(data.length, 4),
      ...le(path.length, 2), ...le(0, 2),
    ];
    const local = Uint8Array.from([...le(0x04034b50, 4), ...common]);
    body.push(local, path, data);
    directory.push(
      Uint8Array.from([
        ...le(0x02014b50, 4), ...le(20, 2), ...common,
        ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4),
      ]),
      path
    );
    offset += local.length + path.length + data.length;
  }
  const size = directory.reduce((s, c) => s + c.length, 0);
  const end = Uint8Array.from([
    ...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2),
    ...le(files.length, 2), ...le(files.length, 2),
    ...le(size, 4), ...le(offset, 4), ...le(0, 2),
  ]);
  const out = new Uint8Array(offset + size + end.length);
  let at = 0;
  for (const part of [...body, ...directory, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
}

function esc(s: string): string {
  return s
    .replace(/[^\t\n\x20-퟿-�\u{10000}-\u{10ffff}]/gu, "") // not legal in XML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetXml({ rows, widths }: SheetData): string {
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w + 0.83203125}" customWidth="1"/>`)
    .join("");
  const data = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
          if (typeof v === "string") return `<c r="${ref}" t="str"><v>${esc(v)}</v></c>`;
          return "";
        })
        .join("");
      return cells && `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<worksheet xmlns="${MAIN}"><cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>`;
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006";
const CT = "application/vnd.openxmlformats-officedocument.spreadsheetml";
const STYLES =
  '<fonts count="1"><font><sz val="12"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>';

export function buildXlsx(sheets: SheetData[]): ArrayBuffer {
  const n = sheets.length;
  const each = (f: (i: number) => string) => sheets.map((_, i) => f(i + 1)).join("");
  return zip([
    [
      "[Content_Types].xml",
      `${HEAD}<Types xmlns="${PKG}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>${each(
        (i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="${CT}.worksheet+xml"/>`
      )}</Types>`,
    ],
    [
      "_rels/.rels",
      `${HEAD}<Relationships xmlns="${PKG}/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${HEAD}<Relationships xmlns="${PKG}/relationships">${each(
        (i) => `<Relationship Id="rId${i}" Type="${REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`
      )}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", `${HEAD}<styleSheet xmlns="${MAIN}">${STYLES}</styleSheet>`],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, HEAD + sheetXml(s)]),
  ]);
}
