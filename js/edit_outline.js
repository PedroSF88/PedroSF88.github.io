// edit_outline.js
// Handles fetching units, topics, and lesson_outline, rendering a structured editable form, and updating lesson_outline in Supabase

console.log('edit_outline.js loaded');

if (!window.supabase) {
  alert('Supabase client not found. Please ensure @supabase/supabase-js is loaded before this script.');
  throw new Error('Supabase client not found.');
}
const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobHpob3F3bHFzaWVmeWl1cW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDgwOTQsImV4cCI6MjA2OTEyNDA5NH0.DnAWm_Ety74vvuRSbiSBZPuD2bCBesiDmNr8wP_mHFQ';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


const contentSelect = document.getElementById('contentSelect');
const unitSelect = document.getElementById('unitSelect');
const topicSelect = document.getElementById('topicSelect');
const outlineFormContainer = document.getElementById('outlineFormContainer');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');

let currentTopic = null;
let currentOutline = null;


// Use correct table/field names from schema
async function loadUnits(content) {
  console.log('loadUnits: content selected:', content);
  unitSelect.innerHTML = '<option value="">Select a unit</option>';
  if (!content) return;
  // 1. Find all course_requests with this content
  const { data: reqs, error: reqErr } = await supa.from('course_requests').select('id').eq('content', content);
  console.log('loadUnits: reqs:', reqs);
  if (reqErr) {
    console.error('Error loading course_requests:', reqErr);
    alert('Error loading course_requests. See console for details.');
    return;
  }
  if (!reqs || !reqs.length) {
    console.warn('No course_requests found for content:', content);
    return;
  }
  const reqIds = reqs.map(r => r.id);
  console.log('loadUnits: reqIds:', reqIds);
  // 2. Find all units for these request_ids
  const { data: units, error: unitErr } = await supa.from('curriculum_units').select('id, unit_title, request_id').in('request_id', reqIds);
  console.log('loadUnits: units returned:', units);
  if (unitErr) {
    console.error('Error loading curriculum_units:', unitErr);
    alert('Error loading curriculum_units. See console for details.');
    return;
  }
  if (!units || !units.length) {
    console.warn('No units found for request_ids:', reqIds);
    return;
  }
  unitSelect.innerHTML += units.map(u => `<option value="${u.id}">${u.unit_title}</option>`).join('');
}

async function loadContents() {
  console.log('loadContents called');
  // Get all unique content values from course_requests
  const { data, error } = await supa.from('course_requests').select('content');
  console.log('Supabase course_requests data:', data);
  if (error) {
    console.error('Error loading course_requests (content):', error);
    alert('Error loading course_requests. See console for details.');
    return;
  }
  if (!data || !data.length) {
    console.warn('No course_requests found.');
    return;
  }
  const contents = Array.from(new Set((data||[]).map(r => r.content).filter(Boolean)));
  contentSelect.innerHTML = '<option value="">Select content</option>' +
    contents.map(c => `<option value="${c}">${c}</option>`).join('');
}

unitSelect.addEventListener('change', e => {
  console.log('unitSelect changed:', e.target.value);
  loadTopics(e.target.value);
  topicSelect.innerHTML = '<option value="">Select a topic</option>';
  outlineFormContainer.innerHTML = '';
  saveBtn.style.display = 'none';
  statusMsg.textContent = '';
});

async function loadTopics(unitId) {
  console.log('loadTopics: unitId:', unitId);
  topicSelect.innerHTML = '<option value="">Select a topic</option>';
  if (!unitId) return;
  const { data, error } = await supa.from('topic_teks').select('id, topic_title').eq('unit_id', unitId);
  console.log('loadTopics: topics returned:', data);
  if (error) return;
  topicSelect.innerHTML += data.map(t => `<option value="${t.id}">${t.topic_title}</option>`).join('');
  console.log('topicSelect options after update:', topicSelect.innerHTML);
  topicSelect.style.background = '#ff0'; // highlight for debug
}

async function loadOutline(topicId) {
  outlineFormContainer.innerHTML = '';
  if (!topicId) return;
  const { data, error } = await supa.from('topic_teks').select('id, lesson_outline').eq('id', topicId).single();
  if (error || !data) return;
  currentTopic = data;
  try {
    currentOutline = typeof data.lesson_outline === 'string' ? JSON.parse(data.lesson_outline) : data.lesson_outline;
  } catch {
    currentOutline = {};
  }
  renderOutlineForm(currentOutline);
}

