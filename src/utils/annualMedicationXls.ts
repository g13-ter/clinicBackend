import type { AnnualMedicationReport } from "../services/report.service";

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildAnnualMedicationXls = (report: AnnualMedicationReport): Buffer => {
  const totalColumns = report.months.length + 4;
  const yearGroups = Array.from(new Set(report.months.map((month) => month.year)));
  const categoryRows: string[] = [];
  let currentCategory = "";

  for (const row of report.rows) {
    if (row.category !== currentCategory) {
      currentCategory = row.category;
      categoryRows.push(
        `<tr class="category"><td colspan="${totalColumns}">${escapeHtml(currentCategory.toUpperCase())}</td></tr>`,
      );
    }
    categoryRows.push(`
      <tr>
        <td class="name">${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.unit)}</td>
        ${row.monthlyConsumed.map((quantity) => `<td class="number">${quantity}</td>`).join("")}
        <td class="number total">${row.totalConsumed}</td>
        <td class="number total">${row.remainingStock}</td>
      </tr>`);
  }

  const yearHeader = yearGroups
    .map((year) => {
      const count = report.months.filter((month) => month.year === year).length;
      return `<th colspan="${count}">${year}</th>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; }
    th, td { border: 1px solid #333; padding: 5px 7px; text-align: center; }
    .title { border: 0; font-size: 14pt; font-weight: bold; line-height: 1.3; }
    .name { min-width: 320px; text-align: left; }
    .category td { background: #ffd91a; font-weight: bold; text-align: center; }
    .number { mso-number-format: "0"; }
    .total { font-weight: bold; }
    @page { size: landscape; margin: 0.4in; }
  </style>
  <!--[if gte mso 9]><xml>
    <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>Annual Medication</x:Name>
      <x:WorksheetOptions><x:Selected/><x:FreezePanes/><x:FrozenNoSplit/>
      <x:SplitHorizontal>4</x:SplitHorizontal><x:TopRowBottomPane>4</x:TopRowBottomPane>
      <x:ProtectContents>False</x:ProtectContents></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
  </xml><![endif]-->
</head>
<body>
  <table>
    <tr><td class="title" colspan="${totalColumns}">
      ANNUAL MEDICATION<br>
      SCHOOL YEAR ${escapeHtml(report.schoolYear)}<br>
      ${escapeHtml(report.campus)}
    </td></tr>
    <tr>
      <th colspan="2"></th>
      ${yearHeader}
      <th colspan="2"></th>
    </tr>
    <tr>
      <th>Name of Medication</th>
      <th>Prep.</th>
      ${report.months.map((month) => `<th>${escapeHtml(month.label)}</th>`).join("")}
      <th>Total Stocks<br>Consumed</th>
      <th>Total Remaining<br>Stock</th>
    </tr>
    ${categoryRows.join("")}
  </table>
</body>
</html>`;

  return Buffer.from(`\uFEFF${html}`, "utf8");
};
