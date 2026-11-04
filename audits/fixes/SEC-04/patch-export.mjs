import fs from 'node:fs';
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, b); };
rep(`// not a comma-delimited blob. SheetJS is dynamically imported so it costs
// nothing on first paint.`.replace('// not', '// not'), `// not a comma-delimited blob. Written by ./xlsx-writer, which needs no library.`);
rep(`import { diffSnapshots } from "./storage";`, `import { diffSnapshots } from "./storage";\nimport { buildXlsx } from "./xlsx-writer";`);
rep(`async function sheetjs() {
  const XLSX = await import("xlsx");
  return XLSX;
}

`, '');
rep(`  const XLSX = await sheetjs();
  const wb = XLSX.utils.book_new();

  const rows: Row[] = [
    ["Cense Loan Desk — your loans"],`, `  const rows: Row[] = [
    ["Cense Loan Desk — your loans"],`);
rep(`  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = COL_WIDTHS.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "My loans");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(\`cense-loan-desk-\${today()}.xlsx\`, buf);`, `  download(
    \`cense-loan-desk-\${today()}.xlsx\`,
    buildXlsx([{ name: "My loans", rows, widths: COL_WIDTHS }])
  );`);
rep(`  const XLSX = await sheetjs();
  const wb = XLSX.utils.book_new();

  // Oldest first`, `  // Oldest first`);
rep(`  const wsChanges = XLSX.utils.aoa_to_sheet(changeRows);
  wsChanges["!cols"] = [
    { wch: 11 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsChanges, "What changed");

`, '');
rep(`  const wsSnaps = XLSX.utils.aoa_to_sheet(snapRows);
  wsSnaps["!cols"] = [
    { wch: 11 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSnaps, "Snapshots");

`, '');
rep(`  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  wsAll["!cols"] = [
    { wch: 11 },
    { wch: 22 },
    { wch: 26 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 15 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, "All loan rows");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(\`cense-loan-history-\${today()}.xlsx\`, buf);`, `  download(
    \`cense-loan-history-\${today()}.xlsx\`,
    buildXlsx([
      { name: "What changed", rows: changeRows, widths: [11, 22, 22, 26, 14, 24, 14, 14, 14] },
      { name: "Snapshots", rows: snapRows, widths: [11, 24, 16, 16, 20] },
      { name: "All loan rows", rows: allRows, widths: [11, 22, 26, 14, 20, 14, 15, 18] },
    ])
  );`);
fs.writeFileSync(p, s);
