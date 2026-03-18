import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase Config (omitted for brevity)
const firebaseConfig = {
  apiKey: "AIzaSyD23cBMvewgTByUcdTNDKe2t4VXtNGEk3A",
  authDomain: "elyzium-5e378.firebaseapp.com",
  projectId: "elyzium-5e378",
  storageBucket: "elyzium-5e378.appspot.com",
  messagingSenderId: "123407494252",
  appId: "1:123407494252:web:324e83b36e587aa1febc49",
  measurementId: "G-53JP89GP8T"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// *** REMOVED: ImgBB API key is no longer needed for flyer upload ***
// const imgbbAPIKey = "fd2ccc747be81c79cc64af5ee7c73d72";

const saveEventBtn = document.getElementById("saveEventBtn");
const msg = document.getElementById("msg");
const ticketTypesContainer = document.getElementById("ticketTypes");
const addTicketTypeBtn = document.getElementById("addTicketTypeBtn");
const startingPriceDisplay = document.getElementById("startingPriceDisplay");

// Progress bar
let progressBar = document.createElement("progress");
progressBar.value = 0;
progressBar.max = 100;
progressBar.style.display = "none";
progressBar.style.marginTop = "10px";
saveEventBtn.parentNode.appendChild(progressBar);

/**
 * Calculates the lowest price from the list of ticket types.
 * @param {Array<Object>} tickets - Array of ticket type objects.
 * @returns {number | null} The lowest price or null if no valid prices are found.
 */
function calculateLowestPrice(tickets) {
    if (!tickets || tickets.length === 0) return null;

    // Map to prices, filter out invalid/zero prices, and find the minimum
    const validPrices = tickets
        .map(ticket => Number(ticket.price))
        .filter(price => !isNaN(price) && price > 0);

    return validPrices.length > 0 ? Math.min(...validPrices) : null;
}

// Add new ticket type dynamically (rest of the code omitted for brevity)
addTicketTypeBtn.addEventListener("click", () => {
  const div = document.createElement("div");
  div.classList.add("ticket-type");

  div.innerHTML = `
    <label>Category Name</label>
    <input type="text" class="ticket-name" placeholder="e.g. VIP">

    <label>Price</label>
    <input type="number" class="ticket-price" placeholder="Enter price">

    <label>Quantity</label>
    <input type="number" class="ticket-qty" placeholder="Enter quantity">
    
  `;

  ticketTypesContainer.appendChild(div);
  
  // Add input listeners to trigger price calculation display
  div.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', updateStartingPriceDisplay);
  });
});

/**
 * Updates the read-only input field with the current lowest price. (omitted for brevity)
 */
