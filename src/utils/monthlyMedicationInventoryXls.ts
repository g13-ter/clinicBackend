import type { MedicationInventoryReportRow } from "../services/report.service";

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatDate = (value: Date | null): string => value
  ? value.toISOString().slice(0, 10)
  : "";

const preferredSections = [
  "Tablet Form",
  "Nebulization",
  "Emergency Medications",
  "External Medications",
  "Topical Medications",
  "Non-Medication Treatments",
  "Medical Supplies",
  "Others",
];

export const buildMonthlyMedicationInventoryXls = (
  rows: MedicationInventoryReportRow[],
  startDate: Date,
  endDate: Date,
  clinicName: string,
  options: { visibleSections?: string[]; includeEmpty?: boolean } = {},
): Buffer => {
  const grouped = new Map<string, MedicationInventoryReportRow[]>();
  for (const row of rows) {
    grouped.set(row.inventorySection, [...(grouped.get(row.inventorySection) ?? []), row]);
  }
  const customSections = [...grouped.keys()]
    .filter((section) => !preferredSections.includes(section))
    .sort((left, right) => left.localeCompare(right));
  const defaultSections = [...preferredSections, ...customSections];
  const visibleSections = options.visibleSections?.length ? options.visibleSections : defaultSections;
  const orderedGroups = visibleSections
    .map((section) => [section, grouped.get(section) ?? []] as const)
    .filter(([, items]) => options.includeEmpty !== false || items.length > 0);

  const tableRows = orderedGroups.map(([section, items]) => `
    <tr class="section"><td colspan="6">${escapeHtml(section.toUpperCase())}</td></tr>
    ${items.length > 0 ? items.map((item) => `
      <tr>
        <td class="name">${escapeHtml(item.name)}</td>
        <td>${escapeHtml(formatDate(item.dateReceived))}</td>
        <td class="number">${item.totalPrescribed}</td>
        <td class="number">${item.remainingStock} ${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(formatDate(item.expirationDate))}</td>
        <td>${escapeHtml(item.remarks)}</td>
      </tr>`).join("") : `
      <tr class="empty-row">
        <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>
      </tr>`}
  `).join("");

  const period = startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth()
    ? startDate.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : `${formatDate(startDate)} to ${formatDate(endDate)}`;

  const html = `<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><style>
    body { font-family: Arial, sans-serif; font-size: 10pt; }
    h2, p { text-align: center; margin: 3px; }
    .period { margin: 14px 0 8px; text-align: left; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #111; padding: 5px; vertical-align: middle; }
    th { background: #e7e7e7; text-align: center; font-weight: bold; height: 36px; }
    .section td { background: #d9d9d9; text-align: center; font-weight: bold; }
    .name { width: 27%; }
    .number { text-align: center; }
    .empty-row td { height: 18px; }
    .signatures { margin-top: 28px; width: 100%; }
    .signatures td { border: 0; width: 50%; text-align: center; padding-top: 30px; }
  </style></head><body>
    <h2>${escapeHtml(clinicName)}</h2>
    <p>MONTHLY MEDICATION INVENTORY REPORT</p>
    <div class="period">MONTH / PERIOD: ${escapeHtml(period.toUpperCase())}</div>
    <table>
      <thead><tr>
        <th>NAME OF MEDICATION</th>
        <th>DATE MEDICATION RECEIVED</th>
        <th>TOTAL NUMBER PRESCRIBED</th>
        <th>TOTAL REMAINING STOCK ON HAND</th>
        <th>EXPIRATION DATE</th>
        <th>REMARKS</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <table class="signatures"><tr><td>Prepared by: ____________________</td><td>Verified by: ____________________</td></tr></table>
  </body></html>`;
  return Buffer.from(html, "utf8");
};
