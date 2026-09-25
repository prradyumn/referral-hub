import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { DOCX } from "@/lib/resume";

/**
 * The only way a stored CV leaves the database.
 *
 * Admin-only, audited, and never rendered in the browser. Keeping this the
 * single reader is what makes moving the files elsewhere later — Blob, or into
 * Keka once the push is on — a change to one file.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // First statement, as in every admin route (src/lib/admin.ts). A non-admin
  // gets a 404: the existence of a CV is not theirs to learn.
  const admin = await requireAdmin();

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const cv = await queryOne<{
    content_type: string;
    size_bytes: number;
    sha256: string;
    data: Buffer;
    ref_code: string;
    candidate_name: string;
  }>(
    `select f.content_type, f.size_bytes, f.sha256, f.data,
            r.ref_code, c.full_name as candidate_name
       from referral_resumes f
       join referrals  r on r.id = f.referral_id
       join candidates c on c.id = r.candidate_id
      where f.referral_id = $1`,
    [id],
  );
  if (!cv) notFound();

  // Written before a byte is sent (CONTEXT.md §9: every résumé download is
  // audited). If this insert fails, the request fails and nothing is served.
  await query(
    `insert into pii_access_log (actor_id, actor_email, action, referral_id)
     values ($1, $2, 'resume.download', $3)`,
    [admin.id, admin.email, id],
  );

  const ext = cv.content_type === DOCX ? "docx" : "pdf";
  const name = `${cv.ref_code} - ${cv.candidate_name}.${ext}`;

  return new Response(new Uint8Array(cv.data), {
    headers: {
      "Content-Type": cv.content_type,
      "Content-Length": String(cv.size_bytes),
      // Download, never display. A PDF opened inline runs in the browser's
      // viewer, and this file has not been virus-scanned.
      "Content-Disposition": `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "X-Checksum-SHA256": cv.sha256,
    },
  });
}

/** The quoted fallback for clients that ignore filename*. */
function asciiName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
}
