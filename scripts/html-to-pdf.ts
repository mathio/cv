import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: html-to-pdf.ts <input.html> [output.pdf]");
    process.exit(2);
  }
  const inPath = path.resolve(process.cwd(), args[0]);
  const outPath = path.resolve(
    process.cwd(),
    args[1] || args[0].replace(/\.html?$/i, ".pdf"),
  );

  if (!fs.existsSync(inPath)) {
    console.error(`Input file does not exist: ${inPath}`);
    process.exit(3);
  }

  const html = fs.readFileSync(inPath, "utf8");

  // Try to locate a local Chrome/Chromium binary (useful when Puppeteer
  // installed without a bundled browser). Prefer an explicit CHROME env
  // var, then common macOS/Linux locations.
  const candidates: string[] = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);

  const executablePath = candidates.find((p) => p && fs.existsSync(p));
  if (executablePath) {
    console.log(`Using local Chrome executable: ${executablePath}`);
  } else {
    console.log(
      "No local Chrome found; attempting to use Puppeteer-provided browser",
    );
  }

  const launchOptions = executablePath
    ? {
        executablePath,
        headless: "new" as const,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      }
    : {
        headless: "new" as const,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      };

  // Launch browser and render
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    // Set the content and wait for network to be idle in case assets are fetched
    await page.setContent(html, { waitUntil: "networkidle0" });
    // Inject extra CSS to hide the on-page download link when printing to PDF
    await page.addStyleTag({
      content: "a.download{display:none !important;} h1{margin-top:0;}",
    });
    await page.emulateMediaType("screen");
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "25mm", left: "15mm", right: "15mm" },
    });
    console.log(`Wrote PDF: ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Error generating PDF:", err);
  process.exit(1);
});
