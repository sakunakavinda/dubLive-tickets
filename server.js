require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const multer = require('multer'); 
const fs = require('fs');

// --- FIREBASE SERVICE ACCOUNT CONFIG ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        console.log("Firebase credentials loaded from environment variable.");
    } catch (e) {
        console.error("CRITICAL ERROR: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON variable.");
        throw new Error("Invalid Firebase Service Account JSON format."); 
    }
} else {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
    try {
        serviceAccount = require(serviceAccountPath);
        console.log(`Firebase credentials loaded from local file path: ${serviceAccountPath}`);
    } catch (e) {
        console.error(`CRITICAL ERROR: Local file path failed. Ensure ${serviceAccountPath} exists or set FIREBASE_SERVICE_ACCOUNT_JSON.`);
        throw new Error("Missing Firebase credentials. Server cannot start.");
    }
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
});
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 8080;

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- Middleware ---
app.use(cors());
// IMPORTANT: Increase JSON limit to handle large Base64 QR code image uploads
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' })); 

// =========================================================
// 📂 DIRECTORY SETUP
// =========================================================

// Define all upload directories
const PROFILES_DIR = path.join(__dirname, 'docs', 'images', 'profiles');
const FLYER_DIR = path.join(__dirname, 'docs', 'images', 'flyers');
const SPONSORS_BASE_DIR = path.join(__dirname, 'docs', 'images', 'sponsors'); 
const MAIN_SPONSOR_DIR = path.join(SPONSORS_BASE_DIR, 'main');
const SUB_SPONSOR_DIR = path.join(SPONSORS_BASE_DIR, 'sub');
const EVENT_MAPS_DIR = path.join(__dirname, 'docs', 'images', 'eventMaps');
const QR_DIR = path.join(__dirname, 'docs', 'images', 'QR');
const RECEIPT_DIR = path.join(__dirname, 'docs', 'images', 'receipts');

// Ensure all directories exist
const dirsToEnsure = [
    PROFILES_DIR, 
    FLYER_DIR, 
    MAIN_SPONSOR_DIR, 
    SUB_SPONSOR_DIR, 
    EVENT_MAPS_DIR,
    QR_DIR,
    RECEIPT_DIR
];

dirsToEnsure.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// =========================================================
// 🛠️ HELPER FUNCTIONS
// =========================================================

// Helper: Safely Delete Local File
function safeUnlink(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error("Failed to delete file:", filePath, err);
            else console.log("Successfully deleted file:", filePath);
        });
    } else {
        console.warn("Attempted to delete non-existent file:", filePath);
    }
}

/**
 * Helper: Save Buffer or Base64 to Local Disk
 * Returns the relative URL for the database (e.g., /images/QR/filename.png)
 */
async function saveBufferToDisk(data, folderPath, filename, subFolderUrl) {
    let buffer;
    
    // Check if data is already a Buffer, otherwise assume Base64 string
    if (Buffer.isBuffer(data)) {
        buffer = data;
    } else {
        // Strip Base64 header if present
        const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
        buffer = Buffer.from(base64Data, 'base64');
    }

    const fullPath = path.join(folderPath, filename);

    // Write file to disk (Promise wrapper)
    await fs.promises.writeFile(fullPath, buffer);
    
    // Return relative URL
    return `/images/${subFolderUrl}/${filename}`;
}

// =========================================================
// 📤 MULTER CONFIGURATIONS
// =========================================================

// 1. Profile Pictures
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILES_DIR),
    filename: (req, file, cb) => {
        const email = req.body.email;
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (!email) return cb(new Error('email is required for filename.'), false);
        const filename = `${email.replace(/[^a-zA-Z0-9]/g, '_')}_profile${fileExt}`;
        cb(null, filename);
    }
});
const profileUpload = multer({ storage: profileStorage });

// 2. Flyers
const flyerStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, FLYER_DIR),
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname).toLowerCase();
        const nameSource = req.body.eventName || req.body.eventId;
        const sanitizedName = nameSource 
            ? nameSource.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^-+|-+$/g, '')
            : `unknown-flyer-${Date.now()}`;
        cb(null, `event-flyer-${sanitizedName}${fileExt}`);
    }
});
const flyerUpload = multer({ storage: flyerStorage });

