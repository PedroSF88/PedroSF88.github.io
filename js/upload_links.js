// Update Visual Links UI logic
const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobHpob3F3bHFzaWVmeWl1cW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDgwOTQsImV4cCI6MjA2OTEyNDA5NH0.DnAWm_Ety74vvuRSbiSBZPuD2bCBesiDmNr8wP_mHFQ';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) :
  supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const requestSelect = document.getElementById('requestSelect');
const unitSelect = document.getElementById('unitSelect');
const topicSelect = document.getElementById('topicSelect');
const visualsTableWrap = document.getElementById('visualsTableWrap');

async function loadRequests() {
  const { data, error } = await supabase.from('course_requests').select('id, content').order('created_at');
  requestSelect.innerHTML = '<option value="">Select a request</option>';
  (data || []).forEach(r => {
    requestSelect.innerHTML += `<option value="${r.id}">${r.content || r.id}</option>`;
  });
}

async function loadUnits(requestId) {
  unitSelect.innerHTML = '<option value="">Select a unit</option>';
  topicSelect.innerHTML = '<option value="">Select a topic</option>';
  visualsTableWrap.innerHTML = '';
  if (!requestId) return;
  const { data, error } = await supabase.from('curriculum_units').select('id, unit_title').eq('request_id', requestId);
  (data || []).forEach(u => {
    unitSelect.innerHTML += `<option value="${u.id}">${u.unit_title || u.id}</option>`;
  });
}

async function loadTopics(unitId) {
  topicSelect.innerHTML = '<option value="">Select a topic</option>';
  visualsTableWrap.innerHTML = '';
  if (!unitId) return;
  const { data, error } = await supabase.from('topic_teks').select('id, topic_title').eq('unit_id', unitId);
  (data || []).forEach(t => {
    topicSelect.innerHTML += `<option value="${t.id}">${t.topic_title || t.id}</option>`;
  });
}

async function loadVisuals(topicId) {
  visualsTableWrap.innerHTML = '';
  if (!topicId) return;
  const { data, error } = await supabase.from('visuals_data').select('*').eq('topic_id', topicId);
  if (!data || !data.length) {
    visualsTableWrap.innerHTML = '<div class="alert alert-warning">No visuals found for this topic.</div>';
    return;
  }
  let html = `<table class="table table-bordered"><thead><tr><th>Visual ID</th><th>Type</th><th>Description</th><th>Link to Image</th><th>Status</th><th>Save</th></tr></thead><tbody>`;
  data.forEach(v => {
    const hasUrl = v.link_to_image && v.link_to_image.trim() !== '';
    html += `<tr>
      <td>${v.visual_id}</td>
      <td>${v.type || ''}</td>
      <td>${v.description || ''}</td>
      <td><input type="text" class="form-control" id="link_${v.id}" value="${v.link_to_image || ''}" /></td>
      <td>${hasUrl ? '<span class="badge bg-success">Exists</span>' : '<span class="badge bg-warning text-dark">Needed</span>'}</td>
      <td><button class="btn btn-primary btn-sm" onclick="saveLink('${v.id}')">Save</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  visualsTableWrap.innerHTML = html;
}

window.saveLink = async function(id) {
  const input = document.getElementById(`link_${id}`);
  const link = input.value.trim();
  const { error } = await supabase.from('visuals_data').update({ link_to_image: link }).eq('id', id);
  if (!error) {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
  } else {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    alert('Failed to save!');
  }
};

requestSelect.addEventListener('change', e => loadUnits(e.target.value));
unitSelect.addEventListener('change', e => loadTopics(e.target.value));
topicSelect.addEventListener('change', e => loadVisuals(e.target.value));

loadRequests();
