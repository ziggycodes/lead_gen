import { NextResponse } from "next/server";
import { US_STATES, listStateIsoCodes } from "@/src/usStates.js";

const states = US_STATES as Record<string, string>;

export async function GET() {
  return NextResponse.json(
    listStateIsoCodes().map((iso: string) => ({ iso, name: states[iso] }))
  );
}
