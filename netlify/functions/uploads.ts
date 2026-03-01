import type { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const handler: Handler = async (event: HandlerEvent) => {
  // Extract filename from path: /.netlify/functions/uploads/filename.jpg
  const filename = event.path
    .replace(/^\/.netlify\/functions\/uploads\/?/, "")
    .replace(/^\//, "");

  if (!filename) {
    return { statusCode: 400, body: "Filename required" };
  }

  try {
    const res = await db.execute({
      sql: "SELECT data, mime_type FROM file_uploads WHERE filename = ?",
      args: [filename],
    });

    if (res.rows.length === 0) {
      return { statusCode: 404, body: "File not found" };
    }

    const { data, mime_type } = res.rows[0];

    return {
      statusCode: 200,
      headers: {
        "Content-Type": mime_type as string,
        "Cache-Control": "public, max-age=31536000",
      },
      body: data as string,
      isBase64Encoded: true,
    };
  } catch (err: any) {
    console.error("Upload fetch error:", err);
    return { statusCode: 500, body: "Error fetching file" };
  }
};
