import { ClockGrid } from "@/components/world-clock/clock-grid";
import { TimeConverter } from "@/components/world-clock/time-converter";

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-10 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto space-y-10">

        <header className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-widest uppercase text-primary">
            World Clock
          </h1>
          <p className="text-sm text-muted-foreground tracking-widest">
            Top 12 Countries — Live Time
          </p>
        </header>

        <ClockGrid />

        <TimeConverter />

      </div>
    </main>
  );
}
