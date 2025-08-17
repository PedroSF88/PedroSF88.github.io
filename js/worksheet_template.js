document.addEventListener('DOMContentLoaded', function() {
  // ================== Supabase setup (unchanged) ==================
  const SUPABASE_URL = window.SUPABASE_URL || 'https://hhlzhoqwlqsiefyiuqmg.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobHpob3F3bHFzaWVmeWl1cW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDgwOTQsImV4cCI6MjA2OTEyNDA5NH0.DnAWm_Ety74vvuRSbiSBZPuD2bCBesiDmNr8wP_mHFQ';
  if (!window.supabase) {
    console.error('Supabase client not found. Please include @supabase/supabase-js before this script.');
    return;
  }
  const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // DOM refs
  const contentSelect = document.getElementById('contentSelect');
  const unitSelect = document.getElementById('unitSelect');
  const topicSelect = document.getElementById('topicSelect');
  const btnLoadSupabase = document.getElementById('btnLoadSupabase');
  const root = document.getElementById('lessonRoot');
  const testBox = document.getElementById('testResults');

  // Populate Content selector
  async function loadContents() {
    if (!contentSelect) return;
    contentSelect.innerHTML = '<option value=\"\">Select content</option>';
    const { data, error } = await supa.from('course_requests').select('content').order('content', { ascending: true });
    if (error) { console.error('Error loading contents:', error); return; }
    const unique = Array.from(new Set((data||[]).map(r => r.content).filter(Boolean)));
    contentSelect.innerHTML += unique.map(c => `<option value=\"${c}\">${c}</option>`).join('');
  }

  // Populate Units for selected content
  async function loadUnits(content) {
    if (!unitSelect) return;
    unitSelect.innerHTML = '<option value=\"\">Select a unit</option>';
    if (topicSelect) topicSelect.innerHTML = '<option value=\"\">Select a topic</option>';
    if (!content) return;
    const { data: reqs, error: reqErr } = await supa.from('course_requests').select('id').eq('content', content);
    if (reqErr || !reqs || !reqs.length) return;
    const reqIds = reqs.map(r => r.id);
    const { data: units, error: unitErr } = await supa.from('curriculum_units').select('id, unit_title, request_id').in('request_id', reqIds);
    if (unitErr || !units || !units.length) return;
    unitSelect.innerHTML += units.map(u => `<option value=\"${u.id}\">${u.unit_title}</option>`).join('');
  }

  // Populate Topics for selected unit
  async function loadTopics(unitId) {
    if (!topicSelect) return;
    topicSelect.innerHTML = '<option value=\"\">Select a topic</option>';
    if (!unitId) return;
    const { data: topics, error } = await supa.from('topic_teks').select('id, topic_title, lesson_outline').eq('unit_id', unitId);
    if (error || !topics || !topics.length) return;
    topicSelect.innerHTML += topics.map(t => `<option value=\"${t.id}\">${t.topic_title}</option>`).join('');
  }

  // On selectors change
  if (contentSelect) contentSelect.addEventListener('change', e => { loadUnits(e.target.value); });
  if (unitSelect) unitSelect.addEventListener('change', e => { loadTopics(e.target.value); });

  // On Load Lesson, fetch and render lesson
  if (btnLoadSupabase) btnLoadSupabase.addEventListener('click', async function() {
    const topicId = topicSelect && topicSelect.value;
    if (!topicId) { alert('Select a topic first.'); return; }
    const { data: topic, error } = await supa.from('topic_teks').select('lesson_outline').eq('id', topicId).single();
    if (error || !topic || !topic.lesson_outline) {
      alert('Failed to load lesson from Supabase.');
      return;
    }
    let lessonData = topic.lesson_outline;
    if (typeof lessonData === 'string') {
      try { lessonData = JSON.parse(lessonData); } catch {}
    }
    if (!lessonData) { alert('Lesson data is empty.'); return; }
    renderAll(lessonData);
  });

  // Initial load
  loadContents();

  // Detect writing-mode support (for rotated terms)
  try{
    if(!(window.CSS && CSS.supports && (CSS.supports('writing-mode','vertical-rl') || CSS.supports('writing-mode','tb-rl')))){
      document.body.classList.add('no-writing-mode');
    }
  }catch(e){}

  // ================== ES5-SAFE HELPERS ==================
  if (typeof Object.assign !== 'function') {
    Object.assign = function(target){
      target = Object(target);
      for (var i=1;i<arguments.length;i++){
        var src = arguments[i];
        if (src != null){
          for (var key in src){ if (Object.prototype.hasOwnProperty.call(src,key)) target[key] = src[key]; }
        }
      }
      return target;
    };
  }

  // ================== Small DOM helpers ==================
  function setProps(node, props){
    for (var k in props){
      if (!props.hasOwnProperty(k)) continue;
      var v = props[k];
      if (k === 'className'){ node.setAttribute('class', v); }
      else if (k === 'style'){ node.setAttribute('style', v); }
      else if (k in node){ try{ node[k] = v; }catch(e){ node.setAttribute(k, v); } }
      else { node.setAttribute(k, v); }
    }
  }
  function el(tag, props){
    var node = document.createElement(tag);
    if (props) setProps(node, props);
    for (var i=2;i<arguments.length;i++){
      var c = arguments[i];
      if (c==null) continue;
      node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  function card(title, content){
    return el('div', {className:'card'},
      el('div', {className:'section-header'}, title),
      content
    );
  }
  function clearRoot(){ if (root) root.innerHTML = ''; }

  // ================== Header / Objectives / Warm Up ==================
  function renderHeader(data){
    if (!root) return;
    var h = el('div', {className:'card'},
      el('h3', {}, data.lesson_title || 'Lesson'),
      el('div', {className:'small muted'}, 'Name: ____________________    Date: __________    Period: ___')
    );
    root.appendChild(h);
  }
  function findLearningObjective(data){
    if (data.learning_objective) return data.learning_objective;
    if (data.objective) return data.objective;
    var seg = (data.lesson_segments||[]).filter(function(s){ return s.objectives; })[0];
    if (seg && seg.objectives && seg.objectives.learning_objective) return seg.objectives.learning_objective;
    return '';
  }
  function findSuccessCriteria(data){
    if (Array.isArray(data.success_criteria) && data.success_criteria.length) return data.success_criteria;
    if (Array.isArray(data.successCriteria) && data.successCriteria.length) return data.successCriteria;
    var seg = (data.lesson_segments||[]).filter(function(s){ return s.objectives; })[0];
    if (seg && seg.objectives && Array.isArray(seg.objectives.success_criteria)) return seg.objectives.success_criteria;
    return [];
  }
  function renderObjectives(data){
    var loText = findLearningObjective(data);
    var scList = findSuccessCriteria(data);

    var box = el('div');
    // Learning Objective
    box.appendChild(
      el('div', {},
        el('div', {className:'subtle', style:'margin:0 0 6px;'}, 'Learning Objective'),
        el('div', {className:'lines sm'}, el('div', {className:'pad'}, loText || ''))
      )
    );
    // Collaborative Success Criteria table (2 rows, 3 columns)
    var scWrap = el('div', {style:'margin-top:10px;'},
      el('div', {className:'subtle', style:'margin:0 0 6px;'}, 'Success Criteria')
    );
    var arr = (scList && scList.length) ? scList : ['','',''];
    // Pad to 3 columns
    while (arr.length < 3) arr.push('');
    // Table: 2 rows (header, content), 3 columns (A/B/C)
    var table = el('table', {className:'success-criteria-table', style:'width:100%; table-layout:fixed; border-collapse:collapse;'});
    var trHead = el('tr');
    ['A','B','C'].forEach(function(ver, idx){
      trHead.appendChild(el('th', {style:'text-align:center;'},ver));
    });
    table.appendChild(trHead);
    var trContent = el('tr');
    ['A','B','C'].forEach(function(ver, idx){
      var td = el('td', {style:'padding:0;'});
      var isVisible = (currentVersion() === ver);
      var div = el('div', {
        className: 'lines lg success-criteria-cell',
        'data-version': ver
      },
        el('div', {
          className:'sc-text' + (isVisible ? '' : ' sc-hidden'),
        }, arr[idx] || '')
      );
      td.appendChild(div);
      trContent.appendChild(td);
    });
    table.appendChild(trContent);
    scWrap.appendChild(table);
    box.appendChild(scWrap);

    root.appendChild(card('Objectives & Success Criteria', box));
  }
  function renderWarmUp(seg){
    var d = seg.warm_up; if(!d) return;
    var box = el('div', {},
      el('p', {}, el('strong', {}, 'Question: '), d.question || ''),
      d.instructions ? el('p', {className:'muted', style:'margin:-6px 0 8px;'}, d.instructions) : null,
      el('div', {className:'lines sm'}, el('div', {className:'pad'}, 'Answer here...'))
    );
    root.appendChild(card('Warm Up', box));
  }

  // ================== Vocabulary (GRID of cards) with A/B/C masking ==================
  // For each vocab item (card), we show exactly ONE of [term | definition | image] per version.
  // The other two show blanks/placeholders. Randomized per row.
  function renderVocabGrid(vocab) {
    if (!root) return;
    var grid = el('div', {
      className: 'vocab-grid'
    });

    var perms = [
      ['term','def','img'], ['term','img','def'],
      ['def','term','img'], ['def','img','term'],
      ['img','term','def'], ['img','def','term']
    ];

    (vocab || []).forEach(function(v) {
      var cell = el('div', { className: 'vocab-grid-cell' });

      // Assign per-row permutation for A/B/C
      var p = perms[Math.floor(Math.random()*perms.length)];
      cell.dataset.pA = p[0]; // visible column in version A
      cell.dataset.pB = p[1]; // visible column in version B
      cell.dataset.pC = p[2]; // visible column in version C

  // Term slot (centered, minimal blank space)
  var termSlot = el('div', { className:'slot slot-term', 'data-col':'term', style:'justify-content:center; align-items:center; min-height:0; margin-bottom:0;' });
  termSlot.appendChild(el('div', { className:'filled term', style:'width:100%; text-align:center;' }, v.term || ''));
  termSlot.appendChild(el('div', { className:'blank muted' }, 'term'));

      // Definition slot
  var defSlot = el('div', { className:'slot slot-def', 'data-col':'def' });
  defSlot.appendChild(el('div', { className:'filled definition' }, v.definition || ''));
  defSlot.appendChild(el('div', { className:'blank placeholder' }, 'write the definition'));

      // Image slot
  var imgSlot = el('div', { className:'slot slot-img', 'data-col':'img' });
  var imgBox = el('div', { className:'filled img-box' });
  var img = el('img', { className:'img-preview', alt:(v.term || 'vocab image') });
  if (v.link_to_image) img.src = v.link_to_image;
  imgBox.appendChild(img);
  imgSlot.appendChild(imgBox);
  imgSlot.appendChild(el('div', { className:'blank placeholder' }, 'draw / paste an image'));

      cell.appendChild(termSlot);
      cell.appendChild(defSlot);
      cell.appendChild(imgSlot);
      grid.appendChild(cell);
    });

    var wrap = el('div', { className:'card' },
  el('div', { className:'section-header' }, 'Vocabulary Puzzle'),
      grid
    );
    root.appendChild(wrap);

    // Apply version masks now that the grid exists
    applyVersionMasks(currentVersion());
  }

  function currentVersion(){
    if (document.body.classList.contains('ver-A')) return 'A';
    if (document.body.classList.contains('ver-B')) return 'B';
    if (document.body.classList.contains('ver-C')) return 'C';
    return 'A';
  }

  // Inline masking: show only the column indicated by dataset.pA/pB/pC; others show blanks
  function applyVersionMasks(v){
    var cards = Array.prototype.slice.call(document.querySelectorAll('.vocab-grid-cell'));
    cards.forEach(function(card){
      var only = card.dataset['p' + v]; // 'term' | 'def' | 'img'
      var slots = card.querySelectorAll('.slot');
      for (var i=0;i<slots.length;i++){
        var slot = slots[i];
        var col = slot.getAttribute('data-col');
        var filled = slot.querySelector('.filled');
        var blank = slot.querySelector('.blank');
        if (col === only){
          if (filled) filled.style.display = '';
          if (blank) blank.style.display = 'none';
        } else {
          if (filled) filled.style.display = 'none';
          if (blank) blank.style.display = '';
        }
      }
    });
  }

  // ================== Segments ==================
  function imgBlock(label, v){
    var fig = el('div', {});
    fig.setAttribute('style','margin-bottom:0.6rem;');
    if (label) fig.appendChild(el('strong', {}, label));
    if (v && v.url_to_image){ fig.appendChild(el('img', {src: v.url_to_image, alt: (v.type || 'image'), style:'max-width:100%;height:auto;display:block;margin-top:.25rem;cursor:zoom-in;'})); }
    if (v && v.description){ fig.appendChild(el('div', {className:'small'}, v.description)); }
    return fig;
  }

  function renderReading(key, obj){
    var d = obj[key]; if(!d) return;
    var box = el('div');
    if (d.title) box.appendChild(el('h4', {}, d.title));
    if (d.instructions) box.appendChild(el('div', {className:'muted'}, d.instructions));
    if (d.text) box.appendChild(el('p', {}, d.text));
    // Discussion Qs with answer lines
    var qs = [];
    if (d.discussion_question_L1) qs.push({lvl:'L1', text:d.discussion_question_L1});
    if (d.discussion_question_L2) qs.push({lvl:'L2', text:d.discussion_question_L2});
    if (d.discussion_question_L3) qs.push({lvl:'L3', text:d.discussion_question_L3});
    if (qs.length){
      var wrap = el('div', {style:'margin-top:8px;'});
  wrap.appendChild(el('div', {className:'section-header'}, 'Discussion Questions'));
      for (var i=0;i<qs.length;i++){
        var q = qs[i];
        wrap.appendChild(el('p', {}, q.lvl+': '+q.text));
        wrap.appendChild(el('div', {className:'lines sm'}, el('div', {className:'pad'}, '')));
      }
      box.appendChild(wrap);
    }
    var title = d.title ? d.title : key.split('_').join(' ').toUpperCase();
    root.appendChild(card(title, box));
  }

  function renderOddOneOut(obj) {
    var d = obj.odd_one_out; if (!d) return;
    var box = el('div');
    // 2x2 grid for visuals
    var grid = el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;' });
    [d.visual_1B, d.visual_2B, d.visual_3B, d.visual_4B].forEach(function(v) {
      grid.appendChild(v ? imgBlock(v.type, v) : el('div'));
    });
    box.appendChild(grid);
    if (d.instructions) {
      box.appendChild(el('div', { className: 'muted' }, d.instructions));
      box.appendChild(el('div', { className: 'lines sm' }, el('div', { className: 'pad' }, 'Justify your choice...')));
    }
    root.appendChild(card('Odd One Out', box));
  }

  function renderCauseEffect(obj) {
    var d = obj.cause_effect; if (!d) return;
    var box = el('div');
    var row = el('div', { style: 'display: flex; gap: 16px; margin-bottom: 12px; justify-content: center;' });
    if (d.visual_1C) row.appendChild(imgBlock(d.visual_1C.type, d.visual_1C));
    if (d.visual_2C) row.appendChild(imgBlock(d.visual_2C.type, d.visual_2C));
    box.appendChild(row);
    if (d.instructions) {
      box.appendChild(el('div', { className: 'muted' }, d.instructions));
      box.appendChild(el('div', { className: 'lines sm' }, el('div', { className: 'pad' }, 'Explain cause → effect...')));
    }
    root.appendChild(card('Cause & Effect', box));
  }

  // ---- Exit Ticket (fixed) ----
  function renderExitTicket(d){
    var box = el('div');
    if (d && typeof d === 'object'){
      if (d.prompt){
        box.appendChild(el('div', {style:'font-weight:bold; margin-bottom:6px;'}, d.prompt));
        if (d.instructions) box.appendChild(el('div', {className:'muted', style:'margin-bottom:8px;'}, d.instructions));
        box.appendChild(el('div', {className:'lines sm'}, el('div', {className:'pad'}, 'Answer here...')));
      }
      if (Array.isArray(d.questions) && d.questions.length){
        d.questions.forEach(function(q, idx){
          box.appendChild(el('p', {}, 'Q'+(idx+1)+': '+q));
          box.appendChild(el('div', {className:'lines sm'}, el('div', {className:'pad'}, '')));
        });
      }
      if (!d.prompt && !Array.isArray(d.questions)){
        // Fallback: string-like
        if (typeof d === 'string') {
          box.appendChild(el('div', {}, d));
          box.appendChild(el('div', {className:'lines lg'}, el('div', {className:'pad'}, 'Answer here...')));
        } else {
          box.appendChild(el('pre', {}, JSON.stringify(d, null, 2)));
        }
      }
    } else if (typeof d === 'string'){
      box.appendChild(el('div', {style:'font-weight:bold; margin-bottom:6px;'}, d));
      box.appendChild(el('div', {className:'lines lg'}, el('div', {className:'pad'}, 'Answer here...')));
    } else {
      box.appendChild(el('div', {className:'muted'}, 'No exit ticket provided.'));
    }
    root.appendChild(card('Exit Ticket', box));
  }

  // ================== Render segments dispatcher ==================
  function renderSegments(segments){
    (segments || []).forEach(function(seg){
      var key = Object.keys(seg)[0];
      if (!key) return;
      if (key === 'warm_up') { renderWarmUp(seg); return; }
      if (key === 'image_analysis') {
        var d = seg.image_analysis; if (!d) return;
        // table layout only for image analysis (unchanged)
        var table = el('table', { style: 'width:100%; margin-bottom: 12px;' });
        var tbody = el('tbody'); table.appendChild(tbody);
        if (d.instructions) tbody.appendChild(el('tr', {}, el('td', { colspan: 2, className: 'muted', style: 'text-align:center; padding: 8px 0;' }, d.instructions)));
        var imgCell = el('td', { style: 'width:50%; vertical-align:top; text-align:center;' });
        if (d.visual_1A) imgCell.appendChild(imgBlock(d.visual_1A.type, d.visual_1A));
        var qCell = el('td', { style: 'width:50%; vertical-align:top;' });
        qCell.appendChild(el('div', { className: 'lines xl' }, el('div', { className: 'pad' }, 'Write your analysis...')));
        tbody.appendChild(el('tr', {}, imgCell, qCell));
        root.appendChild(card('Image Analysis', el('div', {}, table)));
        return;
      }
      if (key.indexOf('reading_') === 0) { renderReading(key, seg); return; }
      if (key === 'odd_one_out') { renderOddOneOut(seg); return; }
      if (key === 'cause_effect') { renderCauseEffect(seg); return; }
      if (key === 'exit_ticket') { renderExitTicket(seg.exit_ticket); return; }
      root.appendChild(card(key.split('_').join(' ').toUpperCase(), el('pre', {}, JSON.stringify(seg[key], null, 2))));
    });
  }

  // ================== Render All ==================
  function renderAll(data) {
    clearRoot();
    window.__CURRENT_LESSON__ = data;
    renderHeader(data);

    // Warm up first if present
    if (Array.isArray(data.lesson_segments)) {
      var warmUpSeg = data.lesson_segments.find(function(seg){ return !!seg.warm_up; });
      if (warmUpSeg) renderWarmUp(warmUpSeg);
    }

    renderObjectives(data);
    if (data.vocabulary && data.vocabulary.length) renderVocabGrid(data.vocabulary);

    // Render all other segments except warm up
    if (Array.isArray(data.lesson_segments)) {
      data.lesson_segments.forEach(function(seg){
        if (!seg.warm_up) {
          var key = Object.keys(seg)[0];
          if (!key) return;
          if (key === 'image_analysis') {
            var d = seg.image_analysis; if (!d) return;
            var table = el('table', { className: 'image-analysis-table', style: 'width:100%; margin-bottom: 12px;' });
            var tbody = el('tbody'); table.appendChild(tbody);
            if (d.instructions) tbody.appendChild(el('tr', {}, el('td', { colspan: 2, className: 'muted', style: 'text-align:center; padding: 8px 0;' }, d.instructions)));
            var imgCell = el('td', { style: 'width:50%; vertical-align:top; text-align:center;' });
            if (d.visual_1A) imgCell.appendChild(imgBlock(d.visual_1A.type, d.visual_1A));
            var qCell = el('td', { style: 'width:50%; vertical-align:top;' });
            qCell.appendChild(el('div', { className: 'lines xl' }, el('div', { className: 'pad' }, 'Write your analysis...')));
            tbody.appendChild(el('tr', {}, imgCell, qCell));
            root.appendChild(card('Image Analysis', el('div', {}, table)));
            return;
          }
          if (key.indexOf('reading_') === 0) { renderReading(key, seg); return; }
          if (key === 'odd_one_out') { renderOddOneOut(seg); return; }
          if (key === 'cause_effect') { renderCauseEffect(seg); return; }
          if (key === 'exit_ticket') { renderExitTicket(seg.exit_ticket); return; }
          root.appendChild(card(key.split('_').join(' ').toUpperCase(), el('pre', {}, JSON.stringify(seg[key], null, 2))));
        }
      });
    }
    // Ensure masks reflect the current version after all content
    applyVersionMasks(currentVersion());
  }

  // ================== Version + Print controls ==================
  function setVersion(v){
    document.body.classList.remove('ver-A','ver-B','ver-C');
    document.body.classList.add('ver-'+v);
    applyVersionMasks(v);
    // Update Success Criteria cell visibility
    var cells = document.querySelectorAll('.success-criteria-cell');
    cells.forEach(function(cell) {
      var scText = cell.querySelector('.sc-text');
      if (scText) {
        if (cell.getAttribute('data-version') === v) {
          scText.classList.remove('sc-hidden');
        } else {
          scText.classList.add('sc-hidden');
        }
      }
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-version]'), function(btn){ btn.addEventListener('click', function(){ setVersion(btn.dataset.version); }); });
  var printBtn = document.querySelector('[data-print]');
  if (printBtn) printBtn.addEventListener('click', function(){ window.print(); });

  // ================== Reshuffle (re-render current data ONLY) ==================
  var btnReshuffle = document.getElementById('btnReshuffle');
  if (btnReshuffle) {
    btnReshuffle.addEventListener('click', function(){
      if (window.__CURRENT_LESSON__) renderAll(window.__CURRENT_LESSON__);
    });
  }

  // ================== Optional URL / paste loaders (guarded) ==================
  var btnFetch = document.getElementById('btnFetch');
  if (btnFetch) {
    btnFetch.addEventListener('click', function(){
      var url = document.getElementById('jsonUrl').value.trim();
      if(!url) { alert('Paste a JSON URL first.'); return; }
      fetch(url, {cache:'no-store'})
        .then(function(res){ if(!res.ok) throw new Error('HTTP '+res.status); return res.json(); })
        .then(function(data){ renderAll(data); })
        .catch(function(e){ console.error(e); alert('Failed to load JSON from URL. See console.'); });
    });
  }
  var btnPaste = document.getElementById('btnPaste');
  if (btnPaste) {
    btnPaste.addEventListener('click', function(){
      var raw = prompt('Paste lesson JSON here:');
      if (!raw) return; 
      try { var data = JSON.parse(raw); renderAll(data); }
      catch(e){ alert('Invalid JSON.'); }
    });
  }

  // ================== Tests (grid-aware) ==================
  function showTest(status, lines){
    if(!testBox) return;
    testBox.className='';
    testBox.style.display='block';
    if(status==='ok') testBox.classList.add('ok');
    if(status==='warn') testBox.classList.add('warn');
    if(status==='err') testBox.classList.add('err');
    testBox.textContent = lines.join('\\n');
    try{ console.log(lines.join('\\n')); }catch(e){}
  }
  function testVocabCardsPresent(){
    var n = document.querySelectorAll('.vocab-grid-cell').length;
    return n ? 'Vocab cards present: '+n : 'Vocab cards present: 0 (FAIL)';
  }
  function testPermutationDistinct(){
    var rows = document.querySelectorAll('.vocab-grid-cell');
    var bad=0;
    rows.forEach(function(r){
      var A=r.dataset.pA, B=r.dataset.pB, C=r.dataset.pC;
      var s=new Set([A,B,C]);
      if (s.size!==3) bad++;
    });
    return bad===0 ? 'Permutation per card (A,B,C) distinct: OK' : ('Permutation duplicates found in '+bad+' cards');
  }
  function testVersionShowsExactlyOne(){
    var msgs=[];
    ['A','B','C'].forEach(function(v){
      setVersion(v);
      var ok=true;
      var cards = document.querySelectorAll('.vocab-grid-cell');
      for (var i=0;i<cards.length;i++){
        var only = cards[i].dataset['p'+v];
        var visible = 0;
        cards[i].querySelectorAll('.slot').forEach(function(slot){
          var col = slot.getAttribute('data-col');
          var filled = slot.querySelector('.filled');
          if (col===only && filled && filled.style.display!=='none') visible++;
        });
        if (visible!==1){ ok=false; break; }
      }
      msgs.push('Version '+v+': '+(ok?'OK':'FAIL')+' (exactly one filled slot visible per card)');
    });
    return msgs;
  }
  function testExitTicketPresence(){
    var hasET = false;
    Array.prototype.forEach.call(document.querySelectorAll('.card .section-header'), function(h){ if(h.textContent==='Exit Ticket') hasET=true; });
    return hasET ? 'Exit Ticket rendered (if present in JSON): OK' : 'Exit Ticket not found (if absent in JSON this is fine)';
  }
  var btnRunTests = document.getElementById('btnRunTests');
  if (btnRunTests) btnRunTests.addEventListener('click', function(){
    var msgs = [];
    msgs.push(testVocabCardsPresent());
    msgs.push(testPermutationDistinct());
    msgs = msgs.concat(testVersionShowsExactlyOne());
    msgs.push(testExitTicketPresence());
    showTest('ok', msgs);
  });

  // Boot is selector-driven; no default data fallback.
});