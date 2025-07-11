const units = {};

// Load JSON and organize by Unit > Topic > Lesson
fetch("lessons/lessons.json")
  .then(res => res.json())
  .then(allLessons => {
    for (const id in allLessons) {
      const data = allLessons[id];
      const { unit_id, topic_id } = data;

      if (!units[unit_id]) units[unit_id] = { unit_question: data.unit_question, topics: {} };
      if (!units[unit_id].topics[topic_id]) {
        units[unit_id].topics[topic_id] = {
          topic_title: data.topic_title,
          lessons: {}
        };
      }

      units[unit_id].topics[topic_id].lessons[data.lesson_day] = data;
    }

    drawUnitAccordion();
  });

// Render Unit/Topic Accordion Menu
function drawUnitAccordion() {
  const container = document.getElementById("unitMenu");
  container.innerHTML = "";

  for (const unit_id in units) {
    const unit = units[unit_id];
    const unitWrapper = document.createElement("div");
    unitWrapper.className = "accordion";

    const unitBtn = document.createElement("button");
    unitBtn.className = "accordion-btn";
    unitBtn.textContent = `${unit_id}: ${unit.unit_question}`;
    unitBtn.onclick = () => unitWrapper.classList.toggle("open");

    const topicList = document.createElement("div");
    topicList.className = "accordion-content";

    for (const topic_id in unit.topics) {
      const topic = unit.topics[topic_id];

      const topicBtn = document.createElement("button");
      topicBtn.className = "topic-btn";
      topicBtn.textContent = topic.topic_title;

      const lessonSet = document.createElement("div");
      lessonSet.className = "lesson-buttons";

      ["Day One", "Day Two"].forEach(day => {
        if (topic.lessons[day]) {
          const lesson = topic.lessons[day];
          const btn = document.createElement("button");
          btn.className = "lesson-btn";
          btn.textContent = `${day}`;
          btn.onclick = () => renderLesson(lesson);
          lessonSet.appendChild(btn);
        }
      });

      topicList.appendChild(topicBtn);
      topicList.appendChild(lessonSet);
    }

    unitWrapper.appendChild(unitBtn);
    unitWrapper.appendChild(topicList);
    container.appendChild(unitWrapper);
  }
}

// Render full lesson content
function renderLesson(data) {
  const out = document.getElementById("lessonView");

  out.innerHTML = `
    <h2>${data.topic_title} (${data.lesson_id})</h2>

    <div class="lesson-section row">
      <div class="col-md-6">
        <h3>Learning Objective</h3>
        <p>${data.learning_objective}</p>
    </div>
      <div class="col-md-6">
        <h3>Success Criteria</h3>
      <ul>
      ${data.success_criteria.map(x => `<li>${x}</li>`).join("")}
      </ul>
      </div>
    </div>

    <div class="lesson-section">
      <h3>Intro Image</h3>
      <img src="${data.image_url.replace('img:', 'images/')}" alt="Intro Image" style="max-width:100%;" />
      <p><em>${data.image_description}</em></p>
    </div>

    <div class="lesson-section">
      <h3>Hook Question</h3>
      <blockquote>${data.hook_question}</blockquote>
    </div>

    <div class="lesson-section">
      <h3>Vocabulary</h3>
      <div class="vocab-grid">
        ${data.vocab_list.map(v => `
          <button onclick="window.open('${v.link.replace('link:', '#')}', '_blank')">
            ${v.term}
          </button>`).join("")}
      </div>
    </div>

    <div class="lesson-section">
      <h3>Readings</h3>
      ${["reading_1", "reading_2"].map(key => {
        const r = data[key];
        return `<div><h4>${r.title}</h4><p><em>${r.summary}</em></p></div>`;
      }).join("")}
    </div>

    <div class="lesson-section">
      <h3>Discussion Questions</h3>
      <ul>${data.discussion_questions.map(q => `<li>${q}</li>`).join("")}</ul>
    </div>

    <div class="lesson-section">
      <h3>Demonstration of Learning</h3>
      <p>${data.DOL_prompt}</p>
    </div>
  `;
}
