;(async function() {
  // Load & nest by unit/topic
  const lessons = await fetch('lessons/lessons.json').then(r => r.json());
  const data = {};
  lessons.forEach(l => {
    data[l.unit_id]         ??= {};
    data[l.unit_id][l.topic_id] ??= [];
    data[l.unit_id][l.topic_id].push(l);
  });

  // Element refs
  const unitMenu   = document.getElementById('unitMenu');
  const topicMenu  = document.getElementById('topicMenu');
  const lessonMenu = document.getElementById('lessonMenu');
  const cardList   = document.getElementById('cardList');


  // Utility to clear areas
  const clear = (...els) => els.forEach(e => e.replaceChildren());

  // Build Unit buttons
  Object.keys(data).forEach(u => {
    const btn = document.createElement('button');
    btn.textContent = u;
    btn.className = 'btn btn-outline-primary w-100 mb-2';
    btn.onclick = () => selectUnit(u);
    unitMenu.append(btn);
  });

  function selectUnit(unit) {
    clear(topicMenu, lessonMenu, cardList);
    Object.entries(data[unit]).forEach(([t, arr]) => {
      const btn = document.createElement('button');
      btn.textContent = arr[0].topic_title;
      btn.className = 'btn btn-outline-secondary w-100 mb-2';
      btn.onclick = () => selectTopic(unit, t);
      topicMenu.append(btn);
    });
  }

  function selectTopic(unit, topicId) {
    clear(lessonMenu, cardList);
    data[unit][topicId].forEach(l => {
      const btn = document.createElement('button');
      btn.textContent = `${l.lesson_day ? ` ${l.lesson_title}` : ''}`;
      btn.className = 'btn btn-outline-success w-100 mb-2';
      btn.onclick = () => renderLesson(l);
      lessonMenu.append(btn);
    });
  }

  function renderLesson(l) {
    clear(cardList);

    // Define each section card
    const sections = [
      {
        cls:    'section-title',
        header: `<br><h3>${l.lesson_title}</h3>`,
        html:   `<div class=\"section-content\ center\"> <h3>${l.lesson_hook}</h3></div>
                <div data-bs-toggle=\"collapse\" href=\"#TWPS_Col\" class=\"section-task\ section-header\"> &#129417; Task: Think, Write, Pair, Share: </div>
                <div id=\"TWPS_Col\" class=\"collapse\ center\">
                <div class=\"left\" p>   
                <strong>Think</strong> about the question.
                <br> <strong>Write</strong> down your ideas.
                <br> <strong>Discuss</strong> your ideas with a partner.
                <br> <strong>Share</strong> your group's ideas with the class.</p></div> </div> <div class="bottom">${l.lesson_id}</div>`
      },
      {
        cls:    'section-objective',
        header: `<br> Learning Objective`,
        html:   `<p>${l.learning_objective}</p>
                 <div class=\"section-header\">Success Criteria</div>
                 <ul>${l.success_criteria.map(x => `<li>${x}</li>`).join('')}</ul>
                 <div data-bs-toggle=\"collapse\" href=\"#LOSC_Col\" class=\"section-task\ section-header\"> &#128021; Task: Fill-in-the-blanks: </div>
                 <div id=\"LOSC_Col\" class=\"collapse\ center\" p>
                <strong>Read</strong> the contents above (LO and SC).
                <br><strong>Find</strong> the missing words.
                <br><strong>Write</strong> the correct words in the worksheets.</p>
                </div>
                 <div data-bs-toggle=\"collapse\" href=\"#teksCol\"class=\"section-header mt-3\" style=\"color: blue;\">TEKS</div>
                 <div id=\"teksCol\" class=\"collapse\"><ul>${l.teks.map(x => `<li>${x}</li>`).join('')}</ul></div> <div class="bottom">${l.lesson_id}</div>`               
      },
      {
        cls:    'section-image',
        header: 'Image Analysis',
        html:   `<img src=\"${l.image_url}\" class=\"img-fluid rounded\">
                <div data-bs-toggle=\"collapse\" href=\"#img_Col\" class=\"section-task\ section-header\"> &#128025; Task: Describe the image: </div>
                 <div id=\"img_Col\" class=\"collapse\ center\" p>
                 <strong>Analyze</strong> the image above. Finish the following sentences:
                 <br>
                 <br>
                <strong>I see...</strong> <br>*<i>Describe the image: WHO or WHAT do you see in it? <br>Point out the details.</i><br> 
                <br><strong>I think...</strong> <br>*<i>Make Sense of it: What might it mean?</i>
                </p></div>
                <div class="bottom">${l.lesson_id}</div>`
      },
      {
        cls:    'section-readings',
        header: 'Reading 1',
        html: ['reading_1']
                  .filter(k => l[k])
                  .map((k,i) => `<div class="mb-3">
                             <div class=\"section-header\">
                               <strong>${l[k].title}</strong> <br>
                             </div>                             
                             <div id="readingCol${i}">
                               <p>${l[k].text}</p>
                             </div>
                              <div data-bs-toggle=\"collapse\" href=\"#read_1_Col\" class=\"section-task\ section-header\"> &#129412; Task: Fill-in-the-blanks: </div>
                              <div id=\"read_1_Col\" class=\"collapse\ center\" p>
                              <strong>Read</strong> the contents above (Reading 1).
                              <br><strong>Find</strong> the missing words for the reading summary.
                              <br><strong>Write</strong> the correct words in the worksheets.</p>
                            </div>
                           </div><div class="bottom">${l.lesson_id}</div>`).join('')
      },
      {
        cls:    'section-vocab',
        header: 'Vocabulary',
        html:   (() => {
          // Instructions and matching in same card
        const task_one = ` <div class=\"section-header\"> &#128037; Task: Vocabulary Matching</div> 
        <p><strong>Open</strong> each link and <strong>review</strong> each site. <strong> Select the vocabulary term from the dropdown that matches the link.</strong> Click <strong>Submit</strong> to check your answers.</p>`;

        const task_two = ` <div class=\"section-header\">&#128051; Task: Definitions </div> <p><strong>Write</strong> a definition for each <strong>vocab</strong> based on the information from each site. <strong>Use at least three (3) of the vocab terms to describe the previous image.</strong> </p>`;

          // Prepare the vocab terms with their original indices
          const terms = l.vocab_list.map((v,i) => ({ term: v.term, idx: i }));
          // Shuffle the terms array for the dropdowns
          const shuffled = [...terms].sort(() => Math.random() - 0.5);

          // Build a row for each link
          const rows = l.vocab_list.map((v, linkIdx) => `
            <li class="mb-3">
              <strong>Link ${linkIdx + 1}</strong>
              <button 
                class="btn btn-sm btn-outline-primary ms-2 mb-2" 
                onclick="window.open('${v.link}','_blank')"
              >Open</button>
              <select id="match-${linkIdx}" 
                      class="form-select form-select-sm w-auto d-inline-block ms-3">
                <option value="">– select term –</option>
                ${shuffled.map(t => 
                  `<option value="${t.idx}">${t.term}</option>`
                ).join('')}
              </select>

              <div id="feedback-${linkIdx}" class="mt-1"></div>
            </li>
          `).join('');

          return `
            ${task_one}
            <ul>${rows}</ul>
            <button id="vocabSubmit" class="btn btn-primary btn-sm mt-3">Submit</button>
            <div id="vocabScore" class="mt-2 fw-bold"></div>
            ${task_two}
            <div class="bottom">${l.lesson_id}</div>
          `;
        })()
      },
      {
        cls:    'section-readings',
        header: 'Reading 2',
        html: ['reading_2']
                  .filter(k => l[k])
                  .map((k,i) => `<div class="mb-3">
                             <div class=\"section-header\" >
                               <strong>${l[k].title}</strong> <br>
                             </div>                             
                             <div id="readingCol${i}">
                               <p>${l[k].text}</p>
                             </div>
                             <div data-bs-toggle=\"collapse\" href=\"#read_2_Col\" class=\"section-task\ section-header\"> &#129409; Task: Fill-in-the-blanks: </div>
                              <div id=\"read_2_Col\" class=\"collapse\ center\" p>
                              <strong>Read</strong> the contents above (Reading 2).
                              <br><strong>Find</strong> the missing words for the reading summary.
                              <br><strong>Write</strong> the correct words in the worksheets.</p>
                            </div>
                           </div> <div class="bottom">${l.lesson_id}</div>`).join('')
      },
      {
        cls:    'section-discussion',
        header: 'Discussion Questions',
        html:   `<ul>${l.discussion_questions.map(q => `<li>${q}</li>`).join('')}</ul>                
                <div data-bs-toggle=\"collapse\" href=\"#DQs_Col\" class=\"section-task\ section-header\"> &#129416; Task: Think, Write, Pair, Share: </div>                
                  <div id=\"DQs_Col\" class=\"collapse\">
                    <div class=\"left\ center\" p>   
                      <strong>Think</strong> about the question.
                      <br> <strong>Write</strong> down your ideas.
                      <br> <strong>Discuss</strong> your ideas with a partner.
                      <br> <strong>Share</strong> your group's ideas with the class.</p>
                    </div>
                    <div><a data-bs-toggle=\"collapse\" href=\"#DQhelp_Col\">Help</a>
                    </div>
                  </div>
                  <div id=\"DQhelp_Col\" class=\"collapse\"><ul>${l.discussion_sentence_stems.map(x => `<li>${x}</li>`).join('')}</ul>
                  </div> <div class="bottom">${l.lesson_id}</div>`

      },
      {
        cls:    'section-DOL',
        header: 'DOL/ Exit Ticket',
        html:   `<p>${l.DOL_prompt}</p>
                <div data-bs-toggle=\"collapse\" href=\"#DOLQ_Col\" class=\"section-task\ section-header\"> &#129421; Task: Answer the Question </div>                
                  <div id=\"DOLQ_Col\" class=\"collapse\">
                    <div class=\"left\ center\" p>   
                      <strong>Think</strong> about the question.
                      <br> <strong>Write</strong> down your ideas.
                      <br> <strong>Turn in</strong> your assignment/ worksheet.</p>
                    </div>
                <a data-bs-toggle=\"collapse\" href=\"#DOLhelpCol\">Help</a>
                <div id=\"DOLhelpCol\" class=\"collapse\"><p>${l.DOL_sentence_stem}</p></div> 
                </div>
                <div class="bottom">${l.lesson_id}</div>`
      }
    ];

    // Append each as a card
    sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = `card p-3 ${sec.cls}`;
      card.innerHTML = `<div class="section-header">${sec.header}</div>${sec.html}`;
      cardList.append(card);
    });
    // Attach submit handler (immediately after cardList.append(...) loops)
      const submit = document.getElementById('vocabSubmit');
      if (submit) {
        submit.addEventListener('click', () => {
          const total = l.vocab_list.length;
          let correct = 0;

          for (let i = 0; i < total; i++) {
            const sel      = document.getElementById(`match-${i}`);
            const fb       = document.getElementById(`feedback-${i}`);
            const chosen   = parseInt(sel.value, 10);

            // reset
            sel.classList.remove('is-valid','is-invalid');
            fb.textContent = '';

            if (chosen === i) {
              correct++;
              sel.classList.add('is-valid');
              fb.innerHTML = '<span class="text-success small">Correct!</span>';
            } else {
              sel.classList.add('is-invalid');
              fb.innerHTML = '<span class="text-danger small">Incorrect</span>';
            }
          }

          document.getElementById('vocabScore').textContent =
            `You got ${correct} out of ${total} correct.`;
        });
      }

    
    // Populate modals
    document.getElementById('stemsBody').innerHTML =
      `<ul>${l.discussion_sentence_stems.map(s => `<li>${s}</li>`).join('')}</ul>`;
    document.getElementById('dolStemsBody').innerHTML =
      `<ul>${l.DOL_sentence_stem.map(s => `<li>${s}</li>`).join('')}</ul>`;
  }
})();
