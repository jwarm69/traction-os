export type ImportedSignal = {
  metric: string;
  value: number;
  period: string;
  note: string;
  source: string;
};
/** RFC-style quoted fields and embedded newlines. Reject the entire import on bad data. */
export function parseSignalsCsv(input: string): ImportedSignal[] {
  if (!input || input.length > 50000)
    throw new Error('Use a CSV file of at most 50,000 characters.');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell.trim());
      cell = '';
      closed = false;
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (char === '"') {
      if (cell || closed)
        throw new Error(
          'Invalid quotation in CSV. Quote the whole field and double internal quotes.',
        );
      quoted = true;
    } else {
      if (closed && !/\s/.test(char))
        throw new Error('Unexpected characters after a quoted CSV field.');
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 201)
    throw new Error('CSV must contain a header and 1–200 data rows.');
  const headers = rows[0].map((h) => h.toLowerCase());
  for (const name of ['metric', 'value', 'period'])
    if (headers.filter((h) => h === name).length !== 1)
      throw new Error(`CSV requires exactly one ${name} column.`);
  return rows.slice(1).map((columns, index) => {
    if (columns.length !== headers.length)
      throw new Error(
        `CSV row ${index + 2} has an unexpected number of fields.`,
      );
    const get = (name: string) => columns[headers.indexOf(name)] || '';
    const metric = get('metric'),
      raw = get('value'),
      value = Number(raw),
      period = get('period');
    if (
      !metric ||
      metric.length > 120 ||
      !period ||
      period.length > 120 ||
      !raw ||
      !Number.isFinite(value) ||
      value < 0
    )
      throw new Error(
        `CSV row ${index + 2} needs a metric, non-negative numeric value, and period.`,
      );
    if (get('note').length > 1000 || get('source').length > 500)
      throw new Error(`CSV row ${index + 2} has an oversized note or source.`);
    return { metric, value, period, note: get('note'), source: get('source') };
  });
}
