// ===== Firebase конфигурация =====
// Конфигурация за Authentication и Firestore (от registration-88c86)
const firebaseConfig = {
    apiKey: "AIzaSyCtTNJsKJWnOVpRazP5Txz37ll_odEkEo8",
    authDomain: "registration-88c86.firebaseapp.com",
    projectId: "registration-88c86",
    storageBucket: "registration-88c86.firebasestorage.app",
    messagingSenderId: "344139226116",
    appId: "1:344139226116:web:4d1559eab47beab89a2951"
};

// Конфигурация за Realtime Database със сензорите (от ESP32)
const databaseConfig = {
    databaseURL: "https://esp32-5d620-default-rtdb.firebaseio.com/"
};

// Инициализиране на Firebase за Authentication и Firestore
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Инициализиране на второ приложение за Realtime Database
const secondaryApp = firebase.initializeApp(databaseConfig, "secondary");
const rtdb = secondaryApp.database();

// Инициализиране на EmailJS (заменете с вашите данни от https://www.emailjs.com/)
emailjs.init("1HnRmk_dhUEdS49Eq");

// ===== Глобални променливи =====
let currentUser = null;
let isAdmin = false;
let spot1Status = "ЗАРЕЖДАНЕ";
let spot2Status = "ЗАРЕЖДАНЕ";
let spot3Status = "СВОБОДНО";
let spot1Distance = -1;
let spot2Distance = -1;
let spot3Distance = -1;
let lastUpdateTime = null;
let map = null;
let parkingPolygons = [];
let allUsers = [];
let filteredUsers = [];
let currentAdminPage = 1;
const usersPerPage = 10;
let userFavorites = []; // Масив с любими места на потребителя
let deferredPrompt; // За PWA инсталация

// Данни за паркоместата
const parkingSpotsData = [
    { id: "spot1", number: 1, name: "Място 1", nameEn: "Spot 1", type: "disabled", lat: 42.8768, lng: 25.3179 },
    { id: "spot2", number: 2, name: "Място 2", nameEn: "Spot 2", type: "regular", lat: 42.8768, lng: 25.3179 },
    { id: "spot3", number: 3, name: "Място 3", nameEn: "Spot 3", type: "regular", lat: 42.8768, lng: 25.3179 }
];

// ===== PWA Инсталация =====
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const closeInstallBanner = document.getElementById('closeInstallBanner');
const permanentInstallBtn = document.getElementById('permanentInstallBtn');
const iosInstructions = document.getElementById('iosInstructions');

// Проверка дали е iOS
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Проверка дали приложението вече е инсталирано (работи в standalone mode)
function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

// Показване/скриване на бутона за инсталиране
function updateInstallButton() {
    if (isRunningStandalone()) {
        // Вече е инсталирано - скриваме бутоните
        if (permanentInstallBtn) permanentInstallBtn.style.display = 'none';
        if (installBanner) installBanner.style.display = 'none';
        if (iosInstructions) iosInstructions.style.display = 'none';
        return;
    }

    if (isIOS()) {
        // iOS - показваме инструкции
        if (permanentInstallBtn) permanentInstallBtn.style.display = 'block';
        if (iosInstructions) iosInstructions.style.display = 'block';
        if (installBanner) installBanner.style.display = 'none';
    } else {
        // Android/други - показваме бутона
        if (permanentInstallBtn) permanentInstallBtn.style.display = 'block';
        if (iosInstructions) iosInstructions.style.display = 'none';
        
        // Показваме банера ако има deferredPrompt
        if (deferredPrompt && !localStorage.getItem('installBannerClosed')) {
            installBanner.style.display = 'flex';
        }
    }
}

// Глобална функция за инсталиране
window.promptInstall = function() {
    if (isIOS()) {
        // iOS - показваме инструкциите
        iosInstructions.style.display = 'block';
        showNotification('Следвайте инструкциите за да добавите Parkly на началния екран', 'success');
        return;
    }

    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Потребителят инсталира приложението');
                showNotification('✅ Parkly беше инсталирано успешно!', 'success');
                updateInstallButton();
            }
            deferredPrompt = null;
            installBanner.style.display = 'none';
        });
    } else {
        showNotification('Инсталацията не е възможна в момента. Опитайте отново по-късно.', 'error');
    }
};

// Слушател за beforeinstallprompt събитие
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButton();
});

// Слушател за успешна инсталация
window.addEventListener('appinstalled', () => {
    console.log('Parkly беше инсталирано');
    deferredPrompt = null;
    updateInstallButton();
    showNotification('✅ Благодарим, че инсталирахте Parkly!', 'success');
});

// Затваряне на банера
if (closeInstallBanner) {
    closeInstallBanner.addEventListener('click', () => {
        installBanner.style.display = 'none';
        localStorage.setItem('installBannerClosed', 'true');
    });
}

// Проверка за офлайн режим
window.addEventListener('online', () => document.body.classList.remove('offline'));
window.addEventListener('offline', () => document.body.classList.add('offline'));

// ===== ФУНКЦИИ ЗА ПОКАЗВАНЕ НА СЪОБЩЕНИЯ =====
function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.style.display = 'block';
        setTimeout(() => element.style.display = 'none', 5000);
    }
}

function showInlineNotification(message, type = 'success') {
    const notificationEl = document.getElementById('notification');
    const icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';
    
    notificationEl.innerHTML = icon + ' ' + message;
    notificationEl.className = `notification ${type} show`;
    
    setTimeout(() => {
        notificationEl.classList.add('hide');
        setTimeout(() => {
            notificationEl.classList.remove('show', 'hide');
        }, 300);
    }, 3000);
}

function showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.style.display = 'block';
        setTimeout(() => element.style.display = 'none', 5000);
    }
}

// ===== ПРОВЕРКА ЗА АДМИНИСТРАТОР =====
async function isUserAdmin(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        return userData?.isAdmin === true || userData?.role === 'admin';
    } catch (error) {
        console.error('Грешка при проверка за администратор:', error);
        return false;
    }
}

// ===== ФУНКЦИИ ЗА ЛЮБИМИ МЕСТА =====
async function loadUserFavorites() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userFavorites = userData.favorites || [];
            console.log("Любими места заредени:", userFavorites);
        }
    } catch (error) {
        console.error('Грешка при зареждане на любими:', error);
    }
}

async function toggleFavorite(spotId) {
    if (!currentUser) {
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        showNotification(
            currentLang === 'bg' ? 'Изисква се вход' : 'Login Required',
            currentLang === 'bg' ? 'За да добавяте любими места, моля влезте в профила си.' : 'Please login to add favorites to your list.',
            '🔐',
            [
                { label: currentLang === 'bg' ? 'Вход' : 'Login', type: 'primary', callback: () => document.querySelector('[data-page=login]').click() },
                { label: currentLang === 'bg' ? 'Отмяна' : 'Cancel', type: 'secondary' }
            ]
        );
        return;
    }
    
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            let favorites = userData.favorites || [];
            
            if (favorites.includes(spotId)) {
                favorites = favorites.filter(id => id !== spotId);
                showSuccess('login-success', 'Премахнато от любими!');
            } else {
                favorites.push(spotId);
                showSuccess('login-success', 'Добавено към любими!');
            }
            
            await userRef.update({ favorites: favorites });
            userFavorites = favorites;
            
            updateFavoriteButtons();
            
            if (document.getElementById('favorites-page').classList.contains('active')) {
                displayFavorites();
            }
            
            if (map && parkingPolygons.length > 0) {
                parkingPolygons.forEach(polygon => map.removeLayer(polygon));
                parkingPolygons = [];
                createParkingSpots();
            }
        }
    } catch (error) {
        console.error('Грешка при промяна на любими:', error);
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        showNotification(
            currentLang === 'bg' ? ' Грешка' : ' Error',
            error.message,
            ''
        );
    }
}

function isFavorite(spotId) {
    return userFavorites && userFavorites.includes(spotId);
}

