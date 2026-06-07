const { execFileSync } = require("child_process");
const fs = require("fs");

const authors = [
  "Автор:Александр Сергеевич Пушкин",
  "Автор:Михаил Юрьевич Лермонтов",
  "Автор:Фёдор Иванович Тютчев",
  "Автор:Афанасий Афанасьевич Фет",
  "Автор:Николай Алексеевич Некрасов",
  "Автор:Александр Александрович Блок",
  "Автор:Сергей Александрович Есенин"
];

const sourceHost = "https://ru.wikisource.org";
const pageLimit = 520;

function curl(url) {
  return execFileSync("curl", [
    "-L",
    "--fail",
    "--silent",
    "--show-error",
    "-A",
    "CenterNotes offline text builder",
    url
  ], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
}

function api(params) {
  const url = `${sourceHost}/w/api.php?${new URLSearchParams({
    format: "json",
    ...params
  })}`;
  return JSON.parse(curl(url));
}

function linksForAuthor(title) {
  const links = [];
  let cont = {};

  do {
    const response = api({
      action: "query",
      prop: "links",
      titles: title,
      plnamespace: "0",
      pllimit: "max",
      ...cont
    });
    const page = Object.values(response.query.pages)[0];
    links.push(...(page.links || []).map(link => link.title));
    cont = response.continue || null;
  } while (cont);

  return links;
}

function pageHtml(title) {
  const response = api({
    action: "parse",
    page: title,
    prop: "text",
    disableeditsection: "1",
    disabletoc: "1"
  });

  return response.parse?.text?.["*"] || "";
}

function cleanText(html) {
  let text = html;
  text = text.replace(/<sup[\s\S]*?<\/sup>/g, "");
  text = text.replace(/<style[\s\S]*?<\/style>/g, "");
  text = text.replace(/<script[\s\S]*?<\/script>/g, "");
  text = text.replace(/<span[^>]*pagenumber[^>]*>[\s\S]*?<\/span>\s*<\/span>/g, "");
  text = text.replace(/<div[^>]*class="[^"]*mw-references-wrap[^"]*"[\s\S]*$/g, "");
  text = text.replace(/<\/(p|div|h[1-6]|li)>/g, "\n");
  text = text.replace(/<br\s*\/?\s*>/g, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;|&#160;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, "\"");
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\[[^\]]*\]/g, "");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function looksLikePoem(title, text) {
  if (text.length < 160 || text.length > 12000) {
    return false;
  }

  if (/[/:]/.test(title) || /^(Автор|Обсуждение|Индекс|Страница):/.test(title)) {
    return false;
  }

  if (/(роман|драма|повесть|рассказ|письмо|статья|рецензия|проза)/i.test(title)) {
    return false;
  }

  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const shortLines = lines.filter(line => line.length <= 72).length;

  return lines.length >= 6 && shortLines / lines.length >= 0.62;
}

function buildPoemPages(poems) {
  const pages = [];

  for (const poem of poems) {
    const block = `${poem.title}\n\n${poem.text}`;

    if (block.length >= 900) {
      pages.push(block);
      continue;
    }

    const previous = pages[pages.length - 1];

    if (previous && previous.length < 2400) {
      pages[pages.length - 1] = `${previous}\n\n* * *\n\n${block}`;
    } else {
      pages.push(block);
    }
  }

  return pages.filter(page => page.length >= 700);
}

const titles = [...new Set(authors.flatMap(linksForAuthor))]
  .filter(title => /\([^()]+\)$/.test(title))
  .filter(title => !/(ДО|ЭСБЕ|РБС|БСЭ|Сальников|Дельвиг|Плещеев|Википедия)/i.test(title))
  .slice(0, pageLimit);

const poems = [];

for (const title of titles) {
  try {
    const text = cleanText(pageHtml(title));

    if (looksLikePoem(title, text)) {
      poems.push({ title, text });
    }
  } catch (error) {
    process.stderr.write(`skip ${title}: ${error.message}\n`);
  }
}

const pages = buildPoemPages(poems);

fs.writeFileSync("web/assets/classic-poem-pages.js", `window.classicPoemPages = ${JSON.stringify({
  source: "https://ru.wikisource.org",
  title: "Русская классическая поэзия",
  authors,
  pages
}, null, 2)};\n`);

console.log(JSON.stringify({
  titles: titles.length,
  poems: poems.length,
  pages: pages.length,
  chars: pages.join("").length
}, null, 2));
