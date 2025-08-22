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

  // On Load Lesson, fetch and render lesson
  if (btnLoadSupabase) btnLoadSupabase.addEventListener('click', async function() {
    const topicId = topicSelect && topicSelect.value;
    if (!topicId) { alert('Select a topic first.'); return; }
    const { data: topic, error } = await supa
      .from('lesson_outlines_public')
      .select('lesson_outline')
      .eq('id', topicId)
      .single();
    let lessonData = topic && topic.lesson_outline;
    if (error || !lessonData) {
      alert('Failed to load lesson from Supabase.');
      return;
    }
    if (typeof lessonData === 'string') {
      try { lessonData = JSON.parse(lessonData); } catch {}
    }
    if (!lessonData) { alert('Lesson data is empty.'); return; }
    renderAll(lessonData);
  });

  // Initial load
  loadContents();

  // Small DOM helpers
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
    // Success Criteria as placeholder lines (not text)
    var scWrap = el('div', {style:'margin-top:10px;'},
      el('div', {className:'subtle', style:'margin:0 0 6px;'}, 'Success Criteria')
    );
    var arr = (scList && scList.length) ? scList : [''];
    arr.forEach(function(){
      scWrap.appendChild(el('div', {className:'lines sm'}, el('div', {className:'pad'}, '')));
    });
    box.appendChild(scWrap);
    root.appendChild(card('Objectives & Success Criteria', box));
  }
  function renderWarmUp(seg){
    var d = seg.warm_up; if(!d) return;
    var box = el('div', {},
      el('p', {}, el('strong', {}, 'Question: '), d.question || ''),
      d.instructions ? el('p', {className:'muted', style:'margin:-6px 0 8px;'}, d.instructions) : null,
      el('div', {className:'lines md'}, el('div', {className:'pad'}, 'Answer here...'))
    );
    root.appendChild(card('Warm Up', box));
  }

  // ================== Vocabulary (GRID of cards, no masking) ==================
  function renderVocabGrid(vocab) {
    if (!root) return;
    var grid = el('div', { className: 'vocab-grid' });
    (vocab || []).forEach(function(v) {
      var cell = el('div', { className: 'vocab-grid-cell' });
      // Term slot
      var termSlot = el('div', { className:'slot slot-term', 'data-col':'term', style:'justify-content:center; align-items:center; min-height:0; margin-bottom:0;' });
      termSlot.appendChild(el('div', { className:'filled term', style:'width:100%; text-align:center;' }, v.term || ''));
      // Definition slot (always blank placeholder)
      var defSlot = el('div', { className:'slot slot-def', 'data-col':'def' });
      defSlot.appendChild(el('div', { className:'blank placeholder' }, 'write the definition'));
      // Image slot
      var imgSlot = el('div', { className:'slot slot-img', 'data-col':'img' });
      var imgBox = el('div', { className:'filled img-box' });
      var img = el('img', { className:'img-preview', alt:(v.term || 'vocab image') });
      if (v.hasOwnProperty('link_to_image') && v.link_to_image) {
        img.src = v.link_to_image;
        img.style.display = '';
      } else {
        img.style.display = 'none';
      }
      imgBox.appendChild(img);
      imgSlot.appendChild(imgBox);
      imgSlot.appendChild(el('div', { className:'blank placeholder' }, 'draw image'));
      cell.appendChild(termSlot);
      cell.appendChild(defSlot);
      cell.appendChild(imgSlot);
      grid.appendChild(cell);
    });
    var wrap = el('div', { className:'card' },
      el('div', { className:'section-header' }, 'Vocabulary'),
      grid
    );
    root.appendChild(wrap);
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

  function renderCompareAndCause(obj) {
    // Render both compare_contrast and cause_effect if present
    if (obj.compare_contrast) {
      var d = obj.compare_contrast;
      var box = el('div');
      var row = el('div', { style: 'display: flex; gap: 16px; margin-bottom: 12px; justify-content: center;' });
      if (d.visual_1C) row.appendChild(imgBlock(d.visual_1C.type, d.visual_1C));
      if (d.visual_2C) row.appendChild(imgBlock(d.visual_2C.type, d.visual_2C));
      box.appendChild(row);
      if (d.instructions) {
        box.appendChild(el('div', { className: 'muted' }, d.instructions));
        box.appendChild(el('div', { className: 'lines md' }, el('div', { className: 'pad' }, 'Compare and contrast...')));
      }
      root.appendChild(card('Compare & Contrast', box));
    }
    if (obj.cause_effect) {
      var d = obj.cause_effect;
      var box = el('div');
      var row = el('div', { style: 'display: flex; gap: 16px; margin-bottom: 12px; justify-content: center;' });
      if (d.visual_1C) row.appendChild(imgBlock(d.visual_1C.type, d.visual_1C));
      if (d.visual_2C) row.appendChild(imgBlock(d.visual_2C.type, d.visual_2C));
      box.appendChild(row);
      if (d.instructions) {
        box.appendChild(el('div', { className: 'muted' }, d.instructions));
        box.appendChild(el('div', { className: 'lines md' }, el('div', { className: 'pad' }, 'Explain cause → effect...')));
      }
      root.appendChild(card('Cause & Effect', box));
    }
  }

  // ---- Exit Ticket (fixed) ----
  function renderExitTicket(d){
    var box = el('div');
    if (d && typeof d === 'object'){
      if (d.prompt){
        box.appendChild(el('div', {style:'font-weight:bold; margin-bottom:6px;'}, d.prompt));
        if (d.instructions) box.appendChild(el('div', {className:'muted', style:'margin-bottom:8px;'}, d.instructions));
        box.appendChild(el('div', {className:'lines md'}, el('div', {className:'pad'}, 'Answer here...')));
      }
      if (Array.isArray(d.questions) && d.questions.length){
        d.questions.forEach(function(q, idx){
          box.appendChild(el('p', {}, 'Q'+(idx+1)+': '+q));
          box.appendChild(el('div', {className:'lines md'}, el('div', {className:'pad'}, '')));
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
        // Two rows: Before Vocab and After Vocab
        var beforeDiv = el('div', { style: 'margin-bottom: 18px;' },
          el('div', { style: 'font-weight: bold; margin-bottom: 4px;' }, 'Before Vocab'),
          el('div', { className: 'lines md' }, el('div', { className: 'pad' }, ''))
        );
        var afterDiv = el('div', {},
          el('div', { style: 'font-weight: bold; margin-bottom: 4px;' }, 'After Vocab'),
          el('div', { className: 'lines md' }, el('div', { className: 'pad' }, ''))
        );
        qCell.appendChild(beforeDiv);
        qCell.appendChild(afterDiv);
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

  // ================== Wordsearch Generator ==================
  function normalizeText(s) {
    s = (s || '').replace(/[’‘]/g, "'").toUpperCase();
    return s.split('').filter(ch => ch >= 'A' && ch <= 'Z').join('');
  }

  const rareLetters = 'ZQJKV';
  function generateWordsearch(vocab) {
    const SEPARATOR = 'X';
    // Build segments: TERM + X + DEFINITION + [3-17 random ZQJKV], then shuffle order
    let segments = (vocab || []).map(item => {
      const termNorm = normalizeText(item.term);
      const defNorm = normalizeText(item.definition || item.def || '');
      // Add 3-17 random rare letters after each block
      const nRare = 3 + Math.floor(Math.random() * 15); // 3-17
      let rareBlock = '';
      for (let i = 0; i < nRare; i++) {
        rareBlock += rareLetters[Math.floor(Math.random() * rareLetters.length)];
      }
      return {
        label: `${item.term} : ${item.definition || item.def || ''}`,
        text: termNorm + SEPARATOR + defNorm + rareBlock
      };
    });
    // Fisher-Yates shuffle
    for (let i = segments.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [segments[i], segments[j]] = [segments[j], segments[i]];
    }
    // Dynamically size grid so that there is no more than one block of random letters at the end
    const fullText = segments.map(seg => seg.text).join('');
    let nchars = fullText.length;
    let minSide = Math.max(18, Math.ceil(Math.sqrt(nchars)));
    let bestSide = minSide;
    let bestCoords = [];
    let bestExtra = Infinity;
    // Try grid sizes from minSide up to minSide+5 to minimize trailing empty space
    for (let trySide = minSide; trySide <= minSide + 5; trySide++) {
      let coords = [];
      for (let r = 0; r < trySide; r++) {
        if (r % 2 === 0) {
          for (let c = 0; c < trySide; c++) coords.push([r, c]);
        } else {
          for (let c = trySide - 1; c >= 0; c--) coords.push([r, c]);
        }
      }
      let extra = coords.length - nchars;
      if (extra >= 0 && extra < bestExtra) {
        bestSide = trySide;
        bestCoords = coords;
        bestExtra = extra;
        if (extra <= segments[0].text.length) break; // No more than one block of random letters
      }
    }
    let side = bestSide;
    let coords = bestCoords;
    // Fill grid
    let grid = Array.from({ length: side }, () => Array(side).fill(''));
    let posIdx = 0;
    let answerKey = [];
    for (const seg of segments) {
      const startIdx = posIdx;
      for (const ch of seg.text) {
        const [r, c] = coords[posIdx];
        grid[r][c] = ch;
        posIdx++;
      }
      const endIdx = posIdx - 1;
      const [sr, sc] = coords[startIdx];
      const [er, ec] = coords[endIdx];
      answerKey.push({
        label: seg.label,
        start: { row: sr, col: sc },
        end: { row: er, col: ec },
        length: seg.text.length
      });
    }
    // Fill rest with rare letters to match the rest of the grid style
    for (let i = posIdx; i < coords.length; i++) {
      const [r, c] = coords[i];
      grid[r][c] = rareLetters[Math.floor(Math.random() * rareLetters.length)];
    }
    return { grid, side, answerKey, separator: SEPARATOR };
  }

  function renderWordsearchCard(vocab) {
    const { grid, side, answerKey, separator } = generateWordsearch(vocab);
    // Render grid as HTML table
    const table = document.createElement('table');
    table.className = 'wordsearch-table';
    for (let r = 0; r < side; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < side; c++) {
        const td = document.createElement('td');
        td.textContent = grid[r][c];
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
  // Card
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  const header = document.createElement('div');
  header.className = 'section-header';
  header.textContent = 'Wordsearch: Terms Embedded with Definitions';
  cardDiv.appendChild(header);
  cardDiv.appendChild(table);
  return cardDiv;
  }

  // ================== Render All ==================
  function renderAll(data) {
    clearRoot();
    window.__CURRENT_LESSON__ = data;
    renderHeader(data); // Name card
    // Gather segments by type for ordered rendering
    var segments = Array.isArray(data.lesson_segments) ? data.lesson_segments : [];
    var warmUpSeg = segments.find(seg => seg.warm_up);
    var imageAnalysisSeg = segments.find(seg => seg.image_analysis);
    var oddOneOutSeg = segments.find(seg => seg.odd_one_out);
  var compareAndCauseSegs = segments.filter(seg => seg.compare_contrast || seg.cause_effect);
    var reading1 = segments.find(seg => Object.keys(seg)[0] === 'reading_1');
    var reading2 = segments.find(seg => Object.keys(seg)[0] === 'reading_2');
    var reading3 = segments.find(seg => Object.keys(seg)[0] === 'reading_3');
    var exitTicketSeg = segments.find(seg => seg.exit_ticket);
    // 1. Warm up
    if (warmUpSeg) renderWarmUp(warmUpSeg);
    // 2. LO/SC
    renderObjectives(data);
    // 3. Image analysis
    if (imageAnalysisSeg) {
      var d = imageAnalysisSeg.image_analysis;
      if (d) {
        var table = el('table', { className: 'image-analysis-table', style: 'width:100%; margin-bottom: 12px;' });
        var tbody = el('tbody'); table.appendChild(tbody);
        if (d.instructions) tbody.appendChild(el('tr', {}, el('td', { colspan: 2, className: 'muted', style: 'text-align:center; padding: 8px 0;' }, d.instructions)));
        var imgCell = el('td', { style: 'width:50%; vertical-align:top; text-align:center;' });
        if (d.visual_1A) imgCell.appendChild(imgBlock(d.visual_1A.type, d.visual_1A));
        var qCell = el('td', { style: 'width:50%; vertical-align:top;' });
        var beforeDiv = el('div', { style: 'margin-bottom: 18px;' },
          el('div', { style: 'font-weight: bold; margin-bottom: 4px;' }, 'Before Vocab'),
          el('div', { className: 'lines md' }, el('div', { className: 'pad' }, ''))
        );
        var afterDiv = el('div', {},
          el('div', { style: 'font-weight: bold; margin-bottom: 4px;' }, 'After Vocab'),
          el('div', { className: 'lines md' }, el('div', { className: 'pad' }, ''))
        );
        qCell.appendChild(beforeDiv);
        qCell.appendChild(afterDiv);
        tbody.appendChild(el('tr', {}, imgCell, qCell));
        root.appendChild(card('Image Analysis', el('div', {}, table)));
      }
    }
    // 4. Vocab
    if (data.vocabulary && data.vocabulary.length) renderVocabGrid(data.vocabulary);
    // 5. Reading 1
    if (reading1) renderReading('reading_1', reading1);
    // 6. Odd One Out
    if (oddOneOutSeg) renderOddOneOut(oddOneOutSeg);
    // 7. Reading 2
    if (reading2) renderReading('reading_2', reading2);
  // 8. Compare & Contrast and/or Cause and Effect
  compareAndCauseSegs.forEach(renderCompareAndCause);
    // 9. Reading 3
    if (reading3) renderReading('reading_3', reading3);
    // 10. Exit Ticket
    if (exitTicketSeg) renderExitTicket(exitTicketSeg.exit_ticket);
    // 11. Wordsearch (after exit ticket)
    if (data.vocabulary && data.vocabulary.length) {
      root.appendChild(renderWordsearchCard(data.vocabulary));
    }
  }

  // Boot is selector-driven; no default data fallback.
});
