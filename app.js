// Database Setup
let db;
const dbName = "TheCurbsideDB";

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore("ingredients", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("products", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("sales", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("categories", { keyPath: "id", autoIncrement: true });
            db.createObjectStore("recipes", { keyPath: "productId" });
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(); };
    });
};

// State Management
let cart = [];
let currentCategory = 'Coffee';

// View Switching
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(`view-${viewId}`).style.display = 'block';
    if(viewId === 'inventory') renderInventory();
    if(viewId === 'pos') renderPOS();
    if(viewId === 'products') renderProductAdmin();
    if(viewId === 'dashboard') renderDashboard();
}

// --- Ingredient Logic ---
async function saveIngredient() {
    const ing = {
        name: document.getElementById('ing-name').value,
        price: parseFloat(document.getElementById('ing-price').value),
        qty: parseFloat(document.getElementById('ing-qty').value),
        unit: document.getElementById('ing-unit').value,
        reorder: parseFloat(document.getElementById('ing-reorder').value),
        stock: parseFloat(document.getElementById('ing-qty').value) // Initial stock same as purchase
    };
    
    const tx = db.transaction("ingredients", "readwrite");
    tx.objectStore("ingredients").add(ing);
    await tx.done;
    closeModal('modal-ingredient');
    renderInventory();
}

async function renderInventory() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    const tx = db.transaction("ingredients", "readonly");
    const store = tx.objectStore("ingredients");
    const ings = await getAllItems(store);
    
    ings.forEach(ing => {
        const row = `<tr>
            <td>${ing.name}</td>
            <td style="color: ${ing.stock <= ing.reorder ? 'var(--danger)' : 'inherit'}">${ing.stock}</td>
            <td>${ing.unit}</td>
            <td>₱${(ing.price / ing.qty).toFixed(2)}</td>
            <td><button onclick="deleteIng(${ing.id})">🗑️</button></td>
        </tr>`;
        list.innerHTML += row;
    });
}

// --- Product & Recipe Logic ---
async function saveProduct() {
    const product = {
        name: document.getElementById('prod-name').value,
        price: parseFloat(document.getElementById('prod-price').value),
        category: document.getElementById('prod-category').value
    };
    const tx = db.transaction("products", "readwrite");
    const request = tx.objectStore("products").add(product);
    request.onsuccess = (e) => {
        const productId = e.target.result;
        // Initialize empty recipe for this product
        const rTx = db.transaction("recipes", "readwrite");
        rTx.objectStore("recipes").add({ productId, ingredients: [] });
    };
    closeModal('modal-product');
    renderProductAdmin();
}

async function renderProductAdmin() {
    const container = document.getElementById('menu-list');
    container.innerHTML = '';
    const products = await getAllItems(db.transaction("products").objectStore("products"));
    
    products.forEach(p => {
        container.innerHTML += `
            <div class="product-card">
                <h4>${p.name}</h4>
                <p>₱${p.price}</p>
                <button onclick="openRecipe(${p.id})">🍳 Recipe</button>
                <button onclick="deleteProduct(${p.id})">🗑️</button>
            </div>`;
    });
}

// --- Recipe Management ---
let activeProductId = null;
async function openRecipe(pid) {
    activeProductId = pid;
    const recipe = await getItem(db.transaction("recipes").objectStore("recipes"), pid);
    const ings = await getAllItems(db.transaction("ingredients").objectStore("ingredients"));
    
    const select = document.getElementById('recipe-ing-select');
    select.innerHTML = ings.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
    
    renderRecipeIngredients(recipe ? recipe.ingredients : []);
    openModal('modal-recipe');
}

function renderRecipeIngredients(items) {
    const list = document.getElementById('recipe-ingredients-list');
    list.innerHTML = items.map((item, idx) => `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <span>${item.name}: ${item.qty} ${item.unit}</span>
            <button onclick="removeRecipeItem(${idx})">❌</button>
        </div>
    `).join('');
}

async function addIngredientToRecipe() {
    const ingId = parseInt(document.getElementById('recipe-ing-select').value);
    const qty = parseFloat(document.getElementById('recipe-ing-qty').value);
    
    const ing = await getItem(db.transaction("ingredients").objectStore("ingredients"), ingId);
    const recipeStore = db.transaction("recipes", "readwrite").objectStore("recipes");
    const recipe = await getItem(recipeStore, activeProductId) || { productId: activeProductId, ingredients: [] };
    
    recipe.ingredients.push({ id: ingId, name: ing.name, qty, unit: ing.unit });
    recipeStore.put(recipe);
    renderRecipeIngredients(recipe.ingredients);
}

