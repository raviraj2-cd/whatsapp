import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "FoodOps Admin API",
    stage: 1,
  });
}
