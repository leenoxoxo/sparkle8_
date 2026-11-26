# Sparkle e-commerce implementation plan

Extend the existing React storefront with a same-origin Node.js and Express API on Render. Use Neon Free PostgreSQL for persistence, Passport with scrypt and PostgreSQL sessions for private administrator access, and Cloudinary Free for product images. Implement on `codex/sparkle-commerce`. Production deployment requires explicit approval.

## Repository review

- React, Vite, and Lucide power a single-page app with manual history navigation. Routes cover Home, About, Shop and product details, Workshops and workshop details, DIY Kits, Custom Orders, How to Order, and Contact. Separate modules handle the cart, chatbot, product presentation, collections, sorting, translations, variant swatches, and workshop video.
- Preserve the current pink and cream palette, images, DM Sans, Playfair Display, Lobster, carousels, animations, reduced-motion behavior, dark mode, and English and Arabic RTL. Render imported translations through React when catalog data or the selected language changes.
- The deployed shop showed 22 cards. The source derives its shop catalog from 12 base records and a collection builder that groups color variants, assigns gallery-only photos, and resolves legacy links. DIY kits, workshop listings, and custom-order examples have separate source data.
- Cart selections live in browser storage, and the cart prepares an Instagram order summary. The chatbot uses local data and canned responses. There is no server, database, order history, admin account, or verified inventory count in the repository.
- The live shop rendered one column at 390 px, two at 768 px, and four at 1440 px. The mobile menu appeared at the two narrower sizes, and the sampled widths showed no page-level horizontal overflow. Full route, keyboard, RTL, and device regression tests belong in staging.
- The production build and four cart unit tests passed. Run the baseline tests with `node --test tests/cart.test.js`. The package has no `npm test` script or tracked GitHub Actions workflow. The Render blueprint uses a static build of `main`, publishes `dist`, and rewrites deep links to `index.html`. Verify the live Render settings and the path to retaining the current hostname before cutover.

## Phase 1 — Baseline and migration

Capture storefront screenshots in both languages and moods at phone, tablet, and desktop widths. Export the resolved catalog with canonical and legacy slugs, colors, variants, localized copy, categories, collections, display order, pricing, and image order. Inventory root and public assets, preserve original files and case-sensitive names, and verify counts and checksums in an idempotent import. Preserve featured selections, custom gallery examples, and existing editorial and workshop media URLs.

Keep exact, starting, and quote-only pricing distinct. Preserve imported sale and original price pairs exactly. Store prices in integer ILS minor units, with documented rounding for new percentage discounts. Reconcile starting quantities with the owner. Route unverified stock and quote-only items through an inquiry flow.

## Phase 2 — Database and API

Add migrations for categories, products, variants, images, aliases, orders, order lines, custom requests, stock movements, admin membership, delivery areas and fees, and business settings. Provision administrators from a local CLI and verify the PostgreSQL session and active admin account on every protected endpoint. Use a restricted database role, row-level security, signed Cloudinary uploads, secure HTTP-only cookies, same-origin mutation checks, rate limits, input validation, and upload type and size limits. Keep privileged credentials server-side.

## Phase 3 — Storefront, COD, and WhatsApp

- Wire the existing home, shop, detail, cart, and chatbot components to the published catalog. Restore compatible saved carts after data loads. Display **Sold Out** at zero stock and use separate availability rules for made-to-order items. Keep a custom request and quote flow.
- Require first name, last name, and a mobile WhatsApp number with +970 or +972. Normalize the number in both the browser and the server. Display **Cash on Delivery / الدفع عند الاستلام** as the sole payment method and explain how Sparkle uses the customer information.
- Show item images, selected colors and variants, quantities, original prices, discounts, and the final product subtotal in ILS. Display delivery as **To be confirmed**.
- **Order via WhatsApp / اطلب عبر واتساب** rechecks the cart on the server and saves a **Pending, Unpaid** order and customer profile in the same transaction. Use a unique order reference and a database-enforced submission key. Identify returning customers by normalized number.
- After the save succeeds, open WhatsApp using the business number [+970 594 503 571](https://wa.me/970594503571). Encode the entire message in the click-to-chat `text` parameter, including Arabic, special characters, and line breaks. Show the order reference and a reopen action tied to the same order through an opaque confirmation token. Keep the reopen link available if the initial handoff is blocked. Tell the customer to press **Send** inside WhatsApp.
- Keep the checkout responsive and consistent with Sparkle’s branding, animations, typography, light and dark moods, and Arabic RTL layout.

### WhatsApp message

Generate the message from the saved order in the customer's selected language. Use this structure for English and localized labels for Arabic.

```text
🎀 New Sparkle Order

Order ID: #SPK-0001

Customer Information
Name: [First Name] [Last Name]
WhatsApp Number: [Normalized Number]

🛍️ Order Details
1. [Product Name]
   Color: [Selected Color]
   Variant: [Selected Variant]
   Quantity: [Quantity]
   Unit Price: ₪[Price]
   Total: ₪[Product Total]

Subtotal: ₪[Subtotal]
Discount: ₪[Discount]
Final product subtotal: ₪[Product Subtotal]
Delivery Fee: To be confirmed

Payment Method: Cash on Delivery

Thank you for shopping with Sparkle! 💗
```

## Phase 4 — Admin dashboard and inventory

- Build a private, responsive Sparkle-branded dashboard for desktop, tablet, and mobile. Support product creation, editing, deletion, hiding, publishing, categories, descriptions, variants, stock adjustments, discounts and sale previews, and ordered multi-image galleries with cover selection. Archive products referenced by historical orders.
- Show low-stock alerts and manage customer orders and custom quotes. Show newly saved Pending orders immediately. Track status history through **Pending → Confirmed → Preparing → Shipped → Delivered**, with **Cancelled** available from eligible states.
- Pending orders and opening WhatsApp leave stock available. Confirmation locks and rechecks inventory and deducts stock once in one database transaction. Insufficient stock blocks confirmation. Restore eligible confirmed stock once on cancellation. Handle post-shipment returns and any restocking explicitly.
- Track **Unpaid** and **Paid** separately from order status. Admins mark delivered orders Paid after collecting cash. Report order counts, confirmed order value, collected revenue, and inventory statistics.
- Keep pending orders in a separate queue. Confirm delivery in WhatsApp, then record details and fees on the order. Keep customer history and internal notes in the authenticated Customers module.

## Phase 5 — Staging and release

- Test catalog parity, legacy links, localized content, cart restoration, admin login and authorization, product and gallery operations, publishing, discounts and currency rounding, and image persistence.
- Test both prefixes, required names, invalid numbers, stale quotes, server-side stock checks, duplicate prevention, customer deduplication, and manual delivery fees.
- Verify bilingual WhatsApp payloads and encoding, mobile, tablet and desktop handoff, blocked-open recovery, repeated clicks, network retries, and reopening from confirmation. Check that the customer must press Send.
- Verify order visibility, customer and custom order transitions, COD payment updates, concurrency for the final unit, idempotent deductions and restocking, and data persistence after restarts and staging redeploys.
- Verify visual parity, responsive layout, keyboard use, English, Arabic RTL, and dark mode.
- Deliver `.env.example`, migrations, an idempotent importer, first-admin provisioning, and GitHub and Render setup instructions. Configure a Render Free Node Web Service with a health endpoint, a start command, and an SPA fallback after API routes. Document cutover and rollback, and obtain explicit production deployment approval after staging verification.
