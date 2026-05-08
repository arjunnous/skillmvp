"use client";

import { useState, useEffect } from "react";
import { COUNTRIES, getTzAbbr } from "@/lib/timezones";

function formatTimeParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const hour   = parts.find((p) => p.type === "hour")?.value   ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const second = parts.find((p) => p.type === "second")?.value ?? "00";
  const ampm   = parts.find((p) => p.type === "dayPeriod")?.value ?? "";

  return { time: `${hour}:${minute}:${second}`, ampm };
}

function formatDate(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ClockGrid() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {COUNTRIES.map((country) => {
        const { time, ampm } = now
          ? formatTimeParts(now, country.tz)
          : { time: "--:--:--", ampm: "" };
        const date   = now ? formatDate(now, country.tz) : "---";
        const abbr   = now ? getTzAbbr(country.tz, now) : "";

        return (
          <div
            key={country.tz}
            className="relative overflow-hidden rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors duration-200"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl leading-none">{country.flag}</span>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {country.name}
                </p>
                <p className="text-xs text-muted-foreground">{country.city}</p>
              </div>
            </div>

            <div className="font-mono text-2xl font-bold text-primary tabular-nums">
              {time}
              <span className="text-sm font-normal text-muted-foreground ml-1.5">
                {ampm}
              </span>
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">{date}</p>
              <p className="text-xs text-muted-foreground/50">{abbr}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