// --- POS Logic ---
async function renderPOS() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';
    const products = await getAllItems(db.transaction("products").objectStore("products"));
    
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `<strong>${p.name}</strong><br>₱${p.price}`;
        card.onclick = () => addToCart(p);
        grid.appendChild(card);
    });
}

function addToCart(product) {
    const existing = cart.find(i => i.id === product.id);
    if(existing) existing.qty++;
    else cart.push({...product, qty: 1});
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    container.innerHTML = cart.map((item, idx) => `
        <div class="cart-item">
            <span>${item.name} x ${item.qty}</span>
            <span>₱${(item.price * item.qty).toFixed(2)}</span>
            <button onclick="cart.splice(${idx},1); updateCartUI();">🗑️</button>
        </div>
    `).join('');
    updateCartTotals();
}

function updateCartTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const disc = parseFloat(document.getElementById('cart-discount').value) || 0;
    const total = subtotal * (1 - (disc / 100));
    document.getElementById('cart-subtotal').innerText = `₱${subtotal.toFixed(2)}`;
    document.getElementById('cart-total').innerText = `Total: ₱${total.toFixed(2)}`;
}

async function completeSale() {
    if(cart.length === 0) return;
    
    // Check & Deduct Stock
    const tx = db.transaction(["ingredients", "sales", "recipes"], "readwrite");
    const ingStore = tx.objectStore("ingredients");
    const saleStore = tx.objectStore("sales");
    const recipeStore = tx.objectStore("recipes");
    
    for(const item of cart) {
        const recipe = await getItem(recipeStore, item.id);
        if(recipe) {
            for(const ingReq of recipe.ingredients) {
                const actualIng = await getItem(ingStore, ingReq.id);
                if(actualIng) {
                    actualIng.stock -= (ingReq.qty * item.qty);
                    ingStore.put(actualIng);
                }
            }
        }
    }
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const total = subtotal * (1 - (parseFloat(document.getElementById('cart-discount').value)/100));
    
    saleStore.add({
        timestamp: new Date().toISOString(),
        items: cart,
        total: total
    });
    
    cart = [];
    updateCartUI();
    alert("Sale Completed!");
}

// --- Dashboard & Reports ---
async function renderDashboard() {
    const sales = await getAllItems(db.transaction("sales").objectStore("sales"));
    const today = new Date().toISOString().split('T')[0];
    const todaysSales = sales.filter(s => s.timestamp.startsWith(today));
    
    const totalRevenue = todaysSales.reduce((sum, s) => sum + s.total, 0);
    document.getElementById('stat-sales').innerText = `₱${totalRevenue.toFixed(2)}`;
    document.getElementById('stat-orders').innerText = todaysSales.length;
    
    // Low stock alerts
    const ings = await getAllItems(db.transaction("ingredients").objectStore("ingredients"));
    const lowStock = ings.filter(i => i.stock <= i.reorder);
    const list = document.getElementById('low-stock-list');
    list.innerHTML = lowStock.map(i => `<li>⚠️ ${i.name}: ${i.stock} ${i.unit} left</li>`).join('');
}

// --- Helpers ---
function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function getAllItems(store) {
    return new Promise(resolve => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

function getItem(store, id) {
    return new Promise(resolve => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
    });
}

function toggleDarkMode() {
    document.body.classList.toggle('light-mode');
}

// Backup & Export
async function exportData() {
    const data = {
        ingredients: await getAllItems(db.transaction("ingredients").objectStore("ingredients")),
        products: await getAllItems(db.transaction("products").objectStore("products")),
        recipes: await getAllItems(db.transaction("recipes").objectStore("recipes")),
        sales: await getAllItems(db.transaction("sales").objectStore("sales"))
    };
    const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curbside_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

async function exportSalesCSV() {
    const sales = await getAllItems(db.transaction("sales").objectStore("sales"));
    let csv = "Date,Total Revenue\n";
    sales.forEach(s => {
        csv += `${s.timestamp},${s.total}\n`;
    });
    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_report.csv`;
    a.click();
}

// Initialize
initDB().then(() => {
    showView('dashboard');
});