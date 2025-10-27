import fs from "fs";
import path from "path";
import { marked } from "marked";

// Disable deprecated behaviors that mangle email addresses and add header ids.
// We disable mangle so email addresses are not obfuscated into entities.
marked.setOptions({ headerIds: false });

const root = path.resolve(__dirname, "..");
const templatePath = path.join(__dirname, "template.html");
const mdPath = path.join(root, "cv", "cv.md");
const outPath = path.join(root, "cv", "cv.html");

function ensureTemplate(): void {
  if (fs.existsSync(templatePath)) return;
  if (!fs.existsSync(outPath)) {
    throw new Error(
      "Neither template.html nor cv.html exist to extract template from.",
    );
  }
  const html = fs.readFileSync(outPath, "utf8");
  const replaced = html.replace(
    /<article[\s\S]*?<\/article>/i,
    "<article>\n  {{content}}\n  </article>",
  );
  fs.writeFileSync(templatePath, replaced, "utf8");
  console.log(`Created template at ${templatePath}`);
}

function extractArticleInner(html: string): string | null {
  const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (m && m[1] !== undefined) return m[1].trim();
  const b = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (b && b[1] !== undefined) return b[1].trim();
  return null;
}

function build() {
  // Prefer using the existing output file as the base template so we preserve
  // exact formatting of the surrounding HTML. If it doesn't exist, fall back
  // to the extracted `template.html` file.
  ensureTemplate();
  const template = fs.readFileSync(templatePath, "utf8");
  if (!template.includes("{{content}}")) {
    throw new Error("Template does not contain {{content}} placeholder");
  }
  if (!fs.existsSync(mdPath))
    throw new Error(`Missing markdown file: ${mdPath}`);
  const md = fs.readFileSync(mdPath, "utf8");

  let content = "";
  const trimmed = md.trim();
  if (
    trimmed.startsWith("<!DOCTYPE html>") ||
    /<article[^>]*>/i.test(trimmed) ||
    /<html[\s\S]*>/i.test(trimmed)
  ) {
    const inner = extractArticleInner(md);
    if (inner !== null) {
      content = inner;
      console.log("Extracted <article> content from cv.md");
    } else {
      // fallback: use whole md (strip doctype/html/head/body)
      content = md;
      console.log("No <article> found; using full file as content");
    }
  } else {
    // treat as markdown, convert to HTML and place inside article
    const html = marked.parse(md);
    content = `\n${html.trim()}\n`;
    console.log("Converted markdown to HTML using marked");
  }

  // Post-process headings: ensure H1-H3 are wrapped in a .heading div and
  // followed by an anchor. Make the transformation idempotent by first
  // removing existing anchor elements and unwrapping any existing .heading
  // containers, then producing a canonical form.
  function stripTags(s: string) {
    return s.replace(/<[^>]+>/g, "");
  }

  function slugify(s: string) {
    return s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // remove empty anchor elements with class anchor
  content = content.replace(/<a[^>]*class=["']anchor["'][^>]*><\/a>/gi, "");
  // unwrap existing .heading divs
  content = content.replace(
    /<div[^>]*class=["']heading["'][^>]*>\s*([\s\S]*?)\s*<\/div>/gi,
    "$1",
  );

  // wrap H1-H3 headings
  let firstH1Seen = false;
  content = content.replace(
    /<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_m, level, attrs, inner) => {
      const raw = String(inner || "");
      const text = stripTags(raw).trim();
      const id = slugify(text) || "section";
      const attrsStr = String(attrs || "");
      const hasDir = /\bdir\s*=/.test(attrsStr);
      const hAttrs = hasDir ? attrsStr : ` dir=\"auto\"${attrsStr}`;
      if (level === "1" && !firstH1Seen) {
        firstH1Seen = true;
        // first H1 links to top; remove any id attribute from the H1 so
        // the anchor is purely a "go to top" link.
        const attrsNoId = attrsStr.replace(
          /\s*\bid\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
          "",
        );
        const hasDir2 = /\bdir\s*=/.test(attrsNoId);
        const hAttrsFirst = hasDir2 ? attrsNoId : ` dir=\"auto\"${attrsNoId}`;
        return `<div class=\"heading\">\n  <h1${hAttrsFirst}>${raw}</h1>\n  <a class=\"anchor\" href=\"#\"></a>\n<a href="./cv.pdf" class="download"><span>📄</span> PDF</a></div>`;
      }
      // if the heading already has an id attribute, use it for the anchor;
      // otherwise add the slugified id to the heading and use that.
      const idMatch = attrsStr.match(
        /\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      const existingId = idMatch
        ? idMatch[1] || idMatch[2] || idMatch[3]
        : null;
      const useId = existingId || id;
      const hAttrsWithId = existingId ? hAttrs : `${hAttrs} id=\"${useId}\"`;
      return `<div class=\"heading\">\n  <h${level}${hAttrsWithId}>${raw}</h${level}>\n  <a class=\"anchor\" href=\"#${useId}\"></a>\n</div>`;
    },
  );

  const out = template.replace("{{content}}", content);

  // Only write if content changed to avoid touching the file (idempotent)
  if (fs.existsSync(outPath)) {
    const prev = fs.readFileSync(outPath, "utf8");
    if (prev === out) {
      console.log(`No changes to ${outPath}`);
      return;
    }
  }

  fs.writeFileSync(outPath, out, "utf8");
  console.log(`Wrote HTML ${outPath}`);
}

try {
  build();
} catch (err) {
  console.error("Error:", (err as Error).message);
  process.exit(1);
}
