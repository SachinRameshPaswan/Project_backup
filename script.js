import { supabase } from './supabase.js';

/**
 * Generates an "Unblockable" AI Image URL.
 * It wraps a free AI service inside a global image proxy to bypass firewalls.
 * * @param {string} prompt - The description of the image you want.
 * @returns {string} A fully formed URL that can be put in an <img> tag.
 */
async function getMagicAIUrl(prompt){
 const res = await fetch(
   "https://ai-image-worker.sachinpaswantt.workers.dev",
   {
     method:"POST",
     headers:{ "Content-Type":"application/json" },
     body: JSON.stringify({ prompt })
   }
 );

 if(!res.ok) throw new Error("AI failed");

 const json = await res.json()
 return json.url
}

window.generatePreview = async function() {
    const title = document.getElementById('lost-title').value.trim();
    const desc = document.getElementById('lost-desc').value.trim();
    const btn = document.getElementById('generate-btn');
    const previewContainer = document.getElementById('ai-preview-container');
    const previewImage = document.getElementById('ai-preview-image');
    const submitBtn = document.getElementById('submit-lost-btn');

    if (title.length < 3) {
        alert("Please enter a valid Item Name.");
        return;
    }

    // 1. Lock UI & Show Loading Spinner
    btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Generating AI Photo...`;
    btn.disabled = true;
    previewContainer.classList.remove('hidden');
    previewImage.src = "https://i.gifer.com/ZKZg.gif"; 

    // 2. THE UNLOCKER: Unlocks the submit button the millisecond any image loads
    previewImage.onload = () => {
        if (!previewImage.src.includes("ZKZg.gif")) {
            btn.innerHTML = `<i class="ph-bold ph-arrows-clockwise"></i> Regenerate`;
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            submitBtn.innerText = "Submit Report";
            btn.disabled = false;
        }
    };

    const prompt = `High quality professional product photo of a ${title}, ${desc}, studio lighting, highly detailed, clean white background, 4k resolution`;
    // ---> PASTE YOUR EXACT HUGGING FACE TOKEN BELOW <---
    const hfToken = window.ENV.HF_TOKEN;

    let successfulBlob = null;

    // ==========================================
    // TIER 1: FLUX MODEL (Primary)
    // ==========================================
    try {
        console.log("Trying Tier 1: FLUX...");
        const res1 = await fetch("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": hfToken },
            body: JSON.stringify({ inputs: prompt }),
        });
        if (!res1.ok) throw new Error("Flux failed");
        successfulBlob = await res1.blob();
    } catch (err1) {
        console.warn("Tier 1 Failed. Routing to Tier 2...", err1);
        
        // ==========================================
        // TIER 2: STABLE DIFFUSION XL (Backup 1)
        // ==========================================
        try {
            console.log("Trying Tier 2: Stable Diffusion XL...");
            const res2 = await fetch("https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": hfToken },
                body: JSON.stringify({ inputs: prompt }),
            });
            if (!res2.ok) throw new Error("SDXL failed");
            successfulBlob = await res2.blob();
        } catch (err2) {
            console.warn("Tier 2 Failed. Hugging Face might be blocked. Routing to Tier 3...", err2);
        }
    }

    // ==========================================
    // PROCESS HUGGING FACE SUCCESS
    // ==========================================
    if (successfulBlob) {
        try {
            // Show it instantly
            previewImage.src = URL.createObjectURL(successfulBlob);

            // Upload to Supabase Storage
            const fileName = `ai-${Date.now()}.png`;
            const { error: uploadError } = await supabase.storage.from("ai-images").upload(fileName, successfulBlob);
            if (uploadError) throw uploadError;

            // Save public URL
            const { data } = supabase.storage.from("ai-images").getPublicUrl(fileName);
            window.currentAIImageURL = data.publicUrl;
            return; // EXIT FUNCTION, WE WON!
            
        } catch (uploadErr) {
            console.warn("Supabase Storage upload failed. Falling back to direct URL...", uploadErr);
            successfulBlob = null; // Force it to Tier 3 if storage breaks
        }
    }

    // ==========================================
    // TIER 3: POLLINATIONS DIRECT URL (The Final Failsafe)
    // ==========================================
    if (!successfulBlob) {
        console.log("Trying Tier 3: Pollinations Direct Injection...");
        
        const safePrompt = encodeURIComponent(`Product photo of a ${title}, isolated on white background`);
        const randomSeed = Math.floor(Math.random() * 100000);
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${safePrompt}?seed=${randomSeed}&width=600&height=400&nologo=true`;

        // If Pollinations ALSO fails, we use a sleek dark-mode text placeholder.
        previewImage.onerror = () => {
            console.warn("All AI models failed. Loading UI Placeholder.");
            const safeText = encodeURIComponent(title);
            const fallbackUrl = `https://placehold.co/600x400/1e293b/ffffff?text=Image+Unavailable:%5Cn${safeText}`;
            window.currentAIImageURL = fallbackUrl;
            previewImage.src = fallbackUrl;
        };

        // Inject directly into the database and screen
        window.currentAIImageURL = pollinationsUrl;
        previewImage.src = pollinationsUrl;
    }
};

