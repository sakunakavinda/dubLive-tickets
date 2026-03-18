document.addEventListener('DOMContentLoaded', function () {
    // Initialize EmailJS
    emailjs.init('6Wk6R2DTBHBjcMnEr');

    // DOM Elements
    const title = document.getElementById('event-title');
    const generateQRButton = document.getElementById('generateQRButton');
    const refreshBtn = document.getElementById('refreshBtn');
    const nameInput = document.getElementById('nameInput');
    const picnicMatCount = document.getElementById('picnicMatCount');
    const campingChairCount = document.getElementById('campingChairCount');
    const contactInput = document.getElementById('contactInput');
    const contactInputConf = document.getElementById('contactInputConf');
    const qrCodeImage = document.getElementById('qrCodeImage');
    const placeholder = document.getElementById('placeholder');
    const loader = document.getElementById('loader');
    const subTotalElement = document.getElementById('subtotal');

    let status = 0;

    // Firebase configuration and initialization
    const firebaseConfig = {
        apiKey: "AIzaSyCVilUKEZ6qt3ASm_AwGaatTqGpO-OaXOc",
        authDomain: "elyzium-5e378.firebaseapp.com",
        projectId: "elyzium-5e378",
        storageBucket: "elyzium-5e378.appspot.com",
        messagingSenderId: "123407494252",
        appId: "1:123407494252:web:5e496e80e23229aafebc49"
    };

    // Initialize Firebase only if not already initialized
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Ticket prices
    const ticketPrices = {
        picnic_mat: 1000,
        camping_chair: 1500
    };

    // Check internet connection
    async function checkInternetConnection() {
        try {
            await firebase.firestore().collection('connectivityCheck').doc('ping').get({ source: 'server' });
            return true;
        } catch (e) {
            return false;
        }
    }

    // Update subtotal when ticket counts change
    function updateSubTotal() {
        const picnicCount = parseInt(picnicMatCount.value) || 0;
        const campingCount = parseInt(campingChairCount.value) || 0;
        const subTotal = (picnicCount * ticketPrices.picnic_mat) + (campingCount * ticketPrices.camping_chair);
        subTotalElement.textContent = `LKR ${subTotal} /=`;
    }

    // Event listeners for counter buttons
    document.querySelectorAll('.counter-btn').forEach(button => {
        button.addEventListener('click', function () {
            const type = this.getAttribute('data-type');
            const isPlus = this.classList.contains('plus');
            const inputField = type === 'picnic_mat' ? picnicMatCount : campingChairCount;
            let value = parseInt(inputField.value) || 0;

            if (isPlus) {
                value++;
            } else {
                value = Math.max(0, value - 1);
            }

            inputField.value = value;
            updateSubTotal();
        });
    });

    title.addEventListener('click', function () {
        // First replace current history state with index.html
    window.history.replaceState({}, '', 'index.html');
    
    // Then navigate to home.html
    window.location.href = './home.html';
    });

    // Initialize page
    function initializePage() {
        window.addEventListener('pageshow', function (event) {
            if (event.persisted || performance.getEntriesByType("navigation")[0].type === "back_forward") {
                clearInputs();
                updateSubTotal();
                loader.style.display = 'none';
                status = 0;
                generateQRButton.disabled = false;
                generateQRButton.textContent = 'Buy';
            } else {
                clearInputs();
            }
        });

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment') === 'cancelled') {
            showCancellationMessage();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // Generate QR Button Click Handler
    generateQRButton.addEventListener('click', async function () {
        if (status === 1) {
            alert("Generation process already initiated");
            return;
        }

        try {
            // Check internet connection first
            const isOnline = await checkInternetConnection();
            if (!isOnline) {
                alert('No internet connection');
                generateQRButton.disabled = false;
                generateQRButton.textContent = 'Buy';
                return;
            }

            status = 1;

            // Validate inputs
            const name = nameInput.value.trim();
            const picnicCount = parseInt(picnicMatCount.value) || 0;
            const campingCount = parseInt(campingChairCount.value) || 0;
            const contact = contactInput.value.trim();
            const contactConf = contactInputConf.value.trim();

            if (!name || (picnicCount === 0 && campingCount === 0) || !contact) {
                alert('Please fill all details correctly and select at least one ticket');
                status = 0;
                generateQRButton.disabled = false;
                generateQRButton.textContent = 'Buy';
                return;
            }

            if (contact !== contactConf) {
                alert('Emails do not match');
                status = 0;
                generateQRButton.disabled = false;
                generateQRButton.textContent = 'Buy';
                return;
            }

            if (!validateEmail(contact)) {
                alert('Please enter a valid email address');
                status = 0;
                generateQRButton.disabled = false;
                generateQRButton.textContent = 'Buy';
                return;
            }

            // Proceed with payment
            qrCodeImage.src = "images/qr.png";
            qrCodeImage.style.display = 'flex';
            placeholder.style.display = 'none';
            generateQRButton.textContent = 'Processing...';
            loader.style.display = 'flex';

            const ticketId = generateTicketId();
            const total = (picnicCount * ticketPrices.picnic_mat) + (campingCount * ticketPrices.camping_chair);

            // Store ticket data in sessionStorage (persists only for this session)
            const ticketData = {
                ticketId,
                name,
                seats: picnicCount + campingCount,
                contact,
                picnicCount: picnicCount,
                campingCount: campingCount,
                total,
                timestamp: new Date().toISOString()
            };

            // Store in sessionStorage with consistent key
            // Replace sessionStorage with localStorage:
            localStorage.setItem('pendingTicket', JSON.stringify(ticketData));
            sessionStorage.setItem(`ticket_${ticketId}`, JSON.stringify(ticketData));

            const stripePriceIds = {
                picnic_mat: 'price_1R9q764ZyAT5oIFLt3qvmW9J',
                camping_chair: 'price_1R9q7V4ZyAT5oIFLjFmPkEJ2'
            };

            const stripe = Stripe("pk_test_51R9V5a4ZyAT5oIFL6UvbhT3aG2SdirrGBXvoABYEDXKiAUT3q4Nmoc8hDmEnouLjC2NO7TfUIU5UQefgUXJR3sON00AuMCHTdZ");
            const baseUrl = 'https://sakunakavinda.github.io/Elyzium';

            // Create line items for each ticket type if count > 0
            const lineItems = [];
            if (picnicCount > 0) {
                lineItems.push({
                    price: stripePriceIds.picnic_mat,
                    quantity: picnicCount
                });
            }
            if (campingCount > 0) {
                lineItems.push({
                    price: stripePriceIds.camping_chair,
                    quantity: campingCount
                });
            }

            const { error } = await stripe.redirectToCheckout({
                lineItems: lineItems,
                mode: 'payment',
                successUrl: `${baseUrl}/success.html?ticketId=${ticketId}`,
                cancelUrl: `${baseUrl}/buy.html?payment=cancelled&ticketId=${ticketId}`,
                clientReferenceId: ticketId,
            });

            if (error) {
                throw error;
            }

        } catch (error) {
            console.error('Error:', error);
            showErrorMessage('Error processing your request: ' + (error.message || 'Please try again later'));
            status = 0;
            generateQRButton.disabled = false;
            generateQRButton.textContent = 'Buy';
            loader.style.display = 'none';
        }
    });

    // Refresh Button Click Handler
    refreshBtn.addEventListener('click', function () {
        clearInputs();
    });

    // Helper Functions
    function generateTicketId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID().replace(/-/g, '').substring(0, 8);
        } else {
            return 'xxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    }

    function validateEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    function clearInputs() {
        nameInput.value = '';
        picnicMatCount.value = 0;
        campingChairCount.value = 0;
        contactInput.value = '';
        contactInputConf.value = '';
        subTotalElement.textContent = 'LKR 0 /=';
        if (placeholder) placeholder.style.display = 'block';
        if (qrCodeImage) {
            qrCodeImage.style.display = 'none';
            qrCodeImage.src = '';
        }
    }

    function showCancellationMessage() {
        alert('Payment was cancelled. Please try again if you wish to complete your purchase.');
    }

    function showErrorMessage(message) {
        alert(message);
    }

    // Initialize the page
    initializePage();
    updateSubTotal(); // Initialize subtotal on page load
});