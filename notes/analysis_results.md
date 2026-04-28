# Codebase Analysis: dubLive Tickets Platform

Based on the review of the current project directory, I have compiled a comprehensive analysis of the **dubLive-tickets** platform. The codebase structures a modern, full-stack event ticketing and management system tailored toward live event experiences.

## 1. Project Architecture Overview
The application consists of a Node.js/Express backend running concurrently with a vanilla HTML/CSS/JS frontend served statically from the `docs` directory. It uses Firebase extensively for database and user authentication, and Stripe for payment processing.

- **Backend:** Node.js, Express, Firebase Admin SDK, Stripe, Multer (Local File System).
- **Frontend:** Vanilla HTML, CSS (`styles.css`), JavaScript (`script.js`, `auth.js`, etc.) using Firebase Client SDK (v12) and EmailJS.
- **Database:** Firebase Firestore (Cloud Database).
- **Hosting Strategy:** The backend is designed to run locally or on a standard server node structure, serving the frontend files directly. Port 8080 is used as the default backend port.

## 2. Backend Design (`server.js`)
The `server.js` file manages backend routes, security middleware, and extensive file upload mechanics. 

### Core Features:
- **Middleware configuration**: Employs `cors` and increased size limits (`express.json({ limit: '50mb' })`) specifically to process large base64 encoded QR Code data.
- **Payment Processing (`/create-payment-intent`, `/finalize-purchase/:ticketId`)**: Interfaces with Stripe to create payment intents securely, calculate order totals on the backend, and finalize purchases with transaction-safe Firestore database updates.
- **Robust Storage Solution**: A complex local storage architecture utilizing `multer`. Uploads are divided logically among folders using `diskStorage`:
  - `docs/images/profiles`: Profile pictures mapped by user email.
  - `docs/images/flyers`: Event flyers.
  - `docs/images/sponsors/(main|sub)`: Main and Sub sponsor images.
  - `docs/images/eventMaps`: Venue/Event seating maps.
  - `docs/images/QR`: Ticketing QR codes in base64 converted back to buffers.
  - `docs/images/receipts`: Bank transfer receipts.
- **Memory Storage**: Utilized actively for securely streaming bank transfer receipts into the filesystem while registering database requests (`/submit-transfer`).

## 3. Frontend Architecture (`docs/` directory)
The UI comprises modular HTML/JS pieces offering targeted functionality sets for administrators, organizers, and consumers.

### Major User Interfaces:
- **`index.html` & `main.html`**: The landing experience, ecosystem introduction, and main ticketing hub. Features modern design aesthetics (glassmorphism, CSS pulses).
- **Dashboards**: Separate, robust interfaces for `admin-dashboard.html` and `organizer-dashboard.html`.
- **Checkout Flows**: Built into `buy.html`, `payment.html`, and script.js, integrating direct Stripe checkout links and EmailJS alerts (`email-service.js`).
- **Ticket Validation**: Includes elements for barcode/QR code generation (`generate-ticket.js`) to parse or create valid tickets offline or locally.

### Key Logic Scripts:
- **`auth.js`**: Re-imports Firebase explicitly to handle client-side Authentication (Google Auth / Email) and handles logic sorting newly registered users into `admins` or `organizers` collections based on dropdown logic.
- **`script.js`**: Primarily focuses on the checkout interactions for tickets (e.g., picnic mats, camping chairs), capturing state in `localStorage` or `sessionStorage`, integrating Stripe Checkout endpoints natively, and rendering QRs locally.

## 4. Database & External Services
- **Firebase / Firestore**: 
  - `events` collection: Tracks total inventory, event names, and locations. Controlled carefully via Firebase admin transactions to avoid overselling tickets (in the finalize-purchase route).
  - `tickets` / `pendingTickets` collections: Logs customer purchases via standard API or caches pending Bank/Cash transfers respectively.
  - `admins`, `organizers`: Distinct role-based collections defining access rules.
- **Stripe**: Configured securely relying on server-side pricing verifications (`price_...`) to thwart manipulation via Stripe Checkout instances, while backend processing enforces total accuracy.
- **EmailJS**: Implemented straight into the DOM/front-end. Handled globally via `dubliveeventsnet@gmail.com` using ID `6Wk6R2DTBHBjcMnEr`.

## 5. Potential Improvement Areas & Observations
1. **Frontend Module Scope**: Many vanilla JS scripts interact within a global context or share direct `window` scopes. Utilizing modern bundling (Webpack, Vite) could securely modularize this.
2. **Dual Firebase Layers**: The app uses both Firebase Admin SDK (Node backend) AND Firebase JS SDK (client-side) somewhat redundantly. Ideally, database reads/writes should funnel purely through custom Express APIs instead of letting the client talk directly to Firestore, improving overall security. 
3. **Email Handling Constraint**: Using `EmailJS` client-side allows anyone reviewing network requests to intercept the template logic. Moving Email processing to the `server.js` via Nodemailer or SendGrid would be safer.
4. **Hardcoded Testing Keys**: `script.js` contains a hardcoded `pk_test` stripe key. Ensure production variables are strictly derived from environment payloads.
5. **Session Safety**: Cart data uses `localStorage`. Sensitive checkout identifiers should be verified via server tokens.

## Summary
The codebase is a mature MVP with complex manual ticketing integrations, strong admin file-system capabilities, and detailed local folder mapping. It represents a functional, end-to-end framework capable of receiving payments online and physically over the counter.
