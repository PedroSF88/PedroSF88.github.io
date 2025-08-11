;(async function() {
  "use strict";
  /**
   * Interactive lesson viewer powered by Supabase.
   */

  // Read Supabase credentials from globals (index.html) with safe fallbacks

  import { createClient } from '@supabase/supabase-js'
  const supabaseUrl = SUPABASE_URL_PLACEHOLDER
  const supabaseKey = process.env.SUPABASE_ANON_KEY_PLACEHOLDER
  const supabase = createClient(supabaseUrl, supabaseKey)

  if (!window.supabase) {
    console.error('Supabase client library not found. Include @supabase/supabase-js before this script.');
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // DOM refs
  const unitMenu   = document.getElementById('unitMenu');
  const topicMenu  = document.getElementById('topicMenu');
  const lessonMenu = document.getElementById('lessonMenu');
  const cardList   = document.getElementById('cardList');

  // Map `${topic_id}|${visual_id}` -> link_to_image
  let visualsMap = {};

  function clear(...els) { els.forEach(e => e && e.replaceChildren()); }

  // Normalize matched_teks to an array of objects
  function normalizeTeks(matched) {
    if (!matched) return [];
    if (Array.isArray(matched)) return matched.filter(x => x && typeof x === 'object');
    if (typeof matched === 'object') return [matched];
    if (typeof matched === 'string') {
      try {
        const parsed = JSON.parse(matched);
        if (Array.isArray(parsed)) return parsed.filter(x => x && typeof x === 'object');
        if (parsed && typeof parsed === 'object') return [parsed];
      } catch (_) {}
    }
    return [];
  }

  // Render TEKS items (array of objects like {teks, text, uuid})
  function renderTEKSList(items) {
    if (!items.length) return '';
    let html = '<ul class="mb-0">';
    items.forEach(it => {
      const code = it.teks ? `<strong>${it.teks}</strong> ` : '';
      const text = it.text ? `${it.text}` : '';
      const uuid = it.uuid ? `<div class="text-muted small">UUID: ${it.uuid}</div>` : '';
      html += `<li>${code}${text}${uuid}</li>`;
    });
    html += '</ul>';
    return html;
  }

  // Resolve image URL from visuals_map or the segment object
  function resolveImg(topic, visualKey, obj) {
    let url = null;
    if (topic && topic.id) url = visualsMap[`${topic.id}|${visualKey}`] || null;
    if (!url && obj && obj.url_to_image && obj.url_to_image !== '@image_placeholder') url = obj.url_to_image;
    return url;
  }

  async function loadData() {
    try {
      // Units
      const { data: units, error: unitErr } = await supabase
        .from('curriculum_units')
        .select('*')
        .order('unit_number', { ascending: true });
      if (unitErr) throw unitErr;

      // Topics
      const { data: topics, error: topicErr } = await supabase
        .from('topic_teks')
        .select('*');
      if (topicErr) throw topicErr;

      // Visuals
      const { data: visuals, error: visualsErr } = await supabase
        .from('visuals_data')
        .select('*');
      if (visualsErr) throw visualsErr;

      visualsMap = {};
      (visuals || []).forEach(v => {
        const key = `${v.topic_id}|${v.visual_id}`;
        visualsMap[key] = v.link_to_image;
      });

      // Map units → topics
      const unitMap = {};
      units.forEach(u => { unitMap[u.id] = { unit: u, topics: [] }; });
      topics.forEach(t => {
        const bin = unitMap[t.unit_id];
        if (bin) bin.topics.push(t);
      });

      buildUnitMenu(unitMap);
    } catch (err) {
      console.error('Error loading curriculum data:', err);
      clear(cardList);
      const p = document.createElement('p');
      p.className = 'text-danger';
      p.textContent = 'Failed to load lessons. Please check your Supabase configuration.';
      cardList.append(p);
    }
  }

  function buildUnitMenu(unitMap) {
    clear(unitMenu, topicMenu, lessonMenu, cardList);
    Object.values(unitMap).forEach(({ unit, topics }) => {
      const btn = document.createElement('button');
      btn.textContent = unit.unit_title || unit.id;
      btn.className = 'btn btn-outline-primary w-100 mb-2';
      btn.onclick = () => selectUnit(unit, topics);
      unitMenu.append(btn);
    });
  }

  function selectUnit(unit, topics) {
    clear(topicMenu, lessonMenu, cardList);
    topics.forEach(topic => {
      const btn = document.createElement('button');
      btn.textContent = topic.topic_title || topic.id;
      btn.className = 'btn btn-outline-secondary w-100 mb-2';
      btn.onclick = () => renderLesson(topic);
      topicMenu.append(btn);
    });
  }

  function renderLesson(topic) {
    clear(cardList);

    let outline = topic.lesson_outline;
    if (!outline) {
      const msg = document.createElement('p');
      msg.textContent = 'No lesson data available for this topic.';
      cardList.append(msg);
      return;
    }
    if (typeof outline === 'string') {
      try { outline = JSON.parse(outline); }
      catch (e) {
        console.error('Invalid lesson_outline JSON:', e);
        const msg = document.createElement('p');
        msg.className = 'text-danger';
        msg.textContent = 'This lesson contains invalid data and cannot be displayed.';
        cardList.append(msg);
        return;
      }
    }

    const sections = [];

    // 1) Warm Up FIRST (before LO/SC/TEKS)
    let warmUpPushed = false;
    if (Array.isArray(outline.lesson_segments)) {
      const warmUpSeg = outline.lesson_segments.find(seg => Object.keys(seg)[0] === 'warm_up');
      if (warmUpSeg) {
        const content = warmUpSeg['warm_up'] || {};
        let html = '';
        if (content.question) html += `<p>${content.question}</p>`;
        if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
        sections.push({ cls: 'section-discussion', header: 'Warm Up', html });
        warmUpPushed = true;
      }
    }

    // 2) Title / Objective / Success Criteria / TEKS
    const teksItems = normalizeTeks(topic.matched_teks);
    const teksCollapseId = `teksCol_${(topic.id || Math.random().toString(36).slice(2))}`;
    sections.push({
      cls: 'section-title',
      header: `<h3>${outline.lesson_title || topic.topic_title}</h3>`,
      html: (() => {
        let html = '';
        if (outline.lesson_objective) {
          html += `<p><strong>Objective:</strong> ${outline.lesson_objective}</p>`;
        }
        if (Array.isArray(outline.success_criteria) && outline.success_criteria.length) {
          html += '<p><strong>Success Criteria:</strong></p><ul>';
          outline.success_criteria.forEach(item => { html += `<li>${item}</li>`; });
          html += '</ul>';
        }
        if (teksItems.length) {
          html += `<div class="section-header mt-3" style="color: blue; cursor: pointer;" data-bs-toggle="collapse" href="#${teksCollapseId}">TEKS</div>`;
          html += `<div id="${teksCollapseId}" class="collapse">${renderTEKSList(teksItems)}</div>`;
        }
        return html;
      })()
    });

    // 3) Vocabulary (optional)
    if (Array.isArray(outline.vocabulary) && outline.vocabulary.length) {
      const vocabHtml = '<ul>' +
        outline.vocabulary.map(v => `<li><strong>${v.term}:</strong> ${v.def}</li>`).join('') +
        '</ul>';
      sections.push({ cls: 'section-vocab', header: 'Vocabulary', html: vocabHtml });
    }

    // 4) Remaining lesson segments (excluding warm_up)
    if (Array.isArray(outline.lesson_segments)) {
      outline.lesson_segments.forEach(seg => {
        const key = Object.keys(seg)[0];
        if (key === 'warm_up' && warmUpPushed) return;

        const content = seg[key];
        let header = '';
        let html = '';
        let cls = '';

        const renderVisualBlock = (k, v) => {
          let s = '<div class="mb-3">';
          if (v.description) {
            s += `<p><strong>${v.type ? v.type.charAt(0).toUpperCase() + v.type.slice(1) : ''}</strong>: ${v.description}</p>`;
          }
          const img = resolveImg(topic, k, v);
          if (img) s += `<img src="${img}" alt="${v.description || ''}" class="img-fluid rounded mb-2">`;
          else s += '<div class="mb-2 p-2 border rounded text-muted text-center">Image unavailable</div>';
          s += '</div>';
          return s;
        };

        switch (key) {
          case 'image_analysis':
            header = 'Image Analysis';
            cls = 'section-image';
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) html += renderVisualBlock(k, v);
            });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;

          case 'compare_contrast':
            header = 'Compare & Contrast';
            cls = 'section-image';
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) html += renderVisualBlock(k, v);
            });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;

          case 'reading_1':
          case 'reading_2':
          case 'reading_3':
            header = content.title || key.replace('_', ' ').replace(/\b\w/g, s => s.toUpperCase());
            cls = 'section-readings';
            if (content.text) html += `<p>${content.text}</p>`;
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            if (content.discussion_question) {
              html += `<p><strong>Discussion Question:</strong> ${content.discussion_question}</p>`;
            }
            break;

          case 'odd_one_out':
            header = 'Odd One Out';
            cls = 'section-image';
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) html += renderVisualBlock(k, v);
            });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;

          case 'cause_effect':
            header = 'Cause & Effect';
            cls = 'section-image';
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) html += renderVisualBlock(k, v);
            });
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;

          case 'exit_ticket':
            header = 'Exit Ticket';
            cls = 'section-DOL';
            if (content.prompt) html += `<p>${content.prompt}</p>`;
            if (content.instructions) html += `<p><em>${content.instructions}</em></p>`;
            break;

          default:
            header = key.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
            cls = 'section-objective';
            html = `<pre>${JSON.stringify(content, null, 2)}</pre>`;
        }

        sections.push({ cls, header, html });
      });
    }

    // Render cards
    sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = `card p-3 ${sec.cls}`;
      card.innerHTML = `<div class="section-header">${sec.header}</div>${sec.html}`;
      cardList.append(card);
    });
  }

  loadData();
})();
