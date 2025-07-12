const units = {};

// Load all lessons from the JSON file
fetch("lessons/lessons.json")
  .then(res => res.json())
  .then(allLessons => {
    for (const id in allLessons) {
      const data = allLessons[id];
      const { unit_id, topic_id } = data;

      if (!units[unit_id]) {
        units[unit_id] = {
          unit_question: data.unit_question,
          topics: {}
        };
      }

      if (!units[unit_id].topics[topic_id]) {
        units[unit_id].topics[topic_id] = {
          topic_title: data.topic_title,
          lessons: {}
        };
      }

      units[unit_id].topics[topic_id].lessons[data.lesson_day] = data;
    }

    drawSidebar();
  });

// Render Units, Topics, and Lessons in Sidebar Accordion
function drawSidebar() {
  const container = document.getElementById("unitMenu");
  container.innerHTML = "";

  const accordion = document.createElement("div");
  accordion.className = "accordion";
  accordion.id = "accordionUnits";

  let unitIndex = 0;

  for (const unit_id in units) {
    const unit = units[unit_id];
    const unitCollapseId = `collapseUnit${unitIndex}`;

    const card = document.createElement("div");
    card.className = "accordion-item";

    card.innerHTML = `
      <h2 class="accordion-header" id="heading${unitIndex}">
        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                data-bs-target="#${unitCollapseId}" aria-expanded="false" aria-controls="${unitCollapseId}">
          ${unit_id}: ${unit.unit_question}
        </button>
      </h2>
      <div id="${unitCollapseId}" class="accordion-collapse collapse" aria-labelledby="heading${unitIndex}" data-bs-parent="#accordionUnits">
        <div class="accordion-body" id="unitBody${unitIndex}">
        </div>
      </div>
    `;

    const bodyDiv = card.querySelector(`#unitBody${unitIndex}`);

    for (const topic_id in unit.topics) {
      const topic = unit.topics[topic_id];

      const topicTitle = document.createElement("h6");
      topicTitle.textContent = topic.topic_title;
      bodyDiv.appendChild(topicTitle);

      ["Day One", "Day Two"].forEach(day => {
        const lesson = topic.lessons[day];
        if (lesson) {
          const btn = document.createElement("button");
          btn.className = "btn btn-outline-primary btn-sm m-1";
          btn.textContent = `${day}`;
          btn.onclick = () => renderLesson(lesson);
          bodyDiv.appendChild(btn);
        }
      });
    }

    accordion.appendChild(card);
    unitIndex++;
  }

  container.appendChild(accordion);
}

// Display full lesson content
function renderLesson(data) {
  const out = document.getElementById("lessonView");
  out.innerHTML = `
    <div class="p-4">
      <h2 class="mb-3">${data.topic_title} (${data.lesson_id})</h2>

      <div class="p-3 mb-3 bg-light rounded">
        <h4>Learning Objective</h4>
        <p>${data.learning_objective}</p>
        <ul>${data.success_criteria.map(x => `<li>${x}</li>`).join("")}</ul>
      </div>

      <div class="p-3 mb-3 bg-white border rounded">
        <h4>Intro Image</h4>
        <img src="${data.image_url?.replace("img:", "images/") || ""}" alt="Intro Image" class="img-fluid mb-2" />
        <p class="fst-italic">${data.image_description}</p>
      </div>

      <div class="p-3 mb-3 bg-light rounded">
        <h4>Hook Question</h4>
        <blockquote class="blockquote">${data.hook_question}</blockquote>
      </div>

      <div class="p-3 mb-3 bg-white border rounded">
        <h4>Vocabulary</h4>
        <div class="row row-cols-2 row-cols-md-3 g-2">
          ${data.vocab_list.map(v => `
            <div class="col">
              <a class="btn btn-outline-secondary w-100" target="_blank" href="${v.link.replace("link:", "#")}">${v.term}</a>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="p-3 mb-3 bg-light rounded">
        <h4>Readings</h4>
        ${["reading_1", "reading_2"].map(key => {
          const r = data[key];
          return r
            ? `<div class="mb-2"><h5>${r.title}</h5><p><em>${r.summary}</em></p></div>`
            : "";
        }).join("")}
      </div>

      <div class="p-3 mb-3 bg-white border rounded">
        <h4>Discussion Questions</h4>
        <ul>${data.discussion_questions.map(q => `<li>${q}</li>`).join("")}</ul>
      </div>

      <div class="p-3 mb-3 bg-light rounded">
        <h4>Demonstration of Learning</h4>
        <p>${data.DOL_prompt}</p>
      </div>
    </div>
  `;
}
