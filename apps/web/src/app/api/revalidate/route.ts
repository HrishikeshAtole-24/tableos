import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/** Called by the API after every menu change (tag-based revalidation of the public menu). */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ code: 'forbidden', message: 'Invalid secret' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { tag?: string };
  if (!body.tag || !/^menu:[a-z0-9-]{2,60}$/.test(body.tag)) {
    return NextResponse.json({ code: 'bad_request', message: 'Invalid tag' }, { status: 400 });
  }
  revalidateTag(body.tag, 'max');
  return NextResponse.json({ revalidated: true });
}
