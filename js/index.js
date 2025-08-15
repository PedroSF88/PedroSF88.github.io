;(async function() {
  "use strict";
  /**
   * Interactive lesson viewer powered by Supabase.
   */

  // Read Supabase credentials from globals (index.html) with safe fallbacks
  const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobHpob3F3bHFzaWVmeWl1cW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDgwOTQsImV4cCI6MjA2OTEyNDA5NH0.DnAWm_Ety74vvuRSbiSBZPuD2bCBesiDmNr8wP_mHFQ';

  if (!window.supabase) {
    console.error("Supabase client library not found. Include @supabase/supabase-js before this script.");
    return;
  }
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // DOM refs
  const unitMenu   = document.getElementById("unitMenu");
  const topicMenu  = document.getElementById("topicMenu");
  const cardList   = document.getElementById("cardList");

  // visuals lookup: `${topic_id}|${visual_id}` -> link_to_image
  let visualsMap = {};

  // utils
  function clear(...els) { els.forEach((e) => e && e.replaceChildren()); }
  function safeParseJSON(val) {
    if (!val) return null;
    if (typeof val === "object") return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return null; } }
    return null;
  }
  function normalizeTeks(matched) {
    if (!matched) return [];
    if (Array.isArray(matched)) return matched.filter((x) => x && typeof x === "object");
    if (typeof matched === "object") return [matched];
    if (typeof matched === "string") {
      const parsed = safeParseJSON(matched);
      if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x === "object");
      if (parsed && typeof parsed === "object") return [parsed];
    }
    return [];
  }
  function renderTEKSList(items) {
    if (!items.length) return "";
    let html = '<ul class="mb-0">';
    items.forEach((it) => {
      const code = it.teks ? `<strong>${it.teks}</strong> ` : "";
      const text = it.text ? `${it.text}` : "";
      const uuid = it.uuid ? `<div class="text-muted small">UUID: ${it.uuid}</div>` : "";
      html += `<li>${code}${text}${uuid}</li>`;
    });
    html += "</ul>";
    return html;
  }
  function normalizeDiscussionQs(content) {
    if (!content) return [];
    const viaFields = ["discussion_question_L1", "discussion_question_L2", "discussion_question_L3"]
      .map((k, i) => (content[k] ? { level: `L${i + 1}`, text: content[k] } : null))
      .filter(Boolean);
    if (viaFields.length) return viaFields;

    const dq = content.discussion_questions ?? content.discussion_question;
    if (!dq) return [];
    if (typeof dq === "object" && !Array.isArray(dq)) {
      const out = [];
      if (dq.L1) out.push({ level: "L1", text: dq.L1 });
      if (dq.L2) out.push({ level: "L2", text: dq.L2 });
      if (dq.L3) out.push({ level: "L3", text: dq.L3 });
      return out;
    }
    if (Array.isArray(dq)) {
      const labels = ["L1", "L2", "L3"];
      return dq.slice(0, 3).map((q, i) => ({ level: labels[i] || `L${i + 1}`, text: q }));
    }
    if (typeof dq === "string") return [{ level: "L1", text: dq }];
    return [];
  }
  function renderDiscussionQsList(items) {
    if (!items.length) return "";
    const dqCollapseId = `discussionQs_${Math.random().toString(36).slice(2)}`;
    return `
      <div class="mt-2">
        <div class="section-header mt-3" style="color: #42EAFF; cursor: pointer;" data-bs-toggle="collapse" href="#${dqCollapseId}">Discussion Questions</div>
        <div id="${dqCollapseId}" class="collapse">
          <ul class="mb-0">
            ${items.map((it) => `<li><span class="badge bg-secondary me-2">${it.level}</span>${it.text}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]]; }
    return a;
  }
  function resolveImg(topic, visualKey, obj) {
    let url = null;
    if (topic && topic.id) url = visualsMap[`${topic.id}|${visualKey}`] || null;
    if (!url && obj && obj.url_to_image && obj.url_to_image !== "@image_placeholder") url = obj.url_to_image;
    return url;
  }

  // data load
  // Update loadData to add debug output
  async function loadData(requestId) {
    try {
      console.log('Loading data for requestId:', requestId);
      const { data: units, error: unitErr } = await supabase
        .from('curriculum_units').select('*').eq('request_id', requestId).order('unit_number', { ascending: true });
      console.log('Units:', units, 'Error:', unitErr);
      if (unitErr) throw unitErr;
      const unitIds = (units || []).map(u => u.id);
      const { data: topics, error: topicErr } = await supabase
        .from('topic_teks').select('*').in('unit_id', unitIds);
      console.log('Topics:', topics, 'Error:', topicErr);
      if (topicErr) throw topicErr;
      const topicIds = (topics || []).map(t => t.id);
      const { data: visuals, error: visualsErr } = await supabase
        .from('visuals_data').select('*').in('topic_id', topicIds);
      console.log('Visuals:', visuals, 'Error:', visualsErr);
      if (visualsErr) throw visualsErr;
      visualsMap = {};
      (visuals || []).forEach(v => {
        visualsMap[`${v.topic_id}|${v.visual_id}`] = v.link_to_image;
      });
      const unitMap = {};
      (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
      (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));
      buildUnitMenu(unitMap);
      // Remove any error message if present
      if (cardList.firstChild && cardList.firstChild.classList && cardList.firstChild.classList.contains('text-danger')) {
        cardList.innerHTML = '';
      }
    } catch (err) {
      console.error('Error loading curriculum data:', err);
      clear(cardList);
      // Do not show error message in the UI
      // const p = document.createElement('p');
      // p.className = 'text-danger';
      // p.textContent = 'Failed to load lessons. Please check your Supabase configuration.';
      // cardList.append(p);
    }
  }

  // Add a new section for course requests in the sidebar
  const requestMenu = document.createElement('div');
  requestMenu.id = 'requestMenu';
  requestMenu.className = 'mb-4';
  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  // Insert the toggle at the very top, then header, then requestMenu
  sidebar.insertBefore(sidebarToggle, sidebar.firstChild);
  const requestHeader = document.createElement('h5');
  requestHeader.textContent = 'Content Area';
  requestHeader.style.marginLeft = '2.5rem';
  requestHeader.style.marginTop = '2.2rem';
  sidebar.insertBefore(requestHeader, sidebarToggle.nextSibling);
  requestMenu.style.marginLeft = '2.5rem';
  sidebar.insertBefore(requestMenu, requestHeader.nextSibling);
  // Also add margin to unitMenu and topicMenu if present
  if (unitMenu) {
    unitMenu.style.marginLeft = '2.5rem';
    unitMenu.style.marginTop = '1.5rem';
  }
  if (topicMenu) {
    topicMenu.style.marginLeft = '2.5rem';
    topicMenu.style.marginTop = '1.5rem';
  }

  // Fetch and display course requests, then filter units/topics/visuals by request
  async function loadRequests() {
    const { data: requests, error: reqErr } = await supabase.from('course_requests').select('*').order('created_at', { ascending: true });
    console.log('Fetched requests:', requests, 'Error:', reqErr);
    requestMenu.innerHTML = '';
    if (reqErr) {
      requestMenu.innerHTML = '<div class="text-danger">Error loading requests</div>';
      return;
    }
    if (!requests || requests.length === 0) {
      requestMenu.innerHTML = '<div class="text-warning">No requests found</div>';
      return;
    }
    (requests || []).forEach(req => {
      const btn = document.createElement('button');
      btn.textContent = req.content || req.id;
      btn.className = 'btn btn-outline-success w-100 mb-2';
      btn.onclick = () => loadData(req.id);
      requestMenu.append(btn);
    });
  }

  // On page load, show requests
  loadRequests();

  function buildUnitMenu(unitMap) {
    clear(unitMenu, topicMenu, cardList);
    Object.values(unitMap).forEach(({ unit, topics }) => {
      const btn = document.createElement("button");
      btn.textContent = unit.unit_title || unit.id;
      btn.className = "btn btn-outline-primary w-100 mb-2";
      btn.onclick = () => selectUnit(unit, topics);
      unitMenu.append(btn);
    });
  }

  // sort topics by leading number in title
  function selectUnit(unit, topics) {
    clear(topicMenu, cardList);
    const getNum = (t) => {
      const m = String(t.topic_title || "").match(/^\s*(\d+)/);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    const sorted = (topics || []).slice().sort((a, b) => getNum(a) - getNum(b));
    sorted.forEach(topic => {
      const btn = document.createElement("button");
      btn.textContent = topic.topic_title || topic.id;
      btn.className = "btn btn-outline-secondary w-100 mb-2";
      btn.onclick = () => {
        renderLesson(topic);
        // Collapse sidebar and show topic title, hide menu
        const sidebar = document.querySelector('.sidebar');
        const topicTitle = document.getElementById('selectedTopicTitle');
        sidebar.classList.add('collapsed');
        topicTitle.style.display = '';
        document.getElementById('unitMenu').style.display = 'none';
        document.getElementById('topicMenu').style.display = 'none';
        document.querySelectorAll('.sidebar h5').forEach(h => h.style.display = 'none');
      };
      topicMenu.append(btn);
    });
  }

  function renderLesson(topic) {
    clear(cardList);
    // Set selected topic title in sidebar
    const selectedTopicTitle = document.getElementById('selectedTopicTitle');
    if (selectedTopicTitle) {
      selectedTopicTitle.textContent = topic.topic_title || '';
    }

    let outline = topic.lesson_outline;
    if (!outline) {
      const msg = document.createElement("p");
      msg.textContent = "No lesson data available for this topic.";
      cardList.append(msg);
      return;
    }
    outline = typeof outline === "string" ? (safeParseJSON(outline) || {}) : outline;

    const sections = [];

    // Warm Up first
    let warmUpPushed = false;
    if (Array.isArray(outline.lesson_segments)) {
      const warmUpSeg = outline.lesson_segments.find(seg => Object.keys(seg)[0] === "warm_up");
      if (warmUpSeg) {
        const content = warmUpSeg["warm_up"] || {};
        let html = "";
        if (content.question) html += `<p>${content.question}</p>`;
        if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
        sections.push({ cls: "section-discussion", header: "Warm Up", html });
        warmUpPushed = true;
      }
    }

    // Title / Objective / SC / TEKS
    const teksItems = normalizeTeks(topic.matched_teks);
    const teksCollapseId = `teksCol_${topic.id || Math.random().toString(36).slice(2)}`;
    sections.push({
      cls: "section-title",
      header: `<h3>${(outline && outline.lesson_title) || topic.topic_title || "Lesson"}</h3>`,
      html: (() => {
        let html = "";
        if (outline && outline.lesson_objective) {
          html += `<p><strong>Lesson Objective:</strong> ${outline.lesson_objective}</p>`;
        }
        if (outline && Array.isArray(outline.success_criteria) && outline.success_criteria.length) {
          html += "<p><strong>Success Criteria:</strong></p><ul>";
          outline.success_criteria.forEach(item => { html += `<li>${item}</li>`; });
          html += "</ul>";
        }
        if (teksItems.length) {
          html += `<div class="section-header mt-3" style="color: #42EAFF; cursor: pointer;" data-bs-toggle="collapse" href="#${teksCollapseId}">TEKS</div>`;
          html += `<div id="${teksCollapseId}" class="collapse">${renderTEKSList(teksItems)}</div>`;
        }
        return html;
      })()
    });

    // Fetch vocab_table for this topic and render one vocab card per term, immediately after LO/SC/TEKS
    (async () => {
      let vocabSections = [];
      try {
        const { data: vocabRows, error: vocabErr } = await supabase.from('vocab_table').select('*').eq('topic_id', topic.id);
        if (vocabRows && Array.isArray(vocabRows)) {
          vocabRows.forEach(vocab => {
            let imgHtml = vocab.link_to_image ? `<img src="${vocab.link_to_image}" alt="${vocab.term}" style="max-width:120px;max-height:120px;display:block;margin-bottom:0.5rem;">` : '';
            let html = `${imgHtml}<div><strong>${vocab.term}</strong></div><div>${vocab.definition}</div>`;
            vocabSections.push({ cls: "section-vocab", header: `Vocabulary: ${vocab.term}`, html });
          });
        }
      } catch (e) { vocabSections = []; }
      // Insert vocab sections after the title/objective/SC/TEKS (which is always sections[0])
      const allSections = [sections[0], ...vocabSections, ...sections.slice(1)];
      clear(cardList);
      allSections.forEach(sec => {
        const card = document.createElement("div");
        card.className = `card p-3 ${sec.cls}`;
        card.innerHTML = `<div class=\"section-header\">${sec.header}</div>${sec.html}`;
        cardList.append(card);
      });
    })();

    // remaining segments (excluding warm_up already shown)
    if (Array.isArray(outline.lesson_segments)) {
      outline.lesson_segments.forEach(seg => {
        const key = Object.keys(seg)[0];
        if (key === "warm_up" && warmUpPushed) return;

        const content = seg[key];
        let header = "", html = "", cls = "";

        const renderVisualBlock = (k, v) => {
          const desc = v.description || '';
          const imgUrl = resolveImg(topic, k, v);
          let s = '<div class="mb-3">';
          if (imgUrl) {
            s += `
              <div class="img-wrap" aria-label="${desc.replace(/"/g,'&quot;')}">
                <img src="${imgUrl}" alt="${(v.type || 'visual') + (desc ? (': ' + desc) : '')}" style="cursor:pointer;" onclick="showImageModal('${imgUrl}')">
                <div class="img-caption">
                  ${v.type ? `<strong>${v.type.charAt(0).toUpperCase()+v.type.slice(1)}:</strong> ` : ''}${desc}
                </div>
              </div>
            `;
          } else {
            s += '<div class="mb-2 p-2 border rounded text-muted text-center">Image unavailable</div>';
          }
          s += '</div>';
          return s;
        };

        switch (key) {
          case "image_analysis":
            header = "Image Analysis"; cls = "section-image";
            Object.entries(content).forEach(([k, v]) => { if (k.startsWith("visual_")) html += renderVisualBlock(k, v); });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;
          case "compare_contrast":
            header = "Compare & Contrast"; cls = "section-image";
            Object.entries(content).forEach(([k, v]) => { if (k.startsWith("visual_")) html += renderVisualBlock(k, v); });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;
          case "odd_one_out":
            header = "Odd One Out"; cls = "section-image";
            Object.entries(content).forEach(([k, v]) => { if (k.startsWith("visual_")) html += renderVisualBlock(k, v); });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;
          case "cause_effect":
            header = "Cause & Effect"; cls = "section-image";
            Object.entries(content).forEach(([k, v]) => { if (k.startsWith("visual_")) html += renderVisualBlock(k, v); });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;
          case "reading_1":
          case "reading_2":
          case "reading_3":
            header = content.title || key.replace("_", " ").replace(/\b\w/g, s => s.toUpperCase());
            cls = "section-readings";
            if (content.text) html += `<p>${String(content.text).replace(/\n/g, "<br>")}</p>`;
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            html += renderDiscussionQsList(normalizeDiscussionQs(content));
            break;
          case "exit_ticket":
            header = "Exit Ticket"; cls = "section-DOL";
            if (content.prompt) html += `<p>${content.prompt}</p>`;
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;
          default:
            header = key.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
            cls = "section-objective";
            html = `<pre>${JSON.stringify(content, null, 2)}</pre>`;
        }
        sections.push({ cls, header, html });
      });
    }

    // render cards
    sections.forEach(sec => {
      const card = document.createElement("div");
      card.className = `card p-3 ${sec.cls}`;
      card.innerHTML = `<div class="section-header">${sec.header}</div>${sec.html}`;
      cardList.append(card);
    });
  }

  // Add modal logic at the end of the file
  if (!document.getElementById('imageModal')) {
    const modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.85)';
    modal.style.zIndex = '9999';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.textAlign = 'center';
    modal.style.overflow = 'auto';
    // Only display flex when open
    // modal.style.display = 'flex';

    modal.innerHTML = `
      <div id="modalImgContainer" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100vw;height:100vh;max-width:100vw;max-height:100vh;overflow:auto;">
        <img id="modalImg" style="display:block;width:auto;height:auto;cursor:zoom-in;transition:transform 0.2s;box-shadow:0 8px 32px #0008;position:relative;" />
        <button id="closeModalBtn" style="margin-top:1rem;padding:0.5rem 1.5rem;font-size:1.2rem;border-radius:8px;border:none;background:#041730;color:#f8efca;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('closeModalBtn').onclick = () => { 
      modal.style.display = 'none';
      // Allow interaction with rest of UI
      document.body.style.overflow = '';
    };
    let zoomed = false;
    document.getElementById('modalImg').onclick = function() {
      zoomed = !zoomed;
      if (zoomed) {
        this.style.transform = 'scale(2)';
        this.style.cursor = 'zoom-out';
      } else {
        this.style.transform = 'scale(1)';
        this.style.cursor = 'zoom-in';
      }
    };
  }
  window.showImageModal = function(url) {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('modalImg');
    img.src = url;
    img.style.transform = 'scale(1)';
    img.style.cursor = 'zoom-in';
    // Reset scroll to top left when opening
    const container = document.getElementById('modalImgContainer');
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
    modal.style.display = 'flex';
    // Prevent background scroll/interactions
    document.body.style.overflow = 'hidden';
  };

  // Hide content buttons after lesson selection
  function hideContentButtons() {
    const contentBtns = document.querySelectorAll('.content-btn');
    contentBtns.forEach(btn => btn.style.display = 'none');
  }

  // Patch renderLesson to hide all navigation buttons after lesson selection
  const origRenderLesson = renderLesson;
  renderLesson = function(topic) {
    // Hide content buttons
    hideContentButtons();
    // Hide unit and topic menus and sidebar headers
    const unitMenu = document.getElementById('unitMenu');
    const topicMenu = document.getElementById('topicMenu');
    if (unitMenu) {
      unitMenu.style.display = 'none';
      // Also hide all buttons inside
      unitMenu.querySelectorAll('button').forEach(btn => btn.style.display = 'none');
    }
    if (topicMenu) {
      topicMenu.style.display = 'none';
      topicMenu.querySelectorAll('button').forEach(btn => btn.style.display = 'none');
    }
    document.querySelectorAll('.sidebar h5').forEach(h => h.style.display = 'none');
    // Hide request menu and its buttons
    const requestMenu = document.getElementById('requestMenu');
    if (requestMenu) {
      requestMenu.style.display = 'none';
      requestMenu.querySelectorAll('button').forEach(btn => btn.style.display = 'none');
    }
    origRenderLesson(topic);
  };

  loadRequests();
  loadData();
})();
