# Biltong Bites - Handcrafted Artisanal Biltong

An e-commerce website and order management system for **Biltong Bites**, a student-led enterprise under the **Young Enterprise Scheme (YES)** at Long Bay College, Auckland, New Zealand. 

The site is built with Eleventy (11ty) for the frontend and runs **100% serverless on Cloudflare Pages** with **Cloudflare Pages Functions** and **Cloudflare D1** (Serverless SQLite), freeing you from hosting on your own physical hardware.

---

## Deployment: Cloudflare Pages (Recommended - 100% Free & Serverless)

With Cloudflare Pages:
- **No local hardware required**: Your home PC doesn't need to stay on.
- **Zero IP exposure**: Your site is protected by Cloudflare's global CDN, DDoS protection, and SSL certificates.
- **Always online**: 99.99% uptime with 0 server maintenance.

### Step-by-Step Setup:

1. **Push your code to GitHub**:
   Make sure your latest repository code is committed and pushed to GitHub.

2. **Connect to Cloudflare Pages**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Compute (Workers & Pages)** > **Create** > **Pages** > **Connect to Git**.
   - Select your `Biltong-Bites-Eleventy` repository.
   - Build Settings:
     - **Framework preset**: `None`
     - **Build command**: `npm run build`
     - **Build output directory**: `_site`
   - Click **Save and Deploy**.

3. **Create Cloudflare D1 Database (SQLite)**:
   - In Cloudflare Dashboard, go to **Storage & Databases** > **D1 SQL Database** > **Create database**.
   - Set the name to: `biltong-bites-db`.
   - Click into the newly created database, go to the **Console** tab, and paste the contents of [`schema.sql`](schema.sql) (or run `wrangler d1 execute biltong-bites-db --file=schema.sql`).

4. **Bind D1 to your Pages project**:
   - In Cloudflare Dashboard, go to **Workers & Pages** > select your **biltong-bites** project > **Settings** > **Functions**.
   - Scroll to **D1 Database Bindings** and click **Add binding**:
     - **Variable name**: `DB`
     - **D1 database**: Select `biltong-bites-db`.
   - Click **Save**.

5. **Set Environment Variables**:
   - In your Pages project settings > **Environment Variables**, add:
     - `ADMIN_USERNAME`: `admin` (or your chosen username)
     - `ADMIN_PASSWORD`: Your secret admin password
     - `ACCOUNT_NUMBER`: Your bank account number for customer transfers
     - `PHONE_NUMBER`: Contact phone number (e.g. `+64 27 305 7992`)
     - `SENDER_EMAIL`: `biltongbites25@gmail.com`
     - *(Optional)* `RESEND_API_KEY`: API key from [resend.com](https://resend.com) (free 3,000 emails/mo) if you want automatic email receipts sent to customers.

---

## Alternative: Running Locally with Python (`serve.py`)

If you wish to test or develop completely offline on your computer:
```bash
python3 serve.py 8000
```
Open [http://localhost:8000](http://localhost:8000).

---

## Project Structure

```
.
├── src/                          # Eleventy source files
│   ├── _data/site.json           # Global site metadata
│   ├── _includes/
│   │   ├── components/           # Header, footer, card, and toggle components
│   │   └── layouts/              # Base and product page layouts
│   ├── assets/
│   │   ├── images/               # Product photography and icons
│   │   ├── scripts/
│   │   │   ├── main.js           # Client-side cart, search, theme, & checkout logic
│   │   │   └── admin.js          # Admin dashboard metrics and actions
│   │   └── styles/
│   │       └── main.css          # Design system & responsive styles
│   ├── products/                 # Markdown product specifications
│   ├── index.njk                 # Homepage catalog & story
│   ├── cart.njk                  # Cart overview page
│   ├── checkout.njk              # Checkout and bank transfer instructions
│   └── admin.njk                 # Admin dashboard template
├── functions/                    # Cloudflare Pages Functions (Serverless Backend)
│   ├── api/
│   │   ├── orders.js             # POST /api/orders (D1 DB insertion + Email dispatch)
│   │   ├── contact.js            # POST /api/contact (Contact form submission)
│   │   └── admin/
│   │       ├── data.js           # GET /api/admin/data (Joined orders & customers)
│   │       ├── reset_orders.js   # DELETE /api/admin/reset_orders
│   │       ├── orders/
│   │       │   ├── [id].js       # DELETE /api/admin/orders/:id
│   │       │   └── [id]/complete.js # POST /api/admin/orders/:id/complete
│   │       └── customers/
│   │           └── [id].js       # DELETE /api/admin/customers/:id
│   ├── admin/_middleware.js      # Basic Auth guard for /admin/
│   └── _middleware.js            # Global security headers & CORS
├── templates/                    # Local server email/message markdown templates
├── schema.sql                    # SQLite / D1 table migrations
├── wrangler.toml                 # Cloudflare configuration
├── _site/                        # Pre-rendered production build directory
├── serve.py                      # Local offline Python server fallback
└── .eleventy.js                  # 11ty build and collection configuration
```

---

## Admin Dashboard

Access the admin dashboard at:
- **Cloudflare**: `https://<your-project>.pages.dev/admin/`
- **Local**: `http://localhost:8000/admin/`

- **Username**: Configured in environment variables (`ADMIN_USERNAME`, default: `admin`)
- **Password**: Configured in environment variables (`ADMIN_PASSWORD`, default: `biltong`)

Features include:
- Real-time revenue & order statistics cards.
- Search and customer filtering.
- 1-click order completion with collection email notifications.
- Customer management and secure order resets.
