document.addEventListener('DOMContentLoaded', () => {
  // --- Setup ---
  const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY =
    window.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z5FpORNEIA4S6kOY-Mdzxw_YtBllO9n';

  // Optional for local DEV ONLY (never ship real keys in prod)
  const ACTIONS_ADMIN_KEY = window.ACTIONS_ADMIN_KEY || null;

  if (!window.supabase) {
    alert('Supabase client not found. Please load @supabase/supabase-js before this script.');
    throw new Error('Supabase client not found.');
  }
  const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const FUNCTIONS_URL = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');

  // --- UI elements ---
  const unitMenu   = document.getElementById("unitMenu");
  const topicMenu  = document.getElementById("topicMenu");
  const cardList   = document.getElementById("cardList");
  let currentTopic = null;
  let currentOutline = null;
  let currentTopicId = null;

  // --- Utils ---
  function clear() {
    for (var i = 0; i < arguments.length; i++) {
      var e = arguments[i];
      if (e) e.innerHTML = '';
    }
  }
  function safeParseJSON(val) {
    if (!val) return null;
    if (typeof val === "object") return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return null; } }
    return null;
  }
  function isLikelyImageUrl(s) {
    return typeof s === 'string' && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(s.trim());
  }
  function isPlaceholder(s) { return s === '@image_placeholder' || s === '@link_placeholder'; }

  // --- Sidebar: Requests → Units → Topics ---
  async function loadRequests() {
    const res = await supa.from('course_requests').select('*').order('created_at', { ascending: true });
    const requests = res.data;
    const error = res.error;
    const requestMenu = document.getElementById('requestMenu');
    requestMenu.innerHTML = '';
    if (error) { requestMenu.innerHTML = '<div class="text-danger">Error loading requests</div>'; return; }
    if (!requests || !requests.length) { requestMenu.innerHTML = '<div class="text-warning">No requests found</div>'; return; }

    requests.forEach(function(req) {
      const btn = document.createElement('button');
      btn.textContent = req.content || req.id;
      btn.className = 'btn btn-outline-success w-100 mb-2';
      btn.onclick = function() { loadData(req.id); };
      requestMenu.append(btn);
    });
  }

  async function loadData(requestId) {
    if (!requestId) { clear(unitMenu, topicMenu, cardList); return; }

    const u = await supa
      .from('curriculum_units')
      .select('*')
      .eq('request_id', requestId)
      .order('unit_number', { ascending: true });

    const units = u.data || [];
    const unitIds = units.map(function(x){ return x.id; });

    const t = await supa
      .from('lesson_outlines_public') // read view
      .select('*')
      .in('unit_id', unitIds)
      .order('topic_title', { ascending: true });

    const topics = t.data || [];

    const unitMap = {};
    units.forEach(function(u){ unitMap[u.id] = { unit: u, topics: [] }; });
    topics.forEach(function(tp){ if (unitMap[tp.unit_id]) unitMap[tp.unit_id].topics.push(tp); });

    buildUnitMenu(unitMap);
  }

  function buildUnitMenu(unitMap) {
    clear(unitMenu, topicMenu, cardList);
    Object.keys(unitMap).forEach(function(k) {
      const unit = unitMap[k].unit;
      const topics = unitMap[k].topics;
      const btn = document.createElement("button");
      btn.textContent = unit.unit_title || unit.id;
      btn.className = "btn btn-outline-primary w-100 mb-2";
      btn.onclick = function() { selectUnit(unit, topics); };
      unitMenu.append(btn);
    });
  }

  function selectUnit(unit, topics) {
    clear(topicMenu, cardList);
    function getNum(t) {
      const m = String(t.topic_title || "").match(/^\s*(\d+)/);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    }
    const sorted = (topics || []).slice().sort(function(a, b){ return getNum(a) - getNum(b); });
    sorted.forEach(function(topic) {
      const btn = document.createElement("button");
      btn.textContent = topic.topic_title || topic.id;
      btn.className = "btn btn-outline-secondary w-100 mb-2";
      btn.onclick = function() {
        renderLessonEditor(topic);
        // Collapse sidebar and show topic title, hide menus
        const sidebar = document.querySelector('.sidebar');
        const topicTitle = document.getElementById('selectedTopicTitle');
        if (sidebar && sidebar.classList) sidebar.classList.add('collapsed');
        if (topicTitle) topicTitle.style.display = '';
        var um = document.getElementById('unitMenu');
        var tm = document.getElementById('topicMenu');
        if (um) um.style.display = 'none';
        if (tm) tm.style.display = 'none';
        document.querySelectorAll('.sidebar h5').forEach(function(h){ h.style.display = 'none'; });
      };
      topicMenu.append(btn);
    });
  }

  // --- Editor ---
  function renderLessonEditor(topic) {
    clear(cardList);
    var headerEl = document.getElementById('selectedTopicTitle');
    if (headerEl) headerEl.textContent = topic.topic_title || '';

    var outline = topic.re_lesson_outlines || topic.lesson_outline || {};
    outline = (typeof outline === "string") ? (safeParseJSON(outline) || {}) : outline;

    // Ensure required scaffolding (no ||=)
    if (!outline.lesson_title) outline.lesson_title = topic.topic_title || '';
    if (!outline.lesson_objective) outline.lesson_objective = '';
    if (!Array.isArray(outline.success_criteria)) outline.success_criteria = [];
    if (!Array.isArray(outline.vocabulary)) outline.vocabulary = [];
    if (!Array.isArray(outline.lesson_segments)) outline.lesson_segments = [];

    currentTopic = topic;
    currentOutline = outline;
    currentTopicId = topic.id;

    // Build form
    var html = '';
    html += `<div class="card p-4 mb-4">
      <h4 class="mb-3">Lesson Info</h4>
      <div class="mb-3">
        <label class="form-label">Lesson Title <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="lessonTitleInput" value="${escapeHtml(outline.lesson_title)}" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Lesson Objective <span class="text-danger">*</span></label>
        <textarea class="form-control" id="lessonObjectiveInput" rows="2" required>${escapeHtml(outline.lesson_objective)}</textarea>
      </div>
      <div class="mb-3">
        <label class="form-label">Success Criteria (comma separated)</label>
        <textarea class="form-control" id="successCriteriaInput" rows="3">${escapeHtml((outline.success_criteria||[]).join(', '))}</textarea>
      </div>
    </div>`;

    // Segments
    html += `<div class="d-flex align-items-center justify-content-between mb-2">
      <h5 class="mb-0">Lesson Segments</h5>
      <button type="button" class="btn btn-outline-primary btn-sm" id="addSegmentBtn_top">+ Add Segment</button>
    </div>`;

    outline.lesson_segments.forEach(function(seg, i) {
      const key = Object.keys(seg)[0];
      const val = seg[key];
      html += `<div class="card p-3 mb-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-bold">${titleCase(key.replace(/_/g, ' '))}</span>
          <div>
            <button type="button" class="btn btn-outline-primary btn-sm me-2" id="addSegmentBtn_${i}">+ Add Below</button>
            <button type="button" class="btn btn-danger btn-sm" id="removeSegmentBtn_${i}" title="Remove segment">&times;</button>
          </div>
        </div>
        <div>${renderField(val, [i, key])}</div>
      </div>`;
    });

    // Vocab
    html += `<div class="d-flex align-items-center justify-content-between mt-4 mb-2">
      <h5 class="mb-0">Vocabulary</h5>
      <button type="button" class="btn btn-outline-primary btn-sm" id="addVocabBtn">+ Add Vocab Term</button>
    </div>`;
    if (Array.isArray(outline.vocabulary) && outline.vocabulary.length) {
      outline.vocabulary.forEach(function(vocab, i) {
        const imgId = `vocab_${i}_image_preview`;
        const inputId = `vocab_${i}_link_to_image_input`;
        html += `<div class="card p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold">Term ${i + 1}</span>
            <button type="button" class="btn btn-danger btn-sm" id="removeVocabBtn_${i}" title="Remove vocab">&times;</button>
          </div>
          <div class="mb-2">
            <label class="form-label">Term</label>
            <input type="text" class="form-control" id="vocab_${i}_term_input" value="${escapeHtml(vocab.term || '')}" required>
          </div>
          <div class="mb-2">
            <label class="form-label">Definition</label>
            <textarea class="form-control" id="vocab_${i}_definition_input" rows="2">${escapeHtml(vocab.definition || vocab.def || '')}</textarea>
          </div>
          <div class="mb-2">
            <label class="form-label">Image Link (or @image_placeholder)</label>
            <input type="text" class="form-control url-input" id="${inputId}" value="${escapeHtml(vocab.link_to_image || '')}"
              pattern="(^https?://.*)|(^@image_placeholder$)">
          </div>
          <div class="vocab-image-preview mt-2" id="vocab_${i}_image_preview_container">`;
        if (vocab.link_to_image && (isLikelyImageUrl(vocab.link_to_image) || isPlaceholder(vocab.link_to_image))) {
          if (isPlaceholder(vocab.link_to_image)) {
            html += `<div class="text-muted small">@image_placeholder</div>`;
          } else {
            html += `<img src="${vocab.link_to_image}" alt="Image preview" class="img-thumbnail" style="max-width:80px;max-height:80px;cursor:zoom-in;" id="${imgId}">`;
          }
        } else {
          html += `<div class="text-muted small">No image</div>`;
        }
        html += `</div></div>`;
      });
    } else {
      html += `<div class="text-muted">No vocabulary yet.</div>`;
    }

    // Footer actions
    html += `
      <div class="d-flex flex-wrap gap-2 justify-content-end mt-4">
        <button class="btn btn-outline-secondary" id="copyJsonBtn">Copy Draft JSON</button>
        <button class="btn btn-success" id="saveBtn">Save Draft</button>
        <button class="btn btn-primary" id="publishBtn">Publish</button>
        <span id="statusMsg" class="ms-2"></span>
      </div>`;
    cardList.innerHTML = html;

    // Wire up dynamic listeners
    wireDynamicInputs();
    wireAddersAndRemovers();
    wireActions();
  }

  function wireDynamicInputs() {
    (currentOutline.vocabulary || []).forEach(function(_, i) {
      const input = document.getElementById(`vocab_${i}_link_to_image_input`);
      const container = document.getElementById(`vocab_${i}_image_preview_container`);
      if (input && container) {
        input.addEventListener('input', function () {
          const url = input.value.trim();
          if (isPlaceholder(url) || !url) {
            container.innerHTML = isPlaceholder(url)
              ? `<div class="text-muted small">@image_placeholder</div>`
              : `<div class="text-muted small">No image</div>`;
          } else if (isLikelyImageUrl(url)) {
            container.innerHTML = `<img src="${url}" alt="Image preview" class="img-thumbnail" style="max-width:80px;max-height:80px;object-fit:contain;">`;
          } else {
            container.innerHTML = `<div class="text-muted small">Not a recognized image URL</div>`;
          }
        });
      }
    });
  }

  function wireAddersAndRemovers() {
    // Add vocab
    const addVocabBtn = document.getElementById('addVocabBtn');
    if (addVocabBtn) {
      addVocabBtn.onclick = function() {
        if (!Array.isArray(currentOutline.vocabulary)) currentOutline.vocabulary = [];
        currentOutline.vocabulary.push({ term: '', definition: '', link_to_image: '@image_placeholder' });
        renderLessonEditor(currentTopic);
      };
    }

    // Remove vocab (with undo)
    (currentOutline.vocabulary || []).forEach(function(vocab, i) {
      const btn = document.getElementById(`removeVocabBtn_${i}`);
      if (btn) btn.onclick = function() { removeWithUndo('vocab', i, vocab); };
    });

    // Add segment (top)
    const addTop = document.getElementById('addSegmentBtn_top');
    if (addTop) addTop.onclick = function() { insertSegment(currentOutline.lesson_segments.length); };

    // Add segment below each
    (currentOutline.lesson_segments || []).forEach(function(seg, i) {
      const addBelow = document.getElementById(`addSegmentBtn_${i}`);
      if (addBelow) addBelow.onclick = function() { insertSegment(i + 1); };
      const rm = document.getElementById(`removeSegmentBtn_${i}`);
      if (rm) rm.onclick = function() { removeWithUndo('segment', i, seg); };
    });
  }

  function insertSegment(index) {
    var type = prompt(
      'Segment type (examples: warm_up, image_analysis, reading_1, odd_one_out, cause_effect, exit_ticket):',
      'warm_up'
    );
    if (!type) return;
    var seg = {};
    if (type.indexOf('reading') === 0) {
      seg[type] = {
        title: '',
        source_type: 'generated',
        text: '',
        instructions: '',
        discussion_question_L1: '',
        discussion_question_L2: '',
        discussion_question_L3: ''
      };
    } else if (type === 'image_analysis') {
      seg[type] = {
        visual_1A: { type: 'artifact photo', description: '', url_to_image: '@image_placeholder' }
      };
    } else if (type === 'odd_one_out') {
      seg[type] = {
        visual_1B: { type: 'artifact photo', description: '', url_to_image: '@image_placeholder' },
        visual_2B: { type: 'diagram', description: '', url_to_image: '@image_placeholder' },
        visual_3B: { type: 'artifact photo', description: '', url_to_image: '@image_placeholder' },
        visual_4B: { type: 'artifact photo', description: '', url_to_image: '@image_placeholder' }
      };
    } else if (type === 'cause_effect') {
      seg[type] = {
        visual_1C: { type: 'diagram', description: '', url_to_image: '@image_placeholder' },
        visual_2C: { type: 'artifact photo', description: '', url_to_image: '@image_placeholder' }
      };
    } else if (type === 'exit_ticket') {
      seg[type] = { type: 'reflection', prompt: '' };
    } else if (type === 'warm_up') {
      seg[type] = { question: '', instructions: 'Individual, 2–3 min' };
    } else {
      seg[type] = { note: '' };
    }

    currentOutline.lesson_segments.splice(index, 0, seg);
    renderLessonEditor(currentTopic);
  }

  function removeWithUndo(kind, index, value) {
    var key = (kind === 'segment') ? 'lesson_segments' : 'vocabulary';
    currentOutline[key].splice(index, 1);
    renderLessonEditor(currentTopic);
    showTempMessage(
      titleCase(kind) + ' removed. Click Save to persist.',
      'danger',
      8000,
      function() {
        currentOutline[key].splice(index, 0, value);
        renderLessonEditor(currentTopic);
      }
    );
  }

  function showTempMessage(msg, level, ms, undoCb) {
    level = level || 'info';
    ms = ms || 4000;
    var el = document.getElementById('removeMsg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'removeMsg';
      el.style.position = 'fixed';
      el.style.top = '1.5rem';
      el.style.right = '2rem';
      el.style.zIndex = 9999;
      el.style.padding = '0.75rem 1.5rem';
      el.style.borderRadius = '8px';
      el.style.fontWeight = 'bold';
      document.body.appendChild(el);
    }
    el.innerHTML = msg;
    el.className = (level === 'danger' ? 'bg-danger' : 'bg-success') + ' text-white';
    el.style.display = 'block';

    if (undoCb) {
      const undo = document.createElement('button');
      undo.textContent = 'Undo ×';
      undo.className = 'btn btn-light btn-sm ms-3';
      undo.onclick = function(e){ e.stopPropagation(); el.style.display = 'none'; undoCb(); };
      el.appendChild(undo);
    } else {
      setTimeout(function(){ el.style.display = 'none'; }, ms);
    }
  }

  function renderField(val, path) {
    const idBase = 'segment_' + path.join('_');
    const lastKey = String(path[path.length - 1] || '').toLowerCase();
    const textareaKeys = ['reading', 'instructions', 'text', 'prompt', 'question', 'discussion', 'description', 'content'];

    if (typeof val === 'string' || typeof val === 'number') {
      if (textareaKeys.some(function(k){ return lastKey.indexOf(k) !== -1; })) {
        return '<textarea class="form-control mb-2" id="' + idBase + '_input" rows="4">' + escapeHtml(val || '') + '</textarea>';
      } else {
        const v = String(val == null ? '' : val);
        var input = '<input type="text" class="form-control mb-2" id="' + idBase + '_input" value="' + escapeHtml(v) + '" placeholder="' + (lastKey.indexOf('link') !== -1 || lastKey.indexOf('url') !== -1 ? '@link_placeholder or https://…' : '') + '">';
        if (lastKey.indexOf('url') !== -1 || lastKey.indexOf('link') !== -1) {
          if (isPlaceholder(v)) {
            input += '<div class="text-muted small">@link_placeholder</div>';
          } else if (isLikelyImageUrl(v)) {
            input += '<div class="mt-2"><img src="' + v + '" alt="Image preview" class="img-thumbnail" style="max-width:120px;max-height:120px;object-fit:contain;"></div>';
          }
        }
        return input;
      }
    } else if (Array.isArray(val)) {
      return val.map(function(item, idx){
        return '<div class="mb-2 ms-3"><label class="form-label">[' + idx + ']</label>' + renderField(item, path.concat(idx)) + '</div>';
      }).join('');
    } else if (typeof val === 'object' && val !== null) {
      return Object.keys(val).map(function(k){
        return '<div class="mb-2 ms-2"><label class="form-label">' + k + '</label>' + renderField(val[k], path.concat(k)) + '</div>';
      }).join('');
    } else {
      return '';
    }
  }

  function wireActions() {
    const saveBtn = document.getElementById('saveBtn');
    const publishBtn = document.getElementById('publishBtn');
    const copyBtn = document.getElementById('copyJsonBtn');
    const statusMsg = document.getElementById('statusMsg');

    copyBtn.onclick = function() {
      const draft = buildUpdatedOutline();
      navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      statusMsg.textContent = 'Draft JSON copied. Use MyGPT → updateOutline to save.';
      statusMsg.className = 'text-success ms-2';
    };

    saveBtn.onclick = async function() {
      if (!currentTopicId) return;
      const draft = buildUpdatedOutline();
      await callUpdateOutline({ topic_id: currentTopicId, draft: draft }, statusMsg, saveBtn);
    };

    publishBtn.onclick = async function() {
      if (!currentTopicId) return;
      await callUpdateOutline({ topic_id: currentTopicId, publish: true }, statusMsg, publishBtn);
    };
  }

  function buildUpdatedOutline() {
    const updated = JSON.parse(JSON.stringify(currentOutline));
    updated.lesson_title = (document.getElementById('lessonTitleInput') || {}).value || '';
    updated.lesson_objective = (document.getElementById('lessonObjectiveInput') || {}).value || '';
    var sc = (document.getElementById('successCriteriaInput') || {}).value || '';
    updated.success_criteria = sc.split(',').map(function(s){ return s.trim(); }).filter(Boolean);

    if (Array.isArray(updated.vocabulary)) {
      updated.vocabulary = updated.vocabulary.map(function(vocab, i) {
        return {
          term: (document.getElementById('vocab_' + i + '_term_input') || {}).value || vocab.term || '',
          definition: (document.getElementById('vocab_' + i + '_definition_input') || {}).value || vocab.definition || vocab.def || '',
          link_to_image: (document.getElementById('vocab_' + i + '_link_to_image_input') || {}).value || vocab.link_to_image || '@image_placeholder'
        };
      });
    }

    function updateFromInputs(obj, path) {
      if (!path) path = [];
      if (typeof obj !== 'object' || obj === null) return;
      Object.keys(obj).forEach(function(k) {
        const val = obj[k];
        const inputElem = document.getElementById('segment_' + path.concat(k).join('_') + '_input');
        if (typeof val === 'string' || typeof val === 'number') {
          if (inputElem) obj[k] = inputElem.value;
        } else if (Array.isArray(val)) {
          val.forEach(function(item, i){ updateFromInputs(item, path.concat(k, i)); });
        } else if (typeof val === 'object' && val !== null) {
          updateFromInputs(val, path.concat(k));
        }
      });
    }
    if (Array.isArray(updated.lesson_segments)) {
      updated.lesson_segments.forEach(function(seg, i) {
        const key = Object.keys(seg)[0];
        updateFromInputs(seg[key], [i, key]);
      });
    }
    return updated;
  }

  async function callUpdateOutline(body, statusEl, btnEl) {
    statusEl.textContent = 'Saving...';
    statusEl.className = 'text-muted ms-2';
    btnEl.disabled = true;
    try {
      const res = await fetch(FUNCTIONS_URL + '/update_outline', {
        method: 'POST',
        headers: Object.assign({
          'Content-Type': 'application/json'
        }, ACTIONS_ADMIN_KEY ? { Authorization: ('Bearer ' + ACTIONS_ADMIN_KEY) } : {}),
        body: JSON.stringify(body)
      });

      if (res.status === 401 && !ACTIONS_ADMIN_KEY) {
        statusEl.textContent = 'Blocked (401): Saving requires MyGPT (or dev admin key). Use “Copy Draft JSON”.';
        statusEl.className = 'text-danger ms-2';
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        statusEl.textContent = 'Error ' + res.status + ': ' + text;
        statusEl.className = 'text-danger ms-2';
        return;
      }
      const json = await res.json().catch(function(){ return {}; });
      const mode = json.mode || (body.publish ? 'published' : 'draft');
      statusEl.textContent = (mode === 'published') ? 'Published!' : 'Saved draft!';
      statusEl.className = 'text-success ms-2';
    } catch (e) {
      statusEl.textContent = 'Network error while saving.';
      statusEl.className = 'text-danger ms-2';
    } finally {
      btnEl.disabled = false;
    }
  }

  // Helpers
  function titleCase(s) { return String(s || '').replace(/\b\w/g, function(m){ return m.toUpperCase(); }); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Init
  loadRequests();
});
