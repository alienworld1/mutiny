import { parseEconomy, type KingdomEconomy } from "./economy";
type Frame = {
  label: string;
  economy: KingdomEconomy;
  quote: string;
  pressure: number;
  hall: string;
  earnings: string;
};
export type Recording = {
  registryHash: string;
  workerHash: string;
  frames: Frame[];
};
export function parseRecording(value: unknown): Recording {
  if (!value || typeof value !== "object") throw Error("Invalid recording");
  const r = value as Record<string, unknown>;
  if (
    r.version !== 1 ||
    r.network !== "sandbox" ||
    typeof r.registryHash !== "string" ||
    typeof r.workerHash !== "string" ||
    !Array.isArray(r.frames) ||
    !r.frames.length ||
    r.frames.length > 200
  )
    throw Error("Invalid recording");
  const frames = r.frames.map((raw: unknown): Frame => {
    if (!raw || typeof raw !== "object") throw Error("Invalid frame");
    const f = raw as Record<string, unknown>;
    if (typeof f.earnings !== "string" || !/^\d{1,39}$/.test(f.earnings))
      throw Error("Invalid earnings");
    const economy = parseEconomy(f.economy);
    const worker = f.worker as
      | {
          quotes?: unknown[];
          offers?: { automatic?: { pressure?: unknown } }[];
          hall_earned?: unknown;
        }
      | undefined;
    const quote = worker?.quotes?.[0],
      pressure = worker?.offers?.[0]?.automatic?.pressure,
      hall = worker?.hall_earned;
    if (
      economy.version !== 4 ||
      typeof f.label !== "string" ||
      typeof quote !== "string" ||
      !/^\d{1,39}$/.test(quote) ||
      typeof hall !== "string" ||
      !/^\d{1,39}$/.test(hall) ||
      typeof pressure !== "number" ||
      !Number.isInteger(pressure) ||
      pressure < 0 ||
      pressure > 4
    )
      throw Error("Invalid frame");
    return {
      label: f.label,
      economy,
      quote,
      pressure,
      hall,
      earnings: f.earnings,
    };
  });
  return { registryHash: r.registryHash, workerHash: r.workerHash, frames };
}
