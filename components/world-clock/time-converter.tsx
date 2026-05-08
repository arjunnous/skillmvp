"use client";

import { useState } from "react";
import { COUNTRIES, getTzAbbr, getAbsoluteTime } from "@/lib/timezones";
import { Slider } from "@/components/ui/slider";

const HOUR_MARKERS = [0, 3, 6, 9, 12, 15, 18, 21, 24] as const;

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm    = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

function markerLabel(h: number): string {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function formatShort(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function TimeConverter() {
  const now = new Date();
  const defaultMinutes = now.getHours() * 60 + now.getMinutes();

  const [refTz, setRefTz]           = useState("Asia/Kolkata");
  const [sliderMinutes, setSlider]  = useState(defaultMinutes);

  const absolute   = getAbsoluteTime(sliderMinutes, refTz);
  const refCountry = COUNTRIES.find((c) => c.tz === refTz) ?? COUNTRIES[0]!;
  const refAbbr    = getTzAbbr(refTz, absolute);

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Time Zone Converter
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select a reference city, drag the slider — see every city update in real time.
        </p>
      </div>

      {/* Reference city pills */}
      <div className="flex flex-wrap gap-2">
        {COUNTRIES.map((c) => (
          <button
            key={c.tz}
            onClick={() => setRefTz(c.tz)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              refTz === c.tz
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            }`}
          >
            {c.flag} {c.city}
          </button>
        ))}
      </div>

      {/* Selected time display */}
      <div className="text-center py-2">
        <span className="font-mono text-4xl font-bold text-primary">
          {minutesToLabel(sliderMinutes)}
        </span>
        <span className="text-lg text-muted-foreground ml-3">
          {refAbbr} · {refCountry.city}
        </span>
      </div>

      {/* 24h slider */}
      <div className="space-y-2 px-1">
        <Slider
          min={0}
          max={1439}
          step={1}
          value={[sliderMinutes]}
          onValueChange={(v) => setSlider(v[0] ?? defaultMinutes)}
        />
        <div className="flex justify-between text-xs text-muted-foreground/50 select-none">
          {HOUR_MARKERS.map((h) => (
            <span key={h}>{markerLabel(h)}</span>
          ))}
        </div>
      </div>

      {/* Equivalent times grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
        {COUNTRIES.map((c) => {
          const isRef   = c.tz === refTz;
          const abbr    = getTzAbbr(c.tz, absolute);
          const timeStr = formatShort(absolute, c.tz);

          return (
            <div
              key={c.tz}
              className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-colors ${
                isRef
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-secondary/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{c.flag}</span>
                <div>
                  <p className="text-xs font-medium text-foreground leading-tight">
                    {c.city}
                  </p>
                  <p className="text-xs text-muted-foreground">{abbr}</p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-mono text-sm font-bold tabular-nums ${
                    isRef ? "text-primary" : "text-foreground"
                  }`}
                >
                  {timeStr}
                </p>
                {isRef && (
                  <p className="text-xs text-primary/60">reference</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
