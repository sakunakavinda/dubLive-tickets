-- PostgreSQL Database Schema for dubLive Tickets

-- 1. ENUMS
CREATE TYPE event_status_enum AS ENUM ('draft', 'published', 'completed', 'cancelled');
CREATE TYPE user_role AS ENUM ('admin', 'organizer', 'customer');
CREATE TYPE sponsor_tier AS ENUM ('main', 'sub');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- 2. EVENTS
-- Note: 'events' created before 'users' since 'users' references 'events'
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

-- 3. USERS
CREATE TABLE users (
    uid VARCHAR(128) PRIMARY KEY, -- Firebase Auth UID
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    event_id UUID REFERENCES events(id) ON DELETE SET NULL, -- Links an organizer to an event
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. EVENT SPONSORS
CREATE TABLE event_sponsors (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    sponsor_tier sponsor_tier NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. EVENT TICKET TYPES (Inventory)
CREATE TABLE event_ticket_types (
    id SERIAL PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., 'picnic_mat', 'camping_chair'
    price DECIMAL(10, 2) NOT NULL,
    total_quantity INT NOT NULL,
    issued_quantity INT NOT NULL DEFAULT 0,
    UNIQUE(event_id, name)
);

-- 6. ORDERS
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY, -- The generated ticketId (e.g., from script.js)
    event_id UUID REFERENCES events(id),
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_nic VARCHAR(50),
    status order_status NOT NULL DEFAULT 'pending',
    master_qr_code_url TEXT, -- Local path reference to QR code image
    receipt_url TEXT,        -- Local path reference to bank transfer receipt
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_scanned BOOLEAN DEFAULT FALSE
);

-- 7. ORDER ITEMS
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id INT REFERENCES event_ticket_types(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_per_item DECIMAL(10, 2) NOT NULL,
    arrived INT NOT NULL DEFAULT 0 CHECK (arrived <= quantity)
);
