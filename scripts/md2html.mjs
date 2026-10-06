// Converts the simple Markdown of docs/USER_GUIDE.md to a printable RTL HTML page
// (docs/submission/USER_GUIDE.html), for saving as PDF and attaching to the request.
// Usage: node scripts/md2html.mjs docs/USER_GUIDE.md docs/submission/USER_GUIDE.html
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1");

let html = "";
let list = null;
let sub = false;
const closeSub = () => {
  if (sub) {
    html += "</ul></li>";
    sub = false;
  }
};
const closeList = () => {
  closeSub();
  if (list) {
    html += list === "ol" ? "</ol>" : "</ul>";
    list = null;
  }
};

for (const line of readFileSync(src, "utf8").split("\n")) {
  let m;
  if ((m = line.match(/^(#{1,3}) (.*)/))) {
    closeList();
    html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
  } else if ((m = line.match(/^ {2}- (.*)/))) {
    if (!sub) {
      html = html.replace(/<\/li>$/, "");
      html += "<ul>";
      sub = true;
    }
    html += `<li>${inline(m[1])}</li>`;
  } else if ((m = line.match(/^\d+\. (.*)/))) {
    closeSub();
    if (list !== "ol") {
      closeList();
      html += "<ol>";
      list = "ol";
    }
    html += `<li>${inline(m[1])}</li>`;
  } else if ((m = line.match(/^- (.*)/))) {
    closeSub();
    if (list !== "ul") {
      closeList();
      html += "<ul>";
      list = "ul";
    }
    html += `<li>${inline(m[1])}</li>`;
  } else if (!line.trim()) {
    closeList();
  } else {
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
}
closeList();

writeFileSync(
  out,
  `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>מדריך למשתמש — InvoiceFlow</title>
<style>
  body { font-family: "Heebo", Arial, sans-serif; line-height: 1.7; color: #1f2933; max-width: 760px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 26px; border-bottom: 2px solid #1f6f78; padding-bottom: 8px; }
  h2 { font-size: 19px; color: #1f6f78; margin-top: 28px; }
  li { margin: 4px 0; }
  code { font-family: Consolas, monospace; background: #f1f3f5; padding: 0 4px; border-radius: 3px; }
  @page { margin: 16mm; @bottom-center { content: "עמוד " counter(page) " מתוך " counter(pages); font-size: 9pt; } }
</style>
</head>
<body>
${html}
</body>
</html>
`,
);
