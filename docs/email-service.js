// email-service.js - VERSION: FETCH SAVED LOCAL IMAGE

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const EMAILJS_SERVICE_ID = "service_i6m7mx9";
const EMAILJS_TEMPLATE_APPROVED_ID = "template_w4luu7m";
const EMAILJS_TEMPLATE_REJECTED_ID = "template_dsib199"; 
const EMAILJS_PUBLIC_KEY = "3eOiK-xC2wifbVSSx"; 

export function formatTicketDetailsAsPlainText(tickets) {
    if (!tickets || tickets.length === 0) return 'No ticket details available.';
    return tickets.map(t => `${t.qty} x ${t.type || 'Standard'}`).join(', ');
}

/**
 * Helper: Fetches an image from a URL (local or remote) and converts it to Base64
 */
async function getImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error converting image to Base64:", error);
        return null;
    }
}

export async function sendApprovalConfirmationEmail(db, ticketData, eventTitle) {
    
    // 1. Get the path to the saved image from Firestore data
    // It usually looks like: "/images/QR/qrcode-PND-1234.png"
    let qrImagePath = ticketData.qrCodeUrl; 

    // If for some reason it's missing, try to fetch from Firestore to be safe
    if (!qrImagePath) {
        try {
            const docSnap = await getDoc(doc(db, "tickets", ticketData.id));
            if (docSnap.exists()) qrImagePath = docSnap.data().qrCodeUrl;
        } catch (e) { console.error("Firestore lookup failed", e); }
    }

    // 2. Fetch the real file from your server and convert to Base64
    console.log(`Fetching QR from: ${qrImagePath}`);
    let qrBase64 = await getImageAsBase64(qrImagePath);

    // Fallback: If fetching the file fails, generate it on the fly (Safety Net)
    if (!qrBase64) {
        console.log("Could not fetch file. Regenerating QR locally as fallback.");
        try {
            const qr = qrcode(0, 'L');
            qr.addData(ticketData.id);
            qr.make();
            qrBase64 = qr.createDataURL(6);
        } catch (e) {
            qrBase64 = "https://placehold.co/200x200?text=Error+Loading+QR";
        }
    }

    try {
        // 3. Prepare Template
        const templateParams = {
            to_name: ticketData.name || ticketData.email, 
            to_email: ticketData.email,
            event_title: eventTitle,
            ticket_id: ticketData.id,
            ticket_details: formatTicketDetailsAsPlainText(ticketData.tickets), 
            
            // This now contains the Base64 data of the ACTUAL saved file
            qr_code_image: qrBase64, 
        };
        
        // 4. Send
        const response = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_APPROVED_ID,
            templateParams,
            EMAILJS_PUBLIC_KEY 
        );

        console.log('Ticket Approved Email Sent:', response.status, response.text);
        return { success: true, message: "Approval email sent." };

    } catch (error) {
        console.error('FAILED to send approval email:', error);
        return { success: false, message: error.message };
    }
}

export async function sendRejectionEmail(ticketData, eventTitle, reasonText) {
    // (Keep your existing rejection logic here - no changes needed)
    if (!window.emailjs) return { success: false, message: "EmailJS SDK not loaded." };
    
    // ... [Your Rejection Logic from previous code] ...
    // (I omitted it here for brevity, but make sure to keep it in your file)

    const templateParams = {
        to_name: ticketData.name || ticketData.email,
        to_email: ticketData.email,
        event_title: eventTitle,
        ticket_id: ticketData.id,
        rejection_reason_text: reasonText, // simplified for brevity
        ticket_status: 'REJECTED' 
    };

    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_REJECTED_ID, templateParams, EMAILJS_PUBLIC_KEY);
        return { success: true, message: 'Rejection email sent.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}