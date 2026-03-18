import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, setDoc, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD23cBMvewgTByUcdTNDKe2t4VXtNGEk3A",
    authDomain: "elyzium-5e378.firebaseapp.com",
    databaseURL: "https://elyzium-5e378-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "elyzium-5e378",
    storageBucket: "elyzium-5e378.firebasestorage.app",
    messagingSenderId: "123407494252",
    appId: "1:123407494252:web:5e496e80e23229aafebc49",
    measurementId: "G-GLZ0W7HFSY"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

// --- HANDLE ROLE SELECTION ---
const roleSelector = document.getElementById("roleSelector");
const eventSelector = document.getElementById("eventSelector");

if (roleSelector && eventSelector) {
    roleSelector.addEventListener("change", async () => {
        const selectedRole = roleSelector.value;
        if (selectedRole === "organizer") {
            eventSelector.style.display = "block";
            // Fetch and populate events
            try {
                const eventsSnapshot = await getDocs(collection(db, 'events'));
                eventSelector.innerHTML = '<option value="" disabled selected>Select Event</option>';
                eventsSnapshot.forEach(doc => {
                    const eventData = doc.data();
                    const option = document.createElement("option");
                    option.value = doc.id;
                    option.textContent = eventData.title || eventData.name || doc.id;
                    eventSelector.appendChild(option);
                });
            } catch (error) {
                console.error("Error fetching events:", error);
                eventSelector.innerHTML = '<option value="" disabled>No events available</option>';
            }
        } else {
            eventSelector.style.display = "none";
            eventSelector.innerHTML = '<option value="" disabled selected>Select Event</option>';
        }
    });
}

// --- HANDLE REGISTER ---
const registerBtn = document.getElementById("registerBtn");
if (registerBtn) {
    registerBtn.addEventListener("click", async () => {
        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const role = document.getElementById("roleSelector").value;
        const errorElement = document.getElementById("error");

        if (password !== confirmPassword) { errorElement.textContent = "Passwords do not match!"; return; }
        if (!name || !email || !password || !confirmPassword) { errorElement.textContent = "Please fill all fields!"; return; }
        if (!role) { errorElement.textContent = 'Please select a role.'; return; }
        
        let eventId = null;
        if (role === "organizer") {
            eventId = document.getElementById("eventSelector").value;
            if (!eventId) { errorElement.textContent = 'Please select an event for the organizer.'; return; }
        }
        
        console.log('Registering user:', { name, email, role, eventId });

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Prepare base user profile
            const userProfile = { name, email, role, createdAt: new Date() };
            if (role === "organizer" && eventId) {
                userProfile.event = eventId;
            }
            
            // Map the user to the correct collection
            const collectionPath = role === "admin" ? "admins" : "organizers";

            await setDoc(doc(db, collectionPath, user.uid), userProfile);

            alert("Registration successful!");
            window.location.replace("admin-dashboard.html"); 
        } catch (error) {
            errorElement.textContent = error.message;
        }
    });
}

// --- HANDLE LOGIN ---
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const errorElement = document.getElementById("error");
        errorElement.textContent = "";

        if (!email || !password) { errorElement.textContent = "Please enter both email and password."; return; }

        const originalBtnText = loginBtn.textContent; 
        loginBtn.textContent = "Logging In...";
        loginBtn.disabled = true;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const userId = userCredential.user.uid;
            let redirectUrl = null;

            // 1. Check for Admin
            const adminDoc = await getDoc(doc(db, "admins", userId));
            if (adminDoc.exists()) redirectUrl = "admin-dashboard.html"; 
             
            // 2. Check for Organizer
            if (!redirectUrl) {
                const organizerDoc = await getDoc(doc(db, "organizers", userId));
                if (organizerDoc.exists()) redirectUrl = "organizer-dashboard.html";
            }

            if (redirectUrl) {
                window.location.replace(redirectUrl);
            } else {
                errorElement.textContent = "No assigned role found.";
                loginBtn.textContent = originalBtnText; loginBtn.disabled = false;
            }
        } catch (error) {
            errorElement.textContent = error.message;
            loginBtn.textContent = originalBtnText; loginBtn.disabled = false;
        }
    });
}