// 3. Sponsors
const sponsorStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.params.type; 
        if (type === 'main') cb(null, MAIN_SPONSOR_DIR);
        else if (type === 'sub') cb(null, SUB_SPONSOR_DIR);
        else cb(new Error('Invalid sponsor type specified.'), false); 
    },
    filename: (req, file, cb) => {
        const type = req.params.type;
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (type === 'main') {
            const eventName = req.body.eventName || req.body.eventId || 'temp-event';
            const sanitizedName = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            cb(null, `main-sponsor-${sanitizedName}${fileExt}`);
        } else {
            const uniqueId = Math.random().toString(36).substring(2, 8);
            cb(null, `${type}-sponsor-${uniqueId}${fileExt}`);
        }
    }
});
const sponsorUpload = multer({ storage: sponsorStorage });

// 4. Maps
const mapStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, EVENT_MAPS_DIR),
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname).toLowerCase();
        const nameSource = req.body.eventName || req.body.eventId;
        const sanitizedName = nameSource 
            ? nameSource.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            : `unknown-${Date.now()}`; 
        cb(null, `event-map-${sanitizedName}${fileExt}`);
    }
});
const mapUpload = multer({ storage: mapStorage });

// 5. Memory Storage (For Receipts/Bank Transfer)
const memoryUpload = multer({ storage: multer.memoryStorage() });


// =========================================================
// 🌐 ROUTES
// =========================================================

// --- Upload Profile Picture (Local) ---
app.post('/upload-profile-pic', (req, res) => {
    profileUpload.single('profilePic')(req, res, (err) => {
        if (err) return res.status(500).json({ error: `Upload error: ${err.message}` });
        if (!req.file) {
            if (!req.body.email) return res.status(400).json({ error: "email missing or no file uploaded." });
            return res.status(400).json({ error: "No file uploaded." });
        }
        const relativeUrl = `/images/profiles/${req.file.filename}`;
        res.status(200).json({ message: "Profile picture saved locally.", profilePicUrl: relativeUrl });
    });
});

// --- Upload Event Flyer (Local) ---
app.post('/upload-event-flyer', (req, res) => {
    flyerUpload.single('eventFlyerImage')(req, res, (err) => {
        if (err) return res.status(500).json({ error: `Upload error: ${err.message}` });
        if (!req.file) return res.status(400).json({ error: "No event flyer file uploaded." });

        const relativePath = `/images/flyers/${req.file.filename}`;
        if (req.body.oldFilePath) {
            const oldAbsolutePath = path.join(__dirname, 'docs', req.body.oldFilePath);
            safeUnlink(oldAbsolutePath);
        }
        res.status(200).json({ message: "Event flyer saved locally.", filePath: relativePath, filename: req.file.filename });
    });
});

// --- Delete Event Flyer ---
app.delete('/delete-event-flyer', (req, res) => {
    const { filePath } = req.body; 
    if (!filePath || !filePath.startsWith('/images/flyers/')) {
         return res.status(403).json({ error: "Invalid file path provided." });
    }
    safeUnlink(path.join(__dirname, 'docs', filePath)); 
    res.status(200).json({ message: "Event flyer deletion initiated." });
});

// --- Upload Sponsor Ad (Local) ---
app.post('/upload-sponsor-ad/:type', (req, res) => {
    sponsorUpload.single('sponsorImage')(req, res, (err) => {
        if (err) return res.status(500).json({ error: `Upload error: ${err.message}` });
        if (!req.file) return res.status(400).json({ error: "No sponsor image file uploaded." });

        const type = req.params.type; 
        let relativePath;
        if (type === 'main') relativePath = `/images/sponsors/main/${req.file.filename}`;
        else if (type === 'sub') relativePath = `/images/sponsors/sub/${req.file.filename}`;
        
        if (type === 'main' && req.body.oldFilePath) {
            const oldAbsolutePath = path.join(__dirname, 'docs', req.body.oldFilePath);
            if (!req.body.oldFilePath.includes('default')) safeUnlink(oldAbsolutePath);
        }
        res.status(200).json({ message: "Sponsor image saved locally.", filePath: relativePath, filename: req.file.filename });
    });
});

