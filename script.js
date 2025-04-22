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
    const c=document.getElementById("memories");c.innerHTML="";
    if(!mems.length){c.innerHTML="<p>No memories yet.</p>";return;}
    mems.slice().reverse().forEach(m=>{
      const d=new Date(m.date);
      const loc=m.location&&m.location.lat!=null?` @ (${m.location.lat.toFixed(3)}, ${m.location.lon.toFixed(3)})`:"";
      c.innerHTML+=`<div class="memory"><strong>${d.toLocaleString()}</strong>${loc}<br/>${m.text}</div>`;
    });
  };
  const renderSummary=(txt)=>{
    document.getElementById("summary").textContent=txt||"(no consolidated summary yet)";
  };

  // ---------- INITIAL RENDER ------------------
  document.getElementById("apikey").value=localStorage.getItem(apiKeyKey)||"";
  renderMemories(loadMemories());
  renderSummary(loadSummary());

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

  // ---------- ADD MEMORY ----------------------
  document.getElementById("remember-btn").onclick=()=>{
    const text=document.getElementById("memory-input").value.trim();if(!text) return;
    const onSuccess=coords=>{
      const mem={text,date:new Date().toISOString(),location:coords?{lat:coords.latitude,lon:coords.longitude}:null};
      const mems=loadMemories();mems.push(mem);saveMemories(mems);renderMemories(mems);
      document.getElementById("memory-input").value="";
      updateConsolidated(mem.text);
    };
    if(navigator.geolocation){navigator.geolocation.getCurrentPosition(p=>onSuccess(p.coords),()=>onSuccess(null),{maximumAge:6e4,timeout:5e3});}else onSuccess(null);
  };
  // Add Enter key support for memory input
  const memoryInput = document.getElementById("memory-input");
  memoryInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("remember-btn").click();
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

  // ---------- ASK QUESTION --------------------
  document.getElementById("ask-btn").onclick=async()=>{
    const q=document.getElementById("question-input").value.trim();if(!q) return;
    const key=(document.getElementById("apikey").value.trim()||localStorage.getItem(apiKeyKey)||"").trim();if(!key){alert("Please provide your OpenAI API key first.");return;}
    const ansBox=document.getElementById("answer");ansBox.style.display="block";ansBox.textContent="Thinking...";document.getElementById("relevant-section").style.display="none";
    const mems=loadMemories();const qWords=q.toLowerCase().split(/\s+/);
    let rel=mems.filter(m=>qWords.some(w=>m.text.toLowerCase().includes(w)));if(!rel.length) rel=mems.slice(-10);rel=rel.slice(-20);
    const prompt=`Below are some of the user's stored memories, each prefixed with an index and timestamp.\nUse them to answer the user's question.\n\nMEMORIES:\n${rel.map((m,i)=>`${i+1}. (${m.date}) ${m.text}`).join("\n")}\n\nQUESTION: ${q}\n\nAnswer by referencing the relevant memories.`;
    try{
      const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:"gpt-4.1-mini",messages:[{role:"system",content:"You are a helpful memory assistant."},{role:"user",content:prompt}],temperature:0.3})});
      if(!r.ok) throw new Error(`OpenAI error: ${r.status}`);const data=await r.json();ansBox.textContent=data.choices?.[0]?.message?.content?.trim()||"(No answer)";showRelevant(rel);
    }catch(e){console.error(e);ansBox.textContent=`Error: ${e.message}`;}
  };
  // Add Enter key support for ask input
  const questionInput = document.getElementById("question-input");
  questionInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("ask-btn").click();
    }
  });
})();
