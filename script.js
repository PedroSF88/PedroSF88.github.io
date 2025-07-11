let data;
let selectedUnit = null;
let selectedTopic = null;
let selectedLesson = null;

document.addEventListener("DOMContentLoaded", async () => {
  const unitContainer = document.getElementById("unit-container");
  const topicContainer = document.getElementById("topic-container");
  const lessonContainer = document.getElementById("lesson-container");
  const lessonView = document.getElementById("lesson-view");
  const unitQuestion = document.getElementById("unit-question");

  const response = await fetch("lessons/lessons.json");
  data = await response.json();

  const unitIds = [...new Set(data.map(d => d.unit_id))];
  unitIds.forEach(unit => {
    const btn = document.createElement("button");
    btn.className = "button";
    btn.textContent = unit;
    btn.onclick = () => {
      selectedUnit = unit;
      selectedTopic = null;
      selectedLesson = null;
      clearSelected("unit-container");
      btn.classList.add("selected");
      unitQuestion.innerHTML = `<h2>Unit Question</h2><p>${data.find(d => d.unit_id === unit).unit_question}</p>`;
      renderTopics(unit);
      topicContainer.innerHTML = "";
      lessonContainer.innerHTML = "";
      lessonView.innerHTML = "";
    };
    unitContainer.appendChild(btn);
  });

  function renderTopics(unit) {
    topicContainer.innerHTML = "<h2>Select a Topic</h2>";
    const topics = [...new Map(data.filter(d => d.unit_id === unit).map(d => [d.topic_id, d.topic_title])).entries()];
    topics.forEach(([id, title]) => {
      const btn = document.createElement("button");
      btn.className = "button";
      btn.textContent = title;
      btn.onclick = () => {
        selectedTopic = id;
        selectedLesson = null;
        clearSelected("topic-container");
        btn.classList.add("selected");
        renderLessons(unit, id);
        lessonView.innerHTML = "";
      };
      topicContainer.appendChild(btn);
    });
  }

  function renderLessons(unit, topic) {
    lessonContainer.innerHTML = "<h2>Select a Lesson</h2>";
    const lessons = data.filter(d => d.unit_id === unit && d.topic_id === topic);
    lessons.forEach(lesson => {
      const btn = document.createElement("button");
      btn.className = "button";
      btn.textContent = `Lesson ${lesson.lesson_day}`;
      btn.onclick = () => {
        selectedLesson = lesson.lesson_id;
        clearSelected("lesson-container");
        btn.classList.add("selected");
        renderLessonView(lesson);
      };
      lessonContainer.appendChild(btn);
    });
  }

  function renderLessonView(lesson) {
    lessonView.innerHTML = `
      <h2>Lesson View</h2>
      <div class="accordion">
        <div class="accordion-header" onclick="toggleAccordion(this)">A) Overview</div>
        <div class="accordion-body">
          <strong>Topic:</strong> ${lesson.topic_title}<br/>
          <strong>Objective:</strong> ${lesson.learning_objective}<br/>
          <strong>Success Criteria:</strong>
          <ul>${lesson.success_criteria.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
      </div>

      <div class="accordion">
        <div class="accordion-header" onclick="toggleAccordion(this)">B) Vocabulary</div>
        <div class="accordion-body">
          <div class="vocab-grid">
            ${lesson.vocab_list.map(v => `<button class="vocab-button" onclick="window.open('${v.link || '#'}', '_blank')">${v.term}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="accordion">
        <div class="accordion-header" onclick="toggleAccordion(this)">C) Readings</div>
        <div class="accordion-body">
          <h4>${lesson.reading_1_outline.title}</h4>
          <p>${lesson.reading_1_outline.summary}</p>
          <h4>${lesson.reading_2_outline.title}</h4>
          <p>${lesson.reading_2_outline.summary}</p>
        </div>
      </div>

      <div class="accordion">
        <div class="accordion-header" onclick="toggleAccordion(this)">D) Discussion & DOL</div>
        <div class="accordion-body">
          <strong>Discussion Questions:</strong>
          <ul>${lesson.discussion_questions.map(q => `<li>${q}</li>`).join('')}</ul>
          <strong>DOL Prompt:</strong>
          <p>${lesson.DOL_prompt}</p>
        </div>
      </div>
    `;
  }

  function clearSelected(containerId) {
    document.querySelectorAll(`#${containerId} .button`).forEach(btn => btn.classList.remove("selected"));
  }

  window.toggleAccordion = function(header) {
    const body = header.nextElementSibling;
    body.style.display = body.style.display === "block" ? "none" : "block";
  };
});
