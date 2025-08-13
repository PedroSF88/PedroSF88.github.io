// upload_links.js
(async function() {
  const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobHpob3F3bHFzaWVmeWl1cW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDgwOTQsImV4cCI6MjA2OTEyNDA5NH0.DnAWm_Ety74vvuRSbiSBZPuD2bCBesiDmNr8wP_mHFQ';
  if (!window.supabase) {
    alert("Supabase client library not found.");
    return;
  }
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const container = document.getElementById('visualsTableContainer');

  async function fetchTopics() {
    const { data, error } = await supabase.from('topic_teks').select('id, topic_title').order('topic_title', { ascending: true });
    if (error) {
      container.innerHTML = `<div class='text-danger'>Failed to load topics: ${error.message}</div>`;
      return [];
    }
    return data;
  }

  async function fetchVisuals() {
    const { data, error } = await supabase.from('visuals_data').select('*').order('topic_id', { ascending: true });
    if (error) {
      container.innerHTML = `<div class='text-danger'>Failed to load visuals_data: ${error.message}</div>`;
      return [];
    }
    return data;
  }

  async function fetchVisualsByTopic(topicId) {
    const { data, error } = await supabase.from('visuals_data').select('*').eq('topic_id', topicId).order('visual_id', { ascending: true });
    if (error) {
      container.innerHTML = `<div class='text-danger'>Failed to load visuals_data: ${error.message}</div>`;
      return [];
    }
    return data;
  }

  async function updateLink(id, newLink) {
    const { error } = await supabase.from('visuals_data').update({ link_to_image: newLink }).eq('id', id);
    return error;
  }

  async function fetchContentAreas() {
    const { data, error } = await supabase.from('curriculum_units').select('content_area').neq('content_area', null).order('content_area', { ascending: true });
    if (error) {
      container.innerHTML = `<div class='text-danger'>Failed to load content areas: ${error.message}</div>`;
      return [];
    }
    // Unique content areas
    const unique = Array.from(new Set((data || []).map(u => u.content_area))).filter(Boolean);
    return unique;
  }

  async function fetchUnitsAndTopicsByContentArea(contentArea) {
    const { data: units, error: unitErr } = await supabase.from('curriculum_units').select('*').eq('content_area', contentArea).order('unit_number', { ascending: true });
    if (unitErr) {
      container.innerHTML = `<div class='text-danger'>Failed to load units: ${unitErr.message}</div>`;
      return { units: [], topics: [] };
    }
    const { data: topics, error: topicErr } = await supabase.from('topic_teks').select('*').in('unit_id', units.map(u => u.id));
    if (topicErr) {
      container.innerHTML = `<div class='text-danger'>Failed to load topics: ${topicErr.message}</div>`;
      return { units, topics: [] };
    }
    return { units, topics };
  }

  function renderContentAreaButtons(contentAreas) {
    let html = '<div class="mb-3">';
    contentAreas.forEach(area => {
      html += `<button class='btn btn-outline-dark me-2 mb-2' data-area='${area}'>${area}</button>`;
    });
    html += '</div><div id="contentAreaMenus"></div>';
    // Render in main area instead of sidebar
    container.innerHTML = html;
    container.querySelectorAll('button[data-area]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const area = btn.getAttribute('data-area');
        const { units, topics } = await fetchUnitsAndTopicsByContentArea(area);
        const unitMap = {};
        (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
        (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));
        renderUnitAndTopicMenu(unitMap);
      });
    });
  }

  function renderUnitAndTopicMenu(unitMap) {
    let html = `<div class='row'><div class='col-md-5'><div id='unitMenu'></div></div><div class='col-md-7'><div id='topicMenu'></div></div></div><div id='topicVisualsTable'></div>`;
    container.innerHTML = html;
    const unitMenu = document.getElementById('unitMenu');
    const topicMenu = document.getElementById('topicMenu');
    const topicTable = document.getElementById('topicVisualsTable');
    Object.values(unitMap).forEach(({ unit, topics }) => {
      const btn = document.createElement('button');
      btn.textContent = unit.unit_title || unit.id;
      btn.className = 'btn btn-outline-primary w-100 mb-2';
      btn.onclick = () => selectUnit(unit, topics);
      unitMenu.append(btn);
    });
    function selectUnit(unit, topics) {
      topicMenu.innerHTML = '';
      topicTable.innerHTML = '';
      const getNum = (t) => {
        const m = String(t.topic_title || '').match(/^\s*(\d+)/);
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
      };
      const sorted = (topics || []).slice().sort((a, b) => getNum(a) - getNum(b));
      sorted.forEach(topic => {
        const btn = document.createElement('button');
        btn.textContent = topic.topic_title || topic.id;
        btn.className = 'btn btn-outline-secondary w-100 mb-2';
        btn.onclick = async () => {
          const visuals = await fetchVisualsByTopic(topic.id);
          renderTable(visuals, topicTable);
        };
        topicMenu.append(btn);
      });
    }
  }

  function renderTable(visuals, tableContainer) {
    if (!visuals.length) {
      tableContainer.innerHTML = '<div class="text-muted">No visuals found for this topic.</div>';
      return;
    }
    let html = `<table class="table table-bordered table-striped align-middle">
      <thead><tr>
        <th>ID</th>
        <th>Visual ID</th>
        <th>Description</th>
        <th>Type</th>
        <th>Link to Image</th>
        <th>Update</th>
      </tr></thead><tbody>`;
    visuals.forEach(row => {
      html += `<tr>
        <td>${row.id}</td>
        <td>${row.visual_id}</td>
        <td>${row.description || ''}</td>
        <td>${row.type || ''}</td>
        <td>
          <input type="text" class="form-control form-control-sm" value="${row.link_to_image || ''}" id="link_${row.id}" />
        </td>
        <td>
          <button class="btn btn-primary btn-sm" data-id="${row.id}">Save</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    tableContainer.innerHTML = html;
    tableContainer.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        const input = document.getElementById(`link_${id}`);
        const newLink = input.value.trim();
        btn.disabled = true;
        btn.textContent = 'Saving...';
        const error = await updateLink(id, newLink);
        btn.disabled = false;
        btn.textContent = 'Save';
        if (error) {
          alert('Error updating link: ' + error.message);
        } else {
          input.classList.add('is-valid');
          setTimeout(() => input.classList.remove('is-valid'), 1200);
        }
      });
    });
  }

  // Initial load
  const contentAreas = await fetchContentAreas();
  renderContentAreaButtons(contentAreas);
  const { units, topics } = await fetchUnitsAndTopics();
  const unitMap = {};
  (units || []).forEach(u => unitMap[u.id] = { unit: u, topics: [] });
  (topics || []).forEach(t => unitMap[t.unit_id] && unitMap[t.unit_id].topics.push(t));
  renderUnitAndTopicMenu(unitMap);
  const visuals = await fetchVisuals();
  renderTable(visuals);
})();
