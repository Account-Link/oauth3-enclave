const http = require('http');
const { chromium } = require('playwright');

const PROXY = process.env.PROXY_URL || 'socks5://openvpn-socks5:1080';
let browser;

async function handleBrowse(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const { url, cookies, userAgent, script } = JSON.parse(Buffer.concat(chunks).toString());

  const context = await browser.newContext({ userAgent: userAgent || undefined });
  try {
    if (cookies?.length) await context.addCookies(cookies);
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let result;
    if (script) {
      result = { status: response.status(), url: page.url(), data: await page.evaluate(script) };
    } else {
      result = { status: response.status(), url: page.url(), body: await page.content() };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } finally {
    await context.close();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, proxy: PROXY }));
    }
    if (req.method === 'POST' && req.url === '/browse') {
      return await handleBrowse(req, res);
    }
    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

(async () => {
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    proxy: { server: PROXY },
  });
  console.log(`Browser service listening on :3000 (proxy: ${PROXY})`);
  server.listen(3000);
})();