// --- Delete Sponsor Ad ---
app.delete('/delete-sponsor-ad/:type', (req, res) => {
    const { filePath } = req.body;
    if (!filePath || !filePath.startsWith('/images/sponsors/')) {
         return res.status(403).json({ error: "Invalid file path provided." });
    }
    safeUnlink(path.join(__dirname, 'docs', filePath)); 
    res.status(200).json({ message: "Deletion initiated." });
});

// --- Upload Event Map (Local) ---
app.post('/upload-event-map', (req, res) => {
    mapUpload.single('eventMapImage')(req, res, (err) => {
        if (err) return res.status(500).json({ error: `Upload error: ${err.message}` });
        if (!req.file) return res.status(400).json({ error: "No event map file uploaded." });

        const relativePath = `/images/eventMaps/${req.file.filename}`;
        if (req.body.oldFilePath) {
            const oldAbsolutePath = path.join(__dirname, 'docs', req.body.oldFilePath);
            safeUnlink(oldAbsolutePath);
        }
        res.status(200).json({ message: "Event map saved locally.", filePath: relativePath, filename: req.file.filename });
    });
});

// --- Delete Event Map ---
app.delete('/delete-event-map', (req, res) => {
    const { filePath } = req.body;
    if (!filePath || !filePath.startsWith('/images/eventMaps/')) {
         return res.status(403).json({ error: "Invalid file path provided." });
    }
    safeUnlink(path.join(__dirname, 'docs', filePath)); 
    res.status(200).json({ message: "Event map deletion initiated." });
});

// --- Create Payment Intent (Stripe) ---
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { order } = req.body;
        if (!order || !Array.isArray(order.tickets) || order.tickets.length === 0) {
            return res.status(400).send({ error: 'Invalid order data received.' });
        }
        let totalAmount = 0;
        for (const ticket of order.tickets) {
            const price = Number(ticket.price);
            const quantity = Number(ticket.quantity);
            if (isNaN(price) || isNaN(quantity)) return res.status(400).send({ error: 'Invalid ticket price or quantity.' });
            totalAmount += price * quantity;
        }
        if (totalAmount <= 0) return res.status(400).send({ error: 'Total amount must be greater than zero.' });

        const paymentIntent = await stripe.paymentIntents.create({ 
            amount: Math.round(totalAmount * 100),
            currency: 'lkr',
            automatic_payment_methods: { enabled: true },
            metadata: { eventId: order.eventId || 'N/A', customerName: order.customer ? order.customer.name : 'N/A' },
        });
        res.send({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ error: `Internal Server Error: ${error.message}` });
    }
});

// --- Finalize Purchase (DB Update) ---
app.post('/finalize-purchase/:ticketId', async (req, res) => {
    const { ticketId } = req.params; 
    const { orderDetails } = req.body;
    if (!orderDetails) return res.status(400).send({ error: 'Missing orderDetails.' });

    const customer = orderDetails.customer || {};
    const ticketData = {
        eventId: orderDetails.eventId,
        email: customer.email,
        phone: customer.phone || '', 
        nic: customer.nic || '',     
        tickets: orderDetails.tickets.map(t => ({ type: t.type, qty: t.quantity, price: t.price, arrived: 0 })),
        purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
        isScanned: false
    };

    try {
        const eventRef = db.collection('events').doc(orderDetails.eventId);
        await db.runTransaction(async (transaction) => {
            const eventSnapshot = await transaction.get(eventRef);
            if (!eventSnapshot.exists) throw new Error(`Event with ID ${orderDetails.eventId} not found.`);

            const eventData = eventSnapshot.data();
            let eventTicketTypes = [...(eventData.ticketTypes || [])];
            orderDetails.tickets.forEach(purchasedTicket => {
                const idx = eventTicketTypes.findIndex(t => t.name === purchasedTicket.type && Number(t.price) === Number(purchasedTicket.price));
                if (idx !== -1) {
                    const currentType = eventTicketTypes[idx];
                    const newIssued = (currentType.issuedTickets || 0) + purchasedTicket.quantity;
                    if (typeof currentType.quantity === 'number' && newIssued > currentType.quantity) {
                        throw new Error(`Stock error: Purchase of ${purchasedTicket.quantity} exceeds remaining count for ${purchasedTicket.type}.`);
                    }
                    eventTicketTypes[idx] = { ...currentType, issuedTickets: newIssued };
                }
            });
            transaction.update(eventRef, { ticketTypes: eventTicketTypes });
        });
        await db.collection('tickets').doc(ticketId).set({ ...ticketData, ticketId });
        res.status(200).send({ message: 'Purchase finalized successfully' });
    } catch (error) {
        console.error("Finalize Error:", error);
        res.status(500).send({ error: error.message });
    }
});

