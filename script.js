// Core App State
let followers = new Map();
let following = new Map();
let currentTab = 'traitors';
let calculatedLists = { traitors: [], fans: [], mutuals: [] };

// Gradient presets for generated user avatars
const gradients = [
    'from-pink-500 to-rose-500', 'from-purple-500 to-indigo-500', 
    'from-blue-500 to-cyan-500', 'from-amber-500 to-orange-500', 
    'from-emerald-500 to-teal-500'
];

function getAvatar(username) {
    const letter = username.charAt(0).toUpperCase();
    const gradClass = gradients[letter.charCodeAt(0) % gradients.length];
    return `<div class="w-10 h-10 rounded-xl bg-gradient-to-br ${gradClass} flex items-center justify-center text-white font-bold shadow-inner shrink-0">${letter}</div>`;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(unixTime) {
    if (!unixTime) return "Unknown";
    return new Date(unixTime * 1000).toLocaleDateString();
}

// Deep JSON Parser
function extractUsers(data) {
    let users = new Map();
    function search(node) {
        if (Array.isArray(node)) {
            node.forEach(search);
        } else if (node !== null && typeof node === 'object') {
            if (node.value && typeof node.value === 'string' && node.href && node.href.includes('instagram.com')) {
                users.set(node.value, node.timestamp || 0);
                return;
            }
            if (node.string_list_data && Array.isArray(node.string_list_data)) {
                node.string_list_data.forEach(i => { if (i.value) users.set(i.value, i.timestamp || 0); });
            } else {
                Object.values(node).forEach(search);
            }
        }
    }
    search(data);
    return users;
}

// --- Drag, Drop & ZIP Processing ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

['dragover', 'dragenter'].forEach(e => dropZone.addEventListener(e, ev => { 
    ev.preventDefault(); 
    dropZone.classList.add('border-pink-500', 'bg-white/5'); 
}));

['dragleave', 'drop'].forEach(e => dropZone.addEventListener(e, ev => { 
    ev.preventDefault(); 
    dropZone.classList.remove('border-pink-500', 'bg-white/5'); 
}));

dropZone.addEventListener('drop', e => handleZip(e.dataTransfer.files[0]));
fileInput.addEventListener('change', e => handleZip(e.target.files[0]));

async function handleZip(file) {
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
        showToast("Please upload the .zip file directly.");
        return;
    }
    
    const status = document.getElementById('uploadStatus');
    status.classList.remove('hidden');
    status.innerHTML = '<i class="ph-bold ph-spinner-gap animate-spin text-lg"></i> Scanning ZIP contents...';

    followers.clear(); 
    following.clear();
    let promises = [];
    let foundHtml = 0;

    try {
        const zip = await JSZip.loadAsync(file);
        
        // Loop through EVERY file inside the ZIP archive
        zip.forEach((path, entry) => {
            const p = path.toLowerCase();
            
            // Ignore Mac hidden folders
            if (p.includes('__macosx')) return; 
            
            // Diagnostic: Check if they downloaded HTML by accident
            if (p.endsWith('.html')) foundHtml++;

            // Only look at JSON files
            if (!p.endsWith('.json')) return;

            // Exclude requests, pending, blocked, or close friends lists
            if (p.includes('request') || p.includes('pending') || p.includes('blocked') || p.includes('close_friends') || p.includes('hashtags')) return;

            // Ultra-broad matching for Followers and Following
            if (p.includes('follower')) {
                promises.push(entry.async("string").then(c => extractUsers(JSON.parse(c)).forEach((t, u) => followers.set(u, t))));
            } else if (p.includes('following')) {
                promises.push(entry.async("string").then(c => extractUsers(JSON.parse(c)).forEach((t, u) => following.set(u, t))));
            }
        });

        await Promise.all(promises);

        // Smart Error Handling
        if (followers.size === 0 || following.size === 0) {
            if (foundHtml > 0) {
                status.innerHTML = `<i class="ph-fill ph-warning-circle text-red-500 text-lg"></i> <b>Error:</b> You downloaded HTML format! (Found ${foundHtml} HTML files). You must request <b>JSON format</b> from Instagram.`;
            } else {
                status.innerHTML = `<i class="ph-fill ph-warning-circle text-red-500 text-lg"></i> <b>Error:</b> Could not find JSON data. Unzip the file on your computer and upload 'followers.json' and 'following.json' directly.`;
            }
            return;
        }

        // Switch Views
        document.getElementById('uploadView').classList.add('hide');
        document.getElementById('dashboardView').classList.remove('hide');
        
        // Update Dashboard Top Metrics
        document.getElementById('metricFollowers').innerText = followers.size;
        document.getElementById('metricFollowing').innerText = following.size;

        calculateData();
        showToast("Data Extracted Successfully!");

    } catch (err) {
        console.error(err);
        status.innerHTML = `<i class="ph-fill ph-warning-circle text-red-500 text-lg"></i> Error reading ZIP file. Please extract it and upload the JSON files manually.`;
    }
}

// --- Data Comparison Logic ---
function calculateData() {
    calculatedLists = { traitors: [], fans: [], mutuals: [] };
    
    // Who do I follow?
    following.forEach((t, u) => { 
        !followers.has(u) ? calculatedLists.traitors.push({u, t}) : calculatedLists.mutuals.push({u, t}); 
    });
    
    // Who follows me?
    followers.forEach((t, u) => { 
        if (!following.has(u)) calculatedLists.fans.push({u, t}); 
    });

    document.getElementById('metricTraitors').innerText = calculatedLists.traitors.length;
    document.getElementById('metricFans').innerText = calculatedLists.fans.length;
    
    renderLists();
}

// --- Rendering engine for the lists ---
function renderLists(search = "") {
    const query = search.toLowerCase();
    
    ['traitors', 'fans', 'mutuals'].forEach(cat => {
        // Filter by search and sort newest first
        let list = calculatedLists[cat].filter(i => i.u.toLowerCase().includes(query)).sort((a, b) => b.t - a.t);
        const el = document.getElementById(`${cat}List`);
        
        if (list.length === 0) {
            el.innerHTML = `<div class="p-8 text-center text-gray-500">No accounts found.</div>`;
            return;
        }

        el.innerHTML = list.map((i, idx) => `
            <li class="list-item-anim px-3 py-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between mb-2 group hover:bg-white/10 transition-colors" style="animation-delay: ${idx < 15 ? idx * 0.03 : 0}s">
                <div class="flex items-center gap-3">
                    ${getAvatar(i.u)}
                    <div>
                        <a href="https://instagram.com/${i.u}" target="_blank" class="font-bold text-gray-200 text-sm hover:text-white">@${i.u}</a>
                        <p class="text-[10px] text-gray-500">Followed: ${formatDate(i.t)}</p>
                    </div>
                </div>
                <a href="https://instagram.com/${i.u}" target="_blank" class="glass text-white px-3 py-1.5 rounded-lg text-xs font-semibold opacity-100 md:opacity-0 group-hover:opacity-100 transition-all shrink-0">Profile</a>
            </li>
        `).join('');
    });
}

// --- Tab Switching ---
function switchTab(id) {
    currentTab = id;
    ['traitors', 'fans', 'mutuals'].forEach(t => {
        document.getElementById(`tab-${t}`).className = (t === id) 
            ? "tab-btn active px-4 py-2 rounded-lg text-sm font-bold bg-gray-700 text-white whitespace-nowrap" 
            : "tab-btn px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white whitespace-nowrap";
        
        document.getElementById(`${t}List`).className = (t === id) 
            ? "max-h-[50vh] md:max-h-[600px] overflow-y-auto scrollbar-hide space-y-1" 
            : "hide";
    });
}

// --- CSV Export ---
function exportCSV() {
    if (calculatedLists[currentTab].length === 0) return showToast("Nothing to export!");
    let csv = "data:text/csv;charset=utf-8,Username,Date\n" + calculatedLists[currentTab].map(i => `${i.u},${formatDate(i.t)}`).join("\n");
    const anchor = document.createElement("a");
    anchor.href = encodeURI(csv);
    anchor.download = `InsightsPro_${currentTab}.csv`;
    anchor.click();
    showToast("CSV Downloaded Successfully!");
}

// --- Search Listener ---
document.getElementById('searchInput').addEventListener('input', e => renderLists(e.target.value));
