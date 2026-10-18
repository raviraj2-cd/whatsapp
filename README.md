# WhatsApp Food Ordering System

Automated conversational food ordering system powered by Meta WhatsApp Cloud API and Next.js Admin Dashboard, sharing a single MongoDB Atlas database.

---

## Stage 1: Setup & Database

### 1. Prerequisites
- **Node.js**: v20 or higher
- **MongoDB**: Local MongoDB instance (`mongodb://localhost:27017`) or MongoDB Atlas cluster

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `MONGODB_URI` points to your active database. Customize `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` if desired.

### 3. Database Seeding
Populate 10 sample menu items (across 3 categories), the initial owner admin account, and default kitchen settings:
```bash
npm run seed
```

### 4. Verify Seed & Order Sequence
Run the seed verification script to inspect inserted records and test the atomic `ORD-YYYYMMDD-001` generator:
```bash
npm run verify-seed
```

### 5. Start Next.js Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) for the application landing page or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the Admin Dashboard.

---

## Project Structure

```
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx
│   │   └── dashboard/page.tsx       # Admin Dashboard
│   ├── api/
│   │   ├── whatsapp/
│   │   │   ├── webhook/route.ts     # Meta webhook verification & event ingest
│   │   │   └── flow/route.ts        # WhatsApp Flows data exchange endpoint
│   │   ├── payments/
│   │   │   └── webhook/route.ts     # Razorpay payment webhook
│   │   └── admin/route.ts           # Admin operational API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── flows/                           # WhatsApp Flows JSON specs & schemas
├── lib/
│   ├── db.ts                        # Mongoose cached connection (hot-reload & serverless safe)
│   ├── logger.ts                    # Structured Pino logger
│   ├── order-number.ts              # Atomic collision-free order generator (ORD-YYYYMMDD-XXX)
│   ├── whatsapp/                    # WhatsApp Cloud API client & helpers
│   ├── bot/                         # Conversational state machine & fallbacks
│   └── payments/                    # Payment processing & Razorpay client
├── models/                          # Mongoose models with indexes
│   ├── User.ts                      # Customer WhatsApp profiles & opt-in
│   ├── MenuItem.ts                  # Menu items, prices, and categories
│   ├── Order.ts                     # Orders, items, quotes, and delivery details
│   ├── Payment.ts                   # Payment link logs & status
│   ├── Session.ts                   # Customer conversational sessions (TTL index)
│   ├── MessageLog.ts                # Inbound/outbound message auditing
│   ├── Broadcast.ts                 # Daily broadcast performance metrics
│   ├── Admin.ts                     # Dashboard admins (owner/staff)
│   ├── Settings.ts                  # Kitchen operational parameters & Flow IDs
│   └── Counter.ts                   # Atomic daily sequence counters
├── scripts/
│   ├── seed.ts                      # Database seeder
│   └── verify-seed.ts               # Verification & health check script
├── tests/
│   └── order-number.test.ts         # Logic validation checks
└── worker/
    └── index.ts                     # Background worker & cron runner
```
