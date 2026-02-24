import type { VercelRequest, VercelResponse } from "@vercel/node";
import { config } from "../src/config";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({
    ok: true,
    service: "linkguard-telegram-bot",
    activeProvider: config.activeProvider,
    timestamp: new Date().toISOString()
  });
}
