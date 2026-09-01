// Writes lead records to CSV or XLSX.

import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";

const COLUMNS = [
  { key: "name", header: "Business Name", width: 32 },
  { key: "niche", header: "Niche", width: 22 },
  { key: "state", header: "State", width: 16 },
  { key: "city", header: "City", width: 18 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "website", header: "Website", width: 28 },
  { key: "email", header: "Email", width: 24 },
  { key: "address", header: "Address", width: 36 },
  { key: "rating", header: "Rating", width: 10 },
  { key: "reviewCount", header: "Reviews", width: 10 },
  { key: "ratingSource", header: "Rating Source", width: 18 },
  { key: "decisionMaker", header: "Decision Maker", width: 26 },
  { key: "decisionMakerTitle", header: "Decision Maker Title", width: 26 },
  { key: "decisionMakerLinkedIn", header: "Decision Maker LinkedIn", width: 40 },
  { key: "decisionMakerConfidence", header: "DM Confidence", width: 14 },
  { key: "painPoint", header: "Likely Pain Point", width: 60 },
  { key: "pitchAngle", header: "Suggested Pitch Angle", width: 50 },
  { key: "signals", header: "Signals", width: 36 },
  { key: "osmLink", header: "Source (OSM)", width: 40 },
];

// Flatten the top decision-maker match onto derived columns.
const DERIVED = {
  decisionMaker: (lead) => lead.decisionMakers?.[0]?.name ?? "",
  decisionMakerTitle: (lead) => lead.decisionMakers?.[0]?.title ?? "",
  decisionMakerLinkedIn: (lead) => lead.decisionMakers?.[0]?.url ?? "",
  decisionMakerConfidence: (lead) => {
    const c = lead.decisionMakers?.[0]?.confidence;
    return typeof c === "number" ? `${Math.round(c * 100)}%` : "";
  },
};

function toRow(lead) {
  const row = {};
  for (const col of COLUMNS) {
    row[col.key] = DERIVED[col.key] ? DERIVED[col.key](lead) : lead[col.key] ?? "";
  }
  return row;
}

export async function writeCsv(leads, path) {
  await writeFile(path, csvString(leads), "utf8"); // BOM included for Excel compatibility
}

function buildWorkbook(leads) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "leadgen-cli";
  wb.created = new Date();
  const ws = wb.addWorksheet("Leads");

  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const lead of leads) {
    ws.addRow(toRow(lead));
  }
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };
  return wb;
}

export async function writeXlsx(leads, path) {
  const wb = buildWorkbook(leads);
  await wb.xlsx.writeFile(path);
}

// Build CSV text (with Excel-friendly BOM) for the given leads.
export function csvString(leads) {
  const records = leads.map(toRow);
  const csv = stringify(records, {
    header: true,
    columns: COLUMNS.map((c) => ({ key: c.key, header: c.header })),
  });
  return "\uFEFF" + csv;
}

// Return a downloadable buffer + metadata for the given format (no disk write).
export async function leadsToBuffer(leads, format) {
  const fmt = (format || "csv").toLowerCase();
  if (fmt === "xlsx") {
    const wb = buildWorkbook(leads);
    const buffer = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buffer),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "leads.xlsx",
    };
  }
  return {
    buffer: Buffer.from(csvString(leads), "utf8"),
    contentType: "text/csv; charset=utf-8",
    filename: "leads.csv",
  };
}

// Dispatch on file extension or explicit format.
export async function writeLeads(leads, path, format) {
  const fmt = (format || (path.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv")).toLowerCase();
  if (fmt === "xlsx") {
    await writeXlsx(leads, path);
  } else {
    await writeCsv(leads, path);
  }
  return fmt;
}
