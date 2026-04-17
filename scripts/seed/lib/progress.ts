import cliProgress from "cli-progress";

type Bar = cliProgress.SingleBar;

export function makeBar(label: string, total: number): Bar {
  const bar = new cliProgress.SingleBar(
    {
      format: `${label.padEnd(22)} │ {bar} │ {value}/{total} ({duration_formatted})`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false,
    },
    cliProgress.Presets.shades_classic,
  );
  bar.start(total, 0);
  return bar;
}

export async function forEachWithProgress<T>(
  label: string,
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency = 1,
): Promise<void> {
  const bar = makeBar(label, items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]!, i);
      bar.increment();
    }
  };
  const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
  try {
    await Promise.all(workers);
  } finally {
    bar.stop();
  }
}

export function logSection(title: string): void {
  const rule = "─".repeat(Math.max(4, 60 - title.length));
  process.stdout.write(`\n── ${title} ${rule}\n`);
}

export function logSummary(rows: Array<[string, number | string]>): void {
  const w = Math.max(...rows.map(([k]) => k.length));
  process.stdout.write("\n");
  for (const [k, v] of rows) {
    process.stdout.write(`  ${k.padEnd(w)}  ${v}\n`);
  }
  process.stdout.write("\n");
}
