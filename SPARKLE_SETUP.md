# Sparkle free-tier staging setup

Use a separate staging project and test customer information. This setup uses Neon Free for PostgreSQL, Cloudinary Free for product images, and a Render Free Web Service for Express. Billing information is unnecessary for the standard free-plan flow. If a provider prompts for a card, an upgrade, or a trial, stop before confirming.

## 1. Create the free accounts

1. Open the [Neon Console](https://console.neon.tech/) and sign in. Confirm the plan is **Free**, then create a project named `sparkle-staging`. Choose a nearby region. In the project dashboard, select **Connect**, choose the owner role and the **direct** connection, and copy the connection string into your private environment file in step 2. [Neon Free plan](https://neon.com/pricing)
2. Open [Cloudinary pricing](https://cloudinary.com/pricing) and select **Sign Up Free** under the **Image and Video Platform**. Use the $0 Free plan. In the Cloudinary Console, open **Settings → API Keys** in your product environment. Copy the cloud name, API key, and API secret into the private file in step 2. [Cloudinary free plan](https://cloudinary.com/documentation/billing_and_plans)
3. Use your existing [Render Dashboard](https://dashboard.render.com/) account. Leave the live Sparkle service in place. Create a separate Web Service only after the local checks pass. [Render Free limits](https://render.com/docs/free)

## 2. Configure the local database and credentials

Open a PowerShell terminal in the Sparkle folder.

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

If you already have a private `.env`, open that file and add the new fields from `.env.example` individually so you preserve any local settings.

- Paste the Neon direct owner connection into `MIGRATION_DATABASE_URL`.
- Leave `DATABASE_URL` empty on the first run so the setup command can create and save a restricted application connection.
- Fill in `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- Generate a session secret using the command below. Paste its output into `SESSION_SECRET` in `.env`. Keep the development origin at `http://localhost:5173`.

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep both connection strings, the session secret, and the Cloudinary secret out of chat, Git, and screenshots. The owner connection stays local. Render receives only the restricted connection.

```powershell
npm.cmd run db:prepare
npm.cmd run admin:setup
```

The first command applies the SQL migrations and adds the restricted `DATABASE_URL` to `.env`. The second prompts for an administrator email and a hidden password. Use a unique password of at least 15 characters. Running it again with the same email updates the password and revokes existing sessions for that account. There is no public registration form.

## 3. Import and run locally

```powershell
npm.cmd run catalog:import
npm.cmd run catalog:import -- --apply
```

The first command validates the source files. The second uploads original images to Cloudinary, checks their downloaded bytes against the originals, and adds missing catalog records to Neon. Source images stay in the repository. Existing catalog records are preserved on rerun. If you already have products, orders, or uploads in an old hosted database, arrange a data migration before switching services. The catalog importer seeds repository data.

Open two project terminals. Run `npm.cmd run api` in the first and `npm.cmd run dev -- --strictPort` in the second. Visit [the local admin dashboard](http://localhost:5173/admin) and sign in. Enter verified stock for items you want customers to order. After a test order is saved, open **Orders → Pending orders**. Use the customer’s WhatsApp number to confirm delivery, then enter the information and fee on the order. Checkout uses **+970 594 503 571** as the business number.

## 4. Verify and host staging

1. Run `npm.cmd test` and `npm.cmd run build`. Test admin sign-in, publishing and image uploads, fees, COD checkout, and WhatsApp in both languages. Use test details and close WhatsApp before sending.
2. Verify that refreshing or reopening the confirmation keeps the same order. Confirm an order for the last unit, verify another order cannot claim it, cancel the first before shipment, then check that stock returns once.
3. In Render, create a **Web Service** from GitHub branch `codex/sparkle-commerce`. Select **Free** explicitly. Set build command `npm ci && npm run build`, start command `npm start`, and health path `/api/health`. Keep auto-deploy off. The branch Blueprint has these settings. [Render Blueprint reference](https://render.com/docs/blueprint-spec)
4. In Render's environment settings, add the restricted `DATABASE_URL`, a separate `SESSION_SECRET`, the three Cloudinary variables, `NODE_ENV=production`, and `SKIP_INSTALL_DEPS=true`. Render supplies the public HTTPS origin and port. Set `APP_ORIGIN` only if you need to override the origin with an approved custom HTTPS domain, with no trailing slash. Leave `MIGRATION_DATABASE_URL` local. Keep the Render session secret stable across deploys.
5. Restart and redeploy staging. Recheck existing products, images, stock, orders, settings, and session continuity. PostgreSQL and Cloudinary hold persistent data, so the service can use Render's ephemeral filesystem.
6. Continue to use the current production site until you approve cutover. Confirm production routing, device behavior, backups, stock, and fees before accepting real orders on the new service.

## Keep the existing Sparkle link

Render assigns each service its own `onrender.com` URL. Keep the existing static site at [sparkle8-mw5h.onrender.com](https://sparkle8-mw5h.onrender.com/) while validating the separate Web Service. A visitor can continue reaching Sparkle through the old link if, after launch approval, you add a launch page there with a link or browser redirect to the new service. Render's static redirect rules cannot handle the domain root. If the address must stay identical in the browser, confirm a service migration or hostname transfer with Render before any cutover. [Render service URLs](https://render.com/docs/your-first-deploy) · [Static redirect limits](https://render.com/docs/redirects-rewrites)

Render Free sleeps after 15 idle minutes and limits runtime, builds, bandwidth, and high outbound traffic. Without a payment method, exceeding some quotas pauses service or builds. Cloudinary shares its 25 credits between storage, transformations, and delivery. Check the dashboards periodically. [Render Free limits](https://render.com/docs/free) · [Cloudinary credits](https://cloudinary.com/documentation/billing_and_plans)
# Private Render preview

In the preview service's **Environment** settings, add `STAGING_ACCESS_ENABLED=true` and `STAGING_ACCESS_PASSWORD` with a unique random password of at least 20 characters. Keep the existing `SESSION_SECRET` and set the health check path to `/api/health`. Testers enter the preview password before using the storefront. Administrators also sign in separately at `/admin`.

To open the site at launch, set `STAGING_ACCESS_ENABLED=false` and remove `STAGING_ACCESS_PASSWORD` from the service's environment before the approved deploy. The gate covers Sparkle's pages, files and APIs. Existing public Cloudinary URLs use Cloudinary's own access rules.
