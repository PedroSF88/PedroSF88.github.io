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
  const contentAreaMenu = document.getElementById("contentAreaMenu");

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
    if (topic && topic.id) {
      // visuals are stored in the lookup with keys like `${topic.id}|visual_1`
      // but some DB rows may only store the numeric id, so try both
      url = visualsMap[`${topic.id}|${visualKey}`]
        || visualsMap[`${topic.id}|${String(visualKey).replace(/^visual_/, '')}`]
        || null;
    }
    if (!url && obj) {
      // Support both `link_to_image` (new field) and `url_to_image` (legacy)
      if (obj.link_to_image && obj.link_to_image !== "@image_placeholder") {
        url = obj.link_to_image;
      } else if (obj.url_to_image && obj.url_to_image !== "@image_placeholder") {
        url = obj.url_to_image;
      }
    }
    return url;
  }

  // data load
  async function loadData() {
    try {
      const { data: units, error: unitErr } = await supabase
        .from("curriculum_units").select("*").order("unit_number", { ascending: true });
      if (unitErr) throw unitErr;

      const { data: topics, error: topicErr } = await supabase.from("topic_teks").select("*");
      if (topicErr) throw topicErr;

      const { data: visuals, error: visualsErr } = await supabase.from("visuals_data").select("*");
      if (visualsErr) throw visualsErr;

      visualsMap = {};
      (visuals || []).forEach(v => {
        // Store links using the same key format used in lesson data
        const link = v.link_to_image || v.url_to_image;
        if (!link || link === "@image_placeholder") return;
        visualsMap[`${v.topic_id}|visual_${v.visual_id}`] = link;
      });

      const unitMap = {};
      (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
      (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));

      buildUnitMenu(unitMap);
    } catch (err) {
      console.error("Error loading curriculum data:", err);
      clear(cardList);
      const p = document.createElement("p");
      p.className = "text-danger";
      p.textContent = "Failed to load lessons. Please check your Supabase configuration.";
      cardList.append(p);
    }
  }

  async function fetchContentAreas() {
    const { data, error } = await supabase.from('curriculum_units').select('content_area').neq('content_area', null).order('content_area', { ascending: true });
    if (error) {
      clear(unitMenu, topicMenu, cardList);
      const p = document.createElement('p');
      p.className = 'text-danger';
      p.textContent = 'Failed to load content areas: ' + error.message;
      cardList.append(p);
      return [];
    }
    // Unique content areas
    const unique = Array.from(new Set((data || []).map(u => u.content_area))).filter(Boolean);
    return unique;
  }

  async function fetchUnitsAndTopicsByContentArea(contentArea) {
    const { data: units, error: unitErr } = await supabase.from('curriculum_units').select('*').eq('content_area', contentArea).order('unit_number', { ascending: true });
    if (unitErr) {
      clear(unitMenu, topicMenu, cardList);
      const p = document.createElement('p');
      p.className = 'text-danger';
      p.textContent = 'Failed to load units: ' + unitErr.message;
      cardList.append(p);
      return { units: [], topics: [] };
    }
    const { data: topics, error: topicErr } = await supabase.from('topic_teks').select('*').in('unit_id', units.map(u => u.id));
    if (topicErr) {
      clear(unitMenu, topicMenu, cardList);
      const p = document.createElement('p');
      p.className = 'text-danger';
      p.textContent = 'Failed to load topics: ' + topicErr.message;
      cardList.append(p);
      return { units, topics: [] };
    }
    // Fetch visuals tied to the topics and populate visualsMap for image lookup
    const topicIds = (topics || []).map(t => t.id);
    visualsMap = {};
    if (topicIds.length) {
      const { data: visuals, error: visualsErr } = await supabase.from('visuals_data').select('*').in('topic_id', topicIds);
      if (visualsErr) {
        console.error('Failed to load visuals:', visualsErr.message);
      } else {
        (visuals || []).forEach(v => {
          const link = v.link_to_image || v.url_to_image;
          if (!link || link === "@image_placeholder") return;
          visualsMap[`${v.topic_id}|visual_${v.visual_id}`] = link;
        });
      }
    }
    return { units, topics };
  }

  function renderContentAreaButtons(contentAreas) {
    // Render in main area, not sidebar
    let html = '<div class="mb-3">';
    contentAreas.forEach(area => {
      html += `<button class='btn btn-outline-dark me-2 mb-2' data-area='${area}'>${area}</button>`;
    });
    html += '</div>';
    contentAreaMenu.innerHTML = html;
    contentAreaMenu.querySelectorAll('button[data-area]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const area = btn.getAttribute('data-area');
        // Hide content area buttons after selection
        contentAreaMenu.innerHTML = '';
        const { units, topics } = await fetchUnitsAndTopicsByContentArea(area);
        const unitMap = {};
        (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
        (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));
        buildUnitMenu(unitMap);
      });
    });
  }

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
          html += `<p><strong>Objective:</strong> ${outline.lesson_objective}</p>`;
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

    // Vocabulary + emoji matching
    const vocabList = Array.isArray(outline?.vocabulary) ? outline.vocabulary : [];
    if (vocabList.length) {
      const vocabHtml = '<ul>' + vocabList.map(v => `<li><strong>${v.term}:</strong> ${v.def}</li>`).join('') + '</ul>';
      sections.push({ cls: "section-vocab", header: "Vocabulary", html: vocabHtml });

      const vocabEmojis = safeParseJSON(topic.vocab_emojis) || topic.vocab_emojis || null;
      if (vocabEmojis && Array.isArray(vocabEmojis) && vocabEmojis.length) {
        const byTerm = new Map();
        vocabEmojis.forEach(entry => {
          if (!entry || !entry.term || !Array.isArray(entry.sets)) return;
          byTerm.set(entry.term, entry.sets);
        });

        // one random set PER vocab term (every term once, if sets exist)
        const selected = (vocabList || []).map(v => {
          const sets = byTerm.get(v.term);
          if (!sets || !sets.length) return null;
          const chosen = sets[Math.floor(Math.random() * sets.length)];
          return { term: v.term, def: v.def, emojis: chosen.emojis || [], explanations: chosen.explanations || [] };
        }).filter(Boolean);

        if (selected.length) {
          const termOptions = vocabList.map(v => `<option value="${encodeURIComponent(v.term)}">${v.term}</option>`).join('');
          const maxEmojis = selected.reduce((m, it) => Math.max(m, it.emojis.length), 0);

          let gameHtml = '';
          gameHtml += `<div class="section-header mt-3";">(${selected.length})</div>`;
          gameHtml += `<div class="table-responsive"><table class="table emoji-matching-table table-striped align-middle mb-2"><thead><tr>`;
          for (let c = 0; c < maxEmojis; c++) gameHtml += `<th scope="col">Emoji ${c + 1}</th>`;
          gameHtml += `<th scope="col" style="min-width:220px;">Your Answer</th><th scope="col">Result</th>`;
          gameHtml += `</tr></thead><tbody>`;

          selected.forEach((item, idx) => {
            const selectId = `emojiMatch_select_${idx}`;
            const resultId = `emojiMatch_result_${idx}`;
            gameHtml += `<tr>`;
            for (let c = 0; c < maxEmojis; c++) {
              const e = item.emojis[c];
              gameHtml += `<td>${e ? `<span class=\"emoji-large\">${e}</span>` : ""}</td>`;
            }
            gameHtml += `<td>
              <select id="${selectId}" class="form-select">
                <option value="">— Select —</option>
                ${termOptions}
              </select>
            </td>`;
            gameHtml += `<td id="${resultId}" class="small text-muted"></td>`;
            gameHtml += `</tr>`;
          });

          gameHtml += `</tbody></table></div>`;
          gameHtml += `<button id="emojiMatch_check" class="btn btn-primary">Submit & Check</button>`;

          sections.push({ cls: "section-vocab", header: "Emoji Matching", html: gameHtml });

          setTimeout(() => {
            const btnCheck = document.getElementById(`emojiMatch_check`);
            if (!btnCheck) return;
            btnCheck.onclick = () => {
              selected.forEach((item, idx) => {
                const selEl = document.getElementById(`emojiMatch_select_${idx}`);
                const resEl = document.getElementById(`emojiMatch_result_${idx}`);
                const chosen = selEl?.value || "";
                const isRight = decodeURIComponent(chosen) === item.term;
                if (!resEl) return;
                if (isRight) {
                  const bullets = (item.explanations || []).map(x => `<li>${x}</li>`).join('');
                  resEl.innerHTML = `<div class="text-success"><strong>Correct!</strong></div>${bullets ? `<ul class="mb-0">${bullets}</ul>` : ''}`;
                  resEl.classList.remove("text-muted");
                } else {
                  resEl.textContent = "Try again";
                  resEl.classList.add("text-muted");
                }
              });
            };
          }, 0);
        }
      }
    }

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
                <img src="${imgUrl}" alt="${(v.type || 'visual') + (desc ? (': ' + desc) : '')}">
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

  // Initial load
  const contentAreas = await fetchContentAreas();
  renderContentAreaButtons(contentAreas);
  // Do not call loadData() here, only load units/topics after content area is selected
})();