function updateStartingPriceDisplay() {
    const tempTicketTypes = [];
    document.querySelectorAll(".ticket-type").forEach((el) => {
        const typePrice = el.querySelector(".ticket-price").value;
        if (typePrice) {
            tempTicketTypes.push({ price: typePrice });
        }
    });

    const lowestPrice = calculateLowestPrice(tempTicketTypes);
    
    if (lowestPrice !== null) {
        // Format the price for display (assuming LKR currency for the template)
        startingPriceDisplay.value = `LKR ${lowestPrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    } else {
        startingPriceDisplay.value = "Calculated automatically";
    }
}

// Save event
saveEventBtn.addEventListener("click", async () => {
  const name = document.getElementById("eventName").value.trim();
  const date = document.getElementById("eventDate").value;
  const time = document.getElementById("eventTime").value;
  const venue = document.getElementById("venue").value.trim();
  const organizer = document.getElementById("organizer").value.trim();
  const contact = document.getElementById("contact").value;
  
  // === NEW FIELD CAPTURE ===
  const description = document.getElementById("eventDescription").value.trim();
  const category = document.getElementById("eventCategory").value;
  const status = document.getElementById("eventStatus").value;
  // =========================
  
  const flyerFile = document.getElementById("flyer").files[0];


  // Collect ticket types dynamically (omitted for brevity)
  const ticketTypes = [];
  document.querySelectorAll(".ticket-type").forEach((el) => {
    const typeName = el.querySelector(".ticket-name").value.trim();
    const typePrice = el.querySelector(".ticket-price").value;
    const typeQty = el.querySelector(".ticket-qty").value;

    if (typeName && typePrice && typeQty) {
      ticketTypes.push({
        name: typeName,
        price: Number(typePrice),
        quantity: Number(typeQty),
        issuedTickets: 0,
      });
    }
  });

  // Calculate the starting price
  const startingPrice = calculateLowestPrice(ticketTypes);

  // Basic validation (omitted for brevity)
  if (!name || !date || !time || !venue || !organizer || !description || !category || !flyerFile || ticketTypes.length === 0 || startingPrice === null) {
    msg.textContent = "⚠️ Please fill all required fields (Name, Date, Time, Venue, Organizer, Description, Category) and enter at least one ticket type with a valid price!";
    msg.style.color = "red";
    return;
  }
  
  // 🚀 CRITICAL VALIDATION: Check if the event date/time is in the past (omitted for brevity)
  const eventDateTime = new Date(`${date}T${time}`);
  const now = new Date();

  if (eventDateTime < now) {
      msg.textContent = "❌ Saving not allowed: The entered event date and time are in the past. Please select a future date/time.";
      msg.style.color = "red";
      alert("Saving not allowed: The entered event date and time are in the past. Please select a future date/time.");
      return;
  }
  // ----------------------------------------------------------------------


  try {
    saveEventBtn.disabled = true;
    saveEventBtn.textContent = "Saving...";
    msg.textContent = "";
    progressBar.style.display = "block";
    progressBar.value = 20;

    // 🚀 NEW: Upload flyer to your server endpoint
    const formData = new FormData();
    // Key must match the Multer key in server.js route: flyerUpload.single('eventFlyerImage')
    formData.append("eventFlyerImage", flyerFile); 
    
    // Add event name to help the server name the file
    formData.append("eventName", name); 

    // Use the existing local upload route from server.js
    const uploadRes = await fetch(`/upload-event-flyer`, { 
      method: "POST",
      body: formData 
    });
    
    // Check for non-200 status code before parsing
    if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(`Flyer upload failed: ${errorData.error || 'Unknown Server Error'}`);
    }
    
    const uploadData = await uploadRes.json();
    
    // Your server returns 'filePath' (e.g., /images/flyers/event-flyer-name.jpg)
    if (!uploadData.filePath) throw new Error("Server response missing file path!"); 

    const flyerUrl = uploadData.filePath; // This is the relative URL we save to Firestore
    progressBar.value = 60;
    // 🚀 END NEW UPLOAD LOGIC 🚀

    // Save event in Firestore
    await addDoc(collection(db, "events"), {
      title: name,
      date: date,
      time: time,
      venue: venue,
      organizer: organizer,
      
      
      // === NEW FIELDS SAVED TO DB ===
      description: description,
      category: category,
      status: status,
      // ==============================
      
      ticketTypes: ticketTypes, // dynamic array
      startingPrice: startingPrice, // lowest price field
      flyerUrl: flyerUrl, // Save the path returned by your internal server
      contact: `https://wa.me/${contact}`,
      createdAt: serverTimestamp(),

      bank: "",
      accNo: "",
      accName: "",
    });

    progressBar.value = 100;
    alert("Event saved successfully!");
    window.location.href = "admin-dashboard.html";

  } catch (error) {
    msg.textContent = "❌ Error: " + error.message;
    msg.style.color = "red";
  } finally {
    saveEventBtn.disabled = false;
    saveEventBtn.textContent = "Save Event";
    progressBar.style.display = "none";
  }
});

// Initialize the first ticket type field on load (omitted for brevity)
document.addEventListener('DOMContentLoaded', () => {
    addTicketTypeBtn.click(); // Programmatically click the button to add the first category
});