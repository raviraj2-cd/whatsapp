# Production Deployment Guide, Go-Live Checklist & Runbook

This document covers production architecture, infrastructure provisioning, secrets management, maintenance runbooks, and disaster recovery.

---

## 1. Architecture Overview

```text
       [ Meta WhatsApp Cloud ]             [ Customer Mobile ]
                 │                                  │
                 ▼                                  ▼
      POST /api/whatsapp/webhook             Razorpay Checkout
                 │                                  │
                 ▼                                  ▼
      ┌─────────────────────────────────────────────────────────┐
      │               Next.js App Server (Vercel/VPS)            │
      │  - Webhooks (WhatsApp & Razorpay)                        │
      │  - WhatsApp Flows Endpoint (/api/whatsapp/flow)         │
      │  - Admin Dashboard & REST APIs (/dashboard, /orders)     │
      └────────────────────────────┬────────────────────────────┘
                                   │
                      MongoDB Atlas Database
                                   │
      ┌────────────────────────────┴────────────────────────────┐
      │             Background Worker (Render/Railway/VPS)       │
      │  - 09:00 AM Daily "Need food?" Broadcast                │
      │  - 5-Min Payment Link Expiry & Customer Cancellation     │
      │  - 10-Min Inactive Session Cleanup                       │
      │  - Nightly Missed-Webhook Reconciliation                │
      └─────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure Setup & Deployment

### A. Next.js Web Application

#### Option 1: Vercel (Recommended for Next.js)
1. Import your Git repository into Vercel.
2. Framework Preset: **Next.js**.
3. Add Environment Variables (listed in Section 3).
4. Deploy. Vercel automatically configures SSL, Edge CDN, and zero-downtime deploys.

#### Option 2: Linux VPS (Ubuntu / Debian with PM2 & Nginx)
```bash
# 1. Install Node.js 20 & PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

# 2. Clone and build
git clone <your-repo> /var/www/whatsapp
cd /var/www/whatsapp
npm ci
npm run build

# 3. Start Next.js with PM2
pm2 start npm --name "foodops-web" -- start
pm2 save

# 4. Configure Nginx reverse proxy with HTTPS (Let's Encrypt / certbot)
sudo certbot --nginx -d yourdomain.com
```

---

### B. Background Scheduler Worker

Because the worker is a long-running Node process:

#### Option 1: Render / Railway (Managed Container)
1. Create a **Background Worker** service.
2. Select repository, branch: `main`.
3. Build Command: `npm install`
4. Start Command: `npx tsx worker/index.ts`
5. Supply the same `MONGODB_URI`, `WHATSAPP_*`, and `RAZORPAY_*` environment variables.

#### Option 2: On the Same VPS (via PM2)
```bash
cd /var/www/whatsapp
pm2 start "npx tsx worker/index.ts" --name "foodops-worker"
pm2 save
pm2 startup
```

---

### C. MongoDB Atlas Configuration
1. **Network Access / IP Allowlist**:
   - In MongoDB Atlas -> **Network Access**:
   - If hosting on Vercel/Render (dynamic IPs): Add `0.0.0.0/0` (secured with strong MongoDB authentication user/password).
   - If hosting on a static VPS: Allow only your VPS static IP address.
2. **Backups**:
   - Ensure **Cloud Backup** is toggled ON with Point-In-Time Recovery enabled.

---

## 3. Environment Variables Reference

| Variable | Description | Example / Note |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `MONGODB_URI` | Atlas MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `NEXTAUTH_URL` | Canonical URL of dashboard | `https://yourdomain.com` |
| `NEXTAUTH_SECRET` | 32-byte secret for JWT signing | `openssl rand -base64 32` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Phone Number ID | Meta App Dashboard -> WhatsApp -> API Setup |
| `WHATSAPP_ACCESS_TOKEN` | Permanent System User Token | Meta Business Settings -> System Users |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification handshake secret | Random string chosen by you |
| `META_APP_SECRET` | Meta App Secret for signature checks | Meta App Dashboard -> Basic Settings |
| `FLOW_PRIVATE_KEY_PEM` | RSA 2048-bit Private Key | Generated via `npm run generate-flow-keys` |
| `FLOW_ID_MENU_ORDER` | Published Menu Order Flow ID | WhatsApp Manager -> Flows |
| `FLOW_ID_CUSTOM_ORDER` | Published Custom Order Flow ID | WhatsApp Manager -> Flows |
| `FLOW_ID_VIEW_ORDER` | Published View Order Flow ID | WhatsApp Manager -> Flows |
| `RAZORPAY_KEY_ID` | Razorpay Live/Test Key ID | `rzp_live_...` or `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret | From Razorpay Dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook Signature Secret | Configured in Razorpay Webhook settings |
| `CRON_SECRET` | Secret protecting manual trigger API | Custom secret token |

---

## 4. Go-Live Checklist

- [ ] **Meta Cloud API Permanent Token**: Ensure you generated a **System User Permanent Access Token** in Meta Business Manager (temporary 24-hr tokens will expire).
- [ ] **WhatsApp Webhook Subscribed**: Subscribed to the `messages` field in Meta App Dashboard pointing to `https://yourdomain.com/api/whatsapp/webhook`.
- [ ] **Public Key Uploaded**: Uploaded `flows/flow_public_key.pem` to your WhatsApp Business phone number.
- [ ] **Flows Published & IDs Saved**: All 3 Flows (`menu_order_flow`, `custom_order_flow`, `view_order_flow`) published in WhatsApp Manager with Endpoint URL set to `https://yourdomain.com/api/whatsapp/flow`.
- [ ] **Razorpay Live Webhook Active**: Webhook configured in Razorpay pointing to `https://yourdomain.com/api/payments/webhook` with `payment_link.paid`, `payment.captured`, `payment_link.expired`, `refund.processed`.
- [ ] **Initial Database Seed**: Seeded owner admin password via `npm run seed`.
- [ ] **Worker Active**: Verified worker is running without crashing: `pm2 status` or Render logs showing active cron schedules.

---

## 5. Maintenance & Emergency Runbooks

### Runbook 1: Rotating WhatsApp Access Token
1. Open **[Meta Business Manager](https://business.facebook.com/)** -> **Business Settings** -> **Users** -> **System Users**.
2. Select your Admin System User -> Click **Generate New Token**.
3. Select your WhatsApp App and check permissions: `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Copy the new token.
5. Update `WHATSAPP_ACCESS_TOKEN` in your hosting platform (Vercel / VPS / Render).
6. Redeploy or restart the services: `pm2 reload all`.

### Runbook 2: Rotating Razorpay API Keys & Webhook Secret
1. Open **[Razorpay Dashboard](https://dashboard.razorpay.com/)** -> **Account & Settings** -> **API Keys**.
2. Click **Regenerate Key**. Keep old key active for 24 hours while updating environment.
3. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in environment variables.
4. If rotating the webhook secret: Edit the Webhook in Razorpay, input the new secret, and update `RAZORPAY_WEBHOOK_SECRET`.

### Runbook 3: What to Do When Webhooks Fail
1. **Check Delivery Logs**:
   - Meta: Meta App Dashboard -> WhatsApp -> Webhook -> Click **Test** or inspect failed delivery logs.
   - Razorpay: Dashboard -> Webhooks -> Click your webhook -> View failed delivery attempts & response status codes.
2. **Inspect Server Logs**:
   - Check Pino logs: Look for `401 Unauthorized` (signature mismatch) or `421 Misdirected Request` (Flow key mismatch).
3. **Idempotency Guarantee**:
   - The system uses strict idempotency on `waMessageId` and `providerPaymentId`. If you click **Re-send Webhook** in Razorpay or Meta, it will safely process without double-charging or duplicate order creation.
4. **Nightly Auto-Recovery**:
   - The scheduler worker's `reconcilePaymentsJob` automatically polls Razorpay for orders in `pending_payment` and resolves missed webhooks.

### Runbook 4: How to Deploy a New WhatsApp Flow Version
> [!NOTE]
> Published Flows are immutable. To change screens or fields:
1. In WhatsApp Manager -> Flows, select your flow and click **Create new version** (Draft).
2. Update the JSON using the Flow Builder.
3. Verify with the Preview tool.
4. Click **Publish**.
5. Copy the updated numeric **Flow ID**.
6. Update `FLOW_ID_MENU_ORDER`, `FLOW_ID_CUSTOM_ORDER`, or `FLOW_ID_VIEW_ORDER` in `.env` and restart/redeploy.
