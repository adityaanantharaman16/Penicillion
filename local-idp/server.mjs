import { Provider } from 'oidc-provider';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { issuer, origin, oidcClientId, oidcSecret, production, nonce } from '../server/config.mjs';
if (production) throw new Error('Local identities are disabled in production.');
const users = new Map([
  ['violet', 'Violet Moss'],
  ['rowan', 'Rowan Reed'],
]);
const errorPage =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Sign-in interrupted</title><main><h1>Sign-in interrupted</h1><p>Return to your bench and start a fresh sign-in.</p><a href="' +
  origin +
  '/#account">Open Account</a></main></html>';
const provider = new Provider(issuer, {
  async renderError(ctx) {
    ctx.type = 'html';
    ctx.body = errorPage;
  },
  clients: [
    {
      client_id: oidcClientId,
      client_secret: oidcSecret,
      redirect_uris: [origin + '/auth/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    },
  ],
  cookies: { keys: [nonce(), nonce()] },
  features: { devInteractions: { enabled: false } },
  interactions: { url: (_ctx, interaction) => '/choose/' + interaction.uid },
  async findAccount(_ctx, accountId) {
    if (users.has(accountId)) return { accountId, claims: async () => ({ sub: accountId }) };
  },
  async loadExistingGrant(ctx) {
    const existing =
      ctx.oidc.result?.consent?.grantId || ctx.oidc.session.grantIdFor(ctx.oidc.client.clientId);
    if (existing) return provider.Grant.find(existing);
    if (!ctx.oidc.session.accountId) return undefined;
    const grant = new provider.Grant({
      accountId: ctx.oidc.session.accountId,
      clientId: ctx.oidc.client.clientId,
    });
    grant.addOIDCScope('openid');
    await grant.save();
    return grant;
  },
});
const dispatch = provider.callback();
const style =
  '@font-face{font-family:Pixel;src:url(/font.ttf)}*{box-sizing:border-box}body{font:20px/1.4 Pixel,monospace;color:#f0e7cc;background:#172633;margin:0;padding:8vh 18px}main{max-width:490px;margin:auto;padding:26px;border:2px solid #86b7a7;background:#25343c}h1{font-size:34px;line-height:1.1;margin:0 0 16px}button{display:block;width:100%;padding:14px;margin:10px 0;background:#c9dfbd;color:#21382f;border:2px solid #18362d;cursor:pointer;font:inherit}a{color:#c9dfbd}button:focus-visible{outline:3px solid #ffae7b}';
const page =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local sign-in · Penicillion</title><link rel="stylesheet" href="/style.css"><main><h1>Choose a test account</h1><p>Use the same name in another browser to open that account’s specimen log.</p><form method="post"><button name="user" value="violet">Violet Moss</button><button name="user" value="rowan">Rowan Reed</button></form></main></html>';
export const accountServer = createServer(async (req, res) => {
  try {
    if (req.headers.host !== new URL(issuer).host) {
      res.writeHead(403).end();
      return;
    }
    if (req.url === '/font.ttf') {
      res.setHeader('Content-Type', 'font/ttf');
      res.end(await readFile(new URL('../web/fonts/pixelify-sans.ttf', import.meta.url)));
      return;
    }
    if (req.url === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (req.url === '/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' }).end(style);
      return;
    }
    if (!/^\/choose\/[\w-]+$/.test(req.url)) {
      dispatch(req, res);
      return;
    }
    const { prompt } = await provider.interactionDetails(req, res);
    if (prompt.name !== 'login') throw Error('Unknown interaction.');
    if (req.method === 'GET') {
      res
        .writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy':
            "default-src 'self'; frame-ancestors 'none'; form-action 'self' " + origin,
        })
        .end(page);
      return;
    }
    if (req.method !== 'POST' || req.headers.origin !== issuer) throw Error('Origin mismatch.');
    let form = '';
    for await (const buf of req) {
      form += buf;
      if (form.length > 100) throw Error('Oversize form.');
    }
    const accountId = new URLSearchParams(form).get('user');
    if (!users.has(accountId)) throw Error('Unknown account.');
    await provider.interactionFinished(
      req,
      res,
      { login: { accountId } },
      { mergeWithLastSubmission: false },
    );
  } catch {
    res
      .writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(errorPage);
  }
});
accountServer.listen(Number(new URL(issuer).port), process.env.IDP_BIND_ADDRESS || '127.0.0.1');
