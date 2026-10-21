import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.LOGIN_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "Chưa cấu hình mật khẩu đăng nhập" },
      { status: 500 },
    );
  }

  let password: unknown;
  try {
    password = (await req.json())?.password;
  } catch {
    // Malformed JSON is treated as an invalid password.
  }

  const expected = Buffer.from(expectedPassword);
  const received = Buffer.from(typeof password === "string" ? password : "");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json(
      { ok: false, error: "Sai mật khẩu, vui lòng thử lại" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
