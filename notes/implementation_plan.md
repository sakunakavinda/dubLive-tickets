# Database Migration Plan: Firebase to PostgreSQL

This document proposes the PostgreSQL database design to replace the current Firebase Firestore database. The design keeps **Firebase Authentication** intact. Instead of querying Firestore, the backend will query PostgreSQL using the Firebase User's `UID` as the primary identifier across roles (admins, organizers, and users).

## User Review Required

> [!IMPORTANT]
> Please review the updated schema below to ensure the relationships meet your application's logic. Based on your feedback, I have adjusted how organizers link to events and added the necessary sponsor and media structures.

## Proposed Changes

We will move from a document-based schema (collections with nested arrays) to a strict relational schema. 

### 1. Events Table
We have added fields for flyer images, event maps, and event status. The direct link to a single organizer has been removed.

```sql
CREATE TYPE event_status_enum AS ENUM ('draft', 'published', 'completed', 'cancelled');

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    location VARCHAR(255),
    event_map_url TEXT,     -- Local path or URL to the event map
    flyer_url TEXT,         -- Local path or URL to the event flyer
    status event_status_enum NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Users Table (Role Management)
Combines `admins` and `organizers` collections into a single table linked to Firebase Authentication. As requested, we've linked organizers to events directly on the user record.

```sql
CREATE TYPE user_role AS ENUM ('admin', 'organizer', 'customer');

CREATE TABLE users (
    uid VARCHAR(128) PRIMARY KEY, -- Firebase Auth UID
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    event_id UUID REFERENCES events(id) ON DELETE SET NULL, -- Links an organizer to an event
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Event Sponsors
Manages the sponsor images uploaded via the local file system.

```sql
CREATE TYPE sponsor_tier AS ENUM ('main', 'sub');

CREATE TABLE event_sponsors (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    sponsor_tier sponsor_tier NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Event Ticket Types (Inventory)
Maps to the `ticketTypes` array from the Firebase `events` document. Ensures transactional safety using standard SQL row locking when updating `issued_quantity`.

```sql
CREATE TABLE event_ticket_types (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., 'picnic_mat', 'camping_chair'
    price DECIMAL(10, 2) NOT NULL,
    total_quantity INT NOT NULL,
    issued_quantity INT NOT NULL DEFAULT 0,
    UNIQUE(event_id, name)
);
```

### 5. Orders Table
Unifies `tickets` and `pendingTickets` from Firebase. Status indicates if the payment cleared or if it is an over-the-counter/transfer "pending" ticket. Using a UUID equivalent to the current `ticketId` generated in `script.js`.

```sql
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY, -- The generated ticketId (e.g., from script.js)
    event_id UUID REFERENCES events(id),
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_nic VARCHAR(50),
    status order_status NOT NULL DEFAULT 'pending',
    master_qr_code_url text, -- Local path reference to QR code image
    receipt_url TEXT,        -- Local path reference to bank transfer receipt
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_scanned BOOLEAN DEFAULT FALSE
);
```

### 6. Order Items Table
Records exactly how many of each ticket type were purchased per order, and tracks how many have "arrived".

```sql
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id INT REFERENCES event_ticket_types(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_per_item DECIMAL(10, 2) NOT NULL,
    arrived INT NOT NULL DEFAULT 0 CHECK (arrived <= quantity)
);
```

## Verification Plan

Once approved, we can proceed to:
1. Initialize a local PostgreSQL instance (or use Docker).
2. Generate the exact SQL migration script.
3. Update database queries within `server.js` and `auth.js` to rely on the generic PostgreSQL connector (`pg` or `sequelize`) instead of the `firebase-admin` Firestore SDK.
