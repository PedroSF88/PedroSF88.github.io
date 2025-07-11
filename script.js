function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function loadJSON() {
  const res = await fetch("lessons/lessons.json");
  return await res.json();
}

async function loadTopics(unitId) {
  const data = await loadJSON();
  const container = document.getElementById("topic-container");
  const seen = new Set();
  for (let item of data) {
    if (item.unit_id === unitId && !seen.has(item.topic_id)) {
      seen.add(item.topic_id);
      const button = document.createElement("button");
      button.className = "topic-button";
      button.textContent = item.topic_title;
      button.onclick = () => {
        window.location.href = `lessons.html?unit=${unitId}&topic=${item.topic_id}`;
      };
      container.appendChild(button);
    }
  }
}

async function loadLessons(unitId, topicId) {
  const data = await loadJSON();
  const container = document.getElementById("lesson-container");
  for (let item of data) {
    if (item.unit_id === unitId && item.topic_id === topicId) {
      const button = document.createElement("button");
      button.className = "lesson-button";
      button.textContent = `Lesson ${item.lesson_day}`;
      button.onclick = () => {
        window.location.href = `view.html?lesson=${item.lesson_id}`;
      };
      container.appendChild(button);
    }
  }
}

async function loadLesson(id) {
  const data = await loadJSON();
  const lesson = data.find(l => l.lesson_id === id);
  if (!lesson) return document.body.innerHTML = "Lesson not found";

  document.getElementById("topic-title").textContent = lesson.topic_title;
  document.getElementById("objective").textContent = lesson.learning_objective;
  document.getElementById("hook").textContent = lesson.hook_question;
  document.getElementById("dol").textContent = lesson.DOL_prompt;

  const vocab = document.getElementById("vocab-list");
  vocab.innerHTML = "";
  lesson.vocab_list.forEach(v => {
    const li = document.createElement("li");
    li.textContent = v.term;
    vocab.appendChild(li);
  });

  document.getElementById("reading-1").innerHTML = `
    <strong>${lesson.reading_1_outline.title}</strong><p>${lesson.reading_1_outline.summary}</p>`;
  document.getElementById("reading-2").innerHTML = `
    <strong>${lesson.reading_2_outline.title}</strong><p>${lesson.reading_2_outline.summary}</p>`;
}