// --- Upload QR Code (Online Payment) - SAVES LOCALLY ---
app.post('/upload-qrcode/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: "Missing base64Image data." });

    try {
        const filename = `qrcode-${ticketId}.png`;
        // Save to local QR folder
        const qrCodeUrl = await saveBufferToDisk(base64Image, QR_DIR, filename, 'QR');
        
        await db.collection('tickets').doc(ticketId).update({ qrCodeUrl });
        res.status(200).json({ message: "QR Code saved locally.", qrCodeUrl });
    } catch (error) {
        console.error("Error saving QR Code:", error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

// --- Upload QR Code (Cash Payment) - SAVES LOCALLY ---
app.post('/upload-qrcode-cash/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: "Missing Base64 image data." });

    try {
        const filename = `cash-qrcode-${ticketId}.png`;
        // Save to local QR folder
        const qrCodeUrl = await saveBufferToDisk(base64Image, QR_DIR, filename, 'QR');
        res.status(200).json({ qrCodeUrl });
    } catch (error) {
        console.error(`Error processing cash ticket QR ${ticketId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// --- Submit Bank Transfer (Receipt & QR) - SAVES LOCALLY ---
app.post('/submit-transfer', memoryUpload.single('receipt'), async (req, res) => {
    try {
        if (!req.file || !req.body.orderData) {
            return res.status(400).json({ error: "Missing transfer receipt file or ticket order data." });
        }

        const fullOrderData = JSON.parse(req.body.orderData);
        const { ticketId, qrCodeDataURL, name, email, phone, nic, ...restOfTicketData } = fullOrderData;
        
        if (!ticketId || !qrCodeDataURL || !name || !email || !phone || !nic) {
            return res.status(400).json({ error: "Missing critical customer/ticket data." });
        }

        // 1. Save Receipt to docs/images/receipts
        const receiptExt = path.extname(req.file.originalname) || '.jpg';
        const receiptFilename = `receipt-${ticketId}${receiptExt}`;
        const receiptUrl = await saveBufferToDisk(req.file.buffer, RECEIPT_DIR, receiptFilename, 'receipts');

        // 2. Save QR Code to docs/images/QR
        const qrFilename = `qrcode-pending-${ticketId}.png`;
        const qrCodeUrl = await saveBufferToDisk(qrCodeDataURL, QR_DIR, qrFilename, 'QR');

        const finalTicketData = {
            ...restOfTicketData,
            name,
            email, 
            phone, 
            nic,   
            ticketId,
            purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
            qrCodeUrl,  // Local Path
            receiptUrl, // Local Path
        };

        await db.collection('pendingTickets').doc(ticketId).set(finalTicketData);
        res.status(200).json({ message: "Transfer submitted and saved locally.", ticketId });

    } catch (error) {
        console.error("Error submitting bank transfer:", error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

// --- Static Files ---
app.use(express.static(path.join(__dirname, 'docs')));

// --- API: Get Version ---
app.get('/api/version', (req, res) => {
    try {
        const packageJsonPath = path.join(__dirname, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        res.json({ version: packageJson.version || '0.2.0' });
    } catch (error) {
        console.error("Error reading package.json:", error);
        res.json({ version: '0.2.0' });
    }
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'index.html'), (err) => {
        if (err) res.status(500).send('Server error: Could not load the main page.');
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server is running. Open http://localhost:${PORT}`);
});