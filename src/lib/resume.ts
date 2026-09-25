import "server-only";

import { createHash } from "node:crypto";
import { constants, inflateRawSync, inflateSync } from "node:zlib";
import { RESUME_MAX_BYTES, quickResumeCheck } from "@/lib/validation";

/**
 * Structural checks on an uploaded CV.
 *
 * **This is not a virus scan**, and nothing downstream should treat it as one.
 * CONTEXT.md §9 asks for scanning before a file becomes readable; no scanner
 * exists yet, so av_scanned_at stays null and the admin screen says so. What
 * this does is refuse the formats and features that résumé-borne attacks
 * actually use, without false positives on ordinary CVs:
 *
 *   · the type comes from the file's bytes, never the name or the browser
 *   · PDF: no scripts, launch actions, embedded files, rich media, XFA forms,
 *     form submission, or encryption (encrypted structure cannot be inspected)
 *   · DOCX: no macros, no embedded OLE or ActiveX objects, and no external
 *     templates or frames — the remote-template route used by Follina-style
 *     attacks. Ordinary external hyperlinks (a LinkedIn URL) are fine.
 *
 * A determined attacker can still get something past a structural check.
 * That gap is what an antivirus scan closes, and it is still owed.
 */

export type Resume = {
  fileName: string;
  contentType: string;
  bytes: Buffer;
  size: number;
  sha256: string;
};

export type ResumeResult =
  | { ok: true; resume: Resume | null }
  | { ok: false; message: string };

