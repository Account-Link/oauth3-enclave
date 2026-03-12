// FC26 custom capability code — this is what the owner writes
// Gets: fetch, secrets (GITHUB_TOKEN), store (persistent KV), paper_id, email_hash, recipient

const REPO = 'amiller/fc26-nfts';

// Validate inputs
if (typeof paper_id !== 'string' || !paper_id.match(/^[a-zA-Z0-9._-]+$/))
  throw new Error('Invalid paper_id');
if (typeof email_hash !== 'string' || !email_hash.match(/^[a-f0-9]{64}$/))
  throw new Error('Invalid email_hash: expected sha256 hex');
if (typeof recipient !== 'string' || !recipient.match(/^0x[a-fA-F0-9]{40}$/))
  throw new Error('Invalid recipient: expected ETH address');

// Rate limit: 1 per email_hash per 10min
const emailKey = `rate:email:${email_hash}`;
const lastEmail = store.get(emailKey);
if (lastEmail && Date.now() - Number(lastEmail) < 600000)
  throw new Error('Rate limited: 1 claim per email per 10 minutes');

// Rate limit: 5 total per 10min
const globalKey = 'rate:global';
const globalLog = JSON.parse(store.get(globalKey) || '[]');
const recent = globalLog.filter(t => Date.now() - t < 600000);
if (recent.length >= 5)
  throw new Error('Rate limited: max 5 claims per 10 minutes');

// Post GitHub issue
const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
  method: 'POST',
  headers: {
    'Authorization': `token ${secrets.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'oauth3-enclave'
  },
  body: JSON.stringify({
    title: `Claim: ${paper_id}`,
    body: `**Paper:** ${paper_id}\n**Email hash:** ${email_hash}\n**Recipient:** ${recipient}`,
    labels: ['claim']
  })
});

if (!res.ok) {
  const err = await res.text();
  throw new Error(`GitHub API error ${res.status}: ${err}`);
}

const issue = await res.json();

// Record rate limit state
store.set(emailKey, String(Date.now()));
recent.push(Date.now());
store.set(globalKey, JSON.stringify(recent));

return { issue_number: issue.number, url: issue.html_url };