window.getMagicAIUrl = getMagicAIUrl;

let currentUser = null;
let currentAIImageURL = ""; // Stores the generated AI image URL temporarily

// ==========================================
// 1. INITIALIZATION & AUTH CHECK
// ==========================================
async function init() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        window.location.href = "login.html";
        return;
    }

    currentUser = data.session.user;

    const { data: userDetails } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    if (!userDetails) {
        alert("Profile data missing.");
        return;
    }

    currentUser = { ...currentUser, ...userDetails };

    // SUPER ADMIN & ADMIN ROUTING
    const isAnyAdmin = currentUser.role === "admin" || currentUser.role === "super_admin";
    
    if (isAnyAdmin && !window.location.pathname.includes("admin.html")) {
        window.location.href = "admin.html";
        return;
    }

    window.currentUser = currentUser;

    updateDashboardUI();

    // Show modal if missing profile fields
    if (!currentUser.student_id || !currentUser.contact_no) {
        document.getElementById('modal-complete-profile')?.classList.remove('hidden');
    }
 
    loadFeed('ALL');
} // <-- Correctly closing init() here!

function updateDashboardUI() {
    if (!currentUser) return;
    
    // Basic User Info
    document.getElementById('nav-user-name').textContent = currentUser.full_name;
    document.getElementById('nav-user-role').textContent = currentUser.role ? currentUser.role.toUpperCase() : 'USER';
    document.getElementById('greeting-text').textContent = `Hello, ${currentUser.full_name.split(' ')[0]}`;
    document.getElementById('user-initial').textContent = currentUser.full_name.charAt(0);

    // NEW: Update Student ID in the Header Badge
    const headerId = document.getElementById('header-student-id');
    if (headerId) {
        headerId.textContent = currentUser.student_id || "N/A";
    }
}

