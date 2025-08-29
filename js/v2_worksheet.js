// v2_worksheet.js
// Renders a worksheet using only v2 outlines

// Requirements: Supabase client loaded, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY set

document.addEventListener('DOMContentLoaded', function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = window.SUPABASE_PUBLISHABLE_KEY;
  if (!window.supabase) {
    alert('Supabase client not found. Please load @supabase/supabase-js before this script.');
    throw new Error('Supabase client not found.');
  }
  const supa = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );

  const contentSelect = document.getElementById('contentSelect');
  const unitSelect = document.getElementById('unitSelect');
  const topicSelect = document.getElementById('topicSelect');
  const btnLoadSupabase = document.getElementById('btnLoadSupabase');
  const worksheetContainer = document.getElementById('worksheetContainer');

  // Populate Content selector
  async function loadContents() {
    if (!contentSelect) return;
    contentSelect.innerHTML = '<option value="">Select content</option>';
    const { data, error } = await supa.from('course_requests').select('content').order('content', { ascending: true });
    if (error) { console.error('Error loading contents:', error); return; }
    const unique = Array.from(new Set((data||[]).map(r => r.content).filter(Boolean)));
    contentSelect.innerHTML += unique.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  // Populate Units for selected content
  async function loadUnits(content) {
    if (!unitSelect) return;
    unitSelect.innerHTML = '<option value="">Select a unit</option>';
    if (topicSelect) topicSelect.innerHTML = '<option value="">Select a topic</option>';
    if (!content) return;
    const { data: reqs, error: reqErr } = await supa.from('course_requests').select('id').eq('content', content);
    if (reqErr || !reqs || !reqs.length) return;
    const reqIds = reqs.map(r => r.id);
    const { data: units, error: unitErr } = await supa.from('curriculum_units').select('id, unit_title, request_id').in('request_id', reqIds);
    if (unitErr || !units || !units.length) return;
    unitSelect.innerHTML += units.map(u => `<option value="${u.id}">${u.unit_title}</option>`).join('');
  }

  // Populate Topics for selected unit
  async function loadTopics(unitId) {
    if (!topicSelect) return;
    topicSelect.innerHTML = '<option value="">Select a topic</option>';
    if (!unitId) return;
    const { data: topics, error } = await supa
      .from('lesson_outlines_public')
      .select('id, topic_title')
      .eq('unit_id', unitId)
      .order('topic_title', { ascending: true });
    if (error || !topics || !topics.length) return;
    topicSelect.innerHTML += topics.map(t => `<option value="${t.id}">${t.topic_title}</option>`).join('');
  }

  // On selectors change
  if (contentSelect) contentSelect.addEventListener('change', e => { loadUnits(e.target.value); });
  if (unitSelect) unitSelect.addEventListener('change', e => { loadTopics(e.target.value); });

  // On Load Worksheet, fetch and render v2 worksheet
  if (btnLoadSupabase) btnLoadSupabase.addEventListener('click', async function() {
    const topicId = topicSelect && topicSelect.value;
    if (!topicId) { alert('Select a topic first.'); return; }
    const { data: topic, error } = await supa
      .from('lesson_outlines_public')
      .select('topic_title, lesson_outline_v2')
      .eq('id', topicId)
      .single();
    let outline = topic && topic.lesson_outline_v2;
    if (error || !outline) {
      alert('Failed to load worksheet from Supabase.');
      return;
    }
    if (typeof outline === 'string') {
      try { outline = JSON.parse(outline); } catch {}
    }
    renderV2Worksheet(outline, topic.topic_title);
  });

  // Initial load
  loadContents();
});

function renderV2Worksheet(outline, topicTitle) {
  const container = document.getElementById('worksheetContainer');
  if (!outline || !outline.lesson_segments) {
    container.innerHTML = '<div class="alert alert-warning">No v2 worksheet data found.</div>';
    return;
  }
  let html = '';
  html += `<h2 class="mb-4">${escapeHtml(topicTitle || outline.lesson_title || 'Worksheet')}</h2>`;
  html += `<div class="mb-3"><strong>Objective:</strong> ${escapeHtml(outline.lesson_objective || '')}</div>`;
  html += `<div class="mb-3"><strong>Success Criteria:</strong> ${(outline.success_criteria||[]).map(escapeHtml).join(', ')}</div>`;
  (outline.lesson_segments || []).forEach((seg, i) => {
    const key = Object.keys(seg)[0];
    html += `<div class="card p-3 mb-3"><h5>${escapeHtml(key.replace(/_/g, ' '))}</h5>`;
    html += renderSegmentFields(seg[key]);
    html += '</div>';
  });
  container.innerHTML = html;
}

function renderSegmentFields(val) {
  if (typeof val === 'string' || typeof val === 'number') {
    return `<div>${escapeHtml(val)}</div>`;
  } else if (Array.isArray(val)) {
    return val.map(renderSegmentFields).join('');
  } else if (typeof val === 'object' && val !== null) {
    return Object.keys(val).map(k => `<div><strong>${escapeHtml(k)}:</strong> ${renderSegmentFields(val[k])}</div>`).join('');
  } else {
    return '';
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