function renderOutlineForm(outline) {
  // Basic fields: lesson_title, lesson_objective, success_criteria
  let html = '';
  html += `<div class="mb-3"><label class="form-label">Lesson Title</label><input type="text" class="form-control" id="lessonTitleInput" value="${outline.lesson_title || ''}"></div>`;
  html += `<div class="mb-3"><label class="form-label">Lesson Objective</label><textarea class="form-control" id="lessonObjectiveInput">${outline.lesson_objective || ''}</textarea></div>`;
  html += `<div class="mb-3"><label class="form-label">Success Criteria (comma separated)</label><input type="text" class="form-control" id="successCriteriaInput" value="${(outline.success_criteria||[]).join(', ')}"></div>`;
  // Segments (if present)
  function renderField(val, path) {
    if (Array.isArray(val)) {
      // Render each array item recursively
      return val.map((item, idx) => `<div class="border p-2 mb-2">${renderField(item, path.concat(idx))}</div>`).join('');
    } else if (val && typeof val === 'object') {
      // For objects, render each property recursively (no textarea for the object itself)
      return Object.entries(val).map(([k, v]) => {
        return `<div class="mb-2"><label class="form-label">${k}</label>${renderField(v, path.concat(k))}</div>`;
      }).join('');
    } else {
      // For primitives, use input or textarea
      const fieldId = `segment_${path.join('_')}_input`;
      if (typeof val === 'boolean') {
        return `<input type="checkbox" class="form-check-input" id="${fieldId}" ${val ? 'checked' : ''}>`;
      } else if (typeof val === 'number') {
        return `<input type="number" class="form-control" id="${fieldId}" value="${val}">`;
      } else if (typeof val === 'string' && val.length > 60) {
        return `<textarea class="form-control mt-2" id="${fieldId}">${val ?? ''}</textarea>`;
      } else {
        return `<input type="text" class="form-control mt-2" id="${fieldId}" value="${val ?? ''}">`;
      }
    }
  }
  if (Array.isArray(outline.lesson_segments)) {
    html += '<div class="mb-3"><label class="form-label">Lesson Segments</label>';
    outline.lesson_segments.forEach((seg, i) => {
      const key = Object.keys(seg)[0];
      const val = seg[key];
      html += `<div class="border rounded p-2 mb-2"><strong>${key}</strong>`;
      html += renderField(val, [i, key]);
      html += `</div>`;
    });
    html += '</div>';
  }
  // Vocabulary (if present)
  if (Array.isArray(outline.vocabulary)) {
    html += '<div class="mb-3"><label class="form-label">Vocabulary</label>';
    outline.vocabulary.forEach((vocab, i) => {
      html += `<div class="border rounded p-2 mb-2"><strong>Term ${i + 1}</strong>`;
      html += `<div class="mb-2"><label class="form-label">Term</label><input type="text" class="form-control" id="vocab_${i}_term_input" value="${vocab.term || ''}"></div>`;
      html += `<div class="mb-2"><label class="form-label">Definition</label><textarea class="form-control" id="vocab_${i}_definition_input">${vocab.definition || vocab.def || ''}</textarea></div>`;
      html += `<div class="mb-2"><label class="form-label">Image Link</label><input type="text" class="form-control" id="vocab_${i}_link_to_image_input" value="${vocab.link_to_image || ''}"></div>`;
      html += `</div>`;
    });
    html += '</div>';
  }
  outlineFormContainer.innerHTML = html;
  saveBtn.style.display = '';
}

saveBtn.addEventListener('click', async () => {
  if (!currentTopic) return;
  // Gather form values
  const lesson_title = document.getElementById('lessonTitleInput').value;
  const lesson_objective = document.getElementById('lessonObjectiveInput').value;
  const success_criteria = document.getElementById('successCriteriaInput').value.split(',').map(s => s.trim()).filter(Boolean);
  let lesson_segments = currentOutline.lesson_segments || [];
  let vocabulary = [];
  if (Array.isArray(currentOutline.vocabulary)) {
    vocabulary = currentOutline.vocabulary.map((vocab, i) => {
      return {
        term: document.getElementById(`vocab_${i}_term_input`)?.value || '',
        definition: document.getElementById(`vocab_${i}_definition_input`)?.value || '',
        link_to_image: document.getElementById(`vocab_${i}_link_to_image_input`)?.value || ''
      };
    });
  }
  // Update segments if present
  function collectField(val, path) {
    if (Array.isArray(val)) {
      return val.map((item, idx) => collectField(item, path.concat(idx)));
    } else if (val && typeof val === 'object') {
      const obj = {};
      Object.entries(val).forEach(([k, v]) => {
        const fieldId = `segment_${path.join('_')}_${k}_input`;
        const el = document.getElementById(fieldId);
        if (el) {
          obj[k] = el.value;
        } else {
          obj[k] = collectField(v, path.concat(k));
        }
      });
      return obj;
    } else {
      const fieldId = `segment_${path.join('_')}_input`;
      const el = document.getElementById(fieldId);
      return el ? el.value : val;
    }
  }
  if (Array.isArray(lesson_segments)) {
    lesson_segments = lesson_segments.map((seg, i) => {
      const key = Object.keys(seg)[0];
      const val = seg[key];
      return { [key]: collectField(val, [i, key]) };
    });
  }
  const newOutline = { lesson_title, lesson_objective, success_criteria, vocabulary, lesson_segments };
  // Update in Supabase
  const { error } = await supa.from('topic_teks').update({ lesson_outline: newOutline }).eq('id', currentTopic.id);
  if (error) {
    statusMsg.textContent = 'Error saving changes.';
    statusMsg.className = 'text-danger mt-3';
  } else {
    statusMsg.textContent = 'Changes saved!';
    statusMsg.className = 'text-success mt-3';
  }
});
contentSelect.addEventListener('change', e => {
  console.log('contentSelect changed:', e.target.value);
  loadUnits(e.target.value);
  unitSelect.innerHTML = '<option value="">Select a unit</option>';
  topicSelect.innerHTML = '<option value="">Select a topic</option>';
  outlineFormContainer.innerHTML = '';
  saveBtn.style.display = 'none';
  statusMsg.textContent = '';
});
// Initial load
loadContents();
