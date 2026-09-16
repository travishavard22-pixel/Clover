/**
 * CSV export for inventory. RFC 4180: fields containing commas, quotes or newlines are quoted and
 * embedded quotes doubled. Values starting with a formula trigger (= + - @) are prefixed with an
 * apostrophe so spreadsheets never execute them.
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join(" > ") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\r\n") + "\r\n";
}

export type CsvItemRow = {
  sku: string;
  title: string;
  status: string;
  brand: string | null;
  model: string | null;
  categoryPath: string[];
  conditionGrade: string | null;
  quantity: number;
  acquisitionCost: number | null;
  estimatedValue: number | null;
  listPrice: number | null;
  floorPrice: number | null;
  soldPrice: number | null;
  fees: number | null;
  shippingCost: number | null;
  soldMarketplace: string | null;
  storageLocation: string | null;
  acquiredAt: Date | null;
  listedAt: Date | null;
  soldAt: Date | null;
  createdAt: Date;
  notes: string | null;
};

export const CSV_HEADERS = [
  "SKU",
  "Title",
  "Status",
  "Brand",
  "Model",
  "Category",
  "Condition",
  "Quantity",
  "Acquisition cost",
  "Estimated value",
  "List price",
  "Floor price",
  "Sold price",
  "Fees",
  "Shipping cost",
  "Sold on",
  "Storage location",
  "Acquired",
  "Listed",
  "Sold",
  "Created",
  "Notes",
];

const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

export function itemsToCsv(items: CsvItemRow[]): string {
  return toCsv(
    CSV_HEADERS,
    items.map((i) => [
      i.sku,
      i.title,
      i.status,
      i.brand,
      i.model,
      i.categoryPath,
      i.conditionGrade,
      i.quantity,
      dollars(i.acquisitionCost),
      dollars(i.estimatedValue),
      dollars(i.listPrice),
      dollars(i.floorPrice),
      dollars(i.soldPrice),
      dollars(i.fees),
      dollars(i.shippingCost),
      i.soldMarketplace,
      i.storageLocation,
      i.acquiredAt,
      i.listedAt,
      i.soldAt,
      i.createdAt,
      i.notes,
    ]),
  );
}
