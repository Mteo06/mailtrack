# Gmail API Setup Guide

## 1. Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create a new project: "MailTrack SaaS"
3. Navigate to **APIs & Services → Library**
4. Enable **Gmail API**
5. Enable **Google+ API** (for userinfo)

## 2. Configure OAuth2 Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (or Internal for G Suite)
3. Fill in: App name, user support email, developer email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Add test users while in development

> **Important:** Only request `gmail.compose`, NOT `gmail.readonly` or full access.
> This is the minimum scope required and follows Google's least-privilege policy.

## 3. Create OAuth2 Credentials (Web Application)

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs:
   - `http://localhost:3001/auth/google/callback` (development)
   - `https://yourdomain.com/auth/google/callback` (production)
5. Copy **Client ID** and **Client Secret** → paste into `.env`

## 4. Create OAuth2 Credentials (Chrome Extension)

1. Create another credential: **Chrome App**
2. Extension ID: found at `chrome://extensions` after loading
3. Copy the Client ID → paste into `manifest.json` `oauth2.client_id`

## 5. Environment Variables

```env
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
```

## 6. Token Storage (Production)

In production, encrypt `google_tokens` before storing in PostgreSQL.
Use AES-256-GCM with a server-side encryption key:

```js
const crypto = require('crypto');
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(data) {
  const [ivHex, tagHex, encHex] = data.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex,'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex,'hex')) + decipher.final('utf8');
}
```
