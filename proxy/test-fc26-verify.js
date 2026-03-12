const REPO = 'amiller/fc26-nfts';

if (typeof issue_number !== 'number' || issue_number < 1)
  throw new Error('Invalid issue_number: expected positive integer');
if (typeof verification_code !== 'string' || !verification_code.trim())
  throw new Error('Invalid verification_code: expected non-empty string');

const rateKey = `rate:verify:${issue_number}`;
const last = store.get(rateKey);
if (last && Date.now() - Number(last) < 600000)
  throw new Error('Rate limited: 1 verify per issue per 10 minutes');

const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${issue_number}/comments`, {
  method: 'POST',
  headers: {
    'Authorization': `token ${secrets.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'oauth3-enclave'
  },
  body: JSON.stringify({ body: verification_code.trim() })
});

if (!res.ok) {
  const err = await res.text();
  throw new Error(`GitHub API error ${res.status}: ${err}`);
}

const comment = await res.json();
store.set(rateKey, String(Date.now()));

return { comment_url: comment.html_url };
