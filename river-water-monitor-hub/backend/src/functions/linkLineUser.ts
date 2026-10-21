// ============================================================
// Base44 Backend Function: linkLineUser
// LINE 連携で取得した lineUserId をアプリ User に紐づける。
//
// フロントからの呼び出し例:
//   base44.functions.invoke("linkLineUser", { userId, lineUserId })
// ============================================================

import { createClientFromRequest } from "@base44/sdk";
import {
  makeBase44Repositories,
  type Base44Client,
} from "../adapters/base44Repositories.ts";
import { linkLineUser } from "../usecases.ts";
import { consoleLogger } from "../runtime.ts";

interface Payload {
  userId: string;
  lineUserId: string;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false }, { status: 405 });
    const b44 = createClientFromRequest(req) as unknown as Base44Client;
    const actor = await b44.auth.me().catch(() => null);
    if (!actor?.id) return Response.json({ ok: false }, { status: 401 });
    const body = (await req.json()) as Partial<Payload>;
    const { userId, lineUserId } = body;

    if (typeof userId !== "string" || typeof lineUserId !== "string" || !/^U[0-9a-f]{32}$/.test(lineUserId)) {
      return Response.json(
        { ok: false, error: "userId と lineUserId は必須です" },
        { status: 400 },
      );
    }

    if (userId !== actor.id) return Response.json({ ok: false }, { status: 403 });
    const repos = makeBase44Repositories(b44);

    const user = await linkLineUser(userId, lineUserId, {
      users: repos.users,
      logger: consoleLogger,
    });

    return Response.json({ ok: true, user });
  } catch (e) {
    console.error("linkLineUser failed", e);
    const status = String(e).includes("見つかりません") ? 404 : 500;
    return Response.json({ ok: false, error: String(e) }, { status });
  }
});