function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const spotId = btn.getAttribute('data-spot-id');
        if (isFavorite(spotId)) {
            btn.innerHTML = '<i class="fas fa-star"></i> Премахни';
            btn.classList.add('btn-warning');
            btn.classList.remove('btn-favorite');
        } else {
            btn.innerHTML = '<i class="far fa-star"></i> Любимо';
            btn.classList.add('btn-favorite');
            btn.classList.remove('btn-warning');
        }
    });
}

function navigateToSpot(lat, lng, spotName) {
    const currentLang = document.body.getAttribute('data-lang') || 'bg';
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                
                if (isMobile) {
                    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`;
                    window.open(url, '_blank');
                } else {
                    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`;
                    window.open(url, '_blank');
                }
                
                console.log(`Навигация от (${userLat}, ${userLng}) до: ${spotName} (${lat}, ${lng})`);
            },
            function(error) {
                console.warn(`Грешка при получаването на местоположението: ${error.message}`);
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                
                if (isMobile) {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
                    window.open(url, '_blank');
                } else {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
                    window.open(url, '_blank');
                }
                
                console.log(`Навигация до: ${spotName} (${lat}, ${lng}) - без начална точка`);
            }
        );
    } else {
        console.warn('Geolocation не е поддържано в этот браузър');
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        window.open(url, '_blank');
    }
}

// ===== ФУНКЦИИ ЗА ПОКАЗВАНЕ НА ЛЮБИМИ =====
async function displayFavorites() {
    const favoritesList = document.getElementById('favorites-list');
    const loginPrompt = document.getElementById('favorites-login-prompt');
    const container = document.getElementById('favorites-list-container');
    
    if (!currentUser) {
        loginPrompt.style.display = 'block';
        container.style.display = 'none';
        return;
    }
    
    loginPrompt.style.display = 'none';
    container.style.display = 'block';
    
    if (!favoritesList) return;
    
    if (userFavorites.length === 0) {
        await loadUserFavorites();
    }
    
    if (userFavorites.length === 0) {
        favoritesList.innerHTML = '<p style="text-align: center; padding: 50px;">Нямате добавени любими места.</p>';
        return;
    }
    
    const currentLang = document.body.getAttribute('data-lang') || 'bg';
    
    const favoriteSpots = parkingSpotsData.filter(spot => userFavorites.includes(spot.id));
    
    favoritesList.innerHTML = favoriteSpots.map(spot => {
        const spotStatus = spot.id === 'spot1' ? spot1Status : 
                           spot.id === 'spot2' ? spot2Status : spot3Status;
        
        const statusClass = spotStatus === 'СВОБОДНО' || spotStatus === 'ПРАЗНО' ? 'status-free' : 
                           (spotStatus === 'ЗАЕТО' ? 'status-busy' : '');
        
        const statusText = spotStatus === 'ПРАЗНО' ? 'СВОБОДНО' : spotStatus;
        
        return `
        <div class="favorite-card">
            <div class="favorite-header">
                <div class="favorite-name lang-bg">${spot.name}</div>
                <div class="favorite-name lang-en">${spot.nameEn}</div>
                ${spot.type === 'disabled' ? '<i class="fas fa-wheelchair" style="color: var(--secondary);"></i>' : ''}
            </div>
            <p><i class="fas fa-map-marker-alt"></i> ул. "Епископ Софроний", Габрово</p>
            <p><i class="fas fa-car"></i> 
                <span class="lang-bg">Статус: </span>
                <span class="lang-en">Status: </span>
                <span class="${statusClass}" style="padding: 3px 8px; border-radius: 5px;">${statusText}</span>
            </p>
            ${spot.id === 'spot1' && currentUser ? `<p><i class="fas fa-ruler"></i> Разстояние: ${spot1Distance} см</p>` : ''}
            ${spot.id === 'spot2' && currentUser ? `<p><i class="fas fa-ruler"></i> Разстояние: ${spot2Distance} см</p>` : ''}
            ${spot.id === 'spot3' && currentUser ? `<p><i class="fas fa-ruler"></i> Разстояние: ${spot3Distance} см</p>` : ''}
            
            <div class="favorite-actions">
                <button class="navigate-btn" onclick="navigateToSpot(${spot.lat}, ${spot.lng}, '${spot.name}')">
                    <i class="fas fa-directions"></i> <span class="lang-bg">Навигирай</span><span class="lang-en">Navigate</span>
                </button>
                <button class="remove-btn" onclick="toggleFavorite('${spot.id}')">
                    <i class="fas fa-trash"></i> <span class="lang-bg">Премахни</span><span class="lang-en">Remove</span>
                </button>
            </div>
        </div>
    `}).join('');
}

// ===== ФУНКЦИИ ЗА АКТУАЛИЗИРАНЕ НА UI СПОРЕД ПОТРЕБИТЕЛЯ =====
function updateUIBasedOnAuth(user) {
    const loginNavItem = document.getElementById('login-nav-item');
    const registerNavItem = document.getElementById('register-nav-item');
    const logoutNavItem = document.getElementById('logout-nav-item');
    const adminNavItem = document.getElementById('admin-nav-item');
    const userName = document.getElementById('userName');
    const userNameEn = document.getElementById('userNameEn');
    const userStatus = document.getElementById('userStatus');
    const userStatusEn = document.getElementById('userStatusEn');
    const statusPanel = document.getElementById('statusPanel');
    const loginPrompt = document.getElementById('loginPrompt');
    
    if (user) {
        currentUser = user;
        
        loginNavItem.style.display = 'none';
        registerNavItem.style.display = 'none';
        logoutNavItem.style.display = 'flex';
        
        const displayName = user.displayName || user.email || 'Потребител';
        userName.textContent = displayName;
        userNameEn.textContent = displayName;
        
        statusPanel.classList.remove('restricted');
        loginPrompt.style.display = 'none';
        
        loadUserFavorites().then(() => {
            updateFavoriteButtons();
        });
        
        loadUserProfile(user.uid);
        
        isUserAdmin(user.uid).then(admin => {
            isAdmin = admin;
            adminNavItem.style.display = admin ? 'flex' : 'none';
            
            userStatus.textContent = admin ? 'Администратор' : 'Потребител';
            userStatusEn.textContent = admin ? 'Administrator' : 'User';
            
            if (admin) {
                loadAllUsers();
            }
        });
        
        updateSpotStatus(1, spot1Status, spot1Distance);
        updateSpotStatus(2, spot2Status, spot2Distance);
        updateSpotStatus(3, spot3Status, spot3Distance);
        if (map && parkingPolygons.length > 0) {
            updateMapColors();
        }
    } else {
        currentUser = null;
        isAdmin = false;
        userFavorites = [];
        
        loginNavItem.style.display = 'flex';
        registerNavItem.style.display = 'flex';
        logoutNavItem.style.display = 'none';
        adminNavItem.style.display = 'none';
        
        userName.textContent = 'Гост';
        userNameEn.textContent = 'Guest';
        userStatus.textContent = '';
        userStatusEn.textContent = '';
        
        statusPanel.classList.add('restricted');
        loginPrompt.style.display = 'block';
        
        clearProfilePage();
        
        updateSpotStatus(1, "ЗАРЕЖДАНЕ", -1);
        updateSpotStatus(2, "ЗАРЕЖДАНЕ", -1);
        updateSpotStatus(3, "СВОБОДНО", -1);
        
        allUsers = [];
        filteredUsers = [];
        
        if (document.getElementById('favorites-page').classList.contains('active')) {
            displayFavorites();
        }
    }
    
    // Актуализираме бутона за инсталиране
    updateInstallButton();
}