export const PDF = "application/pdf";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Reads the optional `resume` form entry. No file is not an error. */
export async function readResume(entry: FormDataEntryValue | null): Promise<ResumeResult> {
  // Browsers send an empty, nameless File for an untouched file input.
  if (!entry || typeof entry === "string" || (entry.size === 0 && !entry.name)) {
    return { ok: true, resume: null };
  }

  const quick = quickResumeCheck(entry);
  if (quick) return { ok: false, message: quick };

  // Re-checked on the bytes: size above was the browser's word for it.
  const bytes = Buffer.from(await entry.arrayBuffer());
  if (bytes.length === 0 || bytes.length > RESUME_MAX_BYTES) {
    return { ok: false, message: "That file is too large. The limit is 4 MB." };
  }

  const detected = sniff(bytes);
  const named = entry.name.toLowerCase().endsWith(".pdf") ? PDF : DOCX;
  if (!detected) {
    return { ok: false, message: "That file isn't a readable PDF or Word document." };
  }
  if (detected !== named) {
    return {
      ok: false,
      message: "That file's contents don't match its name. Export it again as PDF or .docx.",
    };
  }

  const problem = detected === PDF ? inspectPdf(bytes) : inspectDocx(bytes);
  if (problem) return { ok: false, message: problem };

  return {
    ok: true,
    resume: {
      fileName: cleanName(entry.name),
      contentType: detected,
      bytes,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function sniff(b: Buffer): string | null {
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return PDF;
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    return DOCX; // A zip; inspectDocx() establishes that it is actually a Word file.
  }
  return null;
}

/** Shown to TA and put in a download header, so keep it plain. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "cv";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "cv").slice(0, 120);
}

// ------------------------------------------------------------------------ PDF

// Declared in dictionaries, which is why only the structure is searched. Page
// text lives in content streams, which are skipped: a developer's CV that says
// "Node/JavaScript (5 yrs)" puts exactly those bytes in a content stream, and
// must not be refused for it.
const PDF_ACTIVE: [RegExp, string][] = [
  [/\/S\s*\/JavaScript\b/, "scripts"],
  [/\/JS\s*(?:\(|<|\[|\d+\s+\d+\s+R)/, "scripts"],
  [/\/JavaScript\s*(?:<<|\d+\s+\d+\s+R)/, "scripts"],
  [/\/S\s*\/Launch\b/, "an action that opens another program"],
  [/\/EmbeddedFiles?\b/, "files embedded inside it"],
  [/\/RichMedia\b/, "embedded media"],
  [/\/XFA\b/, "an XFA form"],
  [/\/S\s*\/SubmitForm\b/, "a form that sends data out"],
  [/\/S\s*\/ImportData\b/, "a form that imports data"],
];

const REFUSE = (what: string) =>
  `This PDF contains ${what}, which isn't accepted in a CV. ` +
  `Open it and use Print → Save as PDF to make a clean copy, then upload that.`;

function inspectPdf(buf: Buffer): string | null {
  const text = buf.toString("latin1");

  if (!/%%EOF\s*$/.test(text.slice(-4096))) {
    return "That PDF looks incomplete — it may not have finished downloading. Try exporting it again.";
  }

  const { structure, objectStreams } = splitPdf(buf, text);

  if (/\/Encrypt\b/.test(structure)) {
    return (
      "That PDF is password-protected or encrypted, so it can't be checked. " +
      "Export an unprotected copy and upload that."
    );
  }

  // Dictionaries can also live inside compressed object streams (PDF 1.5+),
  // which is where a script would hide from a scan of the raw bytes.
  const searched = [structure, ...objectStreams].map(decodeNames);
  for (const [pattern, what] of PDF_ACTIVE) {
    if (searched.some((s) => pattern.test(s))) return REFUSE(what);
  }
  return null;
}

/**
 * Separates a PDF's structure from its stream bodies, and inflates the
 * object streams — the ones that hold dictionaries rather than page content.
 */
function splitPdf(buf: Buffer, text: string) {
  let structure = "";
  const objectStreams: string[] = [];
  let budget = 32 * 1024 * 1024; // total inflate cap: a small file can expand enormously

  // "endstream" ends in "stream", so exclude it.
  const start = /(?<!end)stream\r?\n/g;
  let pos = 0;
  let m: RegExpExecArray | null;

  while ((m = start.exec(text))) {
    const bodyStart = m.index + m[0].length;
    const bodyEnd = text.indexOf("endstream", bodyStart);
    if (bodyEnd === -1) break;

    const dictFrom = Math.max(pos, text.lastIndexOf(" obj", m.index));
    const dict = text.slice(dictFrom, m.index);
    structure += text.slice(pos, m.index);

    if (/\/Type\s*\/ObjStm\b/.test(dict) && /\/FlateDecode\b/.test(dict) && budget > 0) {
      const out = inflateLenient(buf.subarray(bodyStart, bodyEnd), budget, false);
      if (out) {
        budget -= out.length;
        objectStreams.push(out.toString("latin1"));
      }
    }

    pos = bodyEnd + "endstream".length;
    start.lastIndex = pos;
  }

  structure += text.slice(pos);
  return { structure, objectStreams };
}

/** PDF names may escape characters as #XX — "/J#61vaScript" is "/JavaScript". */
function decodeNames(s: string): string {
  return s.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Inflates without throwing on trailing bytes or a truncated stream, which
 * real PDFs have. Returns null if the data is not deflate at all.
 */
function inflateLenient(data: Buffer, limit: number, raw: boolean): Buffer | null {
  const opts = { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: Math.max(1, limit) };
  try {
    return raw ? inflateRawSync(data, opts) : inflateSync(data, opts);
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------- DOCX

type ZipEntry = { name: string; method: number; compressed: number; localOffset: number };

function inspectDocx(buf: Buffer): string | null {
  const entries = zipEntries(buf);
  if (!entries) return "That Word file looks damaged. Export it again as PDF or .docx.";

  const names = new Set(entries.map((e) => e.name));
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
    return "That file isn't a Word document. Upload the CV as a PDF or .docx.";
  }

  const refuse = (what: string) =>
    `This Word file contains ${what}, which isn't accepted in a CV. ` +
    `Save it as a PDF and upload that instead.`;

  for (const n of names) {
    const lower = n.toLowerCase();
    if (lower.endsWith("vbaproject.bin")) return refuse("macros");
    if (lower.startsWith("word/embeddings/")) return refuse("embedded objects");
    if (lower.startsWith("word/activex/")) return refuse("ActiveX controls");
  }

  // A renamed macro part still has to be declared here.
  const types = readEntry(buf, entries, "[Content_Types].xml");
  if (types === null) return "That Word file looks damaged. Export it again as PDF or .docx.";
  if (/macroEnabled|vbaProject/i.test(types)) return refuse("macros");
  if (/oleObject|activeX/i.test(types)) return refuse("embedded objects");

  // External templates, frames and OLE links fetch content from the internet
  // when the file is opened. Hyperlinks are also TargetMode="External" and are
  // normal in a CV, so only these relationship types are refused.
  for (const e of entries) {
    if (!/^word\/_rels\/.+\.rels$/i.test(e.name)) continue;
    const rels = readEntry(buf, entries, e.name);
    if (rels === null) continue;
    for (const rel of rels.match(/<Relationship\b[^>]*>/gi) ?? []) {
      if (!/TargetMode\s*=\s*"External"/i.test(rel)) continue;
      if (/\/(attachedTemplate|oleObject|frame|subDocument)"/i.test(rel)) {
        return refuse("a link that loads content from the internet when opened");
      }
    }
  }

  return null;
}

/** Reads a zip's central directory. Null if it cannot be found or parsed. */
function zipEntries(buf: Buffer): ZipEntry[] | null {
  // The end-of-central-directory record sits in the last 22 bytes plus up to
  // 64 KB of comment.
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) return null; // zip64: not a CV

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compressed, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The text of one zip entry, capped at 2 MB. Null if unreadable. */
function readEntry(buf: Buffer, entries: ZipEntry[], name: string): string | null {
  const e = entries.find((x) => x.name === name);
  if (!e || e.localOffset + 30 > buf.length) return null;
  if (buf.readUInt32LE(e.localOffset) !== 0x04034b50) return null;

  const start =
    e.localOffset + 30 + buf.readUInt16LE(e.localOffset + 26) + buf.readUInt16LE(e.localOffset + 28);
  const data = buf.subarray(start, start + e.compressed);

  if (e.method === 0) return data.toString("utf8");
  if (e.method !== 8) return null;
  return inflateLenient(data, 2 * 1024 * 1024, true)?.toString("utf8") ?? null;
}
