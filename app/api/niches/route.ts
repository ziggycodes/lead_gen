import { NextResponse } from "next/server";
import { NICHES, listNicheKeys } from "@/src/niches.js";

const niches = NICHES as Record<string, { label: string; category: string }>;

export async function GET() {
  return NextResponse.json(
    listNicheKeys().map((key: string) => ({
      key,
      label: niches[key].label,
      category: niches[key].category,
    }))
  );
}