// STEP B: Submit to Database (Runs when form is submitted)
async function reportLostItem(event){
 event.preventDefault()

 if(!currentAIImageURL)
   return alert("Generate AI image first")

 const btn = document.getElementById('submit-lost-btn')
 btn.innerText="Saving..."
 btn.disabled=true

 const title = document.getElementById('lost-title').value
 const date  = document.getElementById('lost-date').value
 const time  = document.getElementById('lost-time').value
 const loc   = document.getElementById('lost-location').value
 const desc  = document.getElementById('lost-desc').value
 const fileInput = document.getElementById('lost-image')

 let realImageUrl = null

 try{
  // ---------- Upload REAL IMAGE if provided ----------
  if(fileInput.files.length>0){
    const file = fileInput.files[0]
    const ext = file.name.split(".").pop()
    const fileName = `lost-${currentUser.id}-${Date.now()}.${ext}`

    const {error:uploadError}= await supabase.storage
      .from("ai-images")
      .upload(fileName,file)

    if(uploadError) throw uploadError

    const { data, error } = await supabase.storage
  .from("ai-images")
  .createSignedUrl(fileName, 60 * 60);

if (error) throw error;
realImageUrl = data.signedUrl; // Assuming you meant to assign this to realImageUrl
  }

  // ---------- Save record ----------
  const {error}= await supabase.from("items").insert([{
    user_id:currentUser.id,
    title,
    description:desc,
    location:loc,
    date_incident:date,
    time_incident:time,
    item_type:"LOST",
    status:"PENDING",
    ai_image_url:currentAIImageURL,
    real_image_url:realImageUrl
  }])

  if(error) throw error

  alert("Lost item reported successfully")
  location.reload()

 }catch(err){
   alert(err.message)
   btn.disabled=false
   btn.innerText="Submit"
 }
}


