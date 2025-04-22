// All JavaScript moved from <script> in first.html
(function(){
  const memoriesKey="memories";
  const summaryKey="mem_summary";
  const apiKeyKey="openai_key";

  // ---------- LOAD / SAVE helpers -------------
  const loadMemories=()=>{try{return JSON.parse(localStorage.getItem(memoriesKey))||[]}catch{return[]}};
  const saveMemories=(m)=>localStorage.setItem(memoriesKey,JSON.stringify(m));
  const loadSummary=()=>localStorage.getItem(summaryKey)||"";
  const saveSummary=(s)=>localStorage.setItem(summaryKey,s);

  // ----------- RENDER helpers -----------------
  const renderMemories=(mems)=>{
    const c=document.getElementById("memories");
    c.innerHTML="";
    if(!mems.length){c.innerHTML="<p>No memories yet.</p>";return;}
    // Group memories by date (YYYY-MM-DD)
    const grouped = {};
    mems.forEach(m => {
      const day = new Date(m.date).toISOString().slice(0,10);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(m);
    });
    // Render each day group, most recent first
    Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).forEach(day => {
      const dayMems = grouped[day];
      const dayLabel = new Date(day).toLocaleDateString();
      c.innerHTML += `<div style='margin-top:1.2em;'><div style='font-size:1.05em;color:#6366f1;font-weight:600;margin-bottom:0.3em;'>${dayLabel}</div><ul class='memory-list'>`;
      dayMems.forEach((m, idx) => {
        let loc = m.location && m.location.lat != null ? ` (${m.location.lat.toFixed(2)}, ${m.location.lon.toFixed(2)})` : "";
        c.innerHTML += `<li class='memory-list-item'><span class='memory-text'>${m.text}</span> <span class='memory-meta'>${new Date(m.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}${loc}</span> <button class='delete-memory-btn' data-date='${m.date}'>🗑️</button></li>`;
      });
      c.innerHTML += `</ul></div>`;
    });
  };
  const renderSummary=(txt)=>{
    document.getElementById("summary").textContent=txt||"(no consolidated summary yet)";
  };

  // ---------- INITIAL RENDER ------------------
  document.getElementById("apikey").value=localStorage.getItem(apiKeyKey)||"";
  renderMemories(loadMemories());
  renderSummary(loadSummary());

  // Hide placeholder if answer is shown (on page load)
  if (document.getElementById("answer").textContent.trim()) {
    document.getElementById("placeholder").style.display = "none";
  }

  // ---------- SAVE API KEY --------------------
  document.getElementById("save-key").onclick=()=>{
    const k=document.getElementById("apikey").value.trim();if(!k){alert("Please enter a valid API key.");return;}localStorage.setItem(apiKeyKey,k);alert("Key saved ✅");};

  // ---------- CONSOLIDATE ---------------------
  async function updateConsolidated(newText){
    const key=localStorage.getItem(apiKeyKey);if(!key) return;
    const prev=loadSummary();
    const prompt=`You are a personal memory consolidation assistant.\nYou receive a new memory and the existing consolidated summary (which groups memories by topic and context).\nReturn an UPDATED consolidated summary that includes the new memory, merges duplicates, and keeps related thoughts together under clear topic headings.\n\nEXISTING SUMMARY:\n${prev||"(none)"}\n\nNEW MEMORY:\n${newText}\n\nUPDATED CONSOLIDATED SUMMARY:`;
    try{
      const r=await fetch("https://api.openai.com/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
        body:JSON.stringify({model:"gpt-4.1-mini",messages:[{role:"system",content:"You are a helpful assistant."},{role:"user",content:prompt}],temperature:0.2})
      });
      if(!r.ok) throw new Error(`OpenAI error: ${r.status}`);
      const data=await r.json();const upd=data.choices?.[0]?.message?.content?.trim();
      if(upd){saveSummary(upd);renderSummary(upd);} }
    catch(e){console.error(e);/*silently fail so UX isn't blocked*/}
  }

  // ---------- STORE/ASK MODE HANDLING -------------
  // Remove old button event listeners and use the new toggle/button
  const submitBtn = document.getElementById("submit-btn");
  const modeToggle = document.getElementById("mode-toggle");
  const mainInput = document.getElementById("main-input");

  // Remove old buttons if they exist (for safety)
  const oldStoreBtn = document.getElementById("store-btn");
  if (oldStoreBtn) oldStoreBtn.remove();
  const oldAskBtn = document.getElementById("ask-btn");
  if (oldAskBtn) oldAskBtn.remove();

  // Unified submit handler
  submitBtn.onclick = async () => {
    const text = mainInput.value.trim();
    if (!text) return;
    // Hide placeholder when submitting
    document.getElementById("placeholder").style.display = "none";
    if (!modeToggle.checked) {
      // Store mode
      const onSuccess = coords => {
        const mem = { text, date: new Date().toISOString(), location: coords ? { lat: coords.latitude, lon: coords.longitude } : null };
        const mems = loadMemories(); mems.push(mem); saveMemories(mems); renderMemories(mems);
        mainInput.value = "";
        updateConsolidated(mem.text);
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => onSuccess(p.coords), () => onSuccess(null), { maximumAge: 6e4, timeout: 5e3 });
      } else onSuccess(null);
    } else {
      // Ask mode
      const key = (document.getElementById("apikey").value.trim() || localStorage.getItem(apiKeyKey) || "").trim();
      if (!key) { alert("Please provide your OpenAI API key first."); return; }
      const ansBox = document.getElementById("answer"); ansBox.style.display = "block"; ansBox.textContent = "Thinking..."; document.getElementById("relevant-section").style.display = "none";
      const mems = loadMemories(); const qWords = text.toLowerCase().split(/\s+/);
      let rel = mems.filter(m => qWords.some(w => m.text.toLowerCase().includes(w))); if (!rel.length) rel = mems.slice(-10); rel = rel.slice(-20);
      const prompt = `Below are some of the user's stored memories, each prefixed with an index and timestamp.\nUse them to answer the user's question.\n\nMEMORIES:\n${rel.map((m, i) => `${i + 1}. (${m.date}) ${m.text}`).join("\n")}\n\nQUESTION: ${text}\n\nAnswer by referencing the relevant memories.`;
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "gpt-4.1-mini", messages: [{ role: "system", content: "You are a helpful memory assistant." }, { role: "user", content: prompt }], temperature: 0.3 }) });
        if (!r.ok) throw new Error(`OpenAI error: ${r.status}`); const data = await r.json(); ansBox.textContent = data.choices?.[0]?.message?.content?.trim() || "(No answer)"; showRelevant(rel);
      } catch (e) { console.error(e); ansBox.textContent = `Error: ${e.message}`; }
    }
  };

  // ENTER KEY HANDLING (Ctrl/Cmd+Enter always asks, Enter uses current mode)
  mainInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        modeToggle.checked = true; // force ask mode
      }
      submitBtn.click();
    }
  });

  // ---------- CLEAR ALL STORAGE ---------------
  document.getElementById("clear-btn").onclick=()=>{
    if(confirm("Delete ALL stored data (memories, summary)? This will NOT delete your API key.")){
      localStorage.removeItem(memoriesKey);
      localStorage.removeItem(summaryKey);
      renderMemories([]);renderSummary("");
      const ans=document.getElementById("answer");ans.style.display="none";ans.textContent="";
      const rel=document.getElementById("relevant-section");rel.style.display="none";rel.textContent="";
      alert("All memories and summary deleted. API key is retained.");
    }
  };

  // ---------- DELETE API KEY ONLY -------------
  document.getElementById("delete-key").onclick=()=>{
    if(confirm("Delete your stored API key?")){
      localStorage.removeItem(apiKeyKey);
      document.getElementById("apikey").value="";
      alert("API key deleted.");
    }
  };

  // ---------- SHOW RELEVANT -------------------
  const showRelevant=rel=>{
    const box=document.getElementById("relevant-section");box.innerHTML="<strong>Memories used for this answer:</strong><br/>"+rel.map(m=>`<em>${new Date(m.date).toLocaleDateString()}:</em> ${m.text}`).join("<br/>");box.style.display="block";
  };

  // ---------- UNFOLDABLE ERROR INDICATOR -------------
  function updateUnfoldableIndicators() {
    document.querySelectorAll('details > summary').forEach(summary => {
      let indicator = summary.querySelector('.unfoldable-indicator');
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'unfoldable-indicator';
        indicator.textContent = '▶';
        summary.insertBefore(indicator, summary.firstChild);
      }
      const details = summary.parentElement;
      if (details.open) {
        indicator.classList.add('open');
      } else {
        indicator.classList.remove('open');
      }
    });
  }

  updateUnfoldableIndicators();
  document.querySelectorAll('details').forEach(details => {
    details.addEventListener('toggle', updateUnfoldableIndicators);
  });

  // Add event listener for deleting individual memories
  document.getElementById("memories").onclick = function(e) {
    if (e.target.classList.contains("delete-memory-btn")) {
      const date = e.target.getAttribute("data-date");
      let mems = loadMemories();
      mems = mems.filter(m => m.date !== date);
      saveMemories(mems);
      renderMemories(mems);
      // Optionally update summary
      renderSummary(loadSummary());
    }
  };

  // --- SIDEBAR MENU HANDLING ---
  const menuBtn = document.getElementById("menu-btn");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const closeSidebar = document.getElementById("close-sidebar");

  function openSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.style.display = "block";
    document.body.style.overflow = "hidden";
  }
  function closeSidebarFn() {
    sidebar.classList.remove("open");
    sidebarOverlay.style.display = "none";
    document.body.style.overflow = "";
  }
  menuBtn.onclick = openSidebar;
  closeSidebar.onclick = closeSidebarFn;
  sidebarOverlay.onclick = closeSidebarFn;
  // Optional: close sidebar with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSidebarFn();
  });
})();
