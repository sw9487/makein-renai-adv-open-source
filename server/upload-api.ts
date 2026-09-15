import { assets } from "./runtime";
import { isEditor, json, sameOrigin } from "./repository";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (!(await isEditor(req))) return json({ error: "請先登入 editor。" }, 401);
    if (Number(req.headers.get("content-length") ?? 0) > 5 * 1024 * 1024)
      throw Error("圖片不得超過5MB。");
    const data = await req.arrayBuffer();
    if (data.byteLength > 5 * 1024 * 1024) throw Error("圖片不得超過5MB。");
    const b = new Uint8Array(data);
    let mime = "",
      extension = "";
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) {
      mime = "image/png";
      extension = "png";
    } else if (b[0] === 255 && b[1] === 216 && b[2] === 255) {
      mime = "image/jpeg";
      extension = "jpg";
    } else if (
      new TextDecoder().decode(b.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(b.slice(8, 12)) === "WEBP"
    ) {
      mime = "image/webp";
      extension = "webp";
    } else throw Error("只接受 PNG、JPEG、WebP 圖片。");
    const key = crypto.randomUUID() + "." + extension;
    await assets().put(key, data, { httpMetadata: { contentType: mime } });
    return json({ url: '/api/media/' + key });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "上傳失敗。" }, 400);
  }
}
