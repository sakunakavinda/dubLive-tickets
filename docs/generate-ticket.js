// generate-ticket.js

import { 
    getFirestore, doc, getDoc, setDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./auth.js"; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// --- EXTERNAL LIBS/CONFIG (REPLACE PLACEHOLDERS) ---
// IMPORTANT: These IDs must match your EmailJS configuration.
const EMAILJS_SERVICE_ID = 'service_i6m7mx9'; 
const EMAILJS_TEMPLATE_ID = 'template_w4luu7m'; 
const EMAILJS_USER_ID = '3eOiK-xC2wifbVSSx'; 
// -----------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const eventId = params.get("eventId"); 

const loadingElement = document.getElementById("loading");
const formElement = document.getElementById("ticketForm");
const errorElement = document.getElementById("error");
const ticketSelectorDiv = document.getElementById("ticketSelector");
const eventDisplayTitle = document.getElementById("eventDisplayTitle");
const totalAmountSpan = document.getElementById("totalAmount");
const emptyMsg = document.getElementById("emptyMsg");

let eventData = null; 

// Helper function to format money (LKR)
function money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', { style: 'currency', currency: 'LKR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Helper function to generate a unique Ticket ID (Transaction ID)
function generateTransactionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `CASH-${timestamp}${random}`.substring(0, 20);
}

// 🔥 REWRITTEN: Using qrcode-generator library for visual consistency 🔥
function generateQrCode(ticketId) {
    if (typeof qrcode === 'undefined') {
        throw new Error("QRCode library (qrcode-generator) not loaded. Check script include in HTML.");
    }

    // Parameters matching your customer flow (e.g., transfer.html)
    const typeNumber = 0;
    const errorCorrectionLevel = 'L'; // Low error correction level
    
    try {
        const qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.addData(ticketId);
        qr.make();
        
        // Size parameters (moduleSize=8, margin=4) match transfer.html/payment.html
        // and ensure the same density and border size.
        return qr.createDataURL(8, 4); 
    } catch (e) {
        throw new Error("Failed to generate QR code image using qrcode-generator.");
    }
}

