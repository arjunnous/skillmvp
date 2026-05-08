export interface Country {
  flag: string;
  name: string;
  city: string;
  tz: string;
}

export const COUNTRIES: Country[] = [
  { flag: "🇺🇸", name: "United States", city: "New York",   tz: "America/New_York"  },
  { flag: "🇬🇧", name: "United Kingdom", city: "London",    tz: "Europe/London"     },
  { flag: "🇩🇪", name: "Germany",        city: "Berlin",    tz: "Europe/Berlin"     },
  { flag: "🇫🇷", name: "France",         city: "Paris",     tz: "Europe/Paris"      },
  { flag: "🇮🇳", name: "India",          city: "Mumbai",    tz: "Asia/Kolkata"      },
  { flag: "🇨🇳", name: "China",          city: "Beijing",   tz: "Asia/Shanghai"     },
  { flag: "🇯🇵", name: "Japan",          city: "Tokyo",     tz: "Asia/Tokyo"        },
  { flag: "🇦🇺", name: "Australia",      city: "Sydney",    tz: "Australia/Sydney"  },
  { flag: "🇧🇷", name: "Brazil",         city: "São Paulo", tz: "America/Sao_Paulo" },
  { flag: "🇨🇦", name: "Canada",         city: "Toronto",   tz: "America/Toronto"   },
  { flag: "🇦🇪", name: "UAE",            city: "Dubai",     tz: "Asia/Dubai"        },
  { flag: "🇸🇬", name: "Singapore",      city: "Singapore", tz: "Asia/Singapore"    },
];

export function getTzAbbr(tz: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export function getAbsoluteTime(sliderMinutes: number, refTz: string): Date {
  const now = new Date();

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: refTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year  = parseInt(dateParts.find((p) => p.type === "year")?.value  ?? "2024");
  const month = parseInt(dateParts.find((p) => p.type === "month")?.value ?? "1") - 1;
  const day   = parseInt(dateParts.find((p) => p.type === "day")?.value   ?? "1");
  const h     = Math.floor(sliderMinutes / 60);
  const m     = sliderMinutes % 60;

  // Naive UTC date using slider time as if it were UTC
  const naive = new Date(Date.UTC(year, month, day, h, m, 0));

  // Find what hour/minute this UTC time maps to in refTz
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: refTz,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(naive);

  const rawHour = parseInt(tzParts.find((p) => p.type === "hour")?.value   ?? "0");
  const tzMin   = parseInt(tzParts.find((p) => p.type === "minute")?.value ?? "0");
  const tzHour  = rawHour === 24 ? 0 : rawHour;

  // Shift naive UTC so the refTz local time equals h:m
  const wantMs = (h * 60 + m) * 60_000;
  const gotMs  = (tzHour * 60 + tzMin) * 60_000;

  return new Date(naive.getTime() + (wantMs - gotMs));
}