function clearProfilePage() {
    document.getElementById('profile-name').textContent = '';
    document.getElementById('profile-name-en').textContent = '';
    document.getElementById('profile-email').textContent = '';
    document.getElementById('profile-fullname').textContent = '';
    document.getElementById('profile-email-detail').textContent = '';
    document.getElementById('profile-phone').textContent = '-';
    document.getElementById('profile-phone-detail').textContent = '-';
    document.getElementById('profile-role').textContent = 'Потребител';
    document.getElementById('profile-created').textContent = '';
    document.getElementById('profile-lastlogin').textContent = '';
    document.getElementById('profile-admin-badge').style.display = 'none';
}

async function loadUserProfile(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            const fullName = userData.fullName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || currentUser.displayName || 'Потребител';
            
            document.getElementById('profile-name').textContent = fullName;
            document.getElementById('profile-name-en').textContent = fullName;
            document.getElementById('profile-email').textContent = userData.email || currentUser.email;
            document.getElementById('profile-fullname').textContent = fullName;
            document.getElementById('profile-email-detail').textContent = userData.email || currentUser.email;
            document.getElementById('profile-phone').textContent = userData.phone || '-';
            document.getElementById('profile-phone-detail').textContent = userData.phone || '-';
            
            const role = (userData.isAdmin || userData.role === 'admin') ? 'Администратор' : 'Потребител';
            document.getElementById('profile-role').textContent = role;
            
            if (userData.isAdmin || userData.role === 'admin') {
                document.getElementById('profile-admin-badge').style.display = 'inline-block';
            } else {
                document.getElementById('profile-admin-badge').style.display = 'none';
            }
            
            if (userData.createdAt) {
                const date = new Date(userData.createdAt.seconds * 1000);
                document.getElementById('profile-created').textContent = date.toLocaleDateString('bg-BG');
            }
            
            if (userData.lastLogin) {
                const date = new Date(userData.lastLogin.seconds * 1000);
                document.getElementById('profile-lastlogin').textContent = date.toLocaleString('bg-BG');
            }
        }
    } catch (error) {
        console.error('Грешка при зареждане на профил:', error);
    }
}

// ===== ФУНКЦИИ ЗА РЕДАКТИРАНЕ НА ПРОФИЛ =====
window.editProfile = function() {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('edit-firstname').value = data.firstName || '';
            document.getElementById('edit-lastname').value = data.lastName || '';
            document.getElementById('edit-phone').value = data.phone || '';
        }
    });
    
    document.getElementById('editProfileModal').classList.add('active');
};

window.closeEditModal = function() {
    document.getElementById('editProfileModal').classList.remove('active');
};

window.saveProfileChanges = async function() {
    const firstName = document.getElementById('edit-firstname').value.trim();
    const lastName = document.getElementById('edit-lastname').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    
    if (!firstName || !lastName) {
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        showNotification(
            currentLang === 'bg' ? '📝 Задължителни полета' : '📝 Required Fields',
            currentLang === 'bg' ? 'Моля, попълнете име и фамилия' : 'Please enter first and last name',
            '📝'
        );
        return;
    }
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            firstName: firstName,
            lastName: lastName,
            fullName: `${firstName} ${lastName}`,
            phone: phone
        });
        
        await currentUser.updateProfile({
            displayName: `${firstName} ${lastName}`
        });
        
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        showNotification(
            currentLang === 'bg' ? '✅ Успешна актуализация' : '✅ Success',
            currentLang === 'bg' ? 'Профилът е обновен успешно!' : 'Your profile has been updated!',
            ''
        );
        closeEditModal();
        loadUserProfile(currentUser.uid);
        
        document.getElementById('userName').textContent = `${firstName} ${lastName}`;
        document.getElementById('userNameEn').textContent = `${firstName} ${lastName}`;
        
    } catch (error) {
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        showNotification(
            currentLang === 'bg' ? ' Грешка' : ' Error',
            error.message,
            ''
        );
    }
};

// ===== АДМИН ФУНКЦИИ =====
async function loadAllUsers() {
    try {
        console.log('Начало на зареждане на потребители...');
        let snapshot;
        
        try {
            snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        } catch (orderError) {
            console.warn('Ordering не работи, зареждаме без него:', orderError);
            snapshot = await db.collection('users').get();
        }
        
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Зареждени ${allUsers.length} потребители`);
        filteredUsers = [...allUsers];
        
        updateAdminStats();
        displayAdminUsers();
        setupAdminSearch();
    } catch (error) {
        console.error('Грешка при зареждане на потребители:', error);
        const tbody = document.getElementById('adminUsersTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="9" style="text-align: center; color: var(--accent);">❌ Грешка при зареждане: ${error.message}</td></tr>
            `;
        }
    }
}

function updateAdminStats() {
    document.getElementById('adminTotalUsers').textContent = allUsers.length;
    document.getElementById('adminVerifiedUsers').textContent = allUsers.filter(u => u.emailVerified).length;
    document.getElementById('adminGoogleUsers').textContent = allUsers.filter(u => u.provider === 'google').length;
    document.getElementById('adminEmailUsers').textContent = allUsers.filter(u => u.provider === 'email' || !u.provider).length;
    document.getElementById('adminAdminUsers').textContent = allUsers.filter(u => u.isAdmin || u.role === 'admin').length;
}

function setupAdminSearch() {
    const searchInput = document.getElementById('adminSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            
            filteredUsers = allUsers.filter(user => 
                (user.firstName && user.firstName.toLowerCase().includes(searchTerm)) ||
                (user.lastName && user.lastName.toLowerCase().includes(searchTerm)) ||
                (user.fullName && user.fullName.toLowerCase().includes(searchTerm)) ||
                (user.email && user.email.toLowerCase().includes(searchTerm))
            );
            
            currentAdminPage = 1;
            displayAdminUsers();
        });
    }
}

function displayAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    
    if (!tbody) {
        console.error('Таблицата за потребители не е намерена');
        return;
    }
    
    console.log('displayAdminUsers вызван, filteredUsers:', filteredUsers);
    
    if (filteredUsers.length === 0) {
        console.warn('Няма потребители за показване');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Няма потребители</td></tr>';
        updateAdminPagination();
        return;
    }

    const startIndex = (currentAdminPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
    
    console.log(`Показване на потребители ${startIndex + 1}-${Math.min(endIndex, filteredUsers.length)} от ${filteredUsers.length}`);
    
    const currentLang = document.body.getAttribute('data-lang') || 'bg';

    tbody.innerHTML = paginatedUsers.map(user => {
        const isAdminUser = user.isAdmin || user.role === 'admin';
        const createdAt = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('bg-BG') : '-';
        const lastLogin = user.lastLogin ? new Date(user.lastLogin.seconds * 1000).toLocaleDateString('bg-BG') : '-';
        const favoritesCount = user.favorites ? user.favorites.length : 0;
        
        return `
        <tr>
                    <td data-label="${currentLang === 'bg' ? 'Име' : 'First'}">${user.firstName || '-'}</td>
                    <td data-label="${currentLang === 'bg' ? 'Фамилия' : 'Last'}">${user.lastName || '-'}</td>
                    <td data-label="${currentLang === 'bg' ? 'Имейл' : 'Email'}">${user.email}</td>
                    <td data-label="${currentLang === 'bg' ? 'Роля' : 'Role'}">${isAdminUser ? '<span class=\"admin-badge\">' + (currentLang === 'bg' ? 'Админ' : 'Admin') + '</span>' : '<span class=\"user-badge\">' + (currentLang === 'bg' ? 'Потребител' : 'User') + '</span>'}</td>
                    <td data-label="${currentLang === 'bg' ? 'Потв.' : 'Verif.'}">${user.emailVerified ? '✅' : '❌'}</td>
                    <td data-label="${currentLang === 'bg' ? 'Провайдър' : 'Provider'}">${user.provider === 'google' ? 'Google' : (currentLang === 'bg' ? 'Имейл' : 'Email')}</td>
                    <td data-label="${currentLang === 'bg' ? 'Регистрация' : 'Reg.'}">${createdAt}</td>
                    <td data-label="${currentLang === 'bg' ? 'Последен вход' : 'Last Login'}">${lastLogin}</td>
                    <td class="actions-cell" data-label="${currentLang === 'bg' ? 'Действия' : 'Actions'}">
                        ${!isAdminUser 
                            ? `<button class=\"btn-small btn-success\" onclick=\"makeAdmin('${user.id}')\">${currentLang === 'bg' ? 'Направи админ' : 'Make admin'}</button>`
                            : `<button class=\"btn-small btn-warning\" onclick=\"removeAdmin('${user.id}')\">${currentLang === 'bg' ? 'Премахни' : 'Remove'}</button>`
                        }
                        <button class=\"btn-small btn-info\" onclick=\"viewUserDetails('${user.id}')\">${currentLang === 'bg' ? 'Детайли' : 'Details'}</button>
                        <button class=\"btn-small btn-danger\" onclick=\"deleteUser('${user.id}')\">${currentLang === 'bg' ? 'Изтрий' : 'Delete'}</button>
                    </td>
        </tr>
    `}).join('');

    updateAdminPagination();
}

function updateAdminPagination() {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const pagination = document.getElementById('adminPagination');
    
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let buttons = '';
    for (let i = 1; i <= totalPages; i++) {
        buttons += `<button onclick="goToAdminPage(${i})" class="${i === currentAdminPage ? 'active' : ''}">${i}</button>`;
    }
    pagination.innerHTML = buttons;
}

window.goToAdminPage = function(page) {
    currentAdminPage = page;
    displayAdminUsers();
};

window.makeAdmin = async function(userId) {
    const currentLang = document.body.getAttribute('data-lang') || 'bg';
    if (!confirm(currentLang === 'bg' ? 'Направи този потребител администратор?' : 'Make this user an admin?')) return;
    try {
        await db.collection('users').doc(userId).update({ isAdmin: true, role: 'admin' });
        showNotification(
            currentLang === 'bg' ? ' Администратор' : ' Administrator',
            currentLang === 'bg' ? 'Потребителят вече е администратор!' : 'User is now an administrator!',
            ''
        );
        loadAllUsers();
    } catch (error) {
        showNotification(
            currentLang === 'bg' ? '⚠️ Грешка' : '⚠️ Error',
            error.message,
            '⚠️'
        );
    }
};

window.removeAdmin = async function(userId) {
    const currentLang = document.body.getAttribute('data-lang') || 'bg';
    if (!confirm(currentLang === 'bg' ? 'Премахни администраторските права?' : 'Remove admin rights?')) return;
    try {
        await db.collection('users').doc(userId).update({ isAdmin: false, role: 'user' });
        showNotification(
            currentLang === 'bg' ? ' Правата премахнати' : ' Rights Removed',
            currentLang === 'bg' ? 'Администраторските права са премахнати!' : 'Admin rights have been removed!',
            ''
        );
        loadAllUsers();
    } catch (error) {
        showNotification(
            currentLang === 'bg' ? ' Грешка' : ' Error',
            error.message,
            ''
        );
    }
};

window.viewUserDetails = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const createdAt = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleString('bg-BG') : '-';
    const lastLogin = user.lastLogin ? new Date(user.lastLogin.seconds * 1000).toLocaleString('bg-BG') : '-';
    const lang = document.body.getAttribute('data-lang') || 'bg';
    const favoritesCount = user.favorites ? user.favorites.length : 0;
    
    const detailsHtml = `
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Име и фамилия' : 'Full name'}</div>
            <div class="user-detail-value"><i class="fas fa-user"></i> ${user.firstName || '-'} ${user.lastName || '-'}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">Email</div>
            <div class="user-detail-value"><i class="fas fa-envelope"></i> ${user.email}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Телефон' : 'Phone'}</div>
            <div class="user-detail-value"><i class="fas fa-phone"></i> ${user.phone || '-'}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Роля' : 'Role'}</div>
            <div class="user-detail-value"><i class="fas fa-${user.isAdmin || user.role === 'admin' ? 'crown' : 'user'}"></i> ${user.isAdmin || user.role === 'admin' ? (lang === 'bg' ? 'Администратор' : 'Admin') : (lang === 'bg' ? 'Потребител' : 'User')}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Провайдър' : 'Provider'}</div>
            <div class="user-detail-value"><i class="fab fa-${user.provider === 'google' ? 'google' : 'envelope'}"></i> ${user.provider === 'google' ? 'Google' : (lang === 'bg' ? 'Имейл/Парола' : 'Email/Password')}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Имейл потвърден' : 'Email verified'}</div>
            <div class="user-detail-value"><i class="fas fa-${user.emailVerified ? 'check-circle' : 'times-circle'}" style="color: ${user.emailVerified ? 'var(--success)' : 'var(--accent)'}"></i> ${user.emailVerified ? (lang === 'bg' ? 'Да' : 'Yes') : (lang === 'bg' ? 'Не' : 'No')}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Любими места' : 'Favorites'}</div>
            <div class="user-detail-value"><i class="fas fa-star" style="color: var(--favorite);"></i> ${favoritesCount}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Регистрация' : 'Registered'}</div>
            <div class="user-detail-value"><i class="fas fa-calendar-alt"></i> ${createdAt}</div>
        </div>
        <div class="user-detail-item">
            <div class="user-detail-label">${lang === 'bg' ? 'Последен вход' : 'Last login'}</div>
            <div class="user-detail-value"><i class="fas fa-clock"></i> ${lastLogin}</div>
        </div>
    `;
    
    document.getElementById('userDetailsContent').innerHTML = detailsHtml;
    document.getElementById('userDetailsModal').classList.add('active');
};

window.closeUserDetailsModal = function() {
    document.getElementById('userDetailsModal').classList.remove('active');
};

window.deleteUser = async function(userId) {
    const currentLang = document.body.getAttribute('data-lang') || 'bg';
    if (!confirm(currentLang === 'bg' ? 'ВНИМАНИЕ! Сигурни ли сте, че искате да изтриете този потребител? Това действие е необратимо!' : ' WARNING! Are you sure you want to delete this user? This action is irreversible!')) return;
    
    try {
        await db.collection('users').doc(userId).delete();
        showNotification(
            currentLang === 'bg' ? ' Потребител изтрит' : ' User Deleted',
            currentLang === 'bg' ? 'Потребителят е успешно премахнат от системата!' : 'User has been successfully removed from the system!',
            ''
        );
        loadAllUsers();
        closeUserDetailsModal();
    } catch (error) {
        showNotification(
            currentLang === 'bg' ? ' Грешка' : ' Error',
            error.message,
            ''
        );
    }
};

// ===== ФУНКЦИИ ЗА RTDB (ПАРКОМЕСТА) =====
function setupFirebaseListeners() {
    rtdb.ref('parking/spot1').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            spot1Distance = data.distance || -1;
            spot1Status = data.status || "ГРЕШКА";
            
            console.log("Място 1 обновено:", spot1Status, spot1Distance);
            
            if (currentUser) {
                updateSpotStatus(1, spot1Status, spot1Distance);
            }
            if (map && parkingPolygons.length > 0 && currentUser) {
                updateMapColors();
            }
            updateLastUpdateTime();
            updateFreeSpotsCount();
            
            if (document.getElementById('favorites-page').classList.contains('active')) {
                displayFavorites();
            }
        }
    });
    
    rtdb.ref('parking/spot2').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            spot2Distance = data.distance || -1;
            spot2Status = data.status || "ГРЕШКА";
            
            console.log("Място 2 обновено:", spot2Status, spot2Distance);
            
            if (currentUser) {
                updateSpotStatus(2, spot2Status, spot2Distance);
            }
            if (map && parkingPolygons.length > 0 && currentUser) {
                updateMapColors();
            }
            updateLastUpdateTime();
            updateFreeSpotsCount();
            
            if (document.getElementById('favorites-page').classList.contains('active')) {
                displayFavorites();
            }
        }
    });
    
    rtdb.ref('parking/spot3').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            spot3Distance = data.distance || -1;
            spot3Status = data.status || "СВОБОДНО";
            
            console.log("Място 3 обновено:", spot3Status, spot3Distance);
            
            if (currentUser) {
                updateSpotStatus(3, spot3Status, spot3Distance);
            }
            if (map && parkingPolygons.length > 0 && currentUser) {
                updateMapColors();
            }
            updateLastUpdateTime();
            updateFreeSpotsCount();
            
            if (document.getElementById('favorites-page').classList.contains('active')) {
                displayFavorites();
            }
        } else {
            spot3Distance = -1;
            spot3Status = "СВОБОДНО";
            
            if (currentUser) {
                updateSpotStatus(3, "СВОБОДНО", -1);
            }
            updateFreeSpotsCount();
        }
    });
    
    console.log("Firebase слушатели са активирани (включително за място 3)");
}

function updateSpotStatus(spotNumber, status, distance) {
    const statusElement = document.getElementById('status' + spotNumber);
    if (!statusElement) return;
    
    let statusClass = '';
    let icon = '';
    
    if (spotNumber === 1) {
        if (status === "ЗАЕТО") {
            statusClass = "status-disabled-occupied";
            icon = '<i class="fas fa-times-circle"></i>';
        } else if (status === "ПРАЗНО") {
            statusClass = "status-disabled-empty";
            icon = '<i class="fas fa-check-circle"></i>';
        } else {
            statusClass = "status-pending";
            icon = '<i class="fas fa-spinner fa-spin"></i>';
        }
    } else {
        if (status === "ЗАЕТО") {
            statusClass = "status-occupied";
            icon = '<i class="fas fa-times-circle"></i>';
        } else if (status === "ПРАЗНО" || status === "СВОБОДНО") {
            statusClass = "status-empty";
            icon = '<i class="fas fa-check-circle"></i>';
        } else {
            statusClass = "status-pending";
            icon = '<i class="fas fa-spinner fa-spin"></i>';
        }
    }
    
    const currentLang = document.body.getAttribute('data-lang') || 'bg';
    let statusText = status;
    
    if (currentLang === 'en') {
        if (status === "ЗАЕТО") statusText = "OCCUPIED";
        else if (status === "ПРАЗНО" || status === "СВОБОДНО") statusText = "FREE";
        else if (status === "ЗАРЕЖДАНЕ") statusText = "LOADING";
        else if (status === "ГРЕШКА") statusText = "ERROR";
    }
    
    statusElement.innerHTML = icon + ' ' + statusText;
    statusElement.className = 'status-value ' + statusClass;
    
    if (distance > 0) {
        statusElement.title = (currentLang === 'bg' ? 'Разстояние: ' : 'Distance: ') + distance + ' cm';
    }
}

function updateMapColors() {
    if (!map || parkingPolygons.length === 0 || !currentUser) return;
    
    for (let i = 0; i < parkingPolygons.length; i++) {
        let fillColor;
        
        if (i === 0) {
            fillColor = spot1Status === "ЗАЕТО" ? '#b71c1c' : '#0066cc';
        } else if (i === 1) {
            fillColor = spot2Status === "ЗАЕТО" ? '#ea4335' : '#34a853';
        } else {
            fillColor = spot3Status === "ЗАЕТО" ? '#ea4335' : '#34a853';
        }
        
        parkingPolygons[i].setStyle({ fillColor: fillColor });
    }
}

function updateFreeSpotsCount() {
    let free = 0;
    
    if (spot1Status === "ПРАЗНО") free++;
    if (spot2Status === "ПРАЗНО") free++;
    if (spot3Status === "ПРАЗНО" || spot3Status === "СВОБОДНО") free++;
    
    const freeSpotsElement = document.getElementById('freeSpots');
    if (freeSpotsElement) {
        freeSpotsElement.textContent = free;
    }
}

function updateLastUpdateTime() {
    lastUpdateTime = new Date();
    const timeString = lastUpdateTime.toLocaleTimeString('bg-BG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    const lastUpdateElement = document.getElementById('lastUpdate');
    if (lastUpdateElement) {
        lastUpdateElement.innerHTML = '<i class="far fa-clock"></i> ' + timeString;
    }
}

window.manualRefresh = function() {
    const refreshBtn = document.querySelector('.controls button i');
    if (refreshBtn) {
        refreshBtn.className = 'fas fa-spinner fa-spin';
    }
    
    rtdb.ref('parking').once('value').then((snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.spot1) {
                spot1Distance = data.spot1.distance || -1;
                spot1Status = data.spot1.status || "ГРЕШКА";
                if (currentUser) updateSpotStatus(1, spot1Status, spot1Distance);
            }
            if (data.spot2) {
                spot2Distance = data.spot2.distance || -1;
                spot2Status = data.spot2.status || "ГРЕШКА";
                if (currentUser) updateSpotStatus(2, spot2Status, spot2Distance);
            }
            if (data.spot3) {
                spot3Distance = data.spot3.distance || -1;
                spot3Status = data.spot3.status || "СВОБОДНО";
                if (currentUser) updateSpotStatus(3, spot3Status, spot3Distance);
            }
            
            if (map && parkingPolygons.length > 0 && currentUser) {
                updateMapColors();
            }
            updateLastUpdateTime();
            updateFreeSpotsCount();
            
            if (document.getElementById('favorites-page').classList.contains('active')) {
                displayFavorites();
            }
        }
        if (refreshBtn) {
            refreshBtn.className = 'fas fa-sync-alt';
        }
    }).catch((error) => {
        console.error("Грешка при ръчно актуализиране:", error);
        if (refreshBtn) {
            refreshBtn.className = 'fas fa-exclamation-triangle';
            setTimeout(() => {
                refreshBtn.className = 'fas fa-sync-alt';
            }, 2000);
        }
    });
};

// ===== ФУНКЦИИ ЗА КАРТАТА =====
const centerLat = 42.8768;
const centerLng = 25.3179;
const parkingWidth = 3.0;
const parkingLength = 6.0;
const spaceBetween = 0.5;

function metersToDegrees(meters) {
    return meters / 111111;
}

function initializeMap() {
    if (map !== null) {
        console.log("Картата вече е инициализирана");
        return;
    }
    
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error("Елементът за карта не е намерен");
        setTimeout(initializeMap, 500);
        return;
    }
    
    try {
        console.log("Инициализиране на карта...");
        
        map = L.map('map').setView([centerLat, centerLng], 18.5);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 22
        }).addTo(map);
        
        createParkingSpots();
        
        setTimeout(() => {
            map.invalidateSize();
        }, 500);
        
        console.log("Картата е инициализирана успешно");
    } catch (error) {
        console.error("Грешка при инициализиране на картата:", error);
        setTimeout(initializeMap, 1000);
    }
}

function createParkingSpots() {
    if (!map) {
        console.error("Картата не е инициализирана");
        return;
    }
    
    console.log("Създаване на паркоместа...");
    
    parkingPolygons = [];
    
    for (let i = 0; i < 3; i++) {
        const spotId = `spot${i+1}`;
        const offsetLng = metersToDegrees(i * (parkingWidth + spaceBetween));
        const totalWidth = 3 * parkingWidth + 2 * spaceBetween;
        const centerOffset = metersToDegrees(totalWidth / 2);
        
        const spotLat = centerLat;
        const spotLng = centerLng + offsetLng - centerOffset;
        
        parkingSpotsData[i].lat = spotLat;
        parkingSpotsData[i].lng = spotLng;
        
        const halfWidth = metersToDegrees(parkingWidth) / 2;
        const halfLength = metersToDegrees(parkingLength) / 2;
        
        const corners = [
            [spotLat - halfLength, spotLng - halfWidth],
            [spotLat - halfLength, spotLng + halfWidth],
            [spotLat + halfLength, spotLng + halfWidth],
            [spotLat + halfLength, spotLng - halfWidth]
        ];
        
        let fillColor;
        if (i === 0) {
            fillColor = (currentUser && spot1Status === "ЗАЕТО") ? '#b71c1c' : '#0066cc';
        } else if (i === 1) {
            fillColor = (currentUser && spot2Status === "ЗАЕТО") ? '#ea4335' : '#34a853';
        } else {
            fillColor = (currentUser && spot3Status === "ЗАЕТО") ? '#ea4335' : '#34a853';
        }
        
        const parkingSpace = L.polygon(corners, {
            color: '#ffffff',
            fillColor: fillColor,
            fillOpacity: 0.8,
            weight: 2
        }).addTo(map);
        
        parkingPolygons.push(parkingSpace);
        
        let labelHtml;
        if (i === 0) {
            labelHtml = '<div style="background: white; color: ' + fillColor + '; font-weight: 700; font-size: 16px; width: 44px; height: 44px; border-radius: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 3px solid ' + fillColor + '; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: \'Segoe UI\', sans-serif; line-height: 1.2; background: rgba(255,255,255,0.98);"><span style="font-size: 12px;">' + (i + 1) + '</span><i class="fas fa-wheelchair" style="font-size: 18px;"></i></div>';
        } else {
            labelHtml = '<div style="background: white; color: ' + fillColor + '; font-weight: 700; font-size: 18px; width: 38px; height: 38px; border-radius: 30px; display: flex; align-items: center; justify-content: center; border: 3px solid ' + fillColor + '; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: \'Segoe UI\', sans-serif; background: rgba(255,255,255,0.98);">' + (i + 1) + '</div>';
        }
        
        L.marker([spotLat, spotLng], {
            icon: L.divIcon({
                className: 'parking-label',
                html: labelHtml,
                iconSize: i === 0 ? [44, 44] : [38, 38],
                iconAnchor: i === 0 ? [22, 22] : [19, 19]
            })
        }).addTo(map);
        
        let statusText;
        if (i === 0) statusText = spot1Status;
        else if (i === 1) statusText = spot2Status;
        else statusText = spot3Status;
        
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        
        let popupContent = '<div style="text-align: center; min-width: 280px;">';
        popupContent += '<div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;">';
        popupContent += '<div style="background: ' + fillColor + '; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">' + (i + 1) + '</div>';
        popupContent += (i === 0 ? '<i class="fas fa-wheelchair" style="color: #0066cc; font-size: 24px;"></i>' : '');
        popupContent += '</div>';
        popupContent += '<h3 style="margin: 0 0 8px; color: #1a2639; font-weight: 600;">Паркомясто ' + (i + 1) + '</h3>';
        
        if (i === 0) {
            popupContent += '<p style="margin: 0 0 8px; font-size: 14px; color: #0066cc; font-weight: 600; background: #e3f2fd; padding: 4px 12px; border-radius: 30px; display: inline-block;">✦ За хора с увреждания ✦</p>';
        }
        
        popupContent += '<p style="margin: 0 0 12px; font-size: 13px; color: #5a6a7a;"><i class="fas fa-map-marker-alt" style="color: #ea4335;"></i> ул. "Епископ Софроний", Габрово</p>';
        popupContent += '<div style="text-align: left; font-size: 13px; background: #f8f9fa; padding: 12px; border-radius: 12px;">';
        popupContent += '<div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">';
        popupContent += '<i class="fas fa-circle" style="color: ' + fillColor + '; font-size: 10px;"></i><strong>Статус:</strong> <span style="color: ' + fillColor + '; font-weight: 700;">' + statusText + '</span>';
        popupContent += '</div>';
        
        if (i === 0 && currentUser) {
            popupContent += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><i class="fas fa-ruler"></i><strong>Разстояние:</strong> ' + spot1Distance + ' см</div>';
        }
        if (i === 1 && currentUser) {
            popupContent += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><i class="fas fa-ruler"></i><strong>Разстояние:</strong> ' + spot2Distance + ' см</div>';
        }
        if (i === 2 && currentUser) {
            popupContent += '<div style="display: flex; alignments: center; gap: 8px; margin-bottom: 8px;"><i class="fas fa-ruler"></i><strong>Разстояние:</strong> ' + spot3Distance + ' см</div>';
        }
        
        if (!currentUser) {
            popupContent += '<div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 8px; color: #856404;"><i class="fas fa-lock"></i> Влезте, за да видите статуса</div>';
        } else {
            const favoriteText = isFavorite(spotId) ? 
                (currentLang === 'bg' ? 'Премахни от любими' : 'Remove from favorites') : 
                (currentLang === 'bg' ? 'Добави към любими' : 'Add to favorites');
            
            const favoriteIcon = isFavorite(spotId) ? 'fas fa-star' : 'far fa-star';
            const favoriteClass = isFavorite(spotId) ? 'btn-warning' : 'btn-favorite';
            
            popupContent += '<div style="display: flex; gap: 8px; margin-top: 12px;">';
            popupContent += '<button class="btn-small ' + favoriteClass + ' favorite-btn" onclick="toggleFavorite(\'' + spotId + '\')" data-spot-id="' + spotId + '" style="flex: 1;"><i class="' + favoriteIcon + '"></i> ' + favoriteText + '</button>';
            popupContent += '<button class="btn-small btn-success" onclick="navigateToSpot(' + spotLat + ', ' + spotLng + ', \'' + (i === 0 ? 'Място 1' : i === 1 ? 'Място 2' : 'Място 3') + '\')" style="flex: 1;"><i class="fas fa-directions"></i> ' + (currentLang === 'bg' ? 'Навигирай' : 'Navigate') + '</button>';
            popupContent += '</div>';
        }
        
        popupContent += '</div></div>';
        
        parkingSpace.bindPopup(popupContent);
    }
    
    console.log("Паркоместата са създадени успешно");
}

// ===== ФУНКЦИИ ЗА АУТЕНТИКАЦИЯ =====
async function registerUser(email, password, firstName, lastName, phone) {
    if (!email || !password || !firstName || !lastName) {
        showError('register-error', '❌ Моля, попълнете всички задължителни полета');
        return;
    }
    
    if (password.length < 6) {
        showError('register-error', '❌ Паролата трябва да е поне 6 символа');
        return;
    }
    
    if (password !== document.getElementById('register-confirm').value) {
        showError('register-error', '❌ Паролите не съвпадат');
        return;
    }
    
    const registerBtn = document.querySelector('#register-form button[type="submit"]');
    const originalText = registerBtn.innerHTML;
    registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Регистрация...';
    registerBtn.disabled = true;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        await user.updateProfile({
            displayName: `${firstName} ${lastName}`
        });
        
        await db.collection('users').doc(user.uid).set({
            firstName: firstName,
            lastName: lastName,
            fullName: `${firstName} ${lastName}`,
            email: email,
            phone: phone || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            emailVerified: false,
            provider: 'email',
            isAdmin: false,
            role: 'user',
            favorites: []
        });
        
        await user.sendEmailVerification();
        
        showSuccess('register-success', `✅ Регистрацията е успешна! Изпратихме имейл за потвърждение до <strong>${email}</strong>.`);
        
        document.getElementById('register-form').reset();
        
        setTimeout(() => {
            document.querySelector('[data-page=login]').click();
        }, 3000);
        
    } catch (error) {
        console.error('Registration error:', error);
        
        let errorMessage = '';
        switch(error.code) {
            case 'auth/email-already-in-use':
                errorMessage = '❌ Този имейл вече е регистриран.';
                break;
            case 'auth/invalid-email':
                errorMessage = '❌ Невалиден имейл адрес';
                break;
            case 'auth/weak-password':
                errorMessage = '❌ Паролата е твърде слаба (минимум 6 символа)';
                break;
            default:
                errorMessage = '❌ Грешка при регистрация: ' + error.message;
        }
        
        showError('register-error', errorMessage);
    } finally {
        registerBtn.innerHTML = originalText;
        registerBtn.disabled = false;
    }
}

async function loginUser(email, password) {
    if (!email || !password) {
        showError('login-error', '❌ Моля, попълнете имейл и парола');
        return;
    }
    
    const loginBtn = document.querySelector('#login-form button[type="submit"]');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
    loginBtn.disabled = true;
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        if (!user.emailVerified) {
            await auth.signOut();
            
            const resendButton = `<br><br><button class="btn" onclick="resendVerificationEmail('${email}')" style="padding: 8px 16px; font-size: 0.9rem;">Изпрати отново имейл за потвърждение</button>`;
            
            showError('login-error', `❌ Имейлът <strong>${email}</strong> не е потвърден. Моля, проверете пощата си.${resendButton}`);
            
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
            return;
        }
        
        await db.collection('users').doc(user.uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showSuccess('login-success', '✅ Успешен вход! Пренасочване...');
        
        setTimeout(() => {
            document.querySelector('[data-page=map]').click();
        }, 1500);
        
    } catch (error) {
        console.error('Login error:', error);
        
        let errorMessage = '';
        switch(error.code) {
            case 'auth/invalid-email':
                errorMessage = '❌ Невалиден имейл адрес';
                break;
            case 'auth/user-disabled':
                errorMessage = '❌ Потребителят е деактивиран';
                break;
            case 'auth/user-not-found':
                errorMessage = '❌ Няма потребител с този имейл';
                break;
            case 'auth/wrong-password':
                errorMessage = '❌ Грешна парола';
                break;
            default:
                errorMessage = '❌ Грешка при вход: ' + error.message;
        }
        
        showError('login-error', errorMessage);
        
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

async function logoutUser() {
    try {
        await auth.signOut();
        showSuccess('login-success', '✅ Успешен изход');
        document.querySelector('[data-page=map]').click();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function signInWithGoogle(mode) {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            let firstName = '';
            let lastName = '';
            
            if (user.displayName) {
                const nameParts = user.displayName.split(' ');
                firstName = nameParts[0] || '';
                lastName = nameParts.slice(1).join(' ') || '';
            }
            
            await db.collection('users').doc(user.uid).set({
                firstName: firstName,
                lastName: lastName,
                fullName: user.displayName || '',
                email: user.email,
                photoURL: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                emailVerified: user.emailVerified,
                provider: 'google',
                isAdmin: false,
                role: 'user',
                favorites: []
            });
            
            showSuccess(mode === 'login' ? 'login-success' : 'register-success', '✅ Успешна регистрация с Google!');
        } else {
            await db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showSuccess(mode === 'login' ? 'login-success' : 'register-success', '✅ Успешен вход с Google!');
        }
        
        setTimeout(() => {
            document.querySelector('[data-page=map]').click();
        }, 1500);
        
    } catch (error) {
        console.error('Google auth error:', error);
        
        let errorMessage = '';
        switch(error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage = '❌ Прозорецът за вход беше затворен.';
                break;
            case 'auth/popup-blocked':
                errorMessage = '❌ Изскачащият прозорец беше блокиран.';
                break;
            default:
                errorMessage = '❌ Грешка: ' + error.message;
        }
        
        showError(mode === 'login' ? 'login-error' : 'register-error', errorMessage);
    }
}

window.resendVerificationEmail = async function(email) {
    const password = prompt('За да изпратите нов имейл за потвърждение, моля въведете паролата си:');
    
    if (!password) return;
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        await user.sendEmailVerification();
        await auth.signOut();
        
        showSuccess('login-success', '✅ Имейл за потвърждение е изпратен отново!');
    } catch (error) {
        showError('login-error', '❌ Грешка: ' + error.message);
    }
};

// ===== ФУНКЦИИ ЗА ТЕМА И ЕЗИК =====
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDarkTheme = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const darkmodeToggle = document.getElementById('darkmode-toggle');
        if (darkmodeToggle) darkmodeToggle.checked = true;
    }
}

function setLanguage(lang) {
    document.body.setAttribute('data-lang', lang);
    localStorage.setItem('language', lang);
    
    const contactMessage = document.getElementById('contactMessage');
    if (contactMessage) {
        contactMessage.placeholder = lang === 'bg' ? 'Вашето съобщение...' : 'Your message...';
    }
    
    if (currentUser) {
        updateSpotStatus(1, spot1Status, spot1Distance);
        updateSpotStatus(2, spot2Status, spot2Distance);
        updateSpotStatus(3, spot3Status, spot3Distance);
    } else {
        updateSpotStatus(1, "ЗАРЕЖДАНЕ", -1);
        updateSpotStatus(2, "ЗАРЕЖДАНЕ", -1);
        updateSpotStatus(3, "СВОБОДНО", -1);
    }
    
    updateLastUpdateTime();
    
    const pageTitle = document.getElementById('page-title');
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageId = activePage.id.replace('-page', '');
        const pageNames = {
            'map': lang === 'bg' ? 'Карта' : 'Map',
            'favorites': lang === 'bg' ? 'Любими' : 'Favorites',
            'profile': lang === 'bg' ? 'Профил' : 'Profile',
            'login': lang === 'bg' ? 'Вход' : 'Login',
            'register': lang === 'bg' ? 'Регистрация' : 'Register',
            'admin': lang === 'bg' ? 'Админ' : 'Admin',
            'settings': lang === 'bg' ? 'Настройки' : 'Settings'
        };
        pageTitle.textContent = pageNames[pageId];
    }
    
    if (isAdmin && document.getElementById('admin-page').classList.contains('active')) {
        displayAdminUsers();
    }
    
    if (document.getElementById('favorites-page').classList.contains('active')) {
        displayFavorites();
    }
}

function loadLanguage() {
    const savedLanguage = localStorage.getItem('language') || 'bg';
    setLanguage(savedLanguage);
    
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.value = savedLanguage;
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM зареден, инициализиране...");
    
    loadTheme();
    loadLanguage();
    
    setTimeout(function() {
        initializeMap();
    }, 500);
    
    setupFirebaseListeners();
    
    setTimeout(manualRefresh, 1500);
    
    auth.onAuthStateChanged((user) => {
        console.log("Auth state променен:", user ? user.email : "няма потребител");
        updateUIBasedOnAuth(user);
        
        if (map && parkingPolygons.length > 0) {
            parkingPolygons.forEach(polygon => map.removeLayer(polygon));
            parkingPolygons = [];
            createParkingSpots();
        }
    });
    
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');
    
    navItems.forEach(function(item) {
        item.addEventListener('click', function() {
            const pageId = this.getAttribute('data-page');
            
            if (pageId === 'logout') {
                logoutUser();
                return;
            }
            
            if ((pageId === 'profile' || pageId === 'favorites' || pageId === 'admin') && !currentUser) {
                const currentLang = document.body.getAttribute('data-lang') || 'bg';
                showNotification(
                    currentLang === 'bg' ? 'Изисква се вход' : ' Login Required',
                    currentLang === 'bg' ? 'За да достъпите тази страница, моля влезте в профила си.' : 'Please login to your account to access this page.',
                    '',
                    [
                        { label: currentLang === 'bg' ? 'Вход' : 'Login', type: 'primary', callback: () => document.querySelector('[data-page=login]').click() },
                        { label: currentLang === 'bg' ? 'Регистрация' : 'Sign Up', type: 'secondary', callback: () => document.querySelector('[data-page=register]').click() }
                    ]
                );
                return;
            }
            
            if (pageId === 'admin' && !isAdmin) {
                const currentLang = document.body.getAttribute('data-lang') || 'bg';
                showNotification(
                    currentLang === 'bg' ? ' Достъп отказан' : ' Access Denied',
                    currentLang === 'bg' ? 'Нямате администраторски права за достъп до този раздел.' : 'You do not have admin privileges to access this section.',
                    ''
                );
                return;
            }
            
            navItems.forEach(function(nav) {
                nav.classList.remove('active');
            });
            this.classList.add('active');
            
            pages.forEach(function(page) {
                page.classList.remove('active');
                if (page.id === pageId + '-page') {
                    page.classList.add('active');
                    
                    const currentLang = document.body.getAttribute('data-lang') || 'bg';
                    const pageNames = {
                        'map': currentLang === 'bg' ? 'Карта' : 'Map',
                        'favorites': currentLang === 'bg' ? 'Любими' : 'Favorites',
                        'profile': currentLang === 'bg' ? 'Профил' : 'Profile',
                        'login': currentLang === 'bg' ? 'Вход' : 'Login',
                        'register': currentLang === 'bg' ? 'Регистрация' : 'Register',
                        'admin': currentLang === 'bg' ? 'Админ' : 'Admin',
                        'settings': currentLang === 'bg' ? 'Настройки' : 'Settings'
                    };
                    pageTitle.textContent = pageNames[pageId];
                    
                    if (pageId === 'map' && map) {
                        setTimeout(() => map.invalidateSize(), 300);
                    }
                    
                    if (pageId === 'admin' && isAdmin) {
                        console.log('Навигация на админ панел, зареждаме потребители...');
                        console.log('isAdmin:', isAdmin);
                        console.log('currentUser:', currentUser ? currentUser.uid : 'няма');
                        loadAllUsers();
                    }
                    
                    if (pageId === 'favorites' && currentUser) {
                        displayFavorites();
                    }
                    
                    if (pageId === 'profile' && currentUser) {
                        loadUserProfile(currentUser.uid);
                    }
                }
            });
        });
    });
    
    document.getElementById('userInfo').addEventListener('click', function() {
        if (currentUser) {
            document.querySelector('[data-page=profile]').click();
        } else {
            document.querySelector('[data-page=login]').click();
        }
    });
    
    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        loginUser(email, password);
    });
    
    document.getElementById('register-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const firstName = document.getElementById('register-firstname').value;
        const lastName = document.getElementById('register-lastname').value;
        const email = document.getElementById('register-email').value;
        const phone = document.getElementById('register-phone').value;
        const password = document.getElementById('register-password').value;
        
        registerUser(email, password, firstName, lastName, phone);
    });
    
    document.getElementById('editProfileBtn').addEventListener('click', editProfile);
    
    document.getElementById('forgotPasswordLink').addEventListener('click', function(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        
        if (!email) {
            showError('login-error', '❌ Моля, въведете имейл за възстановяване на паролата');
            return;
        }
        
        auth.sendPasswordResetEmail(email)
            .then(() => {
                showSuccess('login-success', `✅ Изпратен е имейл за възстановяване на паролата до <strong>${email}</strong>`);
            })
            .catch((error) => {
                if (error.code === 'auth/user-not-found') {
                    showError('login-error', '❌ Няма потребител с този имейл');
                } else {
                    showError('login-error', '❌ Грешка: ' + error.message);
                }
            });
    });
    
    document.getElementById('forgotPasswordLinkEn').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('forgotPasswordLink').click();
    });
    
    document.getElementById('googleLoginBtn').addEventListener('click', () => signInWithGoogle('login'));
    document.getElementById('googleRegisterBtn').addEventListener('click', () => signInWithGoogle('register'));
    
    const darkmodeToggle = document.getElementById('darkmode-toggle');
    if (darkmodeToggle) {
        darkmodeToggle.addEventListener('change', toggleTheme);
    }
    
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            setLanguage(this.value);
        });
    }
    
    document.getElementById('logoutProfileBtn').addEventListener('click', logoutUser);
    
    const contactBubble = document.getElementById('contactBubble');
    const contactModal = document.getElementById('contactModal');
    const closeModal = document.getElementById('closeModal');
    const contactForm = document.getElementById('contactForm');
    
    contactBubble.addEventListener('click', function() {
        contactModal.classList.toggle('active');
    });
    
    closeModal.addEventListener('click', function() {
        contactModal.classList.remove('active');
    });
    
    document.addEventListener('click', function(event) {
        if (!contactModal.contains(event.target) && !contactBubble.contains(event.target) && contactModal.classList.contains('active')) {
            contactModal.classList.remove('active');
        }
    });
    
    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('Contact form submitted');
        
        const contactMessage = document.getElementById('contactMessage');
        const message = contactMessage.value.trim();
        const currentLang = document.body.getAttribute('data-lang') || 'bg';
        
        console.log('Current user:', currentUser);
        console.log('Message:', message);
        
        if (!currentUser) {
            showNotification(currentLang === 'bg' ? 'Моля, влезте в профила си, за да изпратите съобщение.' : 'Please log in to send a message.', 'error');
            return;
        }
        
        if (!message) {
            console.log('Empty message');
            return;
        }
        
        let userName = currentUser.displayName;
        
        try {
            if (!userName) {
                const doc = await db.collection('users').doc(currentUser.uid).get();
                if (doc.exists) {
                    const userData = doc.data();
                    userName = userData.fullName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || currentUser.email;
                } else {
                    userName = currentUser.email;
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            userName = currentUser.email;
        }
        
        if (!userName) userName = currentUser.email;
        
        const now = new Date();
        const time = now.toLocaleString(currentLang === 'bg' ? 'bg-BG' : 'en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const templateParams = {
            name: userName,
            email: currentUser.email,
            time: time,
            message: message
        };
        
        console.log('Sending email with params:', templateParams);

        emailjs.send('service_tocc10u', 'template_qqogumr', templateParams)
            .then(function(response) {
                console.log('Email sent successfully:', response);
                showNotification(currentLang === 'bg' ? 'Вашето съобщение беше изпратено успешно!' : 'Your message was sent successfully!', 'success');
                contactMessage.value = '';
                contactModal.classList.remove('active');
            }, function(error) {
                console.error('EmailJS error:', error);
                showNotification(currentLang === 'bg' ? 'Грешка при изпращане на съобщението. Опитайте отново.' : 'Error sending message. Please try again.', 'error');
            });
    });
    
    contactModal.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    document.getElementById('userDetailsModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeUserDetailsModal();
        }
    });
    
    document.getElementById('editProfileModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeEditModal();
        }
    });
    
    // Актуализираме бутона за инсталиране при зареждане
    updateInstallButton();
});

console.log("Система за мониторинг на паркинг места - Габрово");
console.log("Използва два Firebase проекта:");
console.log("- Authentication & Firestore: registration-88c86");
console.log("- Realtime Database: esp32-5d620");
console.log("- PWA инсталация: активна");

// ===== Модална нотификация (втората версия на showNotification) =====
function showNotification(title, message, icon = 'ℹ️', buttons = null) {
    const modal = document.getElementById('modalNotification');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const iconEl = document.getElementById('notificationIcon');
    const buttonContainer = document.getElementById('notificationButtons');

    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.textContent = icon;

    buttonContainer.innerHTML = '';
    
    if (buttons) {
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.label;
            button.className = `notification-btn ${btn.type || 'primary'}`;
            button.onclick = () => {
                if (btn.callback) btn.callback();
                closeNotification();
            };
            buttonContainer.appendChild(button);
        });
    } else {
        const okBtn = document.createElement('button');
        okBtn.textContent = document.body.getAttribute('data-lang') === 'bg' ? 'OK' : 'OK';
        okBtn.className = 'notification-btn primary';
        okBtn.onclick = closeNotification;
        buttonContainer.appendChild(okBtn);
    }

    modal.classList.add('active');
}

function closeNotification() {
    document.getElementById('modalNotification').classList.remove('active');
}

// Затвори модалата при клик на фона
document.getElementById('modalNotification').addEventListener('click', function(e) {
    if (e.target === this) {
        closeNotification();
    }
});

// Затвори модалата при ESC бутон
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeNotification();
    }
});

