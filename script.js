// Core App State
let followers = new Map();
let following = new Map();
let currentTab = 'traitors';
let calculatedLists = { traitors: [], fans: [], mutuals: [] };

const gradients = ['from-pink-500 to-rose-500', 'from-purple-500 to-indigo-500', 'from-blue-500 to-cyan-500', 'from-amber-500 to-orange-500', 'from-emerald-500 to-teal-500'];

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

// ---------------------------------------------------------
// ULTIMATE BRUTE-FORCE JSON PARSER
// ---------------------------------------------------------
// Instagram changes their JSON keys constantly (sometimes using "value", 
// sometimes "title", sometimes wrapping it in "string_list_data").
// This function ignores the rules and hunts for the raw data.
function extractUsers(data) {
    let users = new Map();
    
    function search(node) {
        if (Array.isArray(node)) {
            node.forEach(search);
        } else if (node !== null && typeof node === 'object') {
            
            // Format 1: Standard string_list_data (Most common for followers_1.json)
            if (node.string_list_data && Array.isArray(node.string_list_data)) {
                node.string_list_data.forEach(item => {
                    if (item.value && typeof item.value === 'string') {
                        users.set(item.value, item.timestamp || node.timestamp || 0);
                    }
                });
            }
            
            // Format 2: Direct value mapping with a profile link (Sometimes used in following.json)
            else if (node.value && typeof node.value === 'string' && node.href && node.href.includes('instagram.com')) {
                users.set(node.value, node.timestamp || 0);
            }
            
            // Format 3: Username hidden in "title" property 
            else if (node.title && typeof node.title === 'string' && node.href && node.href.includes('instagram.com')) {
                users.set(node.title, node.timestamp || 0);
            }

            // Keep digging deeper into the JSON tree
            Object.values(node).forEach(search);
        }
    }
    
    search(data);
    return users;
}

// --- Drag, Drop & ZIP Auto-Extraction ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

['dragover', 'dragenter'].forEach(e => dropZone.addEventListener(e, ev => { 
    ev.preventDefault(); dropZone.classList.add('border-pink-500', 'bg-white/5'); 
}));

['dragleave', 'drop'].forEach(e => dropZone.addEventListener(e, ev => { 
    ev.preventDefault(); dropZone.classList.remove('border-pink-500', 'bg-white/5'); 
}));

dropZone.addEventListener('drop', e => handleZip(e.dataTransfer.files[0]));
fileInput.addEventListener('change', e => handleZip(e.target.files[0]));

async function handleZip(file) {
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
        showToast("Please upload the Instagram .zip file.");
        return;
    }
    
    const status = document.getElementById('uploadStatus');
    status.classList.remove('hidden');
    status.innerHTML = '<i class="ph-bold ph-spinner-gap animate-spin text-lg"></i> Extracting ZIP automatically...';

    followers.clear(); 
    following.clear();
    let promises = [];

    try {
        const zip = await JSZip.loadAsync(file);
        
        zip.forEach((path, entry) => {
            if (entry.dir) return; 

            const p = path.toLowerCase();
            const fileName = p.split('/').pop(); // Get just the file name, ignore folders
            
            // Exclude non-JSON files and hidden mac files
            if (fileName.includes('__macosx') || fileName.startsWith('.') || !fileName.endsWith('.json')) return;

            // Exclude files that sound like "following" but aren't the actual list
            if (fileName.includes('request') || fileName.includes('pending') || fileName.includes('blocked') || fileName.includes('close_friends') || fileName.includes('recent') || fileName.includes('unfollowed')) return;

            // Target the specific files you listed
            if (fileName.match(/^followers(_\d+)?\.json$/)) {
                promises.push(entry.async("string").then(content => {
                    const parsed = JSON.parse(content);
                    const extracted = extractUsers(parsed);
                    extracted.forEach((time, user) => followers.set(user, time));
                }));
            } 
            else if (fileName.match(/^following(_\d+)?\.json$/)) {
                promises.push(entry.async("string").then(content => {
                    const parsed = JSON.parse(content);
                    const extracted = extractUsers(parsed);
                    extracted.forEach((time, user) => following.set(user, time));
                }));
            }
        });

        await Promise.all(promises);

        if (followers.size === 0 || following.size === 0) {
            status.innerHTML = `<i class="ph-fill ph-warning-circle text-red-500 text-lg"></i> <b>Data Missing:</b> Found ${followers.size} followers and ${following.size} following. Ensure your ZIP contains data.`;
            return;
        }

        // Switch Views on Success
        document.getElementById('uploadView').classList.add('hide');
        document.getElementById('dashboardView').classList.remove('hide');
        
        document.getElementById('metricFollowers').innerText = followers.size.toLocaleString();
        document.getElementById('metricFollowing').innerText = following.size.toLocaleString();

        calculateData();
        showToast("Data Processed Successfully!");

    } catch (err) {
        console.error("ZIP Error:", err);
        status.innerHTML = `<i class="ph-fill ph-warning-circle text-red-500 text-lg"></i> System Error: Could not read ZIP file.`;
    }
}

// --- Data Comparison & Rendering ---
function calculateData() {
    calculatedLists = { traitors: [], fans: [], mutuals: [] };
    
    following.forEach((t, u) => { 
        !followers.has(u) ? calculatedLists.traitors.push({u, t}) : calculatedLists.mutuals.push({u, t}); 
    });
    
    followers.forEach((t, u) => { 
        if (!following.has(u)) calculatedLists.fans.push({u, t}); 
    });

    document.getElementById('metricTraitors').innerText = calculatedLists.traitors.length.toLocaleString();
    document.getElementById('metricFans').innerText = calculatedLists.fans.length.toLocaleString();
    
    renderLists();
}

function renderLists(search = "") {
    const query = search.toLowerCase();
    
    ['traitors', 'fans', 'mutuals'].forEach(cat => {
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
                        <p class="text-[10px] text-gray-500">Date: ${formatDate(i.t)}</p>
                    </div>
                </div>
                <a href="https://instagram.com/${i.u}" target="_blank" class="glass text-white px-3 py-1.5 rounded-lg text-xs font-semibold opacity-100 md:opacity-0 group-hover:opacity-100 transition-all shrink-0">Profile</a>
            </li>
        `).join('');
    });
}

function switchTab(id) {
    currentTab = id;
    ['traitors', 'fans', 'mutuals'].forEach(t => {
        document.getElementById(`tab-${t}`).className = (t === id) ? "tab-btn active px-4 py-2 rounded-lg text-sm font-bold bg-gray-700 text-white whitespace-nowrap" : "tab-btn px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white whitespace-nowrap";
        document.getElementById(`${t}List`).className = (t === id) ? "max-h-[50vh] md:max-h-[600px] overflow-y-auto scrollbar-hide space-y-1" : "hide";
    });
}

function exportCSV() {
    if (calculatedLists[currentTab].length === 0) return showToast("Nothing to export!");
    let csv = "data:text/csv;charset=utf-8,Username,Date\n" + calculatedLists[currentTab].map(i => `${i.u},${formatDate(i.t)}`).join("\n");
    const anchor = document.createElement("a");
    anchor.href = encodeURI(csv);
    anchor.download = `InsightsPro_${currentTab}.csv`;
    anchor.click();
    showToast("CSV Downloaded!");
}

document.getElementById('searchInput').addEventListener('input', e => renderLists(e.target.value));

