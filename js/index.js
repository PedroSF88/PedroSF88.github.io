;(async function() {
  "use strict";
  /**
   * This script fetches curriculum data from a Supabase backend and renders it
   * into a simple interactive lesson viewer. Each unit appears in the sidebar,
   * clicking a unit reveals its topics, and selecting a topic displays the
   * lesson outline defined in the `lesson_outline` JSON column of the
   * `topic_teks` table. The viewer is designed to be flexible enough to
   * accommodate the new lesson format described in the updated database
   * schema.
   *
   * To connect to your own Supabase project you must provide a URL and
   * anonymous key. You can do this by defining `window.SUPABASE_URL` and
   * `window.SUPABASE_ANON_KEY` prior to loading this script, or by editing
   * the placeholder values below. If these values are not set correctly the
   * application will display an error message and no data will be loaded.
   */

  // Attempt to read Supabase credentials from global variables. These should
  // be defined in a separate script tag before this script runs. If they
  // aren't provided, the placeholders below will be used instead. Replace
  // these strings with your actual Supabase project URL and anonymous key.
  const SUPABASE_URL = "SUPABASE_URL_PLACEHOLDER";
  const SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY_PLACEHOLDER";

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Ensure the Supabase client library is available. It is loaded via a CDN
  // script tag in index.html. If the library isn't present, notify the user.
  if (!window.supabase) {
    console.error('Supabase client library not found. Make sure the script tag for @supabase/supabase-js is included.');
    return;
  }

  // Initialize the Supabase client. This will throw if the URL or key are
  // empty strings. If you see errors here, update the placeholders above.
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Grab DOM references up front for speed and clarity.
  const unitMenu   = document.getElementById('unitMenu');
  const topicMenu  = document.getElementById('topicMenu');
  const lessonMenu = document.getElementById('lessonMenu');
  const cardList   = document.getElementById('cardList');

  /**
   * Utility: remove all child nodes from the given elements. This is used to
   * reset portions of the interface when switching between units or topics.
   * @param  {...HTMLElement} els DOM elements to clear
   */
  function clear(...els) {
    els.forEach(e => e && e.replaceChildren());
  }

  /**
   * Fetch units and topics from Supabase. Units are ordered by the
   * `unit_number` field to ensure a stable ordering in the UI. Topics are
   * fetched without any particular order; if you wish to order them you may
   * add an `.order(...)` call here. When complete, the function calls
   * `buildUnitMenu` to render the unit selector.
   */
  async function loadData() {
    try {
      // Fetch all curriculum units. The `unit_number` column allows you to
      // control ordering; if absent the units will be displayed in the order
      // returned by the database.
      const { data: units, error: unitErr } = await supabase
        .from('curriculum_units')
        .select('*')
        .order('unit_number', { ascending: true });
      if (unitErr) throw unitErr;

      // Fetch all topics. Each row in the `topic_teks` table represents a
      // lesson within a unit and contains a JSON lesson outline along with
      // associated TEKS and other metadata.
      const { data: topics, error: topicErr } = await supabase
        .from('topic_teks')
        .select('*');
      if (topicErr) throw topicErr;

      // Build a map of unit_id to { unit, topics: [] }. This makes it easy to
      // traverse units and their associated topics later on.
      const unitMap = {};
      units.forEach(u => {
        unitMap[u.id] = { unit: u, topics: [] };
      });
      topics.forEach(t => {
        const container = unitMap[t.unit_id];
        if (container) {
          container.topics.push(t);
        }
      });

      // Render the unit buttons in the sidebar.
      buildUnitMenu(unitMap);
    } catch (err) {
      console.error('Error loading curriculum data:', err);
      clear(cardList);
      const errorMessage = document.createElement('p');
      errorMessage.className = 'text-danger';
      errorMessage.textContent = 'Failed to load lessons. Please check your Supabase configuration.';
      cardList.append(errorMessage);
    }
  }

  /**
   * Build the unit selector. Each unit appears as a button; selecting a unit
   * populates the topic list. The sidebar menus are cleared when a new unit
   * is selected.
   * @param {Object<string, {unit: Object, topics: Array}>} unitMap
   */
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

  /**
   * When a unit is selected, populate the topic list. The old lesson list and
   * card list are cleared to reflect the change. Each topic becomes a button
   * that triggers the rendering of its lesson when clicked.
   *
   * @param {Object} unit The selected unit
   * @param {Array} topics A list of topic records belonging to the unit
   */
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

  /**
   * Render a lesson given a topic record. The function parses the
   * `lesson_outline` field, which may arrive as a string or a native JSON
   * object, and then generates a series of cards corresponding to each
   * segment. The first card shows the lesson title, objective, success
   * criteria and TEKS. Subsequent cards reflect the lesson segments in
   * `lesson_outline.lesson_segments`.
   *
   * Unknown segment types are displayed verbatim in a preformatted block to
   * aid debugging new content structures.
   *
   * @param {Object} topic A record from the `topic_teks` table
   */
  function renderLesson(topic) {
    clear(cardList);
    let outline = topic.lesson_outline;
    if (!outline) {
      const msg = document.createElement('p');
      msg.textContent = 'No lesson data available for this topic.';
      cardList.append(msg);
      return;
    }
    // If the lesson outline is stored as a string, attempt to parse it.
    if (typeof outline === 'string') {
      try {
        outline = JSON.parse(outline);
      } catch (parseErr) {
        console.error('Invalid lesson_outline JSON:', parseErr);
        const msg = document.createElement('p');
        msg.className = 'text-danger';
        msg.textContent = 'This lesson contains invalid data and cannot be displayed.';
        cardList.append(msg);
        return;
      }
    }

    // Build an array of section definitions. Each entry has a class, a header
    // and HTML content. We'll iterate this array to create DOM nodes.
    const sections = [];

    // Title, objective and success criteria card. Also displays TEKS if
    // available.
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
          outline.success_criteria.forEach(item => {
            html += `<li>${item}</li>`;
          });
          html += '</ul>';
        }
        // Display TEKS if present. The matched_teks column may be JSON
        // encoded or a plain array. We convert it to an array of strings.
        let teksList = [];
        if (Array.isArray(topic.matched_teks)) {
          teksList = topic.matched_teks;
        } else if (typeof topic.matched_teks === 'string') {
          try {
            const parsed = JSON.parse(topic.matched_teks);
            if (Array.isArray(parsed)) teksList = parsed;
          } catch (_) {
            // not parseable; ignore
          }
        }
        if (teksList.length) {
          html += `<div class="section-header mt-3" style="color: blue; cursor: pointer;" data-bs-toggle="collapse" href="#teksCol">TEKS</div>`;
          html += '<div id="teksCol" class="collapse"><ul>';
          teksList.forEach(teks => {
            html += `<li>${teks}</li>`;
          });
          html += '</ul></div>';
        }
        return html;
      })()
    });

    // Vocabulary card. Show each term with its definition. The new lesson
    // structure does not include external links like the previous version,
    // instead it provides definitions directly.
    if (Array.isArray(outline.vocabulary) && outline.vocabulary.length) {
      const vocabHtml = '<ul>' + outline.vocabulary.map(v => `<li><strong>${v.term}:</strong> ${v.def}</li>`).join('') + '</ul>';
      sections.push({
        cls: 'section-vocab',
        header: 'Vocabulary',
        html: vocabHtml
      });
    }

    // Generate a card for each lesson segment. Each segment is an object
    // containing a single key (e.g., warm_up, image_analysis, reading_1). The
    // content varies depending on the segment type; this switch assigns a
    // header, class and body accordingly.
    if (Array.isArray(outline.lesson_segments)) {
      outline.lesson_segments.forEach((seg, idx) => {
        const key = Object.keys(seg)[0];
        const content = seg[key];
        let header = '';
        let html = '';
        let cls = '';
        switch (key) {
          case 'warm_up':
            header = 'Warm Up';
            cls = 'section-discussion';
            if (content.question) {
              html += `<p>${content.question}</p>`;
            }
            if (content.instructions) {
              html += `<p><em>${content.instructions}</em></p>`;
            }
            break;

          case 'image_analysis':
            header = 'Image Analysis';
            cls = 'section-image';
            // For each visual entry we display the description and image if
            // available. Some properties of the object are not visuals (like
            // instructions); we skip those.
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) {
                html += '<div class="mb-3">';
                if (v.description) {
                  html += `<p><strong>${v.type ? v.type.charAt(0).toUpperCase() + v.type.slice(1) : ''}</strong>: ${v.description}</p>`;
                }
                if (v.url_to_image && v.url_to_image !== '@image_placeholder') {
                  html += `<img src="${v.url_to_image}" alt="${v.description || ''}" class="img-fluid rounded mb-2">`;
                } else {
                  html += '<div class="mb-2 p-2 border rounded text-muted text-center">Image unavailable</div>';
                }
                html += '</div>';
              }
            });
            if (content.instructions) {
              html += `<p><em>${content.instructions}</em></p>`;
            }
            break;

          case 'reading_1':
          case 'reading_2':
          case 'reading_3':
            header = content.title || key.replace('_', ' ').replace(/\b\w/g, s => s.toUpperCase());
            cls = 'section-readings';
            if (content.text) {
              html += `<p>${content.text}</p>`;
            }
            if (content.instructions) {
              html += `<p><em>${content.instructions}</em></p>`;
            }
            if (content.discussion_question) {
              html += `<p><strong>Discussion Question:</strong> ${content.discussion_question}</p>`;
            }
            break;

          case 'odd_one_out':
            header = 'Odd One Out';
            cls = 'section-image';
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) {
                html += '<div class="mb-3">';
                if (v.description) {
                  html += `<p><strong>${v.type ? v.type.charAt(0).toUpperCase() + v.type.slice(1) : ''}</strong>: ${v.description}</p>`;
                }
                if (v.url_to_image && v.url_to_image !== '@image_placeholder') {
                  html += `<img src="${v.url_to_image}" alt="${v.description || ''}" class="img-fluid rounded mb-2">`;
                } else {
                  html += '<div class="mb-2 p-2 border rounded text-muted text-center">Image unavailable</div>';
                }
                html += '</div>';
              }
            });
            if (content.instructions) {
              html += `<p><em>${content.instructions}</em></p>`;
            }
            break;

          case 'cause_effect':
            header = 'Cause & Effect';
            cls = 'section-image';
            Object.entries(content).forEach(([k, v]) => {
              if (k.startsWith('visual_')) {
                html += '<div class="mb-3">';
                if (v.description) {
                  html += `<p><strong>${v.type ? v.type.charAt(0).toUpperCase() + v.type.slice(1) : ''}</strong>: ${v.description}</p>`;
                }
                if (v.url_to_image && v.url_to_image !== '@image_placeholder') {
                  html += `<img src="${v.url_to_image}" alt="${v.description || ''}" class="img-fluid rounded mb-2">`;
                } else {
                  html += '<div class="mb-2 p-2 border rounded text-muted text-center">Image unavailable</div>';
                }
                html += '</div>';
              }
            });
            if (content.instructions) {
              html += `<p><em>${content.instructions}</em></p>`;
            }
            break;

          case 'exit_ticket':
            header = 'Exit Ticket';
            cls = 'section-DOL';
            if (content.prompt) {
              html += `<p>${content.prompt}</p>`;
            }
            if (content.instructions) {
              html += `<p><em>${content.instructions}</em></p>`;
            }
            break;

          default:
            // Unknown or unhandled segments are printed raw to help developers
            // understand new structures. They appear in an 'objective'-styled
            // card.
            header = key.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
            cls = 'section-objective';
            html = `<pre>${JSON.stringify(content, null, 2)}</pre>`;
        }
        sections.push({ cls, header, html });
      });
    }

    // Finally, render the cards into the DOM. Each card uses Bootstrap's
    // `card` class along with custom section classes defined in index.css to
    // provide distinct coloring and spacing.
    sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = `card p-3 ${sec.cls}`;
      card.innerHTML = `<div class="section-header">${sec.header}</div>${sec.html}`;
      cardList.append(card);
    });
  }

  // Kick off data loading when the script runs. Without awaiting this call
  // here, the UI would not populate on page load.
  loadData();
})();
