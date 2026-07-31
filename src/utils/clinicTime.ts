const DEFAULT_CLINIC_TIME_ZONE = "Asia/Manila";

const dateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
};

const timeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const parts = dateParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};

const zonedMidnightUtc = (
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date => {
  const intendedUtc = Date.UTC(year, month - 1, day);
  let candidate = intendedUtc;
  // Recalculate to handle zones whose offset changes near this date.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = intendedUtc - timeZoneOffsetMs(new Date(candidate), timeZone);
  }
  return new Date(candidate);
};

export const clinicDateKey = (
  date = new Date(),
  timeZone = process.env.CLINIC_TIME_ZONE || DEFAULT_CLINIC_TIME_ZONE,
): string => {
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

export const clinicDayRange = (
  dateKey: string,
  timeZone = process.env.CLINIC_TIME_ZONE || DEFAULT_CLINIC_TIME_ZONE,
): { start: Date; endExclusive: Date } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("Invalid clinic date");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error("Invalid clinic date");
  }

  const nextCalendarDate = new Date(calendarDate.getTime() + 24 * 60 * 60 * 1000);
  return {
    start: zonedMidnightUtc(year, month, day, timeZone),
    endExclusive: zonedMidnightUtc(
      nextCalendarDate.getUTCFullYear(),
      nextCalendarDate.getUTCMonth() + 1,
      nextCalendarDate.getUTCDate(),
      timeZone,
    ),
  };
};