// Function to upload QR code and get permanent URL (FIXED URL)
async function uploadQRCodeImage(ticketId, base64Image) {
    try {
        // *** FIX: Corrected URL to call the specific cash upload endpoint ***
        const response = await fetch(`/upload-qrcode-cash/${ticketId}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Image })
        });
        // -------------------------------------------------------------------
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Unknown upload error');
        }
        const data = await response.json();
        return data.qrCodeUrl; // Expecting the permanent URL back
    } catch (error) {
        console.error("QR Code Upload Failed:", error);
        throw new Error("Failed to upload QR code image to server. Check server.js (route /upload-qrcode-cash).");
    }
}


/**
 * 1. Load Event data and populate the ticket quantity selector.
 */
async function loadEventData() {
    if (!eventId) {
        errorElement.textContent = "Error: Missing Event ID.";
        loadingElement.style.display = 'none';
        return;
    }

    try {
        const docRef = doc(db, "events", eventId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            errorElement.textContent = "Event not found in database.";
            return;
        }

        eventData = docSnap.data();
        eventData.id = eventId;
        
        eventDisplayTitle.textContent = `Event: ${eventData.title}`;

        const tickets = Array.isArray(eventData.ticketTypes) 
            ? eventData.ticketTypes 
            : []; 

        renderTicketRows(tickets);
        
        loadingElement.style.display = 'none';
        formElement.style.display = 'block';

    } catch (error) {
        console.error("Error loading event data:", error);
        errorElement.textContent = "Failed to load event data: " + error.message;
    }
}

// --- RENDER TICKET ROWS & QTY CONTROLS ---
function renderTicketRows(list) {
    ticketSelectorDiv.innerHTML = '';
    
    const availableTickets = list.filter(t => {
        const remaining = (t.quantity || 0) - (t.issuedTickets || 0);
        return remaining > 0 || t.quantity === undefined;
    });

    if (availableTickets.length === 0) { 
        emptyMsg.style.display = 'block'; 
        return; 
    }
    emptyMsg.style.display = 'none';

    list.forEach((t, originalIndex) => {
        const issued = t.issuedTickets || 0;
        const remaining = typeof t.quantity === 'number' ? t.quantity - issued : '—';
        const maxTickets = typeof t.quantity === 'number' ? Math.max(0, remaining) : Infinity;

        if (typeof t.quantity === 'number' && maxTickets === 0) return;

        const row = document.createElement('div');
        row.className = 'trow';

        const info = document.createElement('div');
        info.className = 'tinfo';
        info.innerHTML = `
          <span class="tname">${t.name || 'Ticket'}</span>
          <span class="tmeta">${money(t.price)} • Available: ${remaining}</span>
        `;

        const qty = document.createElement('div');
        qty.className = 'qty';

        const minus = document.createElement('button');
        minus.className = 'step minus-btn';
        minus.type = 'button';
        minus.textContent = '−';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = String(maxTickets); // Max available
        input.value = '0';
        input.dataset.index = String(originalIndex); // Store the actual array index
        input.dataset.name = t.name;
        input.dataset.price = t.price;
        input.dataset.max = String(maxTickets);

        const plus = document.createElement('button');
        plus.className = 'step plus-btn';
        plus.type = 'button';
        plus.textContent = '+';
        
        function clampAndUpdate() {
            const max = parseInt(input.dataset.max) || Infinity;
            let v = parseInt(input.value || '0', 10);
            if (isNaN(v) || v < 0) v = 0;
            if (v > max) v = max;
            input.value = String(v);
            minus.disabled = v <= 0;
            plus.disabled = v >= max;
            updateTotal();
        }

        minus.addEventListener('click', () => { input.stepDown(); clampAndUpdate(); });
        plus.addEventListener('click', () => { input.stepUp(); clampAndUpdate(); });
        input.addEventListener('input', clampAndUpdate);

        qty.append(minus, input, plus);
        row.append(info, qty);
        ticketSelectorDiv.appendChild(row);
        clampAndUpdate();
    });
}

function updateTotal() {
    let total = 0;
    document.querySelectorAll('#ticketSelector input[type=number]').forEach(inp => {
        const qty = parseInt(inp.value || '0', 10) || 0;
        const price = Number(inp.dataset.price) || 0;
        total += qty * price;
    });
    totalAmountSpan.textContent = money(total);
    return total;
}

/**
 * Clear all form fields after successful ticket generation
 */
function clearFormFields() {
    // Clear customer information fields
    document.getElementById("customerName").value = "";
    document.getElementById("customerEmail").value = "";
    document.getElementById("customerPhone").value = "";
    document.getElementById("customerNIC").value = "";
    
    // Clear ticket quantity inputs and reset totals
    document.querySelectorAll('#ticketSelector input[type=number]').forEach(inp => {
        inp.value = '0';
        // Trigger the input event to update the UI
        inp.dispatchEvent(new Event('input'));
    });
    
    // Clear error/success messages
    errorElement.textContent = "";
    
    // Reset total amount
    totalAmountSpan.textContent = "0 LKR";
}
// --- END: RENDER TICKET ROWS ---


/**
 * 3. Send the ticket email using EmailJS.
 */
async function sendTicketEmail(ticketDetails) {
    if (typeof emailjs === 'undefined') {
        throw new Error("EmailJS SDK is not loaded.");
    }
    
    const ticketSummaryText = ticketDetails.tickets.map(t => `${t.quantity} x ${t.name}`).join('\n');
    
    const templateParams = {
        to_name: ticketDetails.customerName,
        to_email: ticketDetails.customerEmail,
        phone_number: ticketDetails.customerPhone, 
        nic_number: ticketDetails.customerNIC,
        event_title: eventData.title,
        ticket_id: ticketDetails.ticketId,
        ticket_details: ticketSummaryText, 
        qr_code_image: ticketDetails.qrCodeDataUrl, 
        
        event_date: eventData.date,
        event_venue: eventData.venue,
    };

    try {
        emailjs.init(EMAILJS_USER_ID); 
        const response = await emailjs.send(
            EMAILJS_SERVICE_ID, 
            EMAILJS_TEMPLATE_ID, 
            templateParams
        );
        
        if (response.status !== 200) {
             throw new Error(`EmailJS failed with status ${response.status}: ${response.text}`);
        }
        return true;

    } catch (error) {
        throw new Error("Failed to send ticket email. Check EmailJS setup.");
    }
}


/**
 * 4. Update the Firestore database using a Transaction.
 */
async function updateDatabase(transactionId, qrCodeUrl, customerInfo, ticketsToIssue) {
    const eventDocRef = doc(db, "events", eventId);
    
    // --- Phase 1: Update Inventory using Transaction (Critical Safety Check) ---
    await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(eventDocRef);
        if (!docSnap.exists()) {
            throw new Error("Event document does not exist for inventory update!");
        }

        const currentTicketTypes = docSnap.data().ticketTypes;
        let inventoryChangeHappened = false;

        ticketsToIssue.forEach(issue => {
            const index = issue.index;
            const quantity = issue.quantity; 

            if (!Array.isArray(currentTicketTypes) || !currentTicketTypes[index]) {
                throw new Error(`Inventory structure invalid for index ${index}.`);
            }

            const selectedTicket = currentTicketTypes[index];
            const newIssuedCount = (selectedTicket.issuedTickets || 0) + quantity;
            const maxQuantity = selectedTicket.quantity;
            
            // Check availability (critical check)
            if (typeof maxQuantity === 'number' && newIssuedCount > maxQuantity) {
                 throw new Error(`Inventory check failed: Tried to issue ${quantity} tickets, but only ${maxQuantity - (selectedTicket.issuedTickets || 0)} available for ${selectedTicket.name}.`);
            }

            // Modify the issuedTickets count
            currentTicketTypes[index].issuedTickets = newIssuedCount;
            inventoryChangeHappened = true;
        });

        if (inventoryChangeHappened) {
            transaction.update(eventDocRef, {
                ticketTypes: currentTicketTypes
            });
        }
    });

    // --- Phase 2: Create the Consolidated Ticket Document ---
    
    // Map the selected tickets to the target 'tickets' array format:
    const consolidatedTickets = ticketsToIssue.map(t => ({
        type: t.name,
        price: t.price,
        qty: t.quantity,
        arrived: 0, 
    }));
    
    const ticketDocRef = doc(db, "tickets", transactionId);
    await setDoc(ticketDocRef, {
        // TARGET STRUCTURE FIELDS:
        email: customerInfo.customerEmail,
        eventId: eventId,
        isScanned: false, 
        nic: customerInfo.customerNIC,
        phone: customerInfo.customerPhone,
        purchaseDate: new Date(),
        qrCodeUrl: qrCodeUrl,
        ticketId: transactionId,
        issuedBy : auth.currentUser ? auth.currentUser.email : 'admin',
        
        tickets: consolidatedTickets,
        
        // Metadata fields for organizer/admin tracking:
        name: customerInfo.customerName,

    });
}


// =========================================================
// Main Handler
// =========================================================

// Add click event listener to prevent repeated clicks
const generateBtn = document.getElementById("generateTicketBtn");
generateBtn.addEventListener('click', (e) => {
    if (generateBtn.disabled) {
        e.preventDefault();
        alert("Ticket generation is already in progress. Please wait.");
    }
});

formElement.onsubmit = async (e) => {
    e.preventDefault();
    errorElement.textContent = "";
    
    // Check if already processing
    if (generateBtn.disabled) {
        alert("Ticket generation is already in progress. Please wait.");
        return;
    }
    
    const customerInfo = {
        customerName: document.getElementById("customerName").value.trim(),
        customerEmail: document.getElementById("customerEmail").value.trim(),
        customerPhone: document.getElementById("customerPhone").value.trim(),
        customerNIC: document.getElementById("customerNIC").value.trim(),
    };
    
    const totalAmount = updateTotal();

    if (!customerInfo.customerName || !customerInfo.customerEmail || !customerInfo.customerPhone || !customerInfo.customerNIC) {
        errorElement.textContent = "Please fill out all customer information fields.";
        return;
    }
    
    const ticketsToIssue = [];
    document.querySelectorAll('#ticketSelector input[type=number]').forEach(inp => {
        const qty = parseInt(inp.value || '0', 10) || 0;
        if (qty > 0) {
            ticketsToIssue.push({
                index: parseInt(inp.dataset.index),
                name: inp.dataset.name,
                price: Number(inp.dataset.price),
                quantity: qty,
            });
        }
    });

    if (ticketsToIssue.length === 0) {
        errorElement.textContent = "Please select at least one ticket to generate.";
        return;
    }

    // Enhanced button state management
    generateBtn.disabled = true;
    generateBtn.textContent = "Processing...";
    generateBtn.classList.add("btn-processing");
    
    errorElement.style.color = '#00ffcc';
    errorElement.textContent = "Processing order...";

    try {
        const transactionId = generateTransactionId();
        
        // --- Step 1: Generate QR Code (Base64) ---
        errorElement.textContent = "Generating QR Code...";
        const qrCodeDataUrl = await generateQrCode(transactionId);
        
        // --- Step 2: Upload QR Code and get permanent URL (SERVER ENDPOINT REQUIRED) ---
        errorElement.textContent = "Uploading QR Code image...";
        const qrCodeUrl = await uploadQRCodeImage(transactionId, qrCodeDataUrl);

        // --- Step 3: Update Database (Inventory and Ticket Record) ---
        errorElement.textContent = "Updating database records (Transaction)...";
        await updateDatabase(transactionId, qrCodeUrl, customerInfo, ticketsToIssue);
        
        // --- Step 4: Send Email ---
        errorElement.textContent = "Sending ticket via email...";
        await sendTicketEmail({ 
            ...customerInfo, 
            tickets: ticketsToIssue, 
            ticketId: transactionId, 
            qrCodeDataUrl 
        });

        // Clear all form fields after successful generation
        clearFormFields();

        errorElement.style.color = '#7ab97a';
        errorElement.textContent = `Ticket generated, DB updated, and email sent successfully! Total: ${money(totalAmount)}`;

        // Redirect back to the event page after a short delay
        setTimeout(() => {
             // Assuming the event page is named 'event-data.html' based on previous context
             window.location.replace(`ticket-management.html?id=${eventId}`);
        }, 3000);
        
    } catch (error) {
        console.error("Ticket generation failed:", error);
        errorElement.style.color = '#ff5b5b';
        errorElement.textContent = `CRITICAL FAILURE: ${error.message}. Please check inventory/tickets manually.`;
        
        // Error state styling
        generateBtn.classList.remove("btn-processing");
        generateBtn.classList.add("btn-error");
        generateBtn.textContent = "Error - Try Again";
    } finally {
        // Reset button state
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate Ticket & Email";
        generateBtn.classList.remove("btn-processing", "btn-error");
        generateBtn.classList.add("btn-success");
        
        // Reset to original state after a short delay
        setTimeout(() => {
            generateBtn.classList.remove("btn-success");
        }, 2000);
    }
};


// =========================================================
// Initialization
// =========================================================
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("admin.html");
        return;
    }
    if (typeof emailjs === 'undefined') {
        errorElement.textContent = "Warning: EmailJS SDK is missing. Email feature will fail.";
    }

    loadEventData();
});
