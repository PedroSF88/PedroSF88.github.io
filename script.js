let lessons = [];

document.addEventListener("DOMContentLoaded", async () => {
  const response = await fetch("lessons/lessons.json");
  lessons = await response.json();
  renderUnits();
});

function clearAllBelow(id) {
  if (id === "unit") {
    document.getElementById("topic-container").innerHTML = "";
    document.getElementById("lesson-container").innerHTML = "";
    document.getElementById("lesson-view").innerHTML = "";
  } else if (id === "topic") {
    document.getElementById("lesson-container").innerHTML = "";
    document.getElementById("lesson-view").innerHTML = "";
  } else if (id === "lesson") {
    document.getElementById("lesson-view").innerHTML = "";
  }
}

function renderUnits() {
  const container = document.getElementById("unit-container");
  container.innerHTML = "<h2>Select a Unit</h2>";
  for (let i = 1; i <= 6; i++) {
    const btn = document.createElement("button");
    btn.className = "button";
    btn.textContent = `Unit ${i}`;
    btn.onclick = () => {
      clearAllBelow("unit");
      renderTopics(`U${i}`);
    };
    container.appendChild(btn);
  }
}

function renderTopics(unitId) {
  const container = document.getElementById("topic-container");
  container.innerHTML = "<h2>Select a Topic</h2>";
  const seen = new Set();
  lessons.forEach(item => {
    if (item.unit_id === unitId && !seen.has(item.topic_id)) {
      seen.add(item.topic_id);
      const btn = document.createElement("button");
      btn.className = "button";
      btn.textContent = item.topic_title;
      btn.onclick = () => {
        clearAllBelow("topic");
        renderLessons(unitId, item.topic_id);
      };
      container.appendChild(btn);
    }
  });
}

function renderLessons(unitId, topicId) {
  const container = document.getElementById("lesson-container");
  container.innerHTML = "<h2>Select a Lesson</h2>";
  lessons.forEach(item => {
    if (item.unit_id === unitId && item.topic_id === topicId) {
      const btn = document.createElement("button");
      btn.className = "button";
      btn.textContent = `Lesson ${item.lesson_day}`;
      btn.onclick = () => {
        clearAllBelow("lesson");
        renderLesson(item.lesson_id);
      };
      container.appendChild(btn);
    }
  });
}

function renderLesson(lessonId) {
  const lesson = lessons.find(l => l.lesson_id === lessonId);
  if (!lesson) return;

  const container = document.getElementById("lesson-view");
  container.innerHTML = `
    <h2>${lesson.topic_title} — Lesson ${lesson.lesson_day}</h2>
    <p><strong>Objective:</strong> ${lesson.learning_objective}</p>
    <p><strong>Hook Question:</strong> ${lesson.hook_question}</p>
    <h3>Vocabulary</h3>
    <ul id="vocab-list">${lesson.vocab_list.map(v => `<li>${v.term}</li>`).join("")}</ul>
    <h3>Reading 1: ${lesson.reading_1_outline.title}</h3>
    <p>${lesson.reading_1_outline.summary}</p>
    <h3>Reading 2: ${lesson.reading_2_outline.title}</h3>
    <p>${lesson.reading_2_outline.summary}</p>
    <h3>DOL Prompt</h3>
    <p>${lesson.DOL_prompt}</p>
  `;
}