// ==========================================
// 3. REPORT FOUND ITEM (REAL PHOTO UPLOAD)
// ==========================================
async function reportFoundItem(event) {
    event.preventDefault();
    const btn = document.getElementById('found-btn');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Uploading...`;

    const title = document.getElementById('found-title').value;
    const date  = document.getElementById('found-date').value;
    const time  = document.getElementById('found-time').value;
    const loc   = document.getElementById('found-location').value;
    const desc  = document.getElementById('found-desc').value;
    const fileInput = document.getElementById('found-image');

    let publicImageUrl = null;

    try {
        // Handle File Upload to 'found-images' Bucket
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;

            // Note: Make sure 'found-images' bucket is correct. The earlier code referenced 'ai-images' blob logic here incorrectly.
            const { error: uploadError } = await supabase.storage
              .from("found-images")
              .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('found-images')
                .getPublicUrl(fileName); // Swapped to getPublicUrl which is standard for public images
            
            publicImageUrl = publicUrl;
        }

        const { error } = await supabase.from('items').insert([{
            user_id: currentUser.id,
            title: title,
            description: desc,
            location: loc,
            date_incident: date,
            time_incident: time,
            item_type: 'FOUND',
            status: 'PENDING',
            image_url: publicImageUrl // Store real photo URL
        }]);

        if (error) throw error;

        alert("Found Item Reported! Thank you for your honesty.");
        window.location.reload();

    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==========================================
// 4. THE FEED (WITH SECURITY LOGIC)
// ==========================================
async function loadFeed(filterType) {
    const container = document.getElementById('feed-container');
    if (!container) return; // Guard clause if container missing

    container.innerHTML = '<div class="col-span-full text-center py-10"><i class="ph-bold ph-spinner animate-spin text-3xl text-indigo-600"></i></div>';

let query = supabase
    .from('items')
    .select('*')
    .eq('status', 'PENDING') // ONLY show items that are still active
    .order('created_at', { ascending: false });

    if (filterType !== 'ALL') {
        query = query.eq('item_type', filterType);
    }

    const { data: items, error } = await query;

    if (error) {
        container.innerHTML = `<p class="text-red-500">Error loading feed: ${error.message}</p>`;
        return;
    }

    container.innerHTML = ''; // Clear loading spinner

    if (items.length === 0) {
        container.innerHTML = `
    <div class="col-span-full text-center py-12">
        <i class="ph-duotone ph-magnifying-glass text-4xl text-slate-300 mb-2"></i>
        <p class="text-slate-500 font-medium">No items reported yet.</p>
        <p class="text-xs text-slate-400">Be the first to help the community!</p>
    </div>`;    
        return;
    }

    // Render Cards
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-white dark:bg-darkCard rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden hover:shadow-md transition-all";
        
        // --- SECURITY LOGIC START ---
        // Prevents fake claims by hiding real photos of Found items
        
        let displayImage = "";
        let blurClass = "";
        let badgeColor = "";
        let badgeText = item.item_type;

        if(item.item_type==="LOST"){
            const isAdmin = currentUser.role === "admin" || currentUser.role === "super_admin";
            const isOwner = currentUser.id === item.user_id;

            if(isAdmin || isOwner){
                displayImage = item.real_image_url || item.ai_image_url;
            }else{
                displayImage = item.ai_image_url;
            }
            badgeColor="bg-red-100 text-red-600";
        }
 
        else if (item.item_type === 'FOUND') {
            // FOUND ITEM: Show Real Photo ONLY if Admin or Finder
            const isAdmin = currentUser.role === "admin" || currentUser.role === "super_admin";
            const isFinder = currentUser.id === item.user_id;

            if (isAdmin || isFinder) {
                // Show Real Photo
                displayImage = item.image_url || "https://placehold.co/400x300?text=No+Photo";
            } else {
                // HIDE PHOTO for everyone else (Prevent Fake Claims)
                displayImage = "https://placehold.co/400x300/10b981/white?text=Secure+Item";
                blurClass = "blur-sm"; // Optional: adds a blur effect
            }
            badgeColor = "bg-emerald-100 text-emerald-600";
        }
        // --- SECURITY LOGIC END ---

        card.innerHTML = `
            <div class="h-48 overflow-hidden relative bg-slate-100">
                <img src="${displayImage}" class="w-full h-full object-cover ${blurClass}">
                <div class="absolute top-3 left-3 px-3 py-1 rounded-lg text-xs font-bold ${badgeColor}">
                    ${badgeText}
                </div>
            </div>
            <div class="p-5">
                <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-1 truncate">${item.title}</h3>
                <div class="flex items-center text-xs text-slate-400 gap-2 mb-3">
                    <i class="ph-fill ph-map-pin"></i> ${item.location}
                    <span>•</span>
                    <i class="ph-fill ph-clock"></i> ${item.date_incident || 'Unknown Date'}
                </div>
                <p class="text-sm text-slate-500 dark:text-slate-300 line-clamp-2 mb-4">
                    ${item.description}
                </p>
                <button onclick="viewItemDetails('${item.item_id}')" class="w-full py-2 bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 transition">
                    View Details
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================

// Global function for filter buttons (Needs to be attached to window)
window.filterFeed = (type) => {
    loadFeed(type);
};

// ==========================================
// 6. VIEW ITEM DETAILS LOGIC (UPDATED)
// ==========================================
window.viewItemDetails = async (itemId) => {
    // 1. Fetch specific item data
    const { data: item, error } = await supabase
        .from('items')
        .select('*, users(full_name, email)') 
        .eq('item_id', itemId)
        .single();

    if (error) {
        alert("Error fetching details: " + error.message);
        return;
    }

    // 2. Populate the HTML Elements
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text || "N/A";
    };

    setText('detail-title', item.title);
    setText('detail-location', item.location);
    setText('detail-date', `${item.date_incident || '?'} at ${item.time_incident || '?'}`);
    setText('detail-desc', item.description);

    // 3. Handle Image Display (Security Logic)
    const imgEl = document.getElementById('detail-image');
    const badgeEl = document.getElementById('detail-badge');
    const claimBtn = document.getElementById('claim-btn');

    if (item.item_type === 'LOST') {
        if(imgEl) imgEl.src = item.ai_image_url;
        if(badgeEl) {
            badgeEl.className = "px-3 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-600 mb-4 inline-block";
            badgeEl.innerText = "LOST";
        }
        if(claimBtn) {
            claimBtn.innerText = "I Found This! (Contact Owner)";
            claimBtn.onclick = () => contactOwner(item.users?.email, item.title);
        }
    } 
    else {
        // FOUND ITEM
        if(badgeEl) {
            badgeEl.className = "px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-600 mb-4 inline-block";
            badgeEl.innerText = "FOUND";
        }
        
        // Security Check: Hide real photo unless Admin/Owner
        const isAdmin = currentUser.role === "admin" || currentUser.role === "super_admin";
        const isOwner = currentUser.id === item.user_id;
        
        if (imgEl) {
            if (isAdmin || isOwner) {
                imgEl.src = item.image_url;
            } else {
                imgEl.src = "https://placehold.co/600x400/10b981/white?text=Secure+Item+(Photo+Hidden)";
            }
        }

        if(claimBtn) {
            claimBtn.innerText = "This is Mine! (Claim Item)";
            claimBtn.onclick = () => contactOwner(item.users?.email, item.title);
        }
    }

    // 4. Switch View
    if(window.showSection) {
        window.showSection('item-details');
    } else {
        console.error("showSection function missing!");
    }
};

// ==========================================
// 7. CONTACT LOGIC
// ==========================================
window.contactOwner = (ownerEmail, itemTitle) => {
    if (!ownerEmail) return alert("Owner email not found.");
    
    const subject = `Regarding: ${itemTitle} (Connect & Found)`;
    const body = `Hello,\n\nI am contacting you regarding the item "${itemTitle}" posted on Connect & Found.\n\nPlease let me know if we can meet.\n\nThanks, \n${currentUser.full_name}`;
    
    window.location.href = `mailto:${ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

// Attach Form Listeners
const lostForm = document.getElementById('lost-form');
if (lostForm) lostForm.addEventListener('submit', reportLostItem);

const foundForm = document.getElementById('found-form');
if (foundForm) foundForm.addEventListener('submit', reportFoundItem);

// Run Initialization
window.addEventListener("DOMContentLoaded", init);

// ==========================================
// 8. LOGOUT LOGIC (Moved to bottom and fixed)
// ==========================================
window.logout = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
        alert("Error signing out: " + error.message);
    } else {
        window.location.href = 'login.html';
    }
};

// Attach to the sidebar button as well
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', window.logout);
}

// ==========================================
// 9. MY REPORTS LOGIC (Manage Own Items)
// ==========================================
window.loadMyReports = async () => {
    const container = document.getElementById('my-reports-container');
    const countEl = document.getElementById('my-report-count');
    
    container.innerHTML = '<div class="text-center py-10"><i class="ph-bold ph-spinner animate-spin text-3xl text-indigo-600"></i></div>';

    // Fetch items where user_id matches the CURRENT USER
    const { data: items, error } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p class="text-red-500 text-center">Error: ${error.message}</p>`;
        return;
    }

    countEl.innerText = items.length;
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white dark:bg-darkCard rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                <i class="ph-duotone ph-folder-dashed text-4xl text-slate-400 mb-2"></i>
                <p class="text-slate-500">You haven't reported any items yet.</p>
            </div>`;
        return;
    }

items.forEach(item => {
    const isLost = item.item_type === 'LOST';
    const isClaimed = item.status === 'CLAIMED';
    
    // Define colors based on type
    const badgeColor = isLost ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600';
    const statusColor = isClaimed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
    
    const itemCard = document.createElement('div');
    itemCard.className = "bg-white dark:bg-darkCard p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col md:flex-row items-center gap-6";
    
    itemCard.innerHTML = `
        <div class="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden">
            <img src="${isLost ? item.ai_image_url : item.image_url}" class="w-full h-full object-cover">
        </div>
        
        <div class="flex-1 text-center md:text-left">
            <div class="flex items-center justify-center md:justify-start gap-2 mb-1">
                <h4 class="font-bold text-slate-800 dark:text-white">${item.title}</h4>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${badgeColor}">${item.item_type}</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">${item.date_incident || 'No Date'} • ${item.location}</p>
            <span class="text-[10px] px-2 py-1 rounded-md font-bold uppercase ${statusColor}">
                ${item.status}
            </span>
        </div>

        <div class="flex items-center gap-3">
            ${!isClaimed ? `
                <button onclick="deleteItem('${item.item_id}')" class="px-4 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-sm font-bold transition flex items-center gap-2">
                    <i class="ph-bold ph-trash"></i> ${isLost ? 'I found it / Remove' : 'Delete'}
                </button>

                ${!isLost ? `
                <button onclick="markAsSolved('${item.item_id}')" class="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-sm font-bold transition flex items-center gap-2">
                    <i class="ph-bold ph-check-circle"></i> Item Returned
                </button>` : ''}
            ` : `
                <span class="text-emerald-600 font-bold text-sm italic">Resolved</span>
            `}
        </div>
    `;
    container.appendChild(itemCard);
});
};

// ==========================================
// 10. ACTIONS (Delete / Solve)
// ==========================================
window.deleteItem = async (id) => {
    // Simple confirmation to prevent accidental clicks
    const confirmed = confirm("Are you sure? This will permanently remove the report from the system.");
    if (!confirmed) return;

    // Use Supabase delete
    const { error } = await supabase
        .from('items')
        .delete()
        .eq('item_id', id);

    if (error) {
        alert("Error deleting: " + error.message);
    } else {
        alert("Report deleted successfully.");
        loadMyReports(); // Refresh the user's list
        if(typeof loadFeed === 'function') loadFeed('ALL'); // Refresh the dashboard
    }
};

window.markAsSolved = async (id) => {
    if(!confirm("Is this item officially resolved? It will be hidden from the main feed.")) return;

    const { error } = await supabase
        .from('items')
        .update({ status: 'CLAIMED' })
        .eq('item_id', id);

    if (error) alert("Error updating: " + error.message);
    else {
        alert("Great! Item marked as solved.");
        loadMyReports();
        loadFeed('ALL');
    }
};

// ==========================================
// 11. REWARDS / LEADERBOARD LOGIC
// ==========================================
window.loadRewards = async () => {
    // 1. Set current user balance
    const balanceEl = document.getElementById('reward-balance');
    if(balanceEl) balanceEl.innerText = currentUser.points || 0;

    // 2. Fetch Top 5 Users
    const { data: users, error } = await supabase
        .from('users')
        .select('full_name, reward_points')
        .order('reward_points', { ascending: false })
        .limit(5);

    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    if (error) {
        listEl.innerHTML = `<p class="text-red-400 text-sm">Error loading data.</p>`;
        return;
    }

    listEl.innerHTML = ''; // Clear loading text

    // 3. Render the List
    users.forEach((u, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const highlight = u.full_name === currentUser.full_name ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-100' : 'border-transparent';
        
        const row = `
            <div class="flex items-center justify-between p-3 rounded-xl border ${highlight}">
                <div class="flex items-center gap-3">
                    <span class="font-bold text-lg w-8 text-center">${medal}</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200">${u.full_name}</span>
                </div>
                <span class="font-bold text-indigo-600 dark:text-indigo-400">${u.reward_points} pts</span>
            </div>
        `;
        listEl.innerHTML += row;
    });
};

// ==========================================
// 12. LOAD PROFILE (Updated with All Details)
// ==========================================
window.loadProfile = async () => {
    if (!currentUser) return;

    // Helper to safely set text
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text || "-";
    };

    // 1. Basic Info
    setText('profile-name', currentUser.full_name);
    setText('profile-email', currentUser.email);
    setText('profile-role', currentUser.role ? currentUser.role.toUpperCase() : "STUDENT");
    
    const initialEl = document.getElementById('profile-initial');
    if(initialEl) initialEl.innerText = currentUser.full_name.charAt(0);

    // 2. Academic Details (The New Fields)
    setText('prof-student-id', currentUser.student_id);
    setText('prof-course', currentUser.course);
    setText('prof-class', currentUser.class_year);
    setText('prof-division', currentUser.division);
    setText('prof-roll-no', currentUser.roll_no);
    setText('prof-contact', currentUser.contact_no); // User can see their own number

    // 3. Stats (Count items from database)
    const { data: items, error } = await supabase
        .from('items')
        .select('item_type')
        .eq('user_id', currentUser.id);

    if (!error && items) {
        const lostCount = items.filter(i => i.item_type === 'LOST').length;
        const foundCount = items.filter(i => i.item_type === 'FOUND').length;
        
        setText('profile-lost-count', lostCount);
        setText('profile-found-count', foundCount);
        setText('profile-points', currentUser.reward_points || 0); 
    }
};

// ==========================================
// 13. PROFILE UPDATE LOGIC
// ==========================================

// A. Handle the "Missing Details" Modal Submit
const modalForm = document.getElementById('modal-update-form');

if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const updates = {
            student_id: document.getElementById('modal-student-id').value,
            contact_no: document.getElementById('modal-contact').value,
            course: document.getElementById('modal-course').value,
            class_year: document.getElementById('modal-class').value,
            division: document.getElementById('modal-div').value,
            roll_no: document.getElementById('modal-roll').value
        };

        const btn = e.target.querySelector('button');
        btn.innerText = "Saving...";

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('user_id', currentUser.id);

        if (error) {
            alert("Error updating: " + error.message);
            btn.innerText = "Try Again";
        } else {
            alert("Profile Updated!");
            window.location.reload();
        }
    });
}

// ==========================================
// 14. SETTINGS LOGIC (Populate & Toggle Edit)
// ==========================================

// A. Load data into the inputs and lock them
window.loadSettings = () => {
    if (!currentUser) return;
    
    // Correct IDs matching your HTML
    const nameInput = document.getElementById('set-fullname');
    const idInput = document.getElementById('set-college-id');
    const courseInput = document.getElementById('set-course');
    const classInput = document.getElementById('set-class-details');
    const contactInput = document.getElementById('set-contact');
    
    // Fill the boxes with the user's data
    if(nameInput) nameInput.value = currentUser.full_name || '';
    if(idInput) idInput.value = currentUser.college_id || '';
    if(courseInput) courseInput.value = currentUser.course || '';
    if(classInput) classInput.value = currentUser.class_details || '';
    if(contactInput) contactInput.value = currentUser.contact_no || '';

    // Lock them by default when the page loads
    window.lockSettings(true);
};

// B. Toggle the inputs between locked and editable
window.lockSettings = (isLocked) => {
    const inputs = ['set-fullname', 'set-college-id', 'set-course', 'set-class-details', 'set-contact'];
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isLocked;
            // Add a visual cue so the user knows it's locked
            if (isLocked) {
                el.classList.add('bg-slate-100', 'dark:bg-slate-800', 'cursor-not-allowed', 'opacity-70');
            } else {
                el.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'cursor-not-allowed', 'opacity-70');
            }
        }
    });

    // Toggle the buttons
    const editBtn = document.getElementById('btn-enable-edit');
    const saveBtn = document.getElementById('btn-save-settings');
    
    if (editBtn) editBtn.classList.toggle('hidden', !isLocked);
    if (saveBtn) saveBtn.classList.toggle('hidden', isLocked);
};

// C. Save the new settings to Supabase
window.updateProfileSettings = async () => {
    const saveBtn = document.getElementById('btn-save-settings');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Saving...`;
    saveBtn.disabled = true;

    // Grab the new values from the text boxes
    const updates = {
        full_name: document.getElementById('set-fullname').value,
        college_id: document.getElementById('set-college-id').value,
        course: document.getElementById('set-course').value,
        class_details: document.getElementById('set-class-details').value,
        contact_no: document.getElementById('set-contact').value
    };

    // Send to Supabase
    const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('user_id', currentUser.id);

    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;

    if (error) {
        alert("Error: " + error.message);
    } else {
        // Update local user object so they don't have to log out to see changes
        Object.assign(currentUser, updates);
        
        updateDashboardUI(); // Refresh the header name
        
        alert("Settings Saved Successfully!");
        window.lockSettings(true); // Lock the fields again!
    }
};

