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


  // data load
  // Update loadData to add debug output
  async function loadData(requestId) {
    try {
      if (!requestId) {
        console.warn('Warning: No valid requestId provided to loadData. Skipping curriculum_units query.');
        clear(cardList);
        return;
      }

      console.log('Loading data for requestId:', requestId);

      // 1) Units for this request
      const { data: units, error: unitErr } = await supabase
        .from('curriculum_units')
        .select('id, unit_title, request_id, unit_number')
        .eq('request_id', requestId)
        .order('unit_number', { ascending: true });

      console.log('Units:', units, 'Error:', unitErr);
      if (unitErr) throw unitErr;

      // No units? Render empty UI and bail early.
      if (!units || units.length === 0) {
        buildUnitMenu({});
        return;
      }

      const unitIds = units.map(u => u.id);

      // 2) Topics (from the VIEW, published-only + unified lesson_outline)
      // Guard .in() against empty arrays just in case
      const { data: topics, error: topicErr } = await supabase
        .from('lesson_outlines_public')
        .select('id, unit_id, topic_title, lesson_outline')
        .in('unit_id', unitIds.length ? unitIds : ['__none__']);

      console.log('Topics:', topics, 'Error:', topicErr);
      if (topicErr) throw topicErr;

      // Build menu mapping
      const unitMap = {};
      (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
      (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));

      buildUnitMenu(unitMap);

      // Clear any prior inline error
      if (cardList.firstChild && cardList.firstChild.classList?.contains('text-danger')) {
        cardList.innerHTML = '';
      }
    } catch (err) {
      console.error('Error loading curriculum data:', err);
      clear(cardList);
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

  // From view: always use unified lesson_outline
  let outline = topic.lesson_outline;
    if (!outline) {
      const msg = document.createElement("p");
      msg.textContent = "No lesson data available for this topic.";
      cardList.append(msg);
      return;
    }
    outline = typeof outline === "string" ? (safeParseJSON(outline) || {}) : outline;

    const sections = [];

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
          outline.success_criteria.forEach(item => {
            // Split on period, trim, and filter out empty
            item.split('.').map(s => s.trim()).filter(Boolean).forEach(sc => {
              html += `<li>${sc}.</li>`;
            });
          });
          html += "</ul>";
        }
        if (teksItems.length) {
          html += `<div class="section-header mt-3" style="color: #42EAFF; cursor: pointer;" data-bs-toggle="collapse" href="#${teksCollapseId}">TEKS</div>`;
          html += `<div id="${teksCollapseId}" class="collapse">${renderTEKSList(teksItems)}</div>`;
        }
        return html;
      })()
    });

  // Render vocabulary from root-level re_lesson_outlines.vocabulary (if present) in cards, each containing two vocab sub-cards
  if (Array.isArray(outline.vocabulary)) {
    // All vocab subcards inside a single vocab card
        let subcardsHtml = outline.vocabulary.map((vocab, vIdx) => {
          let imgHtml = vocab.link_to_image
            ? `<img src="${vocab.link_to_image}" alt="${vocab.term}" class="img-zoom-preview vocab-img-preview" style="max-width:100%;max-height:200px;width:auto;height:auto;object-fit:contain;display:block;margin:0.5rem auto;cursor:zoom-in;">`
            : `<div class=\"img-placeholder\" style=\"width:160px;height:120px;background:#eee;display:flex;align-items:center;justify-content:center;margin:0 auto;color:#aaa;\">Image</div>`;
          let header = `<span class=\"vocab-term-heading\">${vocab.term}</span>`;
          let defHtml = `<div class=\"vocab-description\">${vocab.definition || vocab.def || ''}</div>`;
          // Two-part layout: left=image, right=term+def
          return `<div class=\"vocab-subcard\" data-vocab-idx=\"${vIdx}\"><div class=\"section-header\">${header} <button class=\"btn btn-sm btn-light vocab-min-btn\" style=\"float:right;margin-left:1rem;\" title=\"Minimize\">&#8211;</button></div><div class=\"vocab-content vocab-flex\"><div class=\"vocab-img-col\">${imgHtml}</div><div class=\"vocab-text-col\">${defHtml}</div></div></div>`;
        }).join('');
  let cardHtml = `<div class=\"vocab-card card p-3 section-vocab flex-column\">${subcardsHtml}</div>`;
  sections.push({ cls: "section-vocab", header: 'Vocabulary', html: cardHtml });
  }

    // Render all lesson_segments as cards (including vocab, grouped visuals, grouped readings, etc.)
    if (Array.isArray(outline.lesson_segments)) {
      outline.lesson_segments.forEach((seg, i) => {
        const key = Object.keys(seg)[0];
        const val = seg[key];
        // Custom: Warm Up section
        if (key === 'warm_up' && typeof val === 'object') {
          let header = 'Warm Up';
          let html = '';
          if (val.question) html += `<p><strong>Question:</strong> ${val.question}</p>`;
          if (val.instructions) html += `<p><em>${val.instructions}</em></p>`;
          sections.push({ cls: 'section-discussion', header, html });
          return;
        }
        // Odd One Out: render as 2x2 grid
        if (key === 'odd_one_out' && typeof val === 'object') {
          let d = val;
          let box = document.createElement('div');
          let grid = document.createElement('div');
          grid.className = 'odd-one-out-grid';
          [d.visual_1B, d.visual_2B, d.visual_3B, d.visual_4B].forEach(function(v) {
            let cell = document.createElement('div');
            if (v && (v.link_to_image || v.url_to_image)) {
              let img = document.createElement('img');
              img.src = v.link_to_image || v.url_to_image;
              img.alt = v.type || '';
              img.className = 'img-zoom-preview odd-one-out-img';
              cell.appendChild(img);
            } else {
              let placeholder = document.createElement('div');
              placeholder.className = 'img-placeholder';
              placeholder.textContent = 'Image';
              cell.appendChild(placeholder);
            }
            grid.appendChild(cell);
          });
          box.appendChild(grid);
          if (d.instructions) {
            let inst = document.createElement('div');
            inst.className = 'muted';
            inst.innerHTML = d.instructions;
            box.appendChild(inst);
          }
          let lines = document.createElement('div');
          lines.className = 'lines sm';
          lines.innerHTML = '<div class="pad">Justify your choice...</div>';
          box.appendChild(lines);
          sections.push({ cls: 'section-image', header: 'Odd One Out', html: box.outerHTML });
          return;
        }
        // ...existing code...
        if (key === 'vocabulary' && Array.isArray(val)) {
          const vocabPairs = [];
          for (let i = 0; i < val.length; i += 2) {
            vocabPairs.push(val.slice(i, i + 2));
          }
          vocabPairs.forEach((pair, idx) => {
            let pairHtml = pair.map(vocab => {
              let imgHtml = vocab.link_to_image
                ? `<img src=\"${vocab.link_to_image}\" alt=\"${vocab.term}\" class=\"img-zoom-preview vocab-img-preview\" style=\"max-width:100%;height:auto;display:block;margin-bottom:0.5rem;cursor:zoom-in;\">`
                : `<div class=\"img-placeholder\" style=\"width:120px;height:90px;background:#eee;display:inline-block;margin-bottom:0.5rem;vertical-align:middle;text-align:center;line-height:90px;color:#aaa;\">Image</div>`;
              let header = `<span style=\"font-weight:bold;\">${vocab.term}</span>`;
              let html = `${imgHtml}<div>${vocab.definition || vocab.def || ''}</div>`;
              return `<div class=\"vocab-subcard mb-2\"><div class=\"section-header\">${header}</div>${html}</div>`;
            }).join('');
            let cardHtml = `<div class=\"vocab-card card p-3 section-vocab d-flex flex-column flex-sm-row justify-content-between\">${pairHtml}</div>`;
            sections.push({ cls: "section-vocab", header: idx === 0 ? '<h5 class="mb-3">Vocabulary</h5>' : '', html: cardHtml });
          });
    // Add modal HTML for image zoom if not present
    if (!document.getElementById('imageZoomModal')) {
      const modalDiv = document.createElement('div');
      modalDiv.innerHTML = `
        <div id="imageZoomModal" style="display:none;position:fixed;z-index:2000;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);align-items:center;justify-content:center;">
          <button type="button" id="imageZoomModalClose" style="position:absolute;top:2rem;right:2rem;z-index:2010;background:#fff;border:none;border-radius:50%;width:2.5rem;height:2.5rem;font-size:2rem;line-height:2.5rem;text-align:center;cursor:pointer;">&times;</button>
          <img id="imageZoomModalImg" src="" style="max-width:90vw;max-height:80vh;box-shadow:0 8px 32px #0008;background:#fff;border-radius:12px;display:block;margin:auto;">
        </div>
      `;
      document.body.appendChild(modalDiv);
    }
    // Add click listeners to all vocab image previews
    attachZoomHandlers();
          return;
        }
        // ...existing code...
        if (key.startsWith("reading_")) {
          let header = val.title || key.replace("_", " ").replace(/\b\w/g, s => s.toUpperCase());
          let html = '';
          // Add instructions if present (before reading)
          if (val.instructions) html += `<div class=\"mb-2 vocab-instructions\"><em>${val.instructions}</em></div>`;
          if (val.text) {
            html += `<p>${String(val.text).replace(/\n/g, "<br>")}</p>`;
          } else {
            html += `<div class=\"text-placeholder\" style=\"background:#f8f8f8;color:#bbb;padding:1em;border-radius:6px;\">No reading text provided.</div>`;
          }
          html += renderDiscussionQsList(normalizeDiscussionQs(val));
          sections.push({ cls: "section-readings", header, html });
          return;
        }
        // ...existing code...
        if (typeof val === 'object' && val !== null) {
          // Collect visuals
          const visuals = [];
          let hasVisuals = false;
          Object.entries(val).forEach(([k, v]) => {
            if (v && typeof v === 'object' && (v.link_to_image || v.url_to_image || v.description)) {
              hasVisuals = true;
              let imgHtml = v.link_to_image || v.url_to_image
                ? `<img src=\"${v.link_to_image || v.url_to_image}\" alt=\"${v.type || k}\" class=\"img-zoom-preview\" style=\"max-width:100%;height:auto;display:block;margin-bottom:0.5rem;cursor:zoom-in;\">`
                : `<div class=\"img-placeholder\" style=\"width:180px;height:120px;background:#eee;display:inline-block;margin-bottom:0.5rem;vertical-align:middle;text-align:center;line-height:120px;color:#aaa;\">Image</div>`;
              let visualHeader = v.type ? `<strong>${v.type}</strong>` : '';
              visuals.push(`<div style=\"margin-bottom:1rem;\">${visualHeader}${imgHtml}</div>`);
            }
          });
          if (visuals.length > 0 || (val.visual_1A || val.visual_1B || val.visual_1C || val.visual_2B || val.visual_2C || val.visual_3B || val.visual_4B)) {
            let header = key.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
            let html = '';
            // Add instructions if present (before images)
            if (val.instructions) {
              html += `<div class=\"mb-2 vocab-instructions\"><em>${val.instructions}</em></div>`;
            }
            html += visuals.join('');
            // If no visuals, add a single placeholder
            if (!hasVisuals) {
              html += `<div class=\"img-placeholder\" style=\"width:180px;height:120px;background:#eee;display:inline-block;margin-bottom:0.5rem;vertical-align:middle;text-align:center;line-height:120px;color:#aaa;\">Image</div>`;
            }
            sections.push({ cls: "section-image", header, html });
            return;
          }
          // If not visuals, but instructions, render as a single card
          if (val.instructions) {
            let header = key.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
            let html = `<em>${val.instructions}</em>`;
            sections.push({ cls: "section-image", header, html });
            return;
          }
        }
        // ...existing code...
        if (key === "exit_ticket") {
          let header = "Exit Ticket";
          let html = "";
          if (val.prompt) html += `<p>${val.prompt}</p>`;
          if (val.instructions) html += `<p class=\"vocab-instructions\"><em>${val.instructions}</em></p>`;
          sections.push({ cls: "section-DOL", header, html });
          return;
        }
        // ...existing code...
        let header = key.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
        let html = `<pre>${JSON.stringify(val, null, 2)}</pre>`;
        sections.push({ cls: "section-objective", header, html });
      });
    }
    clear(cardList);
    let cardIdx = 0;
    sections.forEach(sec => {
      const card = document.createElement("div");
      card.className = `card p-3 ${sec.cls}`;
      card.setAttribute('data-card-idx', cardIdx);
      // Add minimize button to header
      const headerDiv = document.createElement('div');
      headerDiv.className = 'section-header';
      headerDiv.innerHTML = `${sec.header} <button class="btn btn-sm btn-light card-min-btn" style="float:right;margin-left:1rem;" title="Minimize card">&#8211;</button>`;
      card.appendChild(headerDiv);
      const contentDiv = document.createElement('div');
      contentDiv.className = 'card-content';
      contentDiv.innerHTML = sec.html;
      card.appendChild(contentDiv);
      // Minimize logic
      headerDiv.querySelector('.card-min-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        card.classList.toggle('card-minimized');
        if (card.classList.contains('card-minimized')) {
          contentDiv.style.display = 'none';
          this.innerHTML = '&#x25A1;'; // expand icon
          this.title = 'Expand card';
        } else {
          contentDiv.style.display = '';
          this.innerHTML = '&#8211;'; // minimize icon
          this.title = 'Minimize card';
        }
      });
  // Remove modal popup for main cards (do nothing)
      // Add minimize logic and click handler for vocab subcards
      contentDiv.querySelectorAll('.vocab-subcard').forEach((subcard, subIdx) => {
        // Minimize button
        const minBtn = subcard.querySelector('.vocab-min-btn');
        const vocabContent = subcard.querySelector('.vocab-content');
        minBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          subcard.classList.toggle('vocab-minimized');
          if (subcard.classList.contains('vocab-minimized')) {
            vocabContent.style.display = 'none';
            this.innerHTML = '&#x25A1;';
            this.title = 'Expand';
          } else {
            vocabContent.style.display = '';
            this.innerHTML = '&#8211;';
            this.title = 'Minimize';
          }
        });
        // Modal click
        subcard.style.cursor = 'pointer';
        subcard.addEventListener('click', function(e) {
          if (e.target.closest('.vocab-min-btn')) return;
          showCardModal(`<div class=\"card p-3 ${sec.cls}\">${subcard.outerHTML}</div>`, 'Vocabulary', `card p-3 ${sec.cls}`);
        });
      });
      cardList.append(card);
      cardIdx++;
    });

    // Helper to show modal
    function showCardModal(html, title, cardClass) {
      const modal = document.getElementById('cardModal');
      const modalBody = document.getElementById('cardModalBody');
      const modalLabel = document.getElementById('cardModalLabel');
      // If html already contains a .card, use as is; else wrap in cardClass
      let content = html;
      if (!/^<div[^>]*class=["'][^"']*card/.test(html)) {
        content = `<div class=\"${cardClass || 'card'}\">${html}</div>`;
      }
      if (modalBody) modalBody.innerHTML = content;
      if (modalLabel && title) modalLabel.textContent = title.replace(/<[^>]+>/g, '');
      if (window.bootstrap && window.bootstrap.Modal) {
        const bsModal = window.bootstrap.Modal.getOrCreateInstance(modal);
        bsModal.show();
      } else {
        // fallback
        modal.style.display = 'block';
      }
    }

    // Debug: log vocabulary segments found
    if (Array.isArray(outline.lesson_segments)) {
      outline.lesson_segments.forEach((seg, i) => {
        const key = Object.keys(seg)[0];
        if (key === 'vocabulary') {
          console.log('Vocabulary segment found:', seg[key]);
        }
      });
    }
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

  // Attach zoom handlers to all images with .img-zoom-preview
  function attachZoomHandlers() {
    document.querySelectorAll('.img-zoom-preview').forEach(img => {
      img.onclick = null;
      img.addEventListener('click', function(e) {
        console.log('Image clicked for zoom:', img.src); // DEBUG
        e.stopPropagation();
        let modal = document.getElementById('imageZoomModal');
        let modalImg = document.getElementById('imageZoomModalImg');
        // If modal or modalImg is missing, inject it now
        if (!modal || !modalImg) {
          const modalDiv = document.createElement('div');
          modalDiv.innerHTML = `
            <div id=\"imageZoomModal\" style=\"display:flex;position:fixed;z-index:9999;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.88);align-items:center;justify-content:center;\">
              <button type=\"button\" id=\"imageZoomModalClose\" style=\"position:absolute;top:2rem;right:2rem;z-index:10001;background:#fff;border:none;border-radius:50%;width:2.5rem;height:2.5rem;font-size:2rem;line-height:2.5rem;text-align:center;cursor:pointer;box-shadow:0 2px 8px #0003;\">&times;</button>
              <img id=\"imageZoomModalImg\" src=\"\" style=\"max-width:92vw;max-height:82vh;box-shadow:0 8px 32px #000a;background:#fff;border-radius:14px;display:block;margin:auto;\">
            </div>
          `;
          document.body.appendChild(modalDiv);
          modal = document.getElementById('imageZoomModal');
          modalImg = document.getElementById('imageZoomModalImg');
          document.getElementById('imageZoomModalClose').onclick = function() {
            modal.style.display = 'none';
            document.body.style.overflow = '';
          };
          modal.onclick = function(e) { if (e.target === modal) { modal.style.display = 'none'; document.body.style.overflow = ''; } };
          document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { modal.style.display = 'none'; document.body.style.overflow = ''; } });
        }
        modalImg.src = img.src;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        // Remove zoomed class on open
        modalImg.classList.remove('zoomed');
        // Toggle zoom on click
        modalImg.onclick = function(e) {
          e.stopPropagation();
          if (modalImg.classList.contains('zoomed')) {
            modalImg.classList.remove('zoomed');
          } else {
            modalImg.classList.add('zoomed');
          }
        };
      });
    });
    // Modal close logic
    function closeModal() {
      const modal = document.getElementById('imageZoomModal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    }
    document.getElementById('imageZoomModalClose')?.addEventListener('click', closeModal);
    document.getElementById('imageZoomModal')?.addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  // MutationObserver to auto-attach zoom handlers to new images
  (function observeZoomImages() {
    const observer = new MutationObserver(() => {
      attachZoomHandlers();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })();
})();
