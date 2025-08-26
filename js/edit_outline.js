// edit_outline.js
// Front-end editor for lesson outlines.
// - Reads with Supabase publishable key (safe for browser)
// - Saves/publishes via auth-based function (update_outline_auth) when user is signed in
// - Falls back to dev-only admin-key function (update_outline) or "Copy Draft JSON" → save via MyGPT
//
// Requirements in HTML:
// - Load @supabase/supabase-js before this script (window.supabase)
// - Elements with IDs: requestMenu, unitMenu, topicMenu, cardList, selectedTopicTitle
//
// Optional DEV globals (do NOT ship real keys in prod):
//   <script>window.SUPABASE_URL = 'https://...supabase.co';</script>
//   <script>window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';</script>
//   <script>window.ACTIONS_ADMIN_KEY = '...'; // dev only</script>

var currentSchemaVersion = 1; // 1 or 2
document.addEventListener('DOMContentLoaded', function () {
  // --- Setup ---
  var SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
  var FUNCTIONS_URL = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');
  var SUPABASE_PUBLISHABLE_KEY =
    window.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z5FpORNEIA4S6kOY-Mdzxw_YtBllO9n';

  // Optional for local DEV ONLY (never ship real keys in prod)
  var ACTIONS_ADMIN_KEY = window.ACTIONS_ADMIN_KEY || null;

  if (!window.supabase) {
    alert('Supabase client not found. Please load @supabase/supabase-js before this script.');
    throw new Error('Supabase client not found.');
  }
  const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- Auth: Email OTP sign-in with redirect ---
  // choose the exact page you want to land on after login
  const emailRedirectTo = `${location.origin}/edit_outline.html`;

  // Example: call this function to trigger sign-in
  async function signInWithEmail(email) {
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo }
    });
    if (error) alert('Sign-in error: ' + error.message);
  }
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
  function titleCase(s) { return String(s || '').replace(/\b\w/g, function(m){ return m.toUpperCase(); }); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function hasSession() {
    var s = await supa.auth.getSession();
    return !!(s && s.data && s.data.session);
  }

  // --- Sidebar: Requests → Units → Topics ---
  async function loadRequests() {
    var res = await supa.from('course_requests').select('*').order('created_at', { ascending: true });
    var requests = res.data;
    var error = res.error;
    var requestMenu = document.getElementById('requestMenu');
    requestMenu.innerHTML = '';
    if (error) { requestMenu.innerHTML = '<div class="text-danger">Error loading requests</div>'; return; }
    if (!requests || !requests.length) { requestMenu.innerHTML = '<div class="text-warning">No requests found</div>'; return; }

    requests.forEach(function(req) {
      var btn = document.createElement('button');
      btn.textContent = req.content || req.id;
      btn.className = 'btn btn-outline-success w-100 mb-2';
      btn.onclick = function() { loadData(req.id); };
      requestMenu.append(btn);
    });
  }

  async function loadData(requestId) {
    if (!requestId) { clear(unitMenu, topicMenu, cardList); return; }

    var u = await supa
      .from('curriculum_units')
      .select('*')
      .eq('request_id', requestId)
      .order('unit_number', { ascending: true });

    var units = u.data || [];
    var unitIds = units.map(function(x){ return x.id; });

    var t = await supa
      .from('lesson_outlines_public') // read view
      .select('*')
      .in('unit_id', unitIds)
      .order('topic_title', { ascending: true });

    var topics = t.data || [];

    var unitMap = {};
    units.forEach(function(u){ unitMap[u.id] = { unit: u, topics: [] }; });
    topics.forEach(function(tp){ if (unitMap[tp.unit_id]) unitMap[tp.unit_id].topics.push(tp); });

    buildUnitMenu(unitMap);
  }

  function buildUnitMenu(unitMap) {
    clear(unitMenu, topicMenu, cardList);
    Object.keys(unitMap).forEach(function(k) {
      var unit = unitMap[k].unit;
      var topics = unitMap[k].topics;
      var btn = document.createElement("button");
      btn.textContent = unit.unit_title || unit.id;
      btn.className = "btn btn-outline-primary w-100 mb-2";
      btn.onclick = function() { selectUnit(unit, topics); };
      unitMenu.append(btn);
    });
  }

  function selectUnit(unit, topics) {
    clear(topicMenu, cardList);
    function getNum(t) {
      var m = String(t.topic_title || "").match(/^\s*(\d+)/);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    }
    var sorted = (topics || []).slice().sort(function(a, b){ return getNum(a) - getNum(b); });
    sorted.forEach(function(topic) {
      var btn = document.createElement("button");
      btn.textContent = topic.topic_title || topic.id;
      btn.className = "btn btn-outline-secondary w-100 mb-2";
      btn.onclick = function() {
        renderLessonEditor(topic);
        // Collapse sidebar and show topic title, hide menus
        var sidebar = document.querySelector('.sidebar');
        var topicTitle = document.getElementById('selectedTopicTitle');
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

    // --- SCHEMA VERSION TOGGLE ---
    var outline;
    if (currentSchemaVersion === 2) {
      outline = topic.lesson_outline_v2_draft || topic.lesson_outline_v2 || {};
    } else {
      outline = topic.re_lesson_outlines || topic.lesson_outline || {};
    }
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
    html += '<div class="card p-4 mb-4">' +
      '<h4 class="mb-3">Lesson Info</h4>' +
      // --- VERSION TOGGLE UI ---
      '<div class="mb-3">' +
        '<label class="form-label">Schema Version</label><br>' +
        '<div class="form-check form-check-inline">' +
          '<input class="form-check-input" type="radio" name="schemaVersion" id="schemaV1" value="1" ' + (currentSchemaVersion===1?'checked':'') + '>' +
          '<label class="form-check-label" for="schemaV1">v1</label>' +
        '</div>' +
        '<div class="form-check form-check-inline">' +
          '<input class="form-check-input" type="radio" name="schemaVersion" id="schemaV2" value="2" ' + (currentSchemaVersion===2?'checked':'') + '>' +
          '<label class="form-check-label" for="schemaV2">v2</label>' +
        '</div>' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label">Lesson Title <span class="text-danger">*</span></label>' +
        '<input type="text" class="form-control" id="lessonTitleInput" value="' + escapeHtml(outline.lesson_title) + '" required>' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label">Lesson Objective <span class="text-danger">*</span></label>' +
        '<textarea class="form-control" id="lessonObjectiveInput" rows="2" required>' + escapeHtml(outline.lesson_objective) + '</textarea>' +
      '</div>' +
      '<div class="mb-3">' +
        '<label class="form-label">Success Criteria (comma separated)</label>' +
        '<textarea class="form-control" id="successCriteriaInput" rows="3">' + escapeHtml((outline.success_criteria||[]).join(', ')) + '</textarea>' +
      '</div>' +
    '</div>';

    // Segments
    html += '<div class="d-flex align-items-center justify-content-between mb-2">' +
      '<h5 class="mb-0">Lesson Segments</h5>' +
      '<button type="button" class="btn btn-outline-primary btn-sm" id="addSegmentBtn_top">+ Add Segment</button>' +
    '</div>';

    outline.lesson_segments.forEach(function(seg, i) {
      var key = Object.keys(seg)[0];
      var val = seg[key];
      html += '<div class="card p-3 mb-3">' +
        '<div class="d-flex justify-content-between align-items-center mb-2">' +
          '<span class="fw-bold">' + titleCase(key.replace(/_/g, ' ')) + '</span>' +
          '<div>' +
            '<button type="button" class="btn btn-outline-primary btn-sm me-2" id="addSegmentBtn_' + i + '">+ Add Below</button>' +
            '<button type="button" class="btn btn-danger btn-sm" id="removeSegmentBtn_' + i + '" title="Remove segment">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div>' + renderField(val, [i, key]) + '</div>' +
      '</div>';
    });

    // Vocab
    html += '<div class="d-flex align-items-center justify-content-between mt-4 mb-2">' +
      '<h5 class="mb-0">Vocabulary</h5>' +
      '<button type="button" class="btn btn-outline-primary btn-sm" id="addVocabBtn">+ Add Vocab Term</button>' +
    '</div>';
    if (Array.isArray(outline.vocabulary) && outline.vocabulary.length) {
      outline.vocabulary.forEach(function(vocab, i) {
        var imgId = 'vocab_' + i + '_image_preview';
        var inputId = 'vocab_' + i + '_link_to_image_input';
        html += '<div class="card p-3 mb-3">' +
          '<div class="d-flex justify-content-between align-items-center mb-2">' +
            '<span class="fw-bold">Term ' + (i + 1) + '</span>' +
            '<button type="button" class="btn btn-danger btn-sm" id="removeVocabBtn_' + i + '" title="Remove vocab">&times;</button>' +
          '</div>' +
          '<div class="mb-2">' +
            '<label class="form-label">Term</label>' +
            '<input type="text" class="form-control" id="vocab_' + i + '_term_input" value="' + escapeHtml(vocab.term || '') + '" required>' +
          '</div>' +
          '<div class="mb-2">' +
            '<label class="form-label">Definition</label>' +
            '<textarea class="form-control" id="vocab_' + i + '_definition_input" rows="2">' + escapeHtml(vocab.definition || vocab.def || '') + '</textarea>' +
          '</div>' +
          '<div class="mb-2">' +
            '<label class="form-label">Image Link (or @image_placeholder)</label>' +
            '<input type="text" class="form-control url-input" id="' + inputId + '" value="' + escapeHtml(vocab.link_to_image || '') + '" pattern="(^https?://.*)|(^@image_placeholder$)">' +
          '</div>' +
          '<div class="vocab-image-preview mt-2" id="vocab_' + i + '_image_preview_container">';
        if (vocab.link_to_image && (isLikelyImageUrl(vocab.link_to_image) || isPlaceholder(vocab.link_to_image))) {
          if (isPlaceholder(vocab.link_to_image)) {
            html += '<div class="text-muted small">@image_placeholder</div>';
          } else {
            html += '<img src="' + vocab.link_to_image + '" alt="Image preview" class="img-thumbnail" style="max-width:80px;max-height:80px;cursor:zoom-in;" id="' + imgId + '">';
          }
        } else {
          html += '<div class="text-muted small">No image</div>';
        }
        html += '</div></div>';
      });
    } else {
      html += '<div class="text-muted">No vocabulary yet.</div>';
    }

    // Footer actions
    html += '' +
      '<div class="d-flex flex-wrap gap-2 justify-content-end mt-4">' +
        '<button class="btn btn-outline-secondary" id="copyJsonBtn">Copy Draft JSON</button>' +
        '<button class="btn btn-success" id="saveBtn">Save Draft</button>' +
        '<button class="btn btn-primary" id="publishBtn">Publish</button>' +
        '<span id="statusMsg" class="ms-2"></span>' +
      '</div>';
    cardList.innerHTML = html;

    // --- VERSION TOGGLE WIRING ---
    var radios = document.getElementsByName('schemaVersion');
    for (var i=0;i<radios.length;i++){
      radios[i].addEventListener('change', function(){
        currentSchemaVersion = Number(this.value);
        renderLessonEditor(currentTopic);
      });
    }

    // Wire up dynamic listeners
    wireDynamicInputs();
    wireAddersAndRemovers();
    wireActions();
  }

  function wireDynamicInputs() {
    (currentOutline.vocabulary || []).forEach(function(_, i) {
      var input = document.getElementById('vocab_' + i + '_link_to_image_input');
      var container = document.getElementById('vocab_' + i + '_image_preview_container');
      if (input && container) {
        input.addEventListener('input', function () {
          var url = input.value.trim();
          if (isPlaceholder(url) || !url) {
            container.innerHTML = isPlaceholder(url)
              ? '<div class="text-muted small">@image_placeholder</div>'
              : '<div class="text-muted small">No image</div>';
          } else if (isLikelyImageUrl(url)) {
            container.innerHTML = '<img src="' + url + '" alt="Image preview" class="img-thumbnail" style="max-width:80px;max-height:80px;object-fit:contain;">';
          } else {
            container.innerHTML = '<div class="text-muted small">Not a recognized image URL</div>';
          }
        });
      }
    });
  }

  function wireAddersAndRemovers() {
    // Add vocab
    var addVocabBtn = document.getElementById('addVocabBtn');
    if (addVocabBtn) {
      addVocabBtn.onclick = function() {
        if (!Array.isArray(currentOutline.vocabulary)) currentOutline.vocabulary = [];
        currentOutline.vocabulary.push({ term: '', definition: '', link_to_image: '@image_placeholder' });
        renderLessonEditor(currentTopic);
      };
    }

    // Remove vocab (with undo)
    (currentOutline.vocabulary || []).forEach(function(vocab, i) {
      var btn = document.getElementById('removeVocabBtn_' + i);
      if (btn) btn.onclick = function() { removeWithUndo('vocab', i, vocab); };
    });

    // Add segment (top)
    var addTop = document.getElementById('addSegmentBtn_top');
    if (addTop) addTop.onclick = function() { insertSegment(currentOutline.lesson_segments.length); };

    // Add segment below each
    (currentOutline.lesson_segments || []).forEach(function(seg, i) {
      var addBelow = document.getElementById('addSegmentBtn_' + i);
      if (addBelow) addBelow.onclick = function() { insertSegment(i + 1); };
      var rm = document.getElementById('removeSegmentBtn_' + i);
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
      var undo = document.createElement('button');
      undo.textContent = 'Undo ×';
      undo.className = 'btn btn-light btn-sm ms-3';
      undo.onclick = function(e){ e.stopPropagation(); el.style.display = 'none'; undoCb(); };
      el.appendChild(undo);
    } else {
      setTimeout(function(){ el.style.display = 'none'; }, ms);
    }
  }

  // Renders nested fields for segments
  function renderField(val, path) {
    var idBase = 'segment_' + path.join('_');
    var lastKey = String(path[path.length - 1] || '').toLowerCase();
    var textareaKeys = ['reading', 'instructions', 'text', 'prompt', 'question', 'discussion', 'description', 'content'];

    if (typeof val === 'string' || typeof val === 'number') {
      if (textareaKeys.some(function(k){ return lastKey.indexOf(k) !== -1; })) {
        return '<textarea class="form-control mb-2" id="' + idBase + '_input" rows="4">' + escapeHtml(val || '') + '</textarea>';
      } else {
        var v = String(val == null ? '' : val);
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

  // Save / Publish / Copy
  function wireActions() {
    var saveBtn = document.getElementById('saveBtn');
    var publishBtn = document.getElementById('publishBtn');
    var copyBtn = document.getElementById('copyJsonBtn');
    var statusMsg = document.getElementById('statusMsg');

    copyBtn.onclick = function() {
      var draft = buildUpdatedOutline();
      navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      statusMsg.textContent = 'Draft JSON copied. Use MyGPT → updateOutline to save.';
      statusMsg.className = 'text-success ms-2';
    };

    saveBtn.onclick = async function() {
      if (!currentTopicId) return;
      var draft = buildUpdatedOutline();
      await callUpdateOutline({ topic_id: currentTopicId, draft: draft, schema_version: currentSchemaVersion }, statusMsg, saveBtn);
    };

    publishBtn.onclick = async function() {
      if (!currentTopicId) return;
      await callUpdateOutline({ topic_id: currentTopicId, publish: true, schema_version: currentSchemaVersion }, statusMsg, publishBtn);
    };
  }

  function buildUpdatedOutline() {
    var updated = JSON.parse(JSON.stringify(currentOutline));
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
        var val = obj[k];
        var inputElem = document.getElementById('segment_' + path.concat(k).join('_') + '_input');
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
        var key = Object.keys(seg)[0];
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
      // If user is signed in, prefer the auth-based function (no admin key needed)
      if (await hasSession()) {
        var r = await supa.functions.invoke('update_outline_auth', { body: body });
        if (r && r.error) {
          statusEl.textContent = 'Error: ' + (r.error.message || 'invoke failed');
          statusEl.className = 'text-danger ms-2';
          return;
        }
        var modeA = (r && r.data && r.data.mode) || (body.publish ? 'published' : 'draft');
        statusEl.textContent = (modeA === 'published') ? 'Published!' : 'Saved draft!';
        statusEl.className = 'text-success ms-2';
        return;
      }

      // Not signed in → fall back to admin-key function (dev only) or nudge to MyGPT
      var res = await fetch(FUNCTIONS_URL + '/update_outline', {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          ACTIONS_ADMIN_KEY ? { Authorization: ('Bearer ' + ACTIONS_ADMIN_KEY) } : {}
        ),
        body: JSON.stringify(body)
      });

      if (res.status === 401 && !ACTIONS_ADMIN_KEY) {
        statusEl.textContent = 'Blocked (401): Sign in first OR use MyGPT (or dev admin key). You can also click “Copy Draft JSON”.';
        statusEl.className = 'text-danger ms-2';
        return;
      }
      if (!res.ok) {
        var text = await res.text();
        statusEl.textContent = 'Error ' + res.status + ': ' + text;
        statusEl.className = 'text-danger ms-2';
        return;
      }
      var json = await res.json().catch(function(){ return {}; });
      var mode = json.mode || (body.publish ? 'published' : 'draft');
      statusEl.textContent = (mode === 'published') ? 'Published!' : 'Saved draft!';
      statusEl.className = 'text-success ms-2';
    } catch (e) {
      statusEl.textContent = 'Network error while saving.';
      statusEl.className = 'text-danger ms-2';
    } finally {
      btnEl.disabled = false;
    }
  }

  // Deep-link: open editor directly by ?topic=<UUID>
  async function tryOpenFromQuery() {
    try {
      var tid = new URLSearchParams(location.search).get('topic');
      if (!tid) return false;

      var r = await supa
        .from('lesson_outlines_public')
        .select('*')
        .eq('id', tid)
        .maybeSingle();

      var data = r.data;
      if (!data) {
        var f = await supa.from('topic_teks').select('*').eq('id', tid).maybeSingle();
        data = f.data;
      }
      if (!data) return false;

      renderLessonEditor(data);
      // Hide sidebar chrome, show title header
      var sidebar = document.querySelector('.sidebar');
      var topicTitle = document.getElementById('selectedTopicTitle');
      if (sidebar && sidebar.classList) sidebar.classList.add('collapsed');
      if (topicTitle) topicTitle.style.display = '';
      var um = document.getElementById('unitMenu');
      var tm = document.getElementById('topicMenu');
      if (um) um.style.display = 'none';
      if (tm) tm.style.display = 'none';
      document.querySelectorAll('.sidebar h5').forEach(function(h){ h.style.display = 'none'; });
      return true;
    } catch {
      return false;
    }
  }

  // Optional auth helpers (wire to your own Sign In UI if desired)
// --- Auth wiring (email magic link) ---
async function updateAuthUI(session) {
  var authed = !!(session && session.user);
  var status = document.getElementById('authStatus');
  var emailInput = document.getElementById('emailInput');
  var signInBtn = document.getElementById('signInBtn');
  var signOutBtn = document.getElementById('signOutBtn');

  if (status) status.textContent = authed ? ('Signed in as ' + (session.user.email || '')) : 'Not signed in';
  if (emailInput) emailInput.style.display = authed ? 'none' : '';
  if (signInBtn)  signInBtn.style.display  = authed ? 'none' : '';
  if (signOutBtn) signOutBtn.style.display = authed ? '' : 'none';
}

async function refreshAuthUI() {
  var s = await supa.auth.getSession();
  await updateAuthUI(s && s.data ? s.data.session : null);
}

// Handle state changes (e.g., after clicking the magic link)
supa.auth.onAuthStateChange(function (_event, session) {
  updateAuthUI(session);
});

// Send magic link
var _signInBtn = document.getElementById('signInBtn');
if (_signInBtn) {
  _signInBtn.onclick = async function () {
    var email = (document.getElementById('emailInput') || {}).value || '';
    email = email.trim();
    if (!email) { alert('Enter your email'); return; }
    // This URL must be allowed in Auth settings
    var redirectTo = location.href;
    var r = await supa.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo } });
    if (r.error) { alert('Sign-in error: ' + r.error.message); return; }
    alert('Check your email for the sign-in link.\n(You may need to wait up to a minute between requests.)');
  };
}

// Sign out
var _signOutBtn = document.getElementById('signOutBtn');
if (_signOutBtn) {
  _signOutBtn.onclick = async function () {
    try { await supa.auth.signOut(); } catch {}
    await refreshAuthUI();
  };
}

// On load, set initial UI state
refreshAuthUI();


  // Init
  tryOpenFromQuery().then(function(hit){
    if (!hit) loadRequests();
  });
});
