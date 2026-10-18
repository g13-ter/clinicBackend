export type AdultBmiCategory = "underweight" | "normalWeight" | "overweight" | "obese";
export type PediatricBmiCategory = "underweight" | "healthyWeight" | "overweight" | "obesity";

type Sex = "Male" | "Female";
type Lms = readonly [ageMonths: number, l: number, m: number, s: number];

// CDC 2000 BMI-for-age LMS reference anchors. Keep aligned with
// frontend/src/utils/bmi.ts. The final anchor is month 239 (ages 2–19).
const CDC_BMI_LMS: Record<Sex, readonly Lms[]> = {
  Male: [
    [24,-1.982373595,16.54777487,.080127429],[36,-1.419991255,16.00030401,.072634432],[48,-1.714869347,15.62817269,.071889214],[60,-2.61516595,15.41914163,.07599225],[72,-3.21170511,15.38353217,.083048178],[84,-3.323188896,15.51286936,.092131305],[96,-3.18305795,15.78231007,.102091189],[108,-2.971148225,16.16712234,.111720691],[120,-2.765648008,16.64613844,.120112464],[132,-2.590560148,17.20088732,.126734613],[144,-2.447426113,17.81463359,.131389042],[156,-2.3294571,18.47179706,.13414147],[168,-2.227362173,19.15758672,.135251083],[180,-2.132344989,19.85766121,.135110159],[192,-2.039015385,20.5576474,.134198323],[204,-1.949134561,21.24247982,.13305669],[216,-1.874670324,21.8958685,.132286382],[228,-1.835138046,22.50071778,.132566359],[239,-1.841146139,22.99908062,.134408381],
  ],
  Female: [
    [24,-1.024496827,16.38804056,.085025838],[36,-2.096828937,15.69924188,.078605255],[48,-3.018521987,15.29854897,.078713325],[60,-3.35007771,15.15188405,.084300139],[72,-3.225606516,15.21690296,.093803033],[84,-2.926186592,15.45356545,.105325289],[96,-2.617192204,15.82699517,.117158667],[108,-2.360920527,16.30609316,.128013515],[120,-2.171295888,16.86231366,.137057004],[132,-2.045235058,17.46906585,.143868341],[144,-1.975521156,18.10148804,.148361495],[156,-1.954977947,18.73643338,.150705138],[168,-1.977073595,19.35257209,.151255713],[180,-2.034893091,19.9305662,.150511645],[192,-2.119156972,20.45325617,.14909006],[204,-2.215737645,20.90575839,.147723315],[216,-2.303687802,21.27532239,.14726877],[228,-2.355677743,21.55082155,.148723546],[239,-2.346962247,21.71189225,.152716206],
  ],
};

const erf = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + .3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  return sign * y;
};

export function ageInMonthsAtVisit(
  dateOfBirth: Date | string | undefined,
  visitDate: Date | string,
  fallbackAge?: number,
): number | null {
  const visit = visitDate instanceof Date ? visitDate : new Date(visitDate);
  if (Number.isNaN(visit.getTime())) return null;

  if (dateOfBirth) {
    const birth = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
    if (Number.isNaN(birth.getTime()) || birth > visit) return null;

    const visitParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(visit);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(visitParts.find((item) => item.type === type)?.value);
    const visitYear = part("year");
    const visitMonth = part("month");
    const visitDay = part("day");
    const birthYear = birth.getUTCFullYear();
    const birthMonth = birth.getUTCMonth() + 1;
    const birthDay = birth.getUTCDate();
    let months = (visitYear - birthYear) * 12 + visitMonth - birthMonth;
    if (visitDay < birthDay) months -= 1;
    return months >= 0 ? months : null;
  }

  return Number.isFinite(fallbackAge) && fallbackAge! >= 0
    ? Math.floor(fallbackAge!) * 12
    : null;
}

export function classifyAdultBmi(bmi: number): AdultBmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normalWeight";
  if (bmi < 30) return "overweight";
  return "obese";
}

export function classifyPediatricBmi(
  bmi: number,
  months: number,
  sex: string,
): PediatricBmiCategory | null {
  if ((sex !== "Male" && sex !== "Female") || months < 24 || months >= 240 || !Number.isFinite(bmi) || bmi <= 0) {
    return null;
  }

  const rows = CDC_BMI_LMS[sex as Sex];
  let index = 0;
  while (index < rows.length - 2 && months > rows[index + 1]![0]) index += 1;
  const lower = rows[index]!;
  const upper = rows[index + 1]!;
  const ratio = (months - lower[0]) / (upper[0] - lower[0]);
  const l = lower[1] + (upper[1] - lower[1]) * ratio;
  const m = lower[2] + (upper[2] - lower[2]) * ratio;
  const s = lower[3] + (upper[3] - lower[3]) * ratio;
  const z = l === 0 ? Math.log(bmi / m) / s : (Math.pow(bmi / m, l) - 1) / (l * s);
  const percentile = Math.max(.1, Math.min(99.9, 50 * (1 + erf(z / Math.SQRT2))));

  return percentile < 5
    ? "underweight"
    : percentile < 85
      ? "healthyWeight"
      : percentile < 95
        ? "overweight"
        : "obesity";
}
