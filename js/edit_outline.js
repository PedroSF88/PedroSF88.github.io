document.addEventListener('DOMContentLoaded', () => {
  // --- Setup ---
  const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobHpob3F3bHFzaWVmeWl1cW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDgwOTQsImV4cCI6MjA2OTEyNDA5NH0.DnAWm_Ety74vvuRSbiSBZPuD2bCBesiDmNr8wP_mHFQ';
  if (!window.supabase) {
    alert('Supabase client not found. Please ensure @supabase/supabase-js is loaded before this script.');
    throw new Error('Supabase client not found.');
  }
  const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const unitMenu   = document.getElementById("unitMenu");
  const topicMenu  = document.getElementById("topicMenu");
  const cardList   = document.getElementById("cardList");
  let currentTopic = null;
  let currentOutline = null;
  let currentTopicId = null;

  // --- Utility ---
  function clear(...els) { els.forEach((e) => e && (e.innerHTML = '')); }
  function safeParseJSON(val) {
    if (!val) return null;
    if (typeof val === "object") return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return null; } }
    return null;
  }

  // --- Sidebar logic (same as before) ---
  async function loadRequests() {
    const { data: requests, error: reqErr } = await supa.from('course_requests').select('*').order('created_at', { ascending: true });
    const requestMenu = document.getElementById('requestMenu');
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

  async function loadData(requestId) {
    if (!requestId) return clear(unitMenu, topicMenu, cardList);
    const { data: units } = await supa.from('curriculum_units').select('*').eq('request_id', requestId).order('unit_number', { ascending: true });
    const unitIds = (units || []).map(u => u.id);
    const { data: topics } = await supa
      .from('lesson_outlines_public')
      .select('*')
      .in('unit_id', unitIds)
      .order('topic_title', { ascending: true });
    const unitMap = {};
    (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
    (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));
    buildUnitMenu(unitMap);
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
        renderLessonEditor(topic);
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

  // --- Editable Lesson Outline Form ---
  function renderLessonEditor(topic) {
    clear(cardList);
    const selectedTopicTitle = document.getElementById('selectedTopicTitle');
    if (selectedTopicTitle) selectedTopicTitle.textContent = topic.topic_title || '';
    let outline = topic.re_lesson_outlines || topic.lesson_outline;
    if (!outline) outline = {};
    outline = typeof outline === "string" ? (safeParseJSON(outline) || {}) : outline;
    currentTopic = topic;
    currentOutline = outline;
    currentTopicId = topic.id;

    // Build form
    let html = '';
    html += `<div class="card p-4 mb-4">
      <h4 class="mb-3">Lesson Info</h4>
      <div class="mb-3"><label class="form-label">Lesson Title <span class="text-danger">*</span></label><input type="text" class="form-control" id="lessonTitleInput" value="${outline.lesson_title || ''}" required></div>
      <div class="mb-3"><label class="form-label">Lesson Objective <span class="text-danger">*</span></label><textarea class="form-control" id="lessonObjectiveInput" required>${outline.lesson_objective || ''}</textarea></div>
      <div class="mb-3"><label class="form-label">Success Criteria (comma separated)</label><textarea class="form-control" id="successCriteriaInput" rows="3">${(outline.success_criteria||[]).join(', ')}</textarea></div>
    </div>`;
    if (Array.isArray(outline.lesson_segments)) {
      html += `<h5 class="mb-2">Lesson Segments</h5>`;
      outline.lesson_segments.forEach((seg, i) => {
        const key = Object.keys(seg)[0];
        const val = seg[key];
        html += `<div class="card p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold">${key.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase())}</span>
            <button type="button" class="btn btn-danger btn-sm ms-2" id="removeSegmentBtn_${i}" title="Remove segment">&times;</button>
          </div>
          <div>${renderField(val, [i, key])}</div>
          <button type="button" class="btn btn-outline-primary btn-sm mt-2" id="addSegmentBtn_${i}">+ Add Segment Below</button>
        </div>`;
      });
    }
    if (Array.isArray(outline.vocabulary)) {
      html += `<h5 class="mt-4 mb-2">Vocabulary</h5>`;
      outline.vocabulary.forEach((vocab, i) => {
        const imgId = `vocab_${i}_image_preview`;
        const inputId = `vocab_${i}_link_to_image_input`;
        html += `<div class="card p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold">Term ${i + 1}</span>
            <button type="button" class="btn btn-danger btn-sm ms-2" id="removeVocabBtn_${i}" title="Remove vocab">&times;</button>
          </div>
          <div class="mb-2"><label class="form-label">Term</label><input type="text" class="form-control" id="vocab_${i}_term_input" value="${vocab.term || ''}" required></div>
          <div class="mb-2"><label class="form-label">Definition</label><textarea class="form-control" id="vocab_${i}_definition_input">${vocab.definition || vocab.def || ''}</textarea></div>
          <div class="mb-2"><label class="form-label">Image Link</label><input type="text" class="form-control url-input" id="${inputId}" value="${vocab.link_to_image || ''}" pattern="https?://.*"></div>
          <div class="vocab-image-preview mt-2" id="vocab_${i}_image_preview_container">`;
        if (vocab.link_to_image) {
          html += `<img src="${vocab.link_to_image}" alt="Image preview" class="img-thumbnail" style="max-width:80px;max-height:80px;cursor:zoom-in;" id="${imgId}">`;
        } else {
          html += `<div class="text-muted small">No image</div>`;
        }
        html += `</div></div>`;
      });
      html += `<button type="button" class="btn btn-outline-primary mt-2" id="addVocabBtn">+ Add Vocab Term</button>`;
    }
    // Live update vocab image preview on input change
    if (Array.isArray(currentOutline.vocabulary)) {
      currentOutline.vocabulary.forEach((vocab, i) => {
        const input = document.getElementById(`vocab_${i}_link_to_image_input`);
        const container = document.getElementById(`vocab_${i}_image_preview_container`);
        if (input && container) {
          input.addEventListener('input', function() {
            let url = input.value.trim();
            container.innerHTML = url ? `<img src="${url}" alt="Image preview" class="img-thumbnail" style="max-width:80px;max-height:80px;cursor:zoom-in;">` : `<div class="text-muted small">No image</div>`;
          });
        }
      });
    }
    html += `<div class="d-flex justify-content-end mt-4"><button class="btn btn-success" id="saveBtn">Save Changes</button><span id="statusMsg" class="ms-3"></span></div>`;
    cardList.innerHTML = html;



    // Store last removed for undo
    let lastRemoved = null;
    function showTempMessage(msg, type = 'info', ms = 4000, undoCallback) {
      let msgElem = document.getElementById('removeMsg');
      if (!msgElem) {
        msgElem = document.createElement('div');
        msgElem.id = 'removeMsg';
        msgElem.style.position = 'fixed';
        msgElem.style.top = '1.5rem';
        msgElem.style.right = '2rem';
        msgElem.style.zIndex = 9999;
        msgElem.style.padding = '0.75rem 1.5rem';
        msgElem.style.borderRadius = '8px';
        msgElem.style.fontWeight = 'bold';
        document.body.appendChild(msgElem);
      }
      msgElem.innerHTML = msg;
      if (undoCallback) {
        const undoBtn = document.createElement('button');
        undoBtn.textContent = 'Undo ×';
        undoBtn.className = 'btn btn-light btn-sm ms-3';
        undoBtn.onclick = function(e) {
          e.stopPropagation();
          msgElem.style.display = 'none';
          undoCallback();
        };
        msgElem.appendChild(undoBtn);
      }
      msgElem.className = type === 'danger' ? 'bg-danger text-white' : 'bg-success text-white';
      msgElem.style.display = 'block';
      if (!undoCallback) {
        setTimeout(() => { msgElem.style.display = 'none'; }, ms);
      }
    }

    // Add remove segment listeners with confirmation and undo
    if (Array.isArray(currentOutline.lesson_segments)) {
      currentOutline.lesson_segments.forEach((seg, i) => {
        const btn = document.getElementById(`removeSegmentBtn_${i}`);
        if (btn) {
          btn.onclick = function() {
            if (confirm('Are you sure you want to remove this segment?')) {
              // Save for undo
              lastRemoved = { type: 'segment', index: i, value: { ...seg } };
              currentOutline.lesson_segments.splice(i, 1);
              renderLessonEditor(currentTopic);
              showTempMessage('Segment removed. Click Save to update.', 'danger', 8000, function() {
                if (lastRemoved && lastRemoved.type === 'segment') {
                  currentOutline.lesson_segments.splice(lastRemoved.index, 0, lastRemoved.value);
                  renderLessonEditor(currentTopic);
                  lastRemoved = null;
                }
              });
            }
          };
        }
      });
    }
    // Add remove vocab listeners with confirmation and undo
    if (Array.isArray(currentOutline.vocabulary)) {
      currentOutline.vocabulary.forEach((vocab, i) => {
        const btn = document.getElementById(`removeVocabBtn_${i}`);
        if (btn) {
          btn.onclick = function() {
            if (confirm('Are you sure you want to remove this vocab term?')) {
              // Save for undo
              lastRemoved = { type: 'vocab', index: i, value: { ...vocab } };
              currentOutline.vocabulary.splice(i, 1);
              renderLessonEditor(currentTopic);
              showTempMessage('Vocab removed. Click Save to update.', 'danger', 8000, function() {
                if (lastRemoved && lastRemoved.type === 'vocab') {
                  currentOutline.vocabulary.splice(lastRemoved.index, 0, lastRemoved.value);
                  renderLessonEditor(currentTopic);
                  lastRemoved = null;
                }
              });
            }
          };
        }
      });
    }

    // Save logic
    document.getElementById('saveBtn').onclick = async function() {
      if (!currentTopicId) return;
      // Deep copy the current outline
      const updatedOutline = JSON.parse(JSON.stringify(currentOutline));

      // Helper to update fields from form inputs recursively
      function updateFromInputs(obj, path = []) {
        if (typeof obj !== 'object' || obj === null) return;
        Object.keys(obj).forEach((k, idx) => {
          const val = obj[k];
          const idBase = `segment_${path.concat(k).join('_')}`;
          if (typeof val === 'string' || typeof val === 'number') {
            const inputElem = document.getElementById(`${idBase}_input`);
            if (inputElem) {
              if (inputElem.tagName === 'TEXTAREA') {
                obj[k] = inputElem.value;
              } else {
                obj[k] = inputElem.value;
              }
            }
          } else if (Array.isArray(val)) {
            // Only update if textarea exists (for array-as-text)
            const arrInput = document.getElementById(`${idBase}_input`);
            if (arrInput && arrInput.tagName === 'TEXTAREA') {
              obj[k] = arrInput.value.split('\n');
            } else {
              val.forEach((item, i) => updateFromInputs(item, path.concat(k, i)));
            }
          } else if (typeof val === 'object' && val !== null) {
            updateFromInputs(val, path.concat(k));
          }
        });
      }

      // Update lesson_segments
      if (Array.isArray(updatedOutline.lesson_segments)) {
        updatedOutline.lesson_segments.forEach((seg, i) => {
          const key = Object.keys(seg)[0];
          updateFromInputs(seg[key], [i, key]);
        });
      }
      // Update top-level fields
      const lessonTitleInput = document.getElementById('lessonTitleInput');
      if (lessonTitleInput) updatedOutline.lesson_title = lessonTitleInput.value;
      const lessonObjectiveInput = document.getElementById('lessonObjectiveInput');
      if (lessonObjectiveInput) updatedOutline.lesson_objective = lessonObjectiveInput.value;
      const successCriteriaInput = document.getElementById('successCriteriaInput');
      if (successCriteriaInput) updatedOutline.success_criteria = successCriteriaInput.value.split(',').map(s => s.trim()).filter(Boolean);

      // Update vocabulary
      if (Array.isArray(updatedOutline.vocabulary)) {
        updatedOutline.vocabulary = updatedOutline.vocabulary.map((vocab, i) => ({
          term: document.getElementById(`vocab_${i}_term_input`)?.value || vocab.term || '',
          definition: document.getElementById(`vocab_${i}_definition_input`)?.value || vocab.definition || vocab.def || '',
          link_to_image: document.getElementById(`vocab_${i}_link_to_image_input`)?.value || vocab.link_to_image || ''
        }));
      }

      // Save to Supabase
      const saveBtn = document.getElementById('saveBtn');
      const statusMsg = document.getElementById('statusMsg');
      saveBtn.disabled = true;
      statusMsg.textContent = 'Saving...';
      const { error } = await supa
        .from('lesson_outlines_public')
        .update({ lesson_outline: updatedOutline })
        .eq('id', currentTopicId);
      saveBtn.disabled = false;
      if (error) {
        statusMsg.textContent = 'Error saving: ' + error.message;
        statusMsg.className = 'text-danger ms-3';
      } else {
        statusMsg.textContent = 'Saved!';
        statusMsg.className = 'text-success ms-3';
      }
    };
  }

  // --- Render fields for segments (simple, can be improved for complex types) ---
  function renderField(val, path) {
    const idBase = `segment_${path.join('_')}`;
    // Helper: is this a likely image URL?
    function isImageUrl(str) {
      return typeof str === 'string' && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(str.trim());
    }
    // Use textarea for reading and other pertinent fields
    const textareaKeys = ['reading', 'instructions', 'text', 'prompt', 'question', 'discussion', 'description', 'content'];
    const lastKey = path[path.length - 1] ? String(path[path.length - 1]).toLowerCase() : '';
    if (typeof val === 'string' || typeof val === 'number') {
      if (textareaKeys.some(k => lastKey.includes(k))) {
        return `<textarea class="form-control mb-2" id="${idBase}_input" rows="4">${val || ''}</textarea>`;
      } else {
        let input = `<input type="text" class="form-control mb-2" id="${idBase}_input" value="${val || ''}">`;
        if (isImageUrl(val)) {
          input += `<div class="mt-2"><img src="${val}" alt="Image preview" class="img-thumbnail" style="max-width:120px;max-height:120px;object-fit:contain;"></div>`;
        }
        return input;
      }
    } else if (Array.isArray(val)) {
      // Render each array item as a subfield
      return val.map((item, idx) =>
        `<div class="mb-2 ms-3"><label class="form-label">[${idx}]</label>${renderField(item, path.concat(idx))}</div>`
      ).join('') + `<textarea class="form-control mb-2" id="${idBase}_input" style="display:none;">${val.join('\n')}</textarea>`;
    } else if (typeof val === 'object' && val !== null) {
      return Object.keys(val).map(k =>
        `<div class="mb-2 ms-2"><label class="form-label">${k}</label>${renderField(val[k], path.concat(k))}</div>`
      ).join('');
    } else {
      return '';
    }
  }

  // On page load, show requests
  loadRequests();
});

