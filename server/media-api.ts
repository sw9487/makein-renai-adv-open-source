import { assets } from "./runtime";
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const asset = await assets().get(key);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.body).buffer, {
    headers: {
      "Content-Type": asset.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
