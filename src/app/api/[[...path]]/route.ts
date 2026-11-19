import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, loginSchema } from '@/lib/domain';
import { login, requireUser, cookieName, digest } from '@/lib/auth';
import { execute, sql, mongo } from '@/lib/db';
import * as service from '@/lib/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path?: string[] }> };
async function handler(req: NextRequest, ctx: Context) {
  try {
    const path = (await ctx.params).path || [];
    const method = req.method;
    if (method !== 'GET') {
      const origin = req.headers.get('origin');
      const allowed = process.env.APP_URL || req.nextUrl.origin;
      if (!origin || origin !== new URL(allowed).origin)
        throw new AppError(
          403,
          'Request origin is not allowed. Refresh the application and try again.',
        );
      const length = Number(req.headers.get('content-length') || 0);
      if (length > 6 * 1024 * 1024) throw new AppError(413, 'Request is too large.');
    }
    const route = path.join('/');
    if (route === 'health' && method === 'GET') {
      await sql().query('SELECT 1');
      await (await mongo()).command({ ping: 1 });
      return NextResponse.json({ status: 'ok', mysql: 'connected', mongodb: 'connected' });
    }
    if (route === 'auth/login' && method === 'POST') {
      const data = loginSchema.parse(await req.json());
      const { token, user } = await login(data.email, data.password);
      const response = NextResponse.json({ user });
      response.cookies.set(cookieName, token, {
        httpOnly: true,
        secure: process.env.SESSION_SECURE === 'true',
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 3600,
      });
      return response;
    }
    const user = await requireUser();
    if (route === 'auth/me' && method === 'GET') return NextResponse.json({ user });
    if (route === 'auth/logout' && method === 'POST') {
      const token = req.cookies.get(cookieName)?.value;
      if (token) await execute('DELETE FROM sessions WHERE token_hash=?', [digest(token)]);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(cookieName, '', { maxAge: 0, path: '/' });
      return response;
    }
    let result: unknown;
    if (route === 'overview' && method === 'GET') result = await service.overview(user);
    else if (route === 'disputes' && method === 'POST')
      result = await service.createDispute(user, await req.json());
    else if (path[0] === 'disputes' && path.length === 2 && method === 'GET')
      result = await service.disputeDetail(user, path[1]);
    else if (path[0] === 'disputes' && path.length === 2 && method === 'PATCH')
      result = await service.updateDispute(user, path[1], await req.json());
    else if (
      path[0] === 'disputes' &&
      path[2] === 'messages' &&
      path.length === 3 &&
      method === 'POST'
    )
      result = await service.addMessage(user, path[1], await req.json());
    else if (
      path[0] === 'disputes' &&
      path[2] === 'resolve' &&
      path.length === 3 &&
      method === 'POST'
    )
      result = await service.resolveDispute(user, path[1], await req.json());
    else if (
      path[0] === 'disputes' &&
      path[2] === 'evidence' &&
      path.length === 3 &&
      method === 'POST'
    )
      result = await service.uploadEvidence(
        user,
        path[1],
        (await req.formData()).get('file') as File,
      );
    else if (path[0] === 'evidence' && path.length === 2 && method === 'GET') {
      const file = await service.downloadEvidence(user, path[1]);
      return new Response(new Uint8Array(file.bytes), {
        headers: {
          'Content-Type': file.mime,
          'Content-Disposition': `attachment; filename="${file.filename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } else if (
      path[0] === 'refunds' &&
      path[2] === 'complete' &&
      path.length === 3 &&
      method === 'POST'
    )
      result = await service.completeRefund(user, path[1]);
    else if (route === 'sync' && method === 'POST' && user.role === 'admin') {
      await service.syncOutbox();
      result = { ok: true };
    } else throw new AppError(404, 'Endpoint not found.');
    return NextResponse.json(result, {
      status: method === 'POST' && route === 'disputes' ? 201 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: error.issues.map((e) => e.message).join('. ') },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
    if (error instanceof AppError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    const code = (error as { code?: string })?.code;
    if (code === 'ER_DUP_ENTRY')
      return NextResponse.json(
        { error: 'This record already exists. Refresh and try again.' },
        { status: 409 },
      );
    console.error(
      'Request failed:',
      error instanceof Error ? error.name : 'Unknown error',
      code || '',
    );
    return NextResponse.json(
      {
        error: 'A database is unavailable or not configured. Check the setup guide and try again.',
      },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH };
